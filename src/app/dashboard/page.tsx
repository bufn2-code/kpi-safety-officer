import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import LogoutButton from "./logout-button";

async function KontenDashboard() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const labelRole =
    user.role === "super_admin"
      ? "Super Admin"
      : user.role === "admin"
        ? "Admin BUFN"
        : "Safety Officer";

  const isSuperAdmin = user.role === "super_admin";
  const isAdminOrAbove = isSuperAdmin || user.role === "admin";

  const areaInfo =
    user.role === "super_admin"
      ? "Semua Wilayah (BUFN 1 – 5)"
      : user.role === "admin"
        ? `${user.bufn}`
        : `${user.bufn} • ${user.smelter}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#495057] bg-[#2B3035] p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[#8BB3D6]">
            Sistem KPI Safety Officer • PT IWIP
          </p>
          <h1 className="mt-1 text-xl font-bold text-[#F1F3F5]">
            Selamat datang, {user.name}
          </h1>
          <p className="mt-0.5 text-sm text-slate-300">
            ID: <span className="font-mono">{user.employeeId}</span> •{" "}
            <span className="text-slate-200">{areaInfo}</span> • Peran:{" "}
            <span className="rounded bg-[#7A9278]/20 px-2 py-0.5 text-xs font-semibold text-[#A3BE9F]">
              {labelRole}
            </span>
          </p>
        </div>
        <LogoutButton />
      </header>

      {/* Menu Utama */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/kpi-card"
          className="group rounded-xl border border-[#495057] bg-[#2B3035] p-5 transition hover:border-[#7A9278]"
        >
          <span className="inline-block rounded bg-[#7A9278]/20 px-2.5 py-1 text-xs font-semibold text-[#A3BE9F]">
            {isAdminOrAbove ? "Input & Revisi Penilaian" : "Hasil Penilaian"}
          </span>
          <h2 className="mt-3 text-lg font-bold text-[#F1F3F5] group-hover:text-[#A3BE9F]">
            Kartu KPI Bulanan
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            {isSuperAdmin
              ? "Input atau revisi penilaian KPI Safety Officer di seluruh BUFN & Smelter."
              : user.role === "admin"
                ? `Input atau revisi penilaian KPI Safety Officer khusus di wilayah ${user.bufn}.`
                : "Lihat hasil skor KPI bulanan Anda, rincian capaian per indikator, predikat nilai, dan catatan Admin."}
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
                ? "Kelola seluruh akun Safety Officer & Admin BUFN, mutasi lintas BUFN/Smelter, dan tambah smelter baru."
                : `Tambah anggota baru, mutasi lokasi smelter di ${user.bufn}, dan reset password anggota.`}
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
              Master Parameter & Grade
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Atur indikator kinerja, tipe rumus perhitungan, bobot (100%), dan kategori nilai standar (A/B/C/D).
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