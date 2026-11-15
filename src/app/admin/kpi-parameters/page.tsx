import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { firestoreListCollection } from "@/lib/firebase-admin";
import { getCurrentUser } from "@/lib/session";
import { parseKpiParameterDoc, type KpiParameter } from "@/app/api/admin/kpi-parameters/route";
import ParametersManager from "./parameters-manager";

async function KontenParameterKpi() {
  await connection();

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "super_admin" && user.role !== "admin") {
    redirect("/dashboard");
  }

  const docs = await firestoreListCollection("kpi_parameters");
  const parameters = docs
    .map(parseKpiParameterDoc)
    .sort((a: KpiParameter, b: KpiParameter) => a.order - b.order || a.code.localeCompare(b.code));

  return <ParametersManager initialParameters={parameters} />;
}

export default function KpiParametersPage() {
  return (
    <main className="min-h-screen bg-[#212529] p-4 sm:p-8 text-[#F1F3F5]">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#8BB3D6] hover:underline"
          >
            ← Kembali ke Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-[#F1F3F5]">
            Master Parameter KPI Safety Officer
          </h1>
          <p className="mt-0.5 text-sm text-slate-300">
            Atur daftar indikator kinerja bulanan, target, satuan ukur, dan bobot penilaian (total bobot aktif = 100%).
          </p>
        </div>

        <Suspense
          fallback={
            <div className="rounded-xl border border-[#495057] bg-[#2B3035] p-6 text-sm text-slate-400">
              Memuat master parameter KPI...
            </div>
          }
        >
          <KontenParameterKpi />
        </Suspense>
      </div>
    </main>
  );
}