import { firestoreGetDoc, firestoreSetDoc } from "./firebase-admin";

export interface BufnArea {
  name: string;
  smelters: string[];
}

export type JobTitle =
  | "Junior Safety"
  | "Safety Officer"
  | "Senior Safety Officer"
  | "Wakil Supervisor";

export type KpiCategory = "shift_3g2s" | "non_shift" | "wakil_spv";

export const JOB_TITLES: JobTitle[] = [
  "Junior Safety",
  "Safety Officer",
  "Senior Safety Officer",
  "Wakil Supervisor",
];

export const KPI_CATEGORY_LABELS: Record<KpiCategory, string> = {
  shift_3g2s: "3 Grup 2 Shift",
  non_shift: "Non Shift",
  wakil_spv: "Wakil Supervisor",
};

export const KPI_CATEGORIES: KpiCategory[] = [
  "shift_3g2s",
  "non_shift",
  "wakil_spv",
];

export interface ParameterCategoryConfig {
  target: number;
  weight: number;
  categoryTargets?: Partial<Record<KpiCategory, number>>;
  categoryWeights?: Partial<Record<KpiCategory, number>>;
}

export function getParamTargetForCategory(
  p: ParameterCategoryConfig,
  cat: KpiCategory
): number {
  const val = p.categoryTargets?.[cat];
  return val !== undefined && !Number.isNaN(Number(val))
    ? Number(val)
    : p.target;
}

export function getParamWeightForCategory(
  p: ParameterCategoryConfig,
  cat: KpiCategory
): number {
  const val = p.categoryWeights?.[cat];
  return val !== undefined && !Number.isNaN(Number(val))
    ? Number(val)
    : p.weight;
}

export const DEFAULT_WORK_AREAS: BufnArea[] = [
  {
    name: "BUFN 1",
    smelters: ["Smelter A", "Smelter B", "Smelter G"],
  },
  {
    name: "BUFN 2",
    smelters: [],
  },
  {
    name: "BUFN 3",
    smelters: [],
  },
  {
    name: "BUFN 4",
    smelters: [],
  },
  {
    name: "BUFN 5",
    smelters: [],
  },
];

export async function getWorkAreas(): Promise<BufnArea[]> {
  try {
    const doc = await firestoreGetDoc("system_config", "work_areas");
    const jsonStr = doc?.fields?.areasJson?.stringValue;
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr) as BufnArea[];
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Fallback ke default jika belum tersimpan di Firestore
  }
  return DEFAULT_WORK_AREAS;
}

export async function saveWorkAreas(areas: BufnArea[]): Promise<void> {
  await firestoreSetDoc("system_config", "work_areas", {
    areasJson: { stringValue: JSON.stringify(areas) },
    updatedAt: { stringValue: new Date().toISOString() },
  });
}