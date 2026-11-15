import { firestoreGetDoc, firestoreSetDoc } from "./firebase-admin";

export type FormulaType =
  | "higher_better"
  | "lower_better"
  | "yes_no"
  | "direct_percentage"
  | "bonus_point";

export const FORMULA_LABELS: Record<FormulaType, string> = {
  higher_better: "Target Positif (Semakin Tinggi Semakin Baik)",
  lower_better: "Batas Maksimal / Zero Incident (Semakin Rendah Semakin Baik)",
  yes_no: "Kepatuhan Ya / Tidak (1 = Tercapai, 0 = Tidak)",
  direct_percentage: "Persentase Capaian Langsung (0% – 100%)",
  bonus_point: "Poin Bonus / Penambah Nilai (Di Luar Bobot 100%)",
};

export interface GradeThreshold {
  id: string;
  grade: string;
  label: string;
  minScore: number;
  color: "emerald" | "blue" | "amber" | "red";
}

export interface ScoringPolicy {
  requireAllCoreAchieved: boolean; // Saklar: apakah semua indikator utama wajib mencapai batas minimal?
  minCoreAchievementPct: number; // Batas minimal pencapaian tiap indikator utama (misal 100 = 100% target, 80 = 80% target)
  fallbackGradeIfFailed: string; // Predikat maksimal jika ada indikator utama gagal (misal "D")
  capTotalScoreAt100: boolean; // Apakah total skor akhir (utama + bonus) dibatasi maksimal 100%?
}

export const DEFAULT_SCORING_POLICY: ScoringPolicy = {
  requireAllCoreAchieved: false,
  minCoreAchievementPct: 100,
  fallbackGradeIfFailed: "D",
  capTotalScoreAt100: true,
};

export const DEFAULT_GRADES: GradeThreshold[] = [
  { id: "g_a", grade: "A", label: "Sangat Baik", minScore: 90, color: "emerald" },
  { id: "g_b", grade: "B", label: "Baik", minScore: 80, color: "blue" },
  { id: "g_c", grade: "C", label: "Cukup", minScore: 70, color: "amber" },
  { id: "g_d", grade: "D", label: "Kurang", minScore: 0, color: "red" },
];

export function calculateDynamicScore(
  formulaType: FormulaType,
  actual: number,
  target: number,
  weight: number
): number {
  if (weight <= 0) return 0;
  const cleanActual = Math.max(0, Number(actual) || 0);
  const cleanTarget = Math.max(0, Number(target) || 0);

  // Untuk Poin Bonus:
  // target = Poin per 1 kegiatan (misal: 2 poin per kegiatan)
  // weight = Batas maksimal poin bonus yang bisa didapat (misal: 10 poin)
  if (formulaType === "bonus_point") {
    const pointPerUnit = cleanTarget > 0 ? cleanTarget : 1;
    const rawBonus = cleanActual * pointPerUnit;
    return Math.round(Math.min(rawBonus, weight) * 100) / 100;
  }

  let ratio = 0;

  switch (formulaType) {
    case "higher_better": {
      if (cleanTarget <= 0) {
        ratio = cleanActual > 0 ? 1 : 0;
      } else {
        ratio = Math.min(cleanActual / cleanTarget, 1);
      }
      break;
    }
    case "lower_better": {
      if (cleanActual <= cleanTarget) {
        ratio = 1;
      } else if (cleanTarget === 0) {
        ratio = Math.max(0, 1 - cleanActual * 0.5);
      } else {
        const excess = cleanActual - cleanTarget;
        ratio = Math.max(0, 1 - excess / cleanTarget);
      }
      break;
    }
    case "yes_no": {
      ratio = cleanActual >= 1 ? 1 : 0;
      break;
    }
    case "direct_percentage": {
      ratio = Math.min(cleanActual / 100, 1);
      break;
    }
    default: {
      ratio = cleanTarget > 0 ? Math.min(cleanActual / cleanTarget, 1) : 0;
    }
  }

  return Math.round(ratio * weight * 100) / 100;
}

export interface EvaluableEntry {
  code: string;
  name: string;
  formulaType: FormulaType;
  weight: number;
  score: number;
}

