import { NextResponse } from "next/server";
import { firestoreGetDoc } from "@/lib/firebase-admin";
import { getCurrentUser } from "@/lib/session";
import { buildFullKpiRecap } from "@/lib/kpi-recap";
import { JOB_TITLES, type JobTitle } from "@/lib/work-areas";

function getDefaultPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

    const isSuperAdmin = currentUser.role === "super_admin";
    const isAdmin = currentUser.role === "admin";

    if (isSuperAdmin) {
      const data = await buildFullKpiRecap({ period });
      return NextResponse.json({ berhasil: true, ...data });
    }

    if (isAdmin) {
      const data = await buildFullKpiRecap({
        period,
        restrictBufn: currentUser.bufn,
      });
      return NextResponse.json({ berhasil: true, ...data });
    }

    // Cek apakah akun safety_officer ini adalah Wakil Supervisor
    const meDoc = await firestoreGetDoc("users", currentUser.uid);
    const rawJob = meDoc?.fields?.jobTitle?.stringValue as JobTitle;
    const jobTitle: JobTitle = JOB_TITLES.includes(rawJob)
      ? rawJob
      : "Safety Officer";

    if (jobTitle === "Wakil Supervisor") {
      const data = await buildFullKpiRecap({
        period,
        restrictArea: {
          bufn: currentUser.bufn,
          smelter: currentUser.smelter,
        },
      });
      return NextResponse.json({ berhasil: true, ...data });
    }

    const data = await buildFullKpiRecap({
      period,
      restrictUid: currentUser.uid,
    });
    return NextResponse.json({ berhasil: true, ...data });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          error instanceof Error
            ? error.message
            : "Gagal memuat rekapitulasi laporan KPI.",
      },
      { status: 500 }
    );
  }
}