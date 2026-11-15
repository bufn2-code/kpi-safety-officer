import { firestoreListCollection } from "@/lib/firebase-admin";
import { type UserRole } from "@/lib/session";
import {
  calculateDynamicScore,
  evaluateKpiResult,
  evaluateSupervisorKpiResult,
  formatPeriodDateRange,
  getKpiGrades,
  getScoringPolicy,
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
import type {
  KpiCardStatus,
  KpiEntryItem,
  SupervisorBreakdown,
} from "@/app/api/kpi-cards/route";

export interface MonthlyHistoryPoint {
  month: string; // "01" .. "12"
  period: string; // "YYYY-01" .. "YYYY-12"
  label: string; // "Jan", "Feb", dst.
  hasData: boolean;
  status: KpiCardStatus | "unassessed";
  totalScore: number;
  gradeLetter: string;
  gradeLabel: string;
  gradeColor: string;
}

export interface PersonRecapRow {
  uid: string;
  employeeId: string;
  name: string;
  jobTitle: JobTitle;
  kpiCategory: KpiCategory;
  kpiCategoryLabel: string;
  bufn: string;
  smelter: string;

  // Periode bulan yang dipilih
  period: string;
  periodDateRange: string;
  hasCard: boolean;
  status: KpiCardStatus | "unassessed";
  coreScore: number;
  bonusScore: number;
  totalScore: number;
  grade: GradeThreshold;
  gateTriggered: boolean;
  failedCoreCodes: string[];
  adminFeedback: string;
  assessedBy: string;
  updatedAt: string;
  entries: KpiEntryItem[];
  supervisorBreakdown?: SupervisorBreakdown;

  // Riwayat 1 Tahun Berjalan (Jan - Des pada tahun terpilih)
  year: string;
  yearlyHistory: MonthlyHistoryPoint[];
  assessedMonthsCount: number;
  yearlyAverageScore: number;
  yearlyGrade: GradeThreshold;
}

interface ParsedOfficer {
  uid: string;
  employeeId: string;
  name: string;
  role: UserRole;
  jobTitle: JobTitle;
  kpiCategory: KpiCategory;
  bufn: string;
  smelter: string;
  isActive: boolean;
}

const MONTH_SHORT_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

function parseUserRow(
  uid: string,
  f: Record<string, { stringValue?: string; booleanValue?: boolean }>
): ParsedOfficer {
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
    isActive: f.isActive?.booleanValue ?? true,
  };
}

interface ParsedRawCard {
  uid: string;
  period: string;
  status: KpiCardStatus;
  adminFeedback: string;
  assessedBy: string;
  updatedAt: string;
  entries: KpiEntryItem[];
  gradesScale: GradeThreshold[];
  policy: ScoringPolicy;
}

