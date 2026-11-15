import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { firestoreGetDoc } from "@/lib/firebase-admin";
import { getCurrentUser } from "@/lib/session";
import { buildFullKpiRecap } from "@/lib/kpi-recap";
import { getWorkAreas, JOB_TITLES, type JobTitle } from "@/lib/work-areas";
import ReportsDashboard from "./reports-dashboard";

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function KontenLaporan() {
  await connection();

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  const period = getCurrentPeriod();
  const isSuperAdmin = currentUser.role === "super_admin";
  const isAdmin = currentUser.role === "admin";

  const workAreas = await getWorkAreas();

  const meDoc = await firestoreGetDoc("users", currentUser.uid);
  const rawJob = meDoc?.fields?.jobTitle?.stringValue as JobTitle;
  const jobTitle: JobTitle = JOB_TITLES.includes(rawJob)
    ? rawJob
    : "Safety Officer";
  const isWakilSpv = !isSuperAdmin && !isAdmin && jobTitle === "Wakil Supervisor";

  const initialRecap = isSuperAdmin
    ? await buildFullKpiRecap({ period })
    : isAdmin
      ? await buildFullKpiRecap({ period, restrictBufn: currentUser.bufn })
      : isWakilSpv
        ? await buildFullKpiRecap({
            period,
            restrictArea: {
              bufn: currentUser.bufn,
              smelter: currentUser.smelter,
            },
          })
        : await buildFullKpiRecap({ period, restrictUid: currentUser.uid });

  return (
    <ReportsDashboard
      currentUser={currentUser}
      isWakilSpv={isWakilSpv}
      workAreas={workAreas}
      initialRecap={initialRecap}
    />
  );
}

export default function ReportsPage() {
  return (
    <main className="min-h-screen bg-[#212529] p-4 sm:p-8 text-[#F1F3F5]">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#8BB3D6] hover:underline"
          >
            ← Kembali ke Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-[#F1F3F5]">
            Rekapitulasi Laporan, Ekspor Excel & Rapor PDF Slip KPI
          </h1>
          <p className="mt-0.5 text-sm text-slate-300">
            Analisis capaian lintas BUFN & Smelter, ekspor Excel/CSV, serta cetak Slip KPI PDF satuan maupun batch (per Smelter, BUFN, Wakil SPV, Non-Shift, & Tahunan).
          </p>
        </div>

        <Suspense
          fallback={
            <div className="rounded-xl border border-[#495057] bg-[#2B3035] p-6 text-sm text-slate-400">
              Menyiapkan data rekapitulasi & riwayat KPI tahun berjalan...
            </div>
          }
        >
          <KontenLaporan />
        </Suspense>
      </div>
    </main>
  );
}