import { NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  firestoreListCollection,
  firestoreSetDoc,
} from "@/lib/firebase-admin";
import { getCurrentUser } from "@/lib/session";

export interface KpiParameter {
  id: string;
  code: string;
  name: string;
  description: string;
  unit: string;
  target: number;
  weight: number;
  isActive: boolean;
  order: number;
}

export function parseKpiParameterDoc(doc: {
  name?: string;
  fields?: Record<
    string,
    {
      stringValue?: string;
      integerValue?: string;
      doubleValue?: number;
      booleanValue?: boolean;
    }
  >;
}): KpiParameter {
  const f = doc.fields || {};
  const fallbackId = doc.name?.split("/").pop() || "";
  const rawTarget =
    f.target?.doubleValue ??
    (f.target?.integerValue ? Number(f.target.integerValue) : 0);
  const rawWeight =
    f.weight?.doubleValue ??
    (f.weight?.integerValue ? Number(f.weight.integerValue) : 0);
  const rawOrder =
    f.order?.integerValue !== undefined
      ? Number(f.order.integerValue)
      : f.order?.doubleValue ?? 0;

  return {
    id: f.id?.stringValue || fallbackId,
    code: f.code?.stringValue || "",
    name: f.name?.stringValue || "",
    description: f.description?.stringValue || "",
    unit: f.unit?.stringValue || "Kegiatan",
    target: Number(rawTarget) || 0,
    weight: Number(rawWeight) || 0,
    isActive: f.isActive?.booleanValue ?? true,
    order: Number(rawOrder) || 0,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { berhasil: false, pesan: "Sesi tidak valid." },
      { status: 401 }
    );
  }

  try {
    const docs = await firestoreListCollection("kpi_parameters");
    const parameters = docs
      .map(parseKpiParameterDoc)
      .sort((a: KpiParameter, b: KpiParameter) => a.order - b.order || a.code.localeCompare(b.code));

    return NextResponse.json({ berhasil: true, parameters });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan: error instanceof Error ? error.message : "Gagal memuat parameter KPI.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return NextResponse.json(
      { berhasil: false, pesan: "Hanya Admin / Super Admin yang dapat menambah parameter KPI." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const code = String(body.code || "").trim().toUpperCase();
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const unit = String(body.unit || "Kegiatan").trim();
    const target = Number(body.target);
    const weight = Number(body.weight);
    const order = Number(body.order) || 1;

    if (!code || !name || Number.isNaN(target) || target <= 0 || Number.isNaN(weight) || weight <= 0) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: "Kode, Nama Parameter, Target (> 0), dan Bobot (> 0) wajib diisi dengan benar.",
        },
        { status: 400 }
      );
    }

    // Cek total bobot parameter aktif agar tidak melebihi 100%
    const docs = await firestoreListCollection("kpi_parameters");
    const existing = docs.map(parseKpiParameterDoc);
    const activeWeight = existing
      .filter((p: KpiParameter) => p.isActive)
      .reduce((acc: number, p: KpiParameter) => acc + p.weight, 0);

    if (Math.round((activeWeight + weight) * 100) / 100 > 100) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: `Total bobot aktif saat ini ${activeWeight}%. Penambahan ${weight}% akan melebihi batas 100%.`,
        },
        { status: 400 }
      );
    }

    const id = `kpi_${crypto.randomUUID().slice(0, 8)}`;
    await firestoreSetDoc("kpi_parameters", id, {
      id: { stringValue: id },
      code: { stringValue: code },
      name: { stringValue: name },
      description: { stringValue: description },
      unit: { stringValue: unit },
      target: { doubleValue: target },
      weight: { doubleValue: weight },
      isActive: { booleanValue: true },
      order: { integerValue: String(Math.round(order)) },
    });

    return NextResponse.json({
      berhasil: true,
      pesan: `Parameter KPI "${name}" berhasil ditambahkan.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan: error instanceof Error ? error.message : "Gagal menyimpan parameter KPI.",
      },
      { status: 500 }
    );
  }
}