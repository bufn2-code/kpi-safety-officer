import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { firestoreListCollection } from "@/lib/firebase-admin";
import { getCurrentUser, type UserRole } from "@/lib/session";
import type { ManagedUser } from "@/app/api/admin/users/route";
import UsersManager from "./users-manager";

async function KontenKelolaPengguna() {
  await connection();

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.role !== "super_admin" && currentUser.role !== "admin") {
    redirect("/dashboard");
  }

  const docs = await firestoreListCollection("users");
  const users: ManagedUser[] = docs
    .map(
      (doc: {
        fields?: Record<string, { stringValue?: string; booleanValue?: boolean }>;
      }) => {
        const f = doc.fields || {};
        return {
          uid: f.uid?.stringValue || "",
          employeeId: f.employeeId?.stringValue || "",
          name: f.name?.stringValue || "",
          role: (f.role?.stringValue || "safety_officer") as UserRole,
          unit: f.unit?.stringValue || "-",
          isActive: f.isActive?.booleanValue ?? true,
          createdAt: f.createdAt?.stringValue || "",
        };
      }
    )
    .sort((a: ManagedUser, b: ManagedUser) => a.name.localeCompare(b.name));

  return <UsersManager initialUsers={users} currentUser={currentUser} />;
}

export default function AdminUsersPage() {
  return (
    <main className="min-h-screen bg-[#212529] p-4 sm:p-8 text-[#F1F3F5]">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#8BB3D6] hover:underline"
            >
              ← Kembali ke Dashboard
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-[#F1F3F5]">
              Kelola Pengguna & Hak Akses
            </h1>
            <p className="mt-0.5 text-sm text-slate-300">
              Tambah akun Safety Officer atau Admin, ubah unit, reset password, dan atur status aktif akun.
            </p>
          </div>
        </div>

        <Suspense
          fallback={
            <div className="rounded-xl border border-[#495057] bg-[#2B3035] p-6 text-sm text-slate-400">
              Memuat daftar pengguna...
            </div>
          }
        >
          <KontenKelolaPengguna />
        </Suspense>
      </div>
    </main>
  );
}