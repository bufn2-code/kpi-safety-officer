import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { firestoreListCollection } from "@/lib/firebase-admin";
import { getCurrentUser, type UserRole } from "@/lib/session";
import { getWorkAreas } from "@/lib/work-areas";
import KpiCardView from "./kpi-card-view";

export interface OfficerOption {
  uid: string;
  employeeId: string;
  name: string;
  bufn: string;
  smelter: string;
  unit: string;
  role: UserRole;
}

async function KontenKartuKpi() {
  await connection();

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  const isSuperAdmin = currentUser.role === "super_admin";
  const isAdmin = currentUser.role === "admin";
  const isAdminOrAbove = isSuperAdmin || isAdmin;

  const workAreas = await getWorkAreas();

  let officerList: OfficerOption[] = [
    {
      uid: currentUser.uid,
      employeeId: currentUser.employeeId,
      name: currentUser.name,
      bufn: currentUser.bufn,
      smelter: currentUser.smelter,
      unit: currentUser.unit,
      role: currentUser.role,
    },
  ];

  if (isAdminOrAbove) {
    const userDocs = await firestoreListCollection("users");
    officerList = userDocs
      .map(
        (doc: {
          fields?: Record<
            string,
            { stringValue?: string; booleanValue?: boolean }
          >;
        }) => {
          const f = doc.fields || {};
          const role = (f.role?.stringValue || "safety_officer") as UserRole;
          const bufn =
            f.bufn?.stringValue || (role === "super_admin" ? "ALL" : "BUFN 1");
          const smelter = f.smelter?.stringValue || "-";
          return {
            uid: f.uid?.stringValue || "",
            employeeId: f.employeeId?.stringValue || "",
            name: f.name?.stringValue || "",
            bufn,
            smelter,
            unit:
              f.unit?.stringValue ||
              (bufn === "ALL" ? "Comprehensive HSE" : `${bufn} - ${smelter}`),
            role,
            isActive: f.isActive?.booleanValue ?? true,
          };
        }
      )
      .filter((u: OfficerOption & { isActive: boolean }) => {
        if (!u.isActive || !u.uid) return false;
        // Admin BUFN hanya melihat Safety Officer di BUFN-nya sendiri
        if (isAdmin) {
          return u.role === "safety_officer" && u.bufn === currentUser.bufn;
        }
        return u.role === "safety_officer";
      })
      .sort((a: OfficerOption, b: OfficerOption) =>
        a.name.localeCompare(b.name)
      );
  }

  return (
    <KpiCardView
      currentUser={currentUser}
      officerList={officerList}
      workAreas={workAreas}
    />
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
            Penilaian kinerja bulanan berdasarkan lokasi BUFN & Smelter, kalkulasi rumus otomatis, dan predikat nilai standar.
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