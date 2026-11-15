import { NextResponse } from "next/server";
import {
  firestoreGetDoc,
  firestoreListCollection,
  firestoreSetDoc,
} from "@/lib/firebase-admin";
import { getCurrentUser, type UserRole } from "@/lib/session";
import {
  getParamTargetForCategory,
  getParamWeightForCategory,
  parseKpiParameterDoc,
  type KpiParameter,
} from "@/app/api/admin/kpi-parameters/route";
import {
  calculateDynamicScore,
  evaluateKpiResult,
  evaluateSupervisorKpiResult,
  formatPeriodDateRange,
  getKpiGrades,
  getScoringPolicy,
  type FormulaType,
  type GradeThreshold,
  type ScoringPolicy,
  type TeamMemberKpiSummary,
} from "@/lib/kpi-engine";
import {
  JOB_TITLES,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
  type JobTitle,
  type KpiCategory,
} from "@/lib/work-areas";

export type KpiCardStatus = "draft" | "published";

export interface KpiEntryItem {
  parameterId: string;
  code: string;
  name: string;
  formulaType: FormulaType;
  unit: string;
  target: number;
  weight: number;
  actual: number;
  score: number;
  notes: string;
}

export interface SupervisorBreakdown {
  personalRawScore: number;
  personalCoreScore: number;
  personalBonusScore: number;
  personalWeightPct: number;
  personalWeightedScore: number;

  teamWeightPct: number;
  teamCalcMode: "option_a" | "option_b";
  teamAverageScore: number;
  baseTeamPoints: number;
  failedMembersCount: number;
  penaltyPerMember: number;
  totalPenalty: number;
  teamWeightedScore: number;

  teamMembers: TeamMemberKpiSummary[];
}

export interface KpiCardRecord {
  id: string;
  uid: string;
  employeeId: string;
  userName: string;
  jobTitle: JobTitle;
  kpiCategory: KpiCategory;
  kpiCategoryLabel: string;
  bufn: string;
  smelter: string;
  userUnit: string;
  period: string;
  periodDateRange: string;
  status: KpiCardStatus;
  coreScore: number;
  bonusScore: number;
  totalScore: number;
  grade: GradeThreshold;
  gateTriggered: boolean;
  failedCoreCodes: string[];
  gradesScale: GradeThreshold[];
  policy: ScoringPolicy;
  supervisorBreakdown?: SupervisorBreakdown;
  adminFeedback: string;
  entries: KpiEntryItem[];
  updatedAt: string;
  assessedBy: string;
  isHistoricalSnapshot: boolean;
}

function getDefaultPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function parseUserProfileFromFields(
  uid: string,
  f: Record<string, { stringValue?: string; booleanValue?: boolean }>
) {
  const role = (f.role?.stringValue || "safety_officer") as UserRole;
  const bufn =
    f.bufn?.stringValue || (role === "super_admin" ? "ALL" : "BUFN 1");
  const smelter = f.smelter?.stringValue || "-";
  const rawJob = f.jobTitle?.stringValue as JobTitle;
  const jobTitle: JobTitle = JOB_TITLES.includes(rawJob)
    ? rawJob
    : "Safety Officer";

  const rawCat = f.kpiCategory?.stringValue as KpiCategory;
  const kpiCategory: KpiCategory =
    jobTitle === "Wakil Supervisor"
      ? "wakil_spv"
      : KPI_CATEGORIES.includes(rawCat) && rawCat !== "wakil_spv"
        ? rawCat
        : "shift_3g2s";

  return {
    uid,
    employeeId: f.employeeId?.stringValue || "",
    name: f.name?.stringValue || "",
    role,
    jobTitle,
    kpiCategory,
    bufn,
    smelter,
    unit:
      f.unit?.stringValue ||
      (bufn === "ALL" ? "Comprehensive HSE" : `${bufn} - ${smelter}`),
    isActive: f.isActive?.booleanValue ?? true,
  };
}

