import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getKpiGrades,
  getScoringPolicy,
  saveKpiGrades,
  saveScoringPolicy,
  type GradeThreshold,
  type ScoringPolicy,
} from "@/lib/kpi-engine";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { berhasil: false, pesan: "Sesi tidak valid." },
      { status: 401 }
    );
  }

  const [grades, policy] = await Promise.all([
    getKpiGrades(),
    getScoringPolicy(),
  ]);
  return NextResponse.json({ berhasil: true, grades, policy });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin") {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          "Hanya Super Admin yang dapat mengubah Kategori Nilai & Kebijakan Kelulusan.",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    if (Array.isArray(body.grades)) {
      const validColors = new Set(["emerald", "blue", "amber", "red"]);
      const sanitized: GradeThreshold[] = body.grades
        .map(
          (
            item: {
              id?: string;
              grade?: string;
              label?: string;
              minScore?: number;
              color?: string;
            },
            idx: number
          ) => ({
            id: String(item.id || `g_${idx + 1}`),
            grade: String(item.grade || "").trim().toUpperCase(),
            label: String(item.label || "").trim(),
            minScore: Math.max(0, Math.min(100, Number(item.minScore) || 0)),
            color: (validColors.has(String(item.color))
              ? item.color
              : "blue") as GradeThreshold["color"],
          })
        )
        .filter((g: GradeThreshold) => g.grade.length > 0 && g.label.length > 0);

      if (sanitized.length === 0) {
        return NextResponse.json(
          { berhasil: false, pesan: "Minimal harus ada 1 kategori nilai." },
          { status: 400 }
        );
      }

      await saveKpiGrades(sanitized);
    }

    if (body.policy && typeof body.policy === "object") {
      const p = body.policy as Partial<ScoringPolicy>;
      const cleanPolicy: ScoringPolicy = {
        requireAllCoreAchieved: Boolean(p.requireAllCoreAchieved),
        minCoreAchievementPct: Math.max(
          1,
          Math.min(100, Number(p.minCoreAchievementPct) || 100)
        ),
        fallbackGradeIfFailed: String(p.fallbackGradeIfFailed || "D")
          .trim()
          .toUpperCase(),
        capTotalScoreAt100: Boolean(p.capTotalScoreAt100),

        periodStartDay: Math.max(
          1,
          Math.min(31, Math.round(Number(p.periodStartDay) || 20))
        ),
        periodEndDay: Math.max(
          1,
          Math.min(31, Math.round(Number(p.periodEndDay) || 20))
        ),
        periodSpansNextMonth:
          p.periodSpansNextMonth !== undefined
            ? Boolean(p.periodSpansNextMonth)
            : true,

        spvTeamWeightPct: Math.max(
          0,
          Math.min(100, Number(p.spvTeamWeightPct) ?? 30)
        ),
        spvTeamCalcMode:
          p.spvTeamCalcMode === "option_b" ? "option_b" : "option_a",
        spvPenaltyPerFailedMember: Math.max(
          0,
          Number(p.spvPenaltyPerFailedMember) || 0
        ),
      };
      await saveScoringPolicy(cleanPolicy);
    }

    const [updatedGrades, updatedPolicy] = await Promise.all([
      getKpiGrades(),
      getScoringPolicy(),
    ]);

    return NextResponse.json({
      berhasil: true,
      pesan: "Kebijakan Periode, Wakil SPV & Kategori Nilai berhasil diperbarui.",
      grades: updatedGrades,
      policy: updatedPolicy,
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          error instanceof Error
            ? error.message
            : "Gagal menyimpan pengaturan nilai.",
      },
      { status: 500 }
    );
  }
}