import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { firestoreListCollection } from "@/lib/firebase-admin";
import { getCurrentUser } from "@/lib/session";
import { getKpiGrades, getScoringPolicy } from "@/lib/kpi-engine";
import {
  parseKpiParameterDoc,
  type KpiParameter,
} from "@/app/api/admin/kpi-parameters/route";
import ParametersManager from "./parameters-manager";

async function KontenParameterKpi() {
  await connection();

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "super_admin") {
    redirect("/dashboard");
  }

  const [docs, grades, policy] = await Promise.all([
    firestoreListCollection("kpi_parameters"),
    getKpiGrades(),
    getScoringPolicy(),
  ]);

  const parameters = docs
    .map(parseKpiParameterDoc)
    .sort(
      (a: KpiParameter, b: KpiParameter) =>
        a.order - b.order || a.code.localeCompare(b.code)
    );

  return (
    <ParametersManager
      initialParameters={parameters}
      initialGrades={grades}
      initialPolicy={policy}
    />
  );
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
            Master Parameter, Rumus, Poin Bonus & Kebijakan Nilai
          </h1>
          <p className="mt-0.5 text-sm text-slate-300">
            Atur indikator utama (100%), indikator penambah poin (bonus), kategori nilai (A/B/C/D), serta aturan kelulusan indikator wajib.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="rounded-xl border border-[#495057] bg-[#2B3035] p-6 text-sm text-slate-400">
              Memuat konfigurasi parameter dan kebijakan KPI...
            </div>
          }
        >
          <KontenParameterKpi />
        </Suspense>
      </div>
    </main>
  );
}