async function computeTeamMembersForSupervisor(
  spvBufn: string,
  spvSmelter: string,
  period: string,
  grades: GradeThreshold[],
  policy: ScoringPolicy
): Promise<TeamMemberKpiSummary[]> {
  const [allUserDocs, allCardDocs] = await Promise.all([
    firestoreListCollection("users"),
    firestoreListCollection("kpi_cards"),
  ]);

  // Map dokumen kartu periode tersebut berdasarkan uid
  const cardByUid: Record<
    string,
    { entriesJson?: string; totalScore?: number }
  > = {};
  for (const cDoc of allCardDocs) {
    const cf = cDoc.fields || {};
    if (cf.period?.stringValue === period && cf.uid?.stringValue) {
      cardByUid[cf.uid.stringValue] = {
        entriesJson: cf.entriesJson?.stringValue,
        totalScore:
          cf.totalScore?.doubleValue ??
          (cf.totalScore?.integerValue !== undefined
            ? Number(cf.totalScore.integerValue)
            : 0),
      };
    }
  }

  const members: TeamMemberKpiSummary[] = [];

  for (const uDoc of allUserDocs) {
    const uf = uDoc.fields || {};
    const uid = uf.uid?.stringValue || uDoc.name?.split("/").pop() || "";
    if (!uid) continue;
    const profile = parseUserProfileFromFields(uid, uf);

    // Anggota tim Wakil SPV = personel aktif di BUFN & Smelter yang sama, dan bukan Wakil Supervisor
    if (
      !profile.isActive ||
      profile.role !== "safety_officer" ||
      profile.jobTitle === "Wakil Supervisor" ||
      profile.bufn !== spvBufn ||
      profile.smelter !== spvSmelter
    ) {
      continue;
    }

    const savedCard = cardByUid[uid];
    if (!savedCard?.entriesJson) {
      // Belum dinilai pada bulan ini -> dianggap belum mencapai indikator wajib
      members.push({
        uid: profile.uid,
        employeeId: profile.employeeId,
        name: profile.name,
        jobTitle: profile.jobTitle,
        kpiCategory: KPI_CATEGORY_LABELS[profile.kpiCategory],
        totalScore: 0,
        hasFailedCore: true,
        failedCoreCodes: ["Belum Dinilai"],
        hasCardSaved: false,
      });
      continue;
    }

    try {
      const parsedEntries = JSON.parse(
        savedCard.entriesJson
      ) as KpiEntryItem[];
      const normalized = parsedEntries.map((item) => {
        const fType = item.formulaType || "higher_better";
        const score = calculateDynamicScore(
          fType,
          item.actual,
          item.target,
          item.weight
        );
        return {
          code: item.code,
          name: item.name,
          formulaType: fType,
          weight: Number(item.weight) || 0,
          score,
        };
      });

      const evalRes = evaluateKpiResult(normalized, grades, policy);
      members.push({
        uid: profile.uid,
        employeeId: profile.employeeId,
        name: profile.name,
        jobTitle: profile.jobTitle,
        kpiCategory: KPI_CATEGORY_LABELS[profile.kpiCategory],
        totalScore: evalRes.totalScore,
        hasFailedCore: evalRes.failedCoreCodes.length > 0,
        failedCoreCodes: evalRes.failedCoreCodes,
        hasCardSaved: true,
      });
    } catch {
      members.push({
        uid: profile.uid,
        employeeId: profile.employeeId,
        name: profile.name,
        jobTitle: profile.jobTitle,
        kpiCategory: KPI_CATEGORY_LABELS[profile.kpiCategory],
        totalScore: 0,
        hasFailedCore: true,
        failedCoreCodes: ["Data Tidak Valid"],
        hasCardSaved: false,
      });
    }
  }

  return members.sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json(
      { berhasil: false, pesan: "Sesi tidak valid." },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") || getDefaultPeriod()).trim();
    const requestedUid = (searchParams.get("uid") || currentUser.uid).trim();
    const syncMaster = searchParams.get("syncMaster") === "1";

    const isSuperAdmin = currentUser.role === "super_admin";
    const isAdmin = currentUser.role === "admin";
    const isAdminOrAbove = isSuperAdmin || isAdmin;

    // Ambil profil pengguna yang sedang login untuk mengecek apakah ia Wakil Supervisor
    const currentUserDoc = await firestoreGetDoc("users", currentUser.uid);
    const loggedInProfile = currentUserDoc?.fields
      ? parseUserProfileFromFields(currentUser.uid, currentUserDoc.fields)
      : null;
    const isLoggedInWakilSpv =
      loggedInProfile?.jobTitle === "Wakil Supervisor";

    // Ambil profil pemilik kartu yang diminta
    const targetUid =
      isAdminOrAbove || isLoggedInWakilSpv ? requestedUid : currentUser.uid;
    const targetUserDoc = await firestoreGetDoc("users", targetUid);
    if (!targetUserDoc?.fields) {
      return NextResponse.json(
        { berhasil: false, pesan: "Profil personel tidak ditemukan." },
        { status: 404 }
      );
    }

    const ownerInfo = parseUserProfileFromFields(
      targetUid,
      targetUserDoc.fields
    );

    // Validasi Isolasi Akses:
    if (isAdmin && ownerInfo.bufn !== currentUser.bufn) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: `Akses ditolak. Anda hanya memiliki wewenang untuk anggota di ${currentUser.bufn}.`,
        },
        { status: 403 }
      );
    }

    if (!isAdminOrAbove && isLoggedInWakilSpv && loggedInProfile) {
      // Wakil SPV boleh melihat kartu miliknya sendiri atau anggota di BUFN & Smelter yang sama
      const sameArea =
        ownerInfo.bufn === loggedInProfile.bufn &&
        ownerInfo.smelter === loggedInProfile.smelter;
      if (targetUid !== currentUser.uid && !sameArea) {
        return NextResponse.json(
          {
            berhasil: false,
            pesan: `Akses ditolak. Anda hanya dapat memantau anggota di ${loggedInProfile.bufn} - ${loggedInProfile.smelter}.`,
          },
          { status: 403 }
        );
      }
    }

    const docId = `${targetUid}_${period}`;
    const cardDoc = await firestoreGetDoc("kpi_cards", docId);

    const [paramDocs, currentGrades, currentPolicy] = await Promise.all([
      firestoreListCollection("kpi_parameters"),
      getKpiGrades(),
      getScoringPolicy(),
    ]);

    // Filter parameter aktif yang berlaku untuk kategori pola KPI pemilik kartu
    const categoryParams = paramDocs
      .map(parseKpiParameterDoc)
      .filter(
        (p: KpiParameter) =>
          p.isActive && p.applicableCategories.includes(ownerInfo.kpiCategory)
      )
      .sort(
        (a: KpiParameter, b: KpiParameter) =>
          a.order - b.order || a.code.localeCompare(b.code)
      );

    let status: KpiCardStatus = "draft";
    let adminFeedback = "";
    let updatedAt = "";
    let assessedBy = "";
    let entries: KpiEntryItem[] = [];
    let gradesScale: GradeThreshold[] = currentGrades;
    let activePolicy: ScoringPolicy = currentPolicy;
    let isHistoricalSnapshot = false;

    if (cardDoc?.fields) {
      const f = cardDoc.fields;
      status = (f.status?.stringValue || "draft") as KpiCardStatus;
      adminFeedback = f.adminFeedback?.stringValue || "";
      updatedAt = f.updatedAt?.stringValue || "";
      assessedBy = f.assessedBy?.stringValue || "";

      if (f.gradesJson?.stringValue && !(syncMaster && isAdminOrAbove)) {
        try {
          const parsedGrades = JSON.parse(
            f.gradesJson.stringValue
          ) as GradeThreshold[];
          if (Array.isArray(parsedGrades) && parsedGrades.length > 0) {
            gradesScale = parsedGrades;
          }
        } catch {
          gradesScale = currentGrades;
        }
      }

      if (f.policyJson?.stringValue && !(syncMaster && isAdminOrAbove)) {
        try {
          const parsedPolicy = JSON.parse(
            f.policyJson.stringValue
          ) as ScoringPolicy;
          if (parsedPolicy && typeof parsedPolicy === "object") {
            activePolicy = parsedPolicy;
          }
        } catch {
          activePolicy = currentPolicy;
        }
      }

      if (f.entriesJson?.stringValue) {
        try {
          const savedEntries = JSON.parse(
            f.entriesJson.stringValue
          ) as KpiEntryItem[];

          if (
            Array.isArray(savedEntries) &&
            savedEntries.length > 0 &&
            !(syncMaster && isAdminOrAbove)
          ) {
            isHistoricalSnapshot = true;
            entries = savedEntries.map((item) => {
              const fType = item.formulaType || "higher_better";
              const score = calculateDynamicScore(
                fType,
                item.actual,
                item.target,
                item.weight
              );
              return {
                parameterId: item.parameterId,
                code: item.code,
                name: item.name,
                formulaType: fType,
                unit: item.unit,
                target: Number(item.target) || 0,
                weight: Number(item.weight) || 0,
                actual: Number(item.actual) || 0,
                score,
                notes: item.notes || "",
              };
            });
          } else if (Array.isArray(savedEntries)) {
            const savedMap: Record<string, { actual: number; notes: string }> =
              {};
            for (const item of savedEntries) {
              savedMap[item.parameterId] = {
                actual: Number(item.actual) || 0,
                notes: item.notes || "",
              };
            }
            entries = categoryParams.map((p: KpiParameter) => {
              const prev = savedMap[p.id] || { actual: 0, notes: "" };
              const t = getParamTargetForCategory(p, ownerInfo.kpiCategory);
              const w = getParamWeightForCategory(p, ownerInfo.kpiCategory);
              return {
                parameterId: p.id,
                code: p.code,
                name: p.name,
                formulaType: p.formulaType || "higher_better",
                unit: p.unit,
                target: t,
                weight: w,
                actual: prev.actual,
                score: calculateDynamicScore(
                  p.formulaType || "higher_better",
                  prev.actual,
                  t,
                  w
                ),
                notes: prev.notes,
              };
            });
          }
        } catch {
          entries = [];
        }
      }
    }

    if (entries.length === 0) {
      entries = categoryParams.map((p: KpiParameter) => {
        const t = getParamTargetForCategory(p, ownerInfo.kpiCategory);
        const w = getParamWeightForCategory(p, ownerInfo.kpiCategory);
        return {
          parameterId: p.id,
          code: p.code,
          name: p.name,
          formulaType: p.formulaType || "higher_better",
          unit: p.unit,
          target: t,
          weight: w,
          actual: 0,
          score: calculateDynamicScore(
            p.formulaType || "higher_better",
            0,
            t,
            w
          ),
          notes: "",
        };
      });
    }

    let coreScore = 0;
    let bonusScore = 0;
    let totalScore = 0;
    let grade: GradeThreshold;
    let gateTriggered = false;
    let failedCoreCodes: string[] = [];
    let supervisorBreakdown: SupervisorBreakdown | undefined;

    if (ownerInfo.jobTitle === "Wakil Supervisor") {
      const teamMembers = await computeTeamMembersForSupervisor(
        ownerInfo.bufn,
        ownerInfo.smelter,
        period,
        gradesScale,
        activePolicy
      );
      const spvEval = evaluateSupervisorKpiResult(
        entries,
        teamMembers,
        gradesScale,
        activePolicy
      );

      coreScore = spvEval.personalCoreScore;
      bonusScore = spvEval.personalBonusScore;
      totalScore = spvEval.totalScore;
      grade = spvEval.grade;
      gateTriggered = spvEval.gateTriggered;
      failedCoreCodes = spvEval.failedCoreCodes;

      supervisorBreakdown = {
        personalRawScore: spvEval.personalRawScore,
        personalCoreScore: spvEval.personalCoreScore,
        personalBonusScore: spvEval.personalBonusScore,
        personalWeightPct: spvEval.personalWeightPct,
        personalWeightedScore: spvEval.personalWeightedScore,

        teamWeightPct: spvEval.teamWeightPct,
        teamCalcMode: spvEval.teamCalcMode,
        teamAverageScore: spvEval.teamAverageScore,
        baseTeamPoints: spvEval.baseTeamPoints,
        failedMembersCount: spvEval.failedMembersCount,
        penaltyPerMember: spvEval.penaltyPerMember,
        totalPenalty: spvEval.totalPenalty,
        teamWeightedScore: spvEval.teamWeightedScore,

        teamMembers,
      };
    } else {
      const evaluation = evaluateKpiResult(entries, gradesScale, activePolicy);
      coreScore = evaluation.coreScore;
      bonusScore = evaluation.bonusScore;
      totalScore = evaluation.totalScore;
      grade = evaluation.grade;
      gateTriggered = evaluation.gateTriggered;
      failedCoreCodes = evaluation.failedCoreCodes;
    }

    const card: KpiCardRecord = {
      id: docId,
      uid: ownerInfo.uid,
      employeeId: ownerInfo.employeeId,
      userName: ownerInfo.name,
      jobTitle: ownerInfo.jobTitle,
      kpiCategory: ownerInfo.kpiCategory,
      kpiCategoryLabel: KPI_CATEGORY_LABELS[ownerInfo.kpiCategory],
      bufn: ownerInfo.bufn,
      smelter: ownerInfo.smelter,
      userUnit: ownerInfo.unit,
      period,
      periodDateRange: formatPeriodDateRange(period, activePolicy),
      status,
      coreScore,
      bonusScore,
      totalScore,
      grade,
      gateTriggered,
      failedCoreCodes,
      gradesScale,
      policy: activePolicy,
      supervisorBreakdown,
      adminFeedback,
      entries,
      updatedAt,
      assessedBy,
      isHistoricalSnapshot,
    };

    return NextResponse.json({ berhasil: true, card });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          error instanceof Error ? error.message : "Gagal memuat Kartu KPI.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json(
      { berhasil: false, pesan: "Sesi tidak valid." },
      { status: 401 }
    );
  }

  const isSuperAdmin = currentUser.role === "super_admin";
  const isAdmin = currentUser.role === "admin";
  if (!isSuperAdmin && !isAdmin) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          "Hanya Admin BUFN atau Super Admin yang dapat mengisi atau merevisi penilaian KPI.",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const period = String(body.period || "").trim();
    const targetUid = String(body.uid || "").trim();
    const statusInput = body.status === "published" ? "published" : "draft";
    const adminFeedback = String(body.adminFeedback || "").trim();
    const rawEntries = Array.isArray(body.entries) ? body.entries : [];

    if (!targetUid || !/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: "Personel dan periode bulan wajib dipilih.",
        },
        { status: 400 }
      );
    }

    const userDoc = await firestoreGetDoc("users", targetUid);
    if (!userDoc?.fields) {
      return NextResponse.json(
        { berhasil: false, pesan: "Data personel tidak ditemukan." },
        { status: 404 }
      );
    }

    const ownerInfo = parseUserProfileFromFields(targetUid, userDoc.fields);

    if (isAdmin && ownerInfo.bufn !== currentUser.bufn) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: `Anda hanya dapat menilai anggota di wilayah ${currentUser.bufn}.`,
        },
        { status: 403 }
      );
    }

    const [currentGrades, currentPolicy] = await Promise.all([
      getKpiGrades(),
      getScoringPolicy(),
    ]);

    const entries: KpiEntryItem[] = rawEntries.map(
      (item: {
        parameterId?: string;
        code?: string;
        name?: string;
        formulaType?: FormulaType;
        unit?: string;
        target?: number;
        weight?: number;
        actual?: number;
        notes?: string;
      }) => {
        const fType = (item.formulaType || "higher_better") as FormulaType;
        const target = Math.max(0, Number(item.target) || 0);
        const weight = Math.max(0, Number(item.weight) || 0);
        const actual = Math.max(0, Number(item.actual) || 0);
        const score = calculateDynamicScore(fType, actual, target, weight);

        return {
          parameterId: String(item.parameterId || ""),
          code: String(item.code || ""),
          name: String(item.name || ""),
          formulaType: fType,
          unit: String(item.unit || "Kegiatan"),
          target,
          weight,
          actual,
          score,
          notes: String(item.notes || "").trim(),
        };
      }
    );

    let coreScore = 0;
    let bonusScore = 0;
    let totalScore = 0;

    if (ownerInfo.jobTitle === "Wakil Supervisor") {
      const teamMembers = await computeTeamMembersForSupervisor(
        ownerInfo.bufn,
        ownerInfo.smelter,
        period,
        currentGrades,
        currentPolicy
      );
      const spvEval = evaluateSupervisorKpiResult(
        entries,
        teamMembers,
        currentGrades,
        currentPolicy
      );
      coreScore = spvEval.personalCoreScore;
      bonusScore = spvEval.personalBonusScore;
      totalScore = spvEval.totalScore;
    } else {
      const evaluation = evaluateKpiResult(
        entries,
        currentGrades,
        currentPolicy
      );
      coreScore = evaluation.coreScore;
      bonusScore = evaluation.bonusScore;
      totalScore = evaluation.totalScore;
    }

    const docId = `${targetUid}_${period}`;
    const now = new Date().toISOString();
    const assessedBy = `${currentUser.name} (${currentUser.employeeId})`;

    await firestoreSetDoc("kpi_cards", docId, {
      id: { stringValue: docId },
      uid: { stringValue: targetUid },
      employeeId: { stringValue: ownerInfo.employeeId },
      userName: { stringValue: ownerInfo.name },
      jobTitle: { stringValue: ownerInfo.jobTitle },
      kpiCategory: { stringValue: ownerInfo.kpiCategory },
      bufn: { stringValue: ownerInfo.bufn },
      smelter: { stringValue: ownerInfo.smelter },
      userUnit: { stringValue: ownerInfo.unit },
      period: { stringValue: period },
      status: { stringValue: statusInput },
      coreScore: { doubleValue: coreScore },
      bonusScore: { doubleValue: bonusScore },
      totalScore: { doubleValue: totalScore },
      adminFeedback: { stringValue: adminFeedback },
      entriesJson: { stringValue: JSON.stringify(entries) },
      gradesJson: { stringValue: JSON.stringify(currentGrades) },
      policyJson: { stringValue: JSON.stringify(currentPolicy) },
      updatedAt: { stringValue: now },
      assessedBy: { stringValue: assessedBy },
    });

    return NextResponse.json({
      berhasil: true,
      pesan:
        statusInput === "published"
          ? `Penilaian KPI ${ownerInfo.name} (${ownerInfo.jobTitle} • ${ownerInfo.bufn} - ${ownerInfo.smelter}) periode ${period} berhasil disimpan & dipublikasikan.`
          : `Draft penilaian KPI ${ownerInfo.name} (${period}) berhasil disimpan.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          error instanceof Error ? error.message : "Gagal menyimpan Kartu KPI.",
      },
      { status: 500 }
    );
  }
}