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
        ? "Admin"
        : "Safety Officer";

  const isAdminOrAbove = user.role === "super_admin" || user.role === "admin";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#495057] bg-[#2B3035] p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[#8BB3D6]">
            Sistem KPI Safety Officer
          </p>
          <h1 className="mt-1 text-xl font-bold text-[#F1F3F5]">
            Selamat datang, {user.name}
          </h1>
          <p className="mt-0.5 text-sm text-slate-300">
            ID: <span className="font-mono">{user.employeeId}</span> • Unit:{" "}
            {user.unit} • Peran:{" "}
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
            {isAdminOrAbove ? "Input & Penilaian" : "Hasil Penilaian"}
          </span>
          <h2 className="mt-3 text-lg font-bold text-[#F1F3F5] group-hover:text-[#A3BE9F]">
            Kartu KPI Bulanan
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            {isAdminOrAbove
              ? "Pilih Safety Officer, input atau revisi realisasi target bulanan, dan publikasikan hasil skor KPI."
              : "Lihat hasil penilaian skor KPI bulanan Anda, rincian pencapaian target, dan catatan evaluasi Admin."}
          </p>
        </Link>

        {isAdminOrAbove && (
          <>
            <Link
              href="/admin/kpi-parameters"
              className="group rounded-xl border border-[#495057] bg-[#2B3035] p-5 transition hover:border-[#5B7C99]"
            >
              <span className="inline-block rounded bg-[#5B7C99]/20 px-2.5 py-1 text-xs font-semibold text-[#8BB3D6]">
                Konfigurasi KPI
              </span>
              <h2 className="mt-3 text-lg font-bold text-[#F1F3F5] group-hover:text-[#8BB3D6]">
                Master Parameter KPI
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                Kelola daftar indikator kinerja, target bulanan, satuan, dan bobot penilaian (100%).
              </p>
            </Link>

            <Link
              href="/admin/users"
              className="group rounded-xl border border-[#495057] bg-[#2B3035] p-5 transition hover:border-[#5B7C99]"
            >
              <span className="inline-block rounded bg-[#5B7C99]/20 px-2.5 py-1 text-xs font-semibold text-[#8BB3D6]">
                Manajemen Tim
              </span>
              <h2 className="mt-3 text-lg font-bold text-[#F1F3F5] group-hover:text-[#8BB3D6]">
                Kelola Pengguna
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                Tambah akun Safety Officer atau Admin baru, atur unit kerja, dan reset password.
              </p>
            </Link>
          </>
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