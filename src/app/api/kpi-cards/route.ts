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

export type KpiCardStatus = "draft" | "published";

export interface KpiEntryItem {
  parameterId: string;
  code: string;
  name: string;
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
  userUnit: string;
  period: string; // Format: "YYYY-MM"
  status: KpiCardStatus;
  totalScore: number;
  adminFeedback: string;
  entries: KpiEntryItem[];
  updatedAt: string;
  assessedBy: string;
}

export function calculateEntryScore(
  actual: number,
  target: number,
  weight: number
): number {
  if (target <= 0 || actual <= 0) return 0;
  const raw = (actual / target) * weight;
  const capped = Math.min(raw, weight);
  return Math.round(capped * 100) / 100;
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

    const isAdminOrAbove =
      currentUser.role === "super_admin" || currentUser.role === "admin";

    // Safety Officer hanya boleh melihat Kartu KPI miliknya sendiri
    const targetUid = isAdminOrAbove ? requestedUid : currentUser.uid;

    // 1. Ambil Master Parameter KPI aktif
    const paramDocs = await firestoreListCollection("kpi_parameters");
    const activeParams = paramDocs
      .map(parseKpiParameterDoc)
      .filter((p: KpiParameter) => p.isActive)
      .sort(
        (a: KpiParameter, b: KpiParameter) =>
          a.order - b.order || a.code.localeCompare(b.code)
      );

    // 2. Ambil profil pemilik kartu
    const userDoc = await firestoreGetDoc("users", targetUid);
    const uFields = userDoc?.fields || {};
    const ownerInfo = {
      uid: targetUid,
      employeeId: uFields.employeeId?.stringValue || currentUser.employeeId,
      name: uFields.name?.stringValue || currentUser.name,
      unit: uFields.unit?.stringValue || currentUser.unit,
    };

    // 3. Ambil data Kartu KPI periode tersebut
    const docId = `${targetUid}_${period}`;
    const cardDoc = await firestoreGetDoc("kpi_cards", docId);

    let status: KpiCardStatus = "draft";
    let adminFeedback = "";
    let updatedAt = "";
    let assessedBy = "";
    let savedMap: Record<string, { actual: number; notes: string }> = {};

    if (cardDoc?.fields) {
      const f = cardDoc.fields;
      status = (f.status?.stringValue || "draft") as KpiCardStatus;
      adminFeedback = f.adminFeedback?.stringValue || "";
      updatedAt = f.updatedAt?.stringValue || "";
      assessedBy = f.assessedBy?.stringValue || "";

      if (f.entriesJson?.stringValue) {
        try {
          const parsed = JSON.parse(f.entriesJson.stringValue) as Array<{
            parameterId: string;
            actual: number;
            notes: string;
          }>;
          for (const item of parsed) {
            savedMap[item.parameterId] = {
              actual: Number(item.actual) || 0,
              notes: item.notes || "",
            };
          }
        } catch {
          savedMap = {};
        }
      }
    }

    const entries: KpiEntryItem[] = activeParams.map((p: KpiParameter) => {
      const saved = savedMap[p.id];
      const actual = saved ? saved.actual : 0;
      const notes = saved ? saved.notes : "";
      const score = calculateEntryScore(actual, p.target, p.weight);
      return {
        parameterId: p.id,
        code: p.code,
        name: p.name,
        unit: p.unit,
        target: p.target,
        weight: p.weight,
        actual,
        score,
        notes,
      };
    });

    const totalScore =
      Math.round(entries.reduce((sum, item) => sum + item.score, 0) * 100) /
      100;

    const card: KpiCardRecord = {
      id: docId,
      uid: ownerInfo.uid,
      employeeId: ownerInfo.employeeId,
      userName: ownerInfo.name,
      userUnit: ownerInfo.unit,
      period,
      status,
      totalScore,
      adminFeedback,
      entries,
      updatedAt,
      assessedBy,
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

  // Hanya Admin dan Super Admin yang berhak mengisi / merevisi penilaian KPI
  const isAdminOrAbove =
    currentUser.role === "super_admin" || currentUser.role === "admin";
  if (!isAdminOrAbove) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan: "Hanya Admin atau Super Admin yang dapat mengisi atau merevisi penilaian KPI.",
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
        { berhasil: false, pesan: "Personel Safety Officer dan periode bulan wajib dipilih." },
        { status: 400 }
      );
    }

    const paramDocs = await firestoreListCollection("kpi_parameters");
    const activeParams = paramDocs
      .map(parseKpiParameterDoc)
      .filter((p: KpiParameter) => p.isActive)
      .sort(
        (a: KpiParameter, b: KpiParameter) =>
          a.order - b.order || a.code.localeCompare(b.code)
      );

    const inputMap: Record<string, { actual: number; notes: string }> = {};
    for (const item of rawEntries) {
      if (item && typeof item.parameterId === "string") {
        inputMap[item.parameterId] = {
          actual: Math.max(0, Number(item.actual) || 0),
          notes: String(item.notes || "").trim(),
        };
      }
    }

    const entries: KpiEntryItem[] = activeParams.map((p: KpiParameter) => {
      const inp = inputMap[p.id] || { actual: 0, notes: "" };
      const score = calculateEntryScore(inp.actual, p.target, p.weight);
      return {
        parameterId: p.id,
        code: p.code,
        name: p.name,
        unit: p.unit,
        target: p.target,
        weight: p.weight,
        actual: inp.actual,
        score,
        notes: inp.notes,
      };
    });

    const totalScore =
      Math.round(entries.reduce((sum, item) => sum + item.score, 0) * 100) /
      100;

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
    const userUnit = uFields.unit?.stringValue || "-";

    const docId = `${targetUid}_${period}`;
    const now = new Date().toISOString();
    const assessedBy = `${currentUser.name} (${currentUser.employeeId})`;

    await firestoreSetDoc("kpi_cards", docId, {
      id: { stringValue: docId },
      uid: { stringValue: targetUid },
      employeeId: { stringValue: employeeId },
      userName: { stringValue: userName },
      userUnit: { stringValue: userUnit },
      period: { stringValue: period },
      status: { stringValue: statusInput },
      totalScore: { doubleValue: totalScore },
      adminFeedback: { stringValue: adminFeedback },
      entriesJson: { stringValue: JSON.stringify(entries) },
      updatedAt: { stringValue: now },
      assessedBy: { stringValue: assessedBy },
    });

    return NextResponse.json({
      berhasil: true,
      pesan:
        statusInput === "published"
          ? `Penilaian KPI ${userName} (${period}) berhasil disimpan & dipublikasikan.`
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