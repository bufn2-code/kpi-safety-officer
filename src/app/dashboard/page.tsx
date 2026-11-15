import { Suspense } from "react";
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#495057] bg-[#2B3035] p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[#8BB3D6]">
            Sistem KPI Safety Officer
          </p>
          <h1 className="mt-1 text-xl font-bold text-[#F1F3F5]">
            Selamat datang, {user.name}
          </h1>
          <p className="mt-0.5 text-sm text-slate-300">
            ID: <span className="font-mono">{user.employeeId}</span> • Unit: {user.unit} • Peran:{" "}
            <span className="rounded bg-[#7A9278]/20 px-2 py-0.5 text-xs font-semibold text-[#A3BE9F]">
              {labelRole}
            </span>
          </p>
        </div>
        <LogoutButton />
      </header>

      <section className="rounded-xl border border-[#495057] bg-[#2B3035] p-6">
        <h2 className="text-base font-semibold text-[#F1F3F5]">
          Status Otentikasi & Sesi Aktif
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          Sesi login berhasil diverifikasi. Pada tahap berikutnya, halaman ini akan menampilkan ringkasan skor KPI bulanan, target, dan menu kelola pengguna.
        </p>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#212529] p-4 sm:p-8 text-[#F1F3F5]">
      <Suspense
        fallback={
          <div className="mx-auto max-w-4xl rounded-xl border border-[#495057] bg-[#2B3035] p-6 text-sm text-slate-400">
            Memuat sesi pengguna...
          </div>
        }
      >
        <KontenDashboard />
      </Suspense>
    </main>
  );
}