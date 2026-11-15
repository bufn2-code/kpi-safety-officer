import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { firestoreListCollection } from "@/lib/firebase-admin";
import { getCurrentUser, type UserRole } from "@/lib/session";
import KpiCardView from "./kpi-card-view";

export interface OfficerOption {
  uid: string;
  employeeId: string;
  name: string;
  unit: string;
  role: UserRole;
}

async function KontenKartuKpi() {
  await connection();

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  const isAdminOrAbove =
    currentUser.role === "super_admin" || currentUser.role === "admin";

  let officerList: OfficerOption[] = [
    {
      uid: currentUser.uid,
      employeeId: currentUser.employeeId,
      name: currentUser.name,
      unit: currentUser.unit,
      role: currentUser.role,
    },
  ];

  if (isAdminOrAbove) {
    const userDocs = await firestoreListCollection("users");
    officerList = userDocs
      .map(
        (doc: {
          fields?: Record<string, { stringValue?: string; booleanValue?: boolean }>;
        }) => {
          const f = doc.fields || {};
          return {
            uid: f.uid?.stringValue || "",
            employeeId: f.employeeId?.stringValue || "",
            name: f.name?.stringValue || "",
            unit: f.unit?.stringValue || "-",
            role: (f.role?.stringValue || "safety_officer") as UserRole,
            isActive: f.isActive?.booleanValue ?? true,
          };
        }
      )
      .filter((u: OfficerOption & { isActive: boolean }) => u.isActive && u.uid)
      .sort((a: OfficerOption, b: OfficerOption) => a.name.localeCompare(b.name));
  }

  return (
    <KpiCardView currentUser={currentUser} officerList={officerList} />
  );
}

export default function KpiCardPage() {
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
            Kartu KPI Bulanan Safety Officer
          </h1>
          <p className="mt-0.5 text-sm text-slate-300">
            Rincian pencapaian target bulanan, kalkulasi bobot otomatis, dan rekap skor KPI.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="rounded-xl border border-[#495057] bg-[#2B3035] p-6 text-sm text-slate-400">
              Memuat Kartu KPI Bulanan...
            </div>
          }
        >
          <KontenKartuKpi />
        </Suspense>
      </div>
    </main>
  );
}