export async function buildFullKpiRecap(options: {
  period: string; // YYYY-MM
  restrictBufn?: string; // Diisi jika Admin BUFN
  restrictArea?: { bufn: string; smelter: string }; // Diisi jika Wakil SPV
  restrictUid?: string; // Diisi jika Safety Officer biasa
}): Promise<{
  period: string;
  year: string;
  periodDateRange: string;
  policy: ScoringPolicy;
  grades: GradeThreshold[];
  rows: PersonRecapRow[];
}> {
  const period = /^\d{4}-\d{2}$/.test(options.period)
    ? options.period
    : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const year = period.slice(0, 4);

  const [userDocs, cardDocs, defaultGrades, defaultPolicy] = await Promise.all([
    firestoreListCollection("users"),
    firestoreListCollection("kpi_cards"),
    getKpiGrades(),
    getScoringPolicy(),
  ]);

  // 1. Parse semua personel aktif (role safety_officer mencakup Junior, SO, Senior SO, Wakil SPV)
  const allOfficers: ParsedOfficer[] = (
    userDocs as Array<{
      name?: string;
      fields?: Record<string, { stringValue?: string; booleanValue?: boolean }>;
    }>
  )
    .map((doc) => {
      const f = doc.fields || {};
      const uid = f.uid?.stringValue || doc.name?.split("/").pop() || "";
      return parseUserRow(uid, f);
    })
    .filter((u: ParsedOfficer) => Boolean(u.uid) && u.isActive && u.role === "safety_officer");

  // 2. Parse semua dokumen kartu KPI untuk tahun berjalan (YYYY-01 s/d YYYY-12)
  const cardsByUidPeriod: Record<string, ParsedRawCard> = {};
  for (const doc of cardDocs as Array<{
    fields?: Record<string, { stringValue?: string }>;
  }>) {
    const f = doc.fields || {};
    const uid = f.uid?.stringValue || "";
    const cardPeriod = f.period?.stringValue || "";
    if (!uid || !cardPeriod.startsWith(`${year}-`)) continue;

    let entries: KpiEntryItem[] = [];
    if (f.entriesJson?.stringValue) {
      try {
        const parsed = JSON.parse(f.entriesJson.stringValue) as KpiEntryItem[];
        if (Array.isArray(parsed)) {
          entries = parsed.map((item) => {
            const fType = item.formulaType || "higher_better";
            const target = Number(item.target) || 0;
            const weight = Number(item.weight) || 0;
            const actual = Number(item.actual) || 0;
            return {
              parameterId: item.parameterId || "",
              code: item.code || "",
              name: item.name || "",
              formulaType: fType,
              unit: item.unit || "Kegiatan",
              target,
              weight,
              actual,
              score: calculateDynamicScore(fType, actual, target, weight),
              notes: item.notes || "",
            };
          });
        }
      } catch {
        entries = [];
      }
    }

    let gradesScale = defaultGrades;
    if (f.gradesJson?.stringValue) {
      try {
        const pg = JSON.parse(f.gradesJson.stringValue) as GradeThreshold[];
        if (Array.isArray(pg) && pg.length > 0) gradesScale = pg;
      } catch {
        gradesScale = defaultGrades;
      }
    }

    let policy = defaultPolicy;
    if (f.policyJson?.stringValue) {
      try {
        const pp = JSON.parse(f.policyJson.stringValue) as ScoringPolicy;
        if (pp && typeof pp === "object") policy = pp;
      } catch {
        policy = defaultPolicy;
      }
    }

    cardsByUidPeriod[`${uid}_${cardPeriod}`] = {
      uid,
      period: cardPeriod,
      status: (f.status?.stringValue || "draft") as KpiCardStatus,
      adminFeedback: f.adminFeedback?.stringValue || "",
      assessedBy: f.assessedBy?.stringValue || "",
      updatedAt: f.updatedAt?.stringValue || "",
      entries,
      gradesScale,
      policy,
    };
  }

  // Helper untuk mengevaluasi satu personel pada 1 bulan tertentu
  function evaluatePersonMonth(person: ParsedOfficer, targetPeriod: string) {
    const rawCard = cardsByUidPeriod[`${person.uid}_${targetPeriod}`];
    const grades = rawCard?.gradesScale || defaultGrades;
    const policy = rawCard?.policy || defaultPolicy;

    if (person.jobTitle !== "Wakil Supervisor") {
      if (!rawCard) {
        const emptyEval = evaluateKpiResult([], grades, policy);
        return {
          hasCard: false,
          status: "unassessed" as const,
          coreScore: 0,
          bonusScore: 0,
          totalScore: 0,
          grade: emptyEval.grade,
          gateTriggered: false,
          failedCoreCodes: [] as string[],
          adminFeedback: "",
          assessedBy: "",
          updatedAt: "",
          entries: [] as KpiEntryItem[],
          supervisorBreakdown: undefined,
        };
      }

      const evalRes = evaluateKpiResult(rawCard.entries, grades, policy);
      return {
        hasCard: true,
        status: rawCard.status,
        coreScore: evalRes.coreScore,
        bonusScore: evalRes.bonusScore,
        totalScore: evalRes.totalScore,
        grade: evalRes.grade,
        gateTriggered: evalRes.gateTriggered,
        failedCoreCodes: evalRes.failedCoreCodes,
        adminFeedback: rawCard.adminFeedback,
        assessedBy: rawCard.assessedBy,
        updatedAt: rawCard.updatedAt,
        entries: rawCard.entries,
        supervisorBreakdown: undefined,
      };
    }

    // Khusus Wakil Supervisor: gabungkan nilai pribadi + performa anggota di Smelter-nya
    const peers: ParsedOfficer[] = allOfficers.filter(
      (m: ParsedOfficer) =>
        m.jobTitle !== "Wakil Supervisor" &&
        m.bufn === person.bufn &&
        m.smelter === person.smelter
    );

    const teamMembers: TeamMemberKpiSummary[] = peers
      .map((m: ParsedOfficer) => {
        const mCard = cardsByUidPeriod[`${m.uid}_${targetPeriod}`];
        if (!mCard || mCard.entries.length === 0) {
          return {
            uid: m.uid,
            employeeId: m.employeeId,
            name: m.name,
            jobTitle: m.jobTitle,
            kpiCategory: KPI_CATEGORY_LABELS[m.kpiCategory],
            totalScore: 0,
            hasFailedCore: true,
            failedCoreCodes: ["Belum Dinilai"],
            hasCardSaved: false,
          };
        }
        const mEval = evaluateKpiResult(
          mCard.entries,
          mCard.gradesScale,
          mCard.policy
        );
        return {
          uid: m.uid,
          employeeId: m.employeeId,
          name: m.name,
          jobTitle: m.jobTitle,
          kpiCategory: KPI_CATEGORY_LABELS[m.kpiCategory],
          totalScore: mEval.totalScore,
          hasFailedCore: mEval.failedCoreCodes.length > 0,
          failedCoreCodes: mEval.failedCoreCodes,
          hasCardSaved: true,
        };
      })
      .sort((a: TeamMemberKpiSummary, b: TeamMemberKpiSummary) =>
        a.name.localeCompare(b.name)
      );

    const personalEntries = rawCard?.entries || [];
    const spvEval = evaluateSupervisorKpiResult(
      personalEntries,
      teamMembers,
      grades,
      policy
    );

    const supervisorBreakdown: SupervisorBreakdown = {
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

    return {
      hasCard: Boolean(rawCard),
      status: rawCard ? rawCard.status : ("unassessed" as const),
      coreScore: spvEval.personalCoreScore,
      bonusScore: spvEval.personalBonusScore,
      totalScore: spvEval.totalScore,
      grade: spvEval.grade,
      gateTriggered: spvEval.gateTriggered,
      failedCoreCodes: spvEval.failedCoreCodes,
      adminFeedback: rawCard?.adminFeedback || "",
      assessedBy: rawCard?.assessedBy || "",
      updatedAt: rawCard?.updatedAt || "",
      entries: personalEntries,
      supervisorBreakdown,
    };
  }

  // 3. Filter personel sesuai hak akses pemanggil
  const visibleOfficers: ParsedOfficer[] = allOfficers.filter(
    (u: ParsedOfficer) => {
      if (options.restrictUid) return u.uid === options.restrictUid;
      if (options.restrictArea) {
        return (
          u.bufn === options.restrictArea.bufn &&
          u.smelter === options.restrictArea.smelter
        );
      }
      if (options.restrictBufn) {
        return u.bufn === options.restrictBufn;
      }
      return true;
    }
  );

  // 4. Susun baris rekap lengkap beserta histori 12 bulan dalam 1 tahun berjalan
  const rows: PersonRecapRow[] = visibleOfficers
    .map((person: ParsedOfficer) => {
      const currentEval = evaluatePersonMonth(person, period);

      const yearlyHistory: MonthlyHistoryPoint[] = MONTH_SHORT_NAMES.map(
        (label, idx) => {
          const mm = String(idx + 1).padStart(2, "0");
          const mPeriod = `${year}-${mm}`;
          const mEval =
            mPeriod === period
              ? currentEval
              : evaluatePersonMonth(person, mPeriod);

          return {
            month: mm,
            period: mPeriod,
            label,
            hasData: mEval.hasCard,
            status: mEval.status,
            totalScore: mEval.hasCard ? mEval.totalScore : 0,
            gradeLetter: mEval.hasCard ? mEval.grade.grade : "-",
            gradeLabel: mEval.hasCard ? mEval.grade.label : "Belum Dinilai",
            gradeColor: mEval.hasCard ? mEval.grade.color : "slate",
          };
        }
      );

      const assessedMonths = yearlyHistory.filter((h) => h.hasData);
      const assessedMonthsCount = assessedMonths.length;
      const yearlyAverageScore =
        assessedMonthsCount > 0
          ? Math.round(
              (assessedMonths.reduce((acc, h) => acc + h.totalScore, 0) /
                assessedMonthsCount) *
                100
            ) / 100
          : 0;

      // Tentukan grade rata-rata tahunan berdasarkan skala grade default
      const sortedGrades = [...defaultGrades].sort(
        (a, b) => b.minScore - a.minScore
      );
      const yearlyGrade =
        sortedGrades.find((g) => yearlyAverageScore >= g.minScore) ||
        sortedGrades[sortedGrades.length - 1];

      return {
        uid: person.uid,
        employeeId: person.employeeId,
        name: person.name,
        jobTitle: person.jobTitle,
        kpiCategory: person.kpiCategory,
        kpiCategoryLabel: KPI_CATEGORY_LABELS[person.kpiCategory],
        bufn: person.bufn,
        smelter: person.smelter,

        period,
        periodDateRange: formatPeriodDateRange(period, defaultPolicy),
        hasCard: currentEval.hasCard,
        status: currentEval.status,
        coreScore: currentEval.coreScore,
        bonusScore: currentEval.bonusScore,
        totalScore: currentEval.totalScore,
        grade: currentEval.grade,
        gateTriggered: currentEval.gateTriggered,
        failedCoreCodes: currentEval.failedCoreCodes,
        adminFeedback: currentEval.adminFeedback,
        assessedBy: currentEval.assessedBy,
        updatedAt: currentEval.updatedAt,
        entries: currentEval.entries,
        supervisorBreakdown: currentEval.supervisorBreakdown,

        year,
        yearlyHistory,
        assessedMonthsCount,
        yearlyAverageScore,
        yearlyGrade,
      };
    })
    .sort(
      (a: PersonRecapRow, b: PersonRecapRow) =>
        a.bufn.localeCompare(b.bufn, "id", { numeric: true }) ||
        a.smelter.localeCompare(b.smelter, "id", { numeric: true }) ||
        a.name.localeCompare(b.name)
    );

  return {
    period,
    year,
    periodDateRange: formatPeriodDateRange(period, defaultPolicy),
    policy: defaultPolicy,
    grades: defaultGrades,
    rows,
  };
}