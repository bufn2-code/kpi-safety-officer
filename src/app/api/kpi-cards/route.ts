import { NextResponse } from "next/server";
import {
  firestoreGetDoc,
  firestoreListCollection,
  firestoreSetDoc,
} from "@/lib/firebase-admin";
import { getCurrentUser } from "@/lib/session";
import {
  parseKpiParameterDoc,
  type KpiParameter,
} from "@/app/api/admin/kpi-parameters/route";
import {
  calculateDynamicScore,
  evaluateKpiResult,
  getKpiGrades,
  getScoringPolicy,
  type FormulaType,
  type GradeThreshold,
  type ScoringPolicy,
} from "@/lib/kpi-engine";

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

export interface KpiCardRecord {
  id: string;
  uid: string;
  employeeId: string;
  userName: string;
  bufn: string;
  smelter: string;
  userUnit: string;
  period: string;
  status: KpiCardStatus;
  coreScore: number;
  bonusScore: number;
  totalScore: number;
  grade: GradeThreshold;
  gateTriggered: boolean;
  failedCoreCodes: string[];
  gradesScale: GradeThreshold[];
  policy: ScoringPolicy;
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

    const targetUid = isAdminOrAbove ? requestedUid : currentUser.uid;

    const userDoc = await firestoreGetDoc("users", targetUid);
    if (!userDoc?.fields) {
      return NextResponse.json(
        { berhasil: false, pesan: "Profil personel tidak ditemukan." },
        { status: 404 }
      );
    }

    const uFields = userDoc.fields;
    const ownerBufn = uFields.bufn?.stringValue || "BUFN 1";
    const ownerSmelter = uFields.smelter?.stringValue || "-";

    if (isAdmin && ownerBufn !== currentUser.bufn) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: `Akses ditolak. Anda hanya memiliki wewenang untuk anggota di ${currentUser.bufn}.`,
        },
        { status: 403 }
      );
    }

    const ownerInfo = {
      uid: targetUid,
      employeeId: uFields.employeeId?.stringValue || currentUser.employeeId,
      name: uFields.name?.stringValue || currentUser.name,
      bufn: ownerBufn,
      smelter: ownerSmelter,
      unit:
        uFields.unit?.stringValue ||
        (ownerBufn === "ALL"
          ? "Comprehensive HSE"
          : `${ownerBufn} - ${ownerSmelter}`),
    };

    const docId = `${targetUid}_${period}`;
    const cardDoc = await firestoreGetDoc("kpi_cards", docId);

    const [paramDocs, currentGrades, currentPolicy] = await Promise.all([
      firestoreListCollection("kpi_parameters"),
      getKpiGrades(),
      getScoringPolicy(),
    ]);

    const activeParams = paramDocs
      .map(parseKpiParameterDoc)
      .filter((p: KpiParameter) => p.isActive)
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
            entries = activeParams.map((p: KpiParameter) => {
              const prev = savedMap[p.id] || { actual: 0, notes: "" };
              return {
                parameterId: p.id,
                code: p.code,
                name: p.name,
                formulaType: p.formulaType || "higher_better",
                unit: p.unit,
                target: p.target,
                weight: p.weight,
                actual: prev.actual,
                score: calculateDynamicScore(
                  p.formulaType || "higher_better",
                  prev.actual,
                  p.target,
                  p.weight
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
      entries = activeParams.map((p: KpiParameter) => ({
        parameterId: p.id,
        code: p.code,
        name: p.name,
        formulaType: p.formulaType || "higher_better",
        unit: p.unit,
        target: p.target,
        weight: p.weight,
        actual: 0,
        score: calculateDynamicScore(
          p.formulaType || "higher_better",
          0,
          p.target,
          p.weight
        ),
        notes: "",
      }));
    }

    const evaluation = evaluateKpiResult(entries, gradesScale, activePolicy);

    const card: KpiCardRecord = {
      id: docId,
      uid: ownerInfo.uid,
      employeeId: ownerInfo.employeeId,
      userName: ownerInfo.name,
      bufn: ownerInfo.bufn,
      smelter: ownerInfo.smelter,
      userUnit: ownerInfo.unit,
      period,
      status,
      coreScore: evaluation.coreScore,
      bonusScore: evaluation.bonusScore,
      totalScore: evaluation.totalScore,
      grade: evaluation.grade,
      gateTriggered: evaluation.gateTriggered,
      failedCoreCodes: evaluation.failedCoreCodes,
      gradesScale,
      policy: activePolicy,
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
          pesan: "Personel Safety Officer dan periode bulan wajib dipilih.",
        },
        { status: 400 }
      );
    }

    const userDoc = await firestoreGetDoc("users", targetUid);
    if (!userDoc?.fields) {
      return NextResponse.json(
        { berhasil: false, pesan: "Data Safety Officer tidak ditemukan." },
        { status: 404 }
      );
    }

    const uFields = userDoc.fields;
    const employeeId = uFields.employeeId?.stringValue || "";
    const userName = uFields.name?.stringValue || "";
    const ownerBufn = uFields.bufn?.stringValue || "BUFN 1";
    const ownerSmelter = uFields.smelter?.stringValue || "-";
    const userUnit =
      uFields.unit?.stringValue || `${ownerBufn} - ${ownerSmelter}`;

    if (isAdmin && ownerBufn !== currentUser.bufn) {
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

    const evaluation = evaluateKpiResult(entries, currentGrades, currentPolicy);

    const docId = `${targetUid}_${period}`;
    const now = new Date().toISOString();
    const assessedBy = `${currentUser.name} (${currentUser.employeeId})`;

    await firestoreSetDoc("kpi_cards", docId, {
      id: { stringValue: docId },
      uid: { stringValue: targetUid },
      employeeId: { stringValue: employeeId },
      userName: { stringValue: userName },
      bufn: { stringValue: ownerBufn },
      smelter: { stringValue: ownerSmelter },
      userUnit: { stringValue: userUnit },
      period: { stringValue: period },
      status: { stringValue: statusInput },
      coreScore: { doubleValue: evaluation.coreScore },
      bonusScore: { doubleValue: evaluation.bonusScore },
      totalScore: { doubleValue: evaluation.totalScore },
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
          ? `Penilaian KPI ${userName} (${ownerBufn} - ${ownerSmelter}) periode ${period} berhasil disimpan & dipublikasikan.`
          : `Draft penilaian KPI ${userName} (${period}) berhasil disimpan.`,
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