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

export type SpvTeamCalcMode = "option_a" | "option_b";

export interface ScoringPolicy {
  // 1. Aturan Kelulusan Indikator Wajib
  requireAllCoreAchieved: boolean;
  minCoreAchievementPct: number;
  fallbackGradeIfFailed: string;
  capTotalScoreAt100: boolean;

  // 2. Aturan Periode Cut-Off KPI (Default: Tanggal 20 s/d Tanggal 20 bulan berikutnya)
  periodStartDay: number;
  periodEndDay: number;
  periodSpansNextMonth: boolean;

  // 3. Aturan Khusus Wakil Supervisor
  spvTeamWeightPct: number; // Fleksibel (default 30%, sehingga porsi pribadi = 100 - 30 = 70%)
  spvTeamCalcMode: SpvTeamCalcMode; // "option_a" = mulai penuh lalu dipotong penalti; "option_b" = rata-rata tim * porsi% lalu dipotong penalti
  spvPenaltyPerFailedMember: number; // Pengurangan poin per anggota yang indikator wajibnya tidak tercapai
}

export const DEFAULT_SCORING_POLICY: ScoringPolicy = {
  requireAllCoreAchieved: false,
  minCoreAchievementPct: 100,
  fallbackGradeIfFailed: "D",
  capTotalScoreAt100: true,

  periodStartDay: 20,
  periodEndDay: 20,
  periodSpansNextMonth: true,

  spvTeamWeightPct: 30,
  spvTeamCalcMode: "option_a",
  spvPenaltyPerFailedMember: 5,
};

export const DEFAULT_GRADES: GradeThreshold[] = [
  { id: "g_a", grade: "A", label: "Sangat Baik", minScore: 90, color: "emerald" },
  { id: "g_b", grade: "B", label: "Baik", minScore: 80, color: "blue" },
  { id: "g_c", grade: "C", label: "Cukup", minScore: 70, color: "amber" },
  { id: "g_d", grade: "D", label: "Kurang", minScore: 0, color: "red" },
];

