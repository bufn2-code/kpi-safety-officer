import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { firestoreGetDoc, firestoreListCollection } from "@/lib/firebase-admin";
import { getCurrentUser, type UserRole } from "@/lib/session";
import {
  getWorkAreas,
  JOB_TITLES,
  KPI_CATEGORIES,
  type JobTitle,
  type KpiCategory,
} from "@/lib/work-areas";
import KpiCardView from "./kpi-card-view";

export interface OfficerOption {
  uid: string;
  employeeId: string;
  name: string;
  jobTitle: JobTitle;
  kpiCategory: KpiCategory;
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

  // Ambil profil terbaru pengguna yang login dari Firestore untuk mengetahui Jabatan & Kategori KPI
  const meDoc = await firestoreGetDoc("users", currentUser.uid);
  const meFields = meDoc?.fields || {};
  const myJobRaw = meFields.jobTitle?.stringValue as JobTitle;
  const myJobTitle: JobTitle = JOB_TITLES.includes(myJobRaw)
    ? myJobRaw
    : "Safety Officer";
  const myCatRaw = meFields.kpiCategory?.stringValue as KpiCategory;
  const myKpiCategory: KpiCategory =
    myJobTitle === "Wakil Supervisor"
      ? "wakil_spv"
      : KPI_CATEGORIES.includes(myCatRaw)
        ? myCatRaw
        : "shift_3g2s";

  const isWakilSpv = myJobTitle === "Wakil Supervisor";

  let officerList: OfficerOption[] = [
    {
      uid: currentUser.uid,
      employeeId: currentUser.employeeId,
      name: currentUser.name,
      jobTitle: myJobTitle,
      kpiCategory: myKpiCategory,
      bufn: currentUser.bufn,
      smelter: currentUser.smelter,
      unit: currentUser.unit,
      role: currentUser.role,
    },
  ];

  if (isAdminOrAbove || isWakilSpv) {
    const userDocs = await firestoreListCollection("users");
    officerList = userDocs
      .map(
        (doc: {
          name?: string;
          fields?: Record<
            string,
            { stringValue?: string; booleanValue?: boolean }
          >;
        }) => {
          const f = doc.fields || {};
          const uid = f.uid?.stringValue || doc.name?.split("/").pop() || "";
          const role = (f.role?.stringValue || "safety_officer") as UserRole;
          const bufn =
            f.bufn?.stringValue || (role === "super_admin" ? "ALL" : "BUFN 1");
          const smelter = f.smelter?.stringValue || "-";
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

          return {
            uid,
            employeeId: f.employeeId?.stringValue || "",
            name: f.name?.stringValue || "",
            jobTitle,
            kpiCategory,
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
        if (isSuperAdmin) return u.role === "safety_officer";
        if (isAdmin) {
          return u.role === "safety_officer" && u.bufn === currentUser.bufn;
        }
        // Wakil SPV melihat dirinya sendiri + anggota di BUFN & Smelter yang sama
        return (
          u.uid === currentUser.uid ||
          (u.role === "safety_officer" &&
            u.bufn === currentUser.bufn &&
            u.smelter === currentUser.smelter)
        );
      })
      .sort((a: OfficerOption, b: OfficerOption) => {
        // Jika Wakil SPV, letakkan akun pribadinya di urutan paling atas
        if (a.uid === currentUser.uid) return -1;
        if (b.uid === currentUser.uid) return 1;
        return a.name.localeCompare(b.name);
      });
  }

  return (
    <KpiCardView
      currentUser={currentUser}
      isWakilSpv={isWakilSpv}
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
            Kartu KPI Bulanan HSE
          </h1>
          <p className="mt-0.5 text-sm text-slate-300">
            Penilaian kinerja sesuai Jabatan, Kategori Pola Kerja (3 Grup 2 Shift, Non Shift, Wakil SPV), dan periode cut-off aktif.
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