export function evaluateKpiResult(
  entries: EvaluableEntry[],
  grades: GradeThreshold[],
  policy: ScoringPolicy
): {
  coreScore: number;
  bonusScore: number;
  totalScore: number;
  grade: GradeThreshold;
  gateTriggered: boolean;
  failedCoreCodes: string[];
} {
  let coreRaw = 0;
  let bonusRaw = 0;
  const failedCoreCodes: string[] = [];

  for (const item of entries) {
    if (item.formulaType === "bonus_point") {
      bonusRaw += item.score;
    } else {
      coreRaw += item.score;
      if (policy.requireAllCoreAchieved && item.weight > 0) {
        const achievedPct = (item.score / item.weight) * 100;
        if (achievedPct + 0.001 < policy.minCoreAchievementPct) {
          failedCoreCodes.push(item.code || item.name);
        }
      }
    }
  }

  const coreScore = Math.round(coreRaw * 100) / 100;
  const bonusScore = Math.round(bonusRaw * 100) / 100;
  const sumScore = Math.round((coreScore + bonusScore) * 100) / 100;
  const totalScore = policy.capTotalScoreAt100
    ? Math.min(100, sumScore)
    : sumScore;

  const sortedGrades = [...grades].sort((a, b) => b.minScore - a.minScore);
  let resolved =
    sortedGrades[sortedGrades.length - 1] || {
      id: "g_d",
      grade: "D",
      label: "Kurang",
      minScore: 0,
      color: "red" as const,
    };

  for (const g of sortedGrades) {
    if (totalScore >= g.minScore) {
      resolved = g;
      break;
    }
  }

  let gateTriggered = false;
  if (policy.requireAllCoreAchieved && failedCoreCodes.length > 0) {
    const fallbackGradeObj = sortedGrades.find(
      (g) => g.grade.toUpperCase() === policy.fallbackGradeIfFailed.toUpperCase()
    );
    if (fallbackGradeObj && resolved.minScore > fallbackGradeObj.minScore) {
      resolved = fallbackGradeObj;
      gateTriggered = true;
    }
  }

  return {
    coreScore,
    bonusScore,
    totalScore,
    grade: resolved,
    gateTriggered,
    failedCoreCodes,
  };
}

export async function getKpiGrades(): Promise<GradeThreshold[]> {
  try {
    const doc = await firestoreGetDoc("system_config", "kpi_grades");
    const jsonStr = doc?.fields?.gradesJson?.stringValue;
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr) as GradeThreshold[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.sort((a, b) => b.minScore - a.minScore);
      }
    }
  } catch {
    // Gunakan default jika belum tersimpan
  }
  return DEFAULT_GRADES;
}

export async function saveKpiGrades(grades: GradeThreshold[]): Promise<void> {
  const sorted = [...grades].sort((a, b) => b.minScore - a.minScore);
  await firestoreSetDoc("system_config", "kpi_grades", {
    gradesJson: { stringValue: JSON.stringify(sorted) },
    updatedAt: { stringValue: new Date().toISOString() },
  });
}

export async function getScoringPolicy(): Promise<ScoringPolicy> {
  try {
    const doc = await firestoreGetDoc("system_config", "kpi_policy");
    const jsonStr = doc?.fields?.policyJson?.stringValue;
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr) as Partial<ScoringPolicy>;
      return {
        requireAllCoreAchieved: Boolean(parsed.requireAllCoreAchieved),
        minCoreAchievementPct:
          Number(parsed.minCoreAchievementPct) > 0
            ? Number(parsed.minCoreAchievementPct)
            : 100,
        fallbackGradeIfFailed: String(parsed.fallbackGradeIfFailed || "D"),
        capTotalScoreAt100:
          parsed.capTotalScoreAt100 !== undefined
            ? Boolean(parsed.capTotalScoreAt100)
            : true,
      };
    }
  } catch {
    // Gunakan default jika belum tersimpan
  }
  return DEFAULT_SCORING_POLICY;
}

export async function saveScoringPolicy(policy: ScoringPolicy): Promise<void> {
  await firestoreSetDoc("system_config", "kpi_policy", {
    policyJson: { stringValue: JSON.stringify(policy) },
    updatedAt: { stringValue: new Date().toISOString() },
  });
}