const BULAN_ID = [
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

export function formatPeriodDateRange(
  periodYm: string,
  policy: Pick<
    ScoringPolicy,
    "periodStartDay" | "periodEndDay" | "periodSpansNextMonth"
  >
): string {
  const match = /^(\d{4})-(\d{2})$/.exec(periodYm);
  if (!match) return periodYm;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1; // 0-based

  const startDay = Math.max(1, Math.min(31, Number(policy.periodStartDay) || 20));
  const endDay = Math.max(1, Math.min(31, Number(policy.periodEndDay) || 20));

  if (!policy.periodSpansNextMonth) {
    const mName = BULAN_ID[monthIdx] || "";
    return `${startDay} ${mName} ${year} – ${endDay} ${mName} ${year}`;
  }

  // Periode berjalan dari tanggal X bulan ini ke tanggal Y bulan berikutnya
  const nextMonthIdx = (monthIdx + 1) % 12;
  const nextYear = monthIdx === 11 ? year + 1 : year;

  return `${startDay} ${BULAN_ID[monthIdx]} ${year} – ${endDay} ${BULAN_ID[nextMonthIdx]} ${nextYear}`;
}

export function calculateDynamicScore(
  formulaType: FormulaType,
  actual: number,
  target: number,
  weight: number
): number {
  if (weight <= 0) return 0;
  const cleanActual = Math.max(0, Number(actual) || 0);
  const cleanTarget = Math.max(0, Number(target) || 0);

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

export function resolveGradeByScore(
  score: number,
  grades: GradeThreshold[]
): GradeThreshold {
  const sortedGrades = [...grades].sort((a, b) => b.minScore - a.minScore);
  for (const g of sortedGrades) {
    if (score >= g.minScore) {
      return g;
    }
  }
  return (
    sortedGrades[sortedGrades.length - 1] || {
      id: "g_d",
      grade: "D",
      label: "Kurang",
      minScore: 0,
      color: "red",
    }
  );
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
  const minThresholdPct =
    Number(policy.minCoreAchievementPct) > 0
      ? Number(policy.minCoreAchievementPct)
      : 100;

  for (const item of entries) {
    if (item.formulaType === "bonus_point") {
      bonusRaw += item.score;
    } else {
      coreRaw += item.score;
      if (item.weight > 0) {
        const achievedPct = (item.score / item.weight) * 100;
        if (achievedPct + 0.001 < minThresholdPct) {
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

  let resolved = resolveGradeByScore(totalScore, grades);

  let gateTriggered = false;
  if (policy.requireAllCoreAchieved && failedCoreCodes.length > 0) {
    const sortedGrades = [...grades].sort((a, b) => b.minScore - a.minScore);
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

export interface TeamMemberKpiSummary {
  uid: string;
  employeeId: string;
  name: string;
  jobTitle: string;
  kpiCategory: string;
  totalScore: number;
  hasFailedCore: boolean;
  failedCoreCodes: string[];
  hasCardSaved: boolean;
}

export function evaluateSupervisorKpiResult(
  personalEntries: EvaluableEntry[],
  teamMembers: TeamMemberKpiSummary[],
  grades: GradeThreshold[],
  policy: ScoringPolicy
) {
  const personalEval = evaluateKpiResult(personalEntries, grades, policy);

  const teamWeightPct = Math.max(
    0,
    Math.min(100, Number(policy.spvTeamWeightPct) ?? 30)
  );
  const personalWeightPct = Math.round((100 - teamWeightPct) * 100) / 100;

  // Kontribusi Porsi Pribadi (misal 70% dari skor pribadi Wakil SPV)
  const personalWeightedScore =
    Math.round(personalEval.totalScore * (personalWeightPct / 100) * 100) / 100;

  // Hitung jumlah anggota di wilayah Smelter-nya yang memiliki indikator wajib tidak tercapai
  const failedMembers = teamMembers.filter((m) => m.hasFailedCore);
  const failedMembersCount = failedMembers.length;
  const penaltyPerMember = Math.max(
    0,
    Number(policy.spvPenaltyPerFailedMember) || 0
  );
  const totalPenalty =
    Math.round(failedMembersCount * penaltyPerMember * 100) / 100;

  const teamAverageScore =
    teamMembers.length > 0
      ? Math.round(
          (teamMembers.reduce((sum, m) => sum + m.totalScore, 0) /
            teamMembers.length) *
            100
        ) / 100
      : 100;

  let baseTeamPoints = teamWeightPct;
  if (policy.spvTeamCalcMode === "option_b") {
    // Opsi B: Rata-rata skor anggota * porsi % tim (misal 85% * 30% = 25.5 poin)
    baseTeamPoints =
      Math.round(teamAverageScore * (teamWeightPct / 100) * 100) / 100;
  } else {
    // Opsi A: Mulai dari penuh porsi % tim (misal 30 poin)
    baseTeamPoints = teamWeightPct;
  }

  const teamWeightedScore = Math.max(
    0,
    Math.round((baseTeamPoints - totalPenalty) * 100) / 100
  );

  const rawCombined =
    Math.round((personalWeightedScore + teamWeightedScore) * 100) / 100;
  const finalScore = policy.capTotalScoreAt100
    ? Math.min(100, rawCombined)
    : rawCombined;

  let resolvedGrade = resolveGradeByScore(finalScore, grades);
  let gateTriggered = false;

  if (
    policy.requireAllCoreAchieved &&
    personalEval.failedCoreCodes.length > 0
  ) {
    const sortedGrades = [...grades].sort((a, b) => b.minScore - a.minScore);
    const fallbackGradeObj = sortedGrades.find(
      (g) => g.grade.toUpperCase() === policy.fallbackGradeIfFailed.toUpperCase()
    );
    if (fallbackGradeObj && resolvedGrade.minScore > fallbackGradeObj.minScore) {
      resolvedGrade = fallbackGradeObj;
      gateTriggered = true;
    }
  }

  return {
    personalRawScore: personalEval.totalScore,
    personalCoreScore: personalEval.coreScore,
    personalBonusScore: personalEval.bonusScore,
    personalWeightPct,
    personalWeightedScore,

    teamWeightPct,
    teamCalcMode: policy.spvTeamCalcMode,
    teamAverageScore,
    baseTeamPoints,
    failedMembersCount,
    penaltyPerMember,
    totalPenalty,
    teamWeightedScore,

    totalScore: finalScore,
    grade: resolvedGrade,
    gateTriggered,
    failedCoreCodes: personalEval.failedCoreCodes,
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

        periodStartDay:
          Number(parsed.periodStartDay) >= 1 &&
          Number(parsed.periodStartDay) <= 31
            ? Number(parsed.periodStartDay)
            : 20,
        periodEndDay:
          Number(parsed.periodEndDay) >= 1 && Number(parsed.periodEndDay) <= 31
            ? Number(parsed.periodEndDay)
            : 20,
        periodSpansNextMonth:
          parsed.periodSpansNextMonth !== undefined
            ? Boolean(parsed.periodSpansNextMonth)
            : true,

        spvTeamWeightPct:
          parsed.spvTeamWeightPct !== undefined &&
          !Number.isNaN(Number(parsed.spvTeamWeightPct))
            ? Math.max(0, Math.min(100, Number(parsed.spvTeamWeightPct)))
            : 30,
        spvTeamCalcMode:
          parsed.spvTeamCalcMode === "option_b" ? "option_b" : "option_a",
        spvPenaltyPerFailedMember:
          parsed.spvPenaltyPerFailedMember !== undefined &&
          !Number.isNaN(Number(parsed.spvPenaltyPerFailedMember))
            ? Math.max(0, Number(parsed.spvPenaltyPerFailedMember))
            : 5,
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