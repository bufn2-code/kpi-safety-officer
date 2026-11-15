import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { firestoreGetDoc } from "@/lib/firebase-admin";
import { getCurrentUser } from "@/lib/session";
import {
  JOB_TITLES,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
  type JobTitle,
  type KpiCategory,
} from "@/lib/work-areas";
import LogoutButton from "./logout-button";

async function KontenDashboard() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const meDoc = await firestoreGetDoc("users", user.uid);
  const f = meDoc?.fields || {};
  const rawJob = f.jobTitle?.stringValue as JobTitle;
  const jobTitle: JobTitle = JOB_TITLES.includes(rawJob)
    ? rawJob
    : "Safety Officer";
  const rawCat = f.kpiCategory?.stringValue as KpiCategory;
  const kpiCategory: KpiCategory =
    jobTitle === "Wakil Supervisor"
      ? "wakil_spv"
      : KPI_CATEGORIES.includes(rawCat)
        ? rawCat
        : "shift_3g2s";

  const isSuperAdmin = user.role === "super_admin";
  const isAdmin = user.role === "admin";
  const isAdminOrAbove = isSuperAdmin || isAdmin;
  const isWakilSpv = !isAdminOrAbove && jobTitle === "Wakil Supervisor";

  const labelRole = isSuperAdmin
    ? "Super Admin"
    : isAdmin
      ? "Admin BUFN"
      : `${jobTitle} (${KPI_CATEGORY_LABELS[kpiCategory]})`;

  const areaInfo = isSuperAdmin
    ? "Semua Wilayah (BUFN 1 – 5)"
    : isAdmin
      ? `${user.bufn}`
      : `${user.bufn} • ${user.smelter}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#495057] bg-[#2B3035] p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[#8BB3D6]">
            Sistem KPI HSE • PT IWIP
          </p>
          <h1 className="mt-1 text-xl font-bold text-[#F1F3F5]">
            Selamat datang, {user.name}
          </h1>
          <p className="mt-0.5 text-sm text-slate-300">
            ID: <span className="font-mono">{user.employeeId}</span> •{" "}
            <span className="text-slate-200">{areaInfo}</span> •{" "}
            <span className="rounded bg-[#7A9278]/20 px-2 py-0.5 text-xs font-semibold text-[#A3BE9F]">
              {labelRole}
            </span>
          </p>
        </div>
        <LogoutButton />
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
        <Link
          href="/kpi-card"
          className="group rounded-xl border border-[#495057] bg-[#2B3035] p-5 transition hover:border-[#7A9278]"
        >
          <span className="inline-block rounded bg-[#7A9278]/20 px-2.5 py-1 text-xs font-semibold text-[#A3BE9F]">
            {isAdminOrAbove
              ? "Input & Revisi Penilaian"
              : isWakilSpv
                ? "Kartu Pribadi & Pantau Tim"
                : "Hasil Penilaian"}
          </span>
          <h2 className="mt-3 text-lg font-bold text-[#F1F3F5] group-hover:text-[#A3BE9F]">
            Kartu KPI Bulanan
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            {isSuperAdmin
              ? "Input atau revisi penilaian KPI untuk 3 Grup 2 Shift, Non Shift, dan Wakil Supervisor di seluruh BUFN."
              : isAdmin
                ? `Input atau revisi penilaian KPI seluruh personel & Wakil SPV di wilayah ${user.bufn}.`
                : isWakilSpv
                  ? `Lihat skor gabungan Anda (Pribadi + Tim) serta pantau capaian anggota di ${user.smelter}.`
                  : "Lihat hasil skor KPI bulanan Anda, rincian capaian per indikator, predikat nilai, dan catatan Admin."}
          </p>
        </Link>

        <Link
          href="/reports"
          className="group rounded-xl border border-[#495057] bg-[#2B3035] p-5 transition hover:border-[#7A9278]"
        >
          <span className="inline-block rounded bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-300">
            Laporan, Excel & PDF Slip KPI
          </span>
          <h2 className="mt-3 text-lg font-bold text-[#F1F3F5] group-hover:text-amber-300">
            Rekapitulasi & Cetak Slip PDF
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            {isAdminOrAbove
              ? "Rekap lintas BUFN & Smelter, ekspor Excel/CSV, serta cetak Slip KPI PDF satuan maupun batch (per Smelter, BUFN, Wakil SPV, Non-Shift, & Tahunan)."
              : isWakilSpv
                ? `Rekap capaian tim ${user.smelter}, ekspor Excel, serta cetak Slip KPI PDF bulanan & tahunan.`
                : "Lihat riwayat nilai KPI Anda 1 tahun berjalan (Jan–Des) dan unduh Slip KPI PDF pribadi Anda."}
          </p>
        </Link>

        {isAdminOrAbove && (
          <Link
            href="/admin/users"
            className="group rounded-xl border border-[#495057] bg-[#2B3035] p-5 transition hover:border-[#5B7C99]"
          >
            <span className="inline-block rounded bg-[#5B7C99]/20 px-2.5 py-1 text-xs font-semibold text-[#8BB3D6]">
              Manajemen Personel
            </span>
            <h2 className="mt-3 text-lg font-bold text-[#F1F3F5] group-hover:text-[#8BB3D6]">
              Kelola Pengguna & Smelter
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              {isSuperAdmin
                ? "Kelola Junior Safety, Safety Officer, Senior SO, Wakil SPV, Admin BUFN, dan atur BUFN/Smelter."
                : `Kelola personel lapangan & Wakil SPV di wilayah ${user.bufn}, mutasi smelter, dan reset password.`}
            </p>
          </Link>
        )}

        {isSuperAdmin && (
          <Link
            href="/admin/kpi-parameters"
            className="group rounded-xl border border-[#495057] bg-[#2B3035] p-5 transition hover:border-[#5B7C99]"
          >
            <span className="inline-block rounded bg-[#5B7C99]/20 px-2.5 py-1 text-xs font-semibold text-[#8BB3D6]">
              Kebijakan & Rumus
            </span>
            <h2 className="mt-3 text-lg font-bold text-[#F1F3F5] group-hover:text-[#8BB3D6]">
              Master Parameter & Kebijakan
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Atur target 3 kategori pola kerja, poin bonus, cut-off tanggal 20–20, aturan Wakil SPV, dan Grade.
            </p>
          </Link>
        )}
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#212529] p-4 sm:p-8 text-[#F1F3F5]">
      <Suspense
        fallback={
          <div className="mx-auto max-w-5xl rounded-xl border border-[#495057] bg-[#2B3035] p-6 text-sm text-slate-400">
            Memuat sesi pengguna...
          </div>
        }
      >
        <KontenDashboard />
      </Suspense>
    </main>
  );
}