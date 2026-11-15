import { NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  firestoreListCollection,
  firestoreSetDoc,
} from "@/lib/firebase-admin";
import { getCurrentUser } from "@/lib/session";
import type { FormulaType } from "@/lib/kpi-engine";
import { KPI_CATEGORIES, type KpiCategory } from "@/lib/work-areas";

export interface KpiParameter {
  id: string;
  code: string;
  name: string;
  description: string;
  formulaType: FormulaType;
  unit: string;
  target: number; // Target default / fallback
  weight: number; // Bobot default / fallback
  applicableCategories: KpiCategory[];
  categoryTargets: Partial<Record<KpiCategory, number>>;
  categoryWeights: Partial<Record<KpiCategory, number>>;
  isActive: boolean;
  order: number;
}

const VALID_FORMULAS = new Set<FormulaType>([
  "higher_better",
  "lower_better",
  "yes_no",
  "direct_percentage",
  "bonus_point",
]);

export function getParamTargetForCategory(
  p: KpiParameter,
  cat: KpiCategory
): number {
  const val = p.categoryTargets?.[cat];
  return val !== undefined && !Number.isNaN(Number(val))
    ? Number(val)
    : p.target;
}

export function getParamWeightForCategory(
  p: KpiParameter,
  cat: KpiCategory
): number {
  const val = p.categoryWeights?.[cat];
  return val !== undefined && !Number.isNaN(Number(val))
    ? Number(val)
    : p.weight;
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
    (f.target?.integerValue !== undefined ? Number(f.target.integerValue) : 0);
  const rawWeight =
    f.weight?.doubleValue ??
    (f.weight?.integerValue !== undefined ? Number(f.weight.integerValue) : 0);
  const rawOrder =
    f.order?.integerValue !== undefined
      ? Number(f.order.integerValue)
      : f.order?.doubleValue ?? 0;

  const rawFormula = (f.formulaType?.stringValue ||
    "higher_better") as FormulaType;

  let applicableCategories: KpiCategory[] = [...KPI_CATEGORIES];
  if (f.applicableCategoriesJson?.stringValue) {
    try {
      const parsed = JSON.parse(
        f.applicableCategoriesJson.stringValue
      ) as KpiCategory[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        applicableCategories = parsed.filter((c) => KPI_CATEGORIES.includes(c));
      }
    } catch {
      // fallback semua kategori
    }
  }

  let categoryTargets: Partial<Record<KpiCategory, number>> = {};
  if (f.categoryTargetsJson?.stringValue) {
    try {
      categoryTargets = JSON.parse(f.categoryTargetsJson.stringValue);
    } catch {
      categoryTargets = {};
    }
  }

  let categoryWeights: Partial<Record<KpiCategory, number>> = {};
  if (f.categoryWeightsJson?.stringValue) {
    try {
      categoryWeights = JSON.parse(f.categoryWeightsJson.stringValue);
    } catch {
      categoryWeights = {};
    }
  }

  return {
    id: f.id?.stringValue || fallbackId,
    code: f.code?.stringValue || "",
    name: f.name?.stringValue || "",
    description: f.description?.stringValue || "",
    formulaType: VALID_FORMULAS.has(rawFormula) ? rawFormula : "higher_better",
    unit: f.unit?.stringValue || "Kegiatan",
    target: Number(rawTarget) || 0,
    weight: Number(rawWeight) || 0,
    applicableCategories,
    categoryTargets,
    categoryWeights,
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
      .sort(
        (a: KpiParameter, b: KpiParameter) =>
          a.order - b.order || a.code.localeCompare(b.code)
      );

    return NextResponse.json({ berhasil: true, parameters });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          error instanceof Error
            ? error.message
            : "Gagal memuat parameter KPI.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin") {
    return NextResponse.json(
      {
        berhasil: false,
        pesan: "Hanya Super Admin yang dapat menambah Master Parameter KPI.",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const code = String(body.code || "").trim().toUpperCase();
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const rawFormula = String(
      body.formulaType || "higher_better"
    ) as FormulaType;
    const formulaType: FormulaType = VALID_FORMULAS.has(rawFormula)
      ? rawFormula
      : "higher_better";
    const unit = String(body.unit || "Kegiatan").trim();
    const target = Number(body.target);
    const weight = Number(body.weight);
    const order = Number(body.order) || 1;

    const rawCats = Array.isArray(body.applicableCategories)
      ? (body.applicableCategories as KpiCategory[]).filter((c) =>
          KPI_CATEGORIES.includes(c)
        )
      : [...KPI_CATEGORIES];

    if (rawCats.length === 0) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: "Pilih minimal 1 Kategori Pola Kerja KPI.",
        },
        { status: 400 }
      );
    }

    const categoryTargets: Partial<Record<KpiCategory, number>> = {};
    const categoryWeights: Partial<Record<KpiCategory, number>> = {};

    for (const cat of rawCats) {
      const ct = Number(body.categoryTargets?.[cat]);
      const cw = Number(body.categoryWeights?.[cat]);
      categoryTargets[cat] = !Number.isNaN(ct) && ct >= 0 ? ct : target;
      categoryWeights[cat] = !Number.isNaN(cw) && cw > 0 ? cw : weight;
    }

    if (
      !code ||
      !name ||
      Number.isNaN(target) ||
      target < 0 ||
      Number.isNaN(weight) ||
      weight <= 0
    ) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan:
            "Kode, Nama Parameter, Target/Poin (>= 0), dan Bobot/Maksimal Poin (> 0) wajib diisi dengan benar.",
        },
        { status: 400 }
      );
    }

    // Validasi batas 100% per kategori untuk parameter utama (non-bonus)
    if (formulaType !== "bonus_point") {
      const docs = await firestoreListCollection("kpi_parameters");
      const existing = docs.map(parseKpiParameterDoc);

      for (const cat of rawCats) {
        const currentCatWeight = existing
          .filter(
            (p: KpiParameter) =>
              p.isActive &&
              p.formulaType !== "bonus_point" &&
              p.applicableCategories.includes(cat)
          )
          .reduce(
            (acc: number, p: KpiParameter) =>
              acc + getParamWeightForCategory(p, cat),
            0
          );

        const addW = categoryWeights[cat] ?? weight;
        if (Math.round((currentCatWeight + addW) * 100) / 100 > 100) {
          return NextResponse.json(
            {
              berhasil: false,
              pesan: `Total bobot kategori "${cat}" saat ini ${currentCatWeight}%. Penambahan ${addW}% akan melebihi batas 100%.`,
            },
            { status: 400 }
          );
        }
      }
    }

    const id = `kpi_${crypto.randomUUID().slice(0, 8)}`;
    await firestoreSetDoc("kpi_parameters", id, {
      id: { stringValue: id },
      code: { stringValue: code },
      name: { stringValue: name },
      description: { stringValue: description },
      formulaType: { stringValue: formulaType },
      unit: { stringValue: unit },
      target: { doubleValue: target },
      weight: { doubleValue: weight },
      applicableCategoriesJson: { stringValue: JSON.stringify(rawCats) },
      categoryTargetsJson: { stringValue: JSON.stringify(categoryTargets) },
      categoryWeightsJson: { stringValue: JSON.stringify(categoryWeights) },
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
        pesan:
          error instanceof Error
            ? error.message
            : "Gagal menyimpan parameter KPI.",
      },
      { status: 500 }
    );
  }
}