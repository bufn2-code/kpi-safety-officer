import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { firestoreGetDoc } from "@/lib/firebase-admin";
import SetupAdminForm from "./setup-form";

async function CekStatusSetup() {
  await connection();
  const initDoc = await firestoreGetDoc("system_config", "init");
  if (initDoc?.fields?.initialized?.booleanValue === true) {
    redirect("/login");
  }
  return <SetupAdminForm />;
}

export default function SetupAdminPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#212529] p-4 text-[#F1F3F5]">
      <div className="w-full max-w-md rounded-xl border border-[#495057] bg-[#2B3035] p-6 shadow-lg">
        <div className="mb-6">
          <span className="inline-block rounded bg-[#5B7C99]/20 px-2.5 py-1 text-xs font-medium text-[#8BB3D6]">
            Inisialisasi Sistem
          </span>
          <h1 className="mt-2 text-2xl font-bold text-[#F1F3F5]">
            Buat Akun Super Admin
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Halaman ini hanya aktif satu kali untuk membuat akun pengelola utama KPI Safety Officer.
          </p>
        </div>

        <Suspense
          fallback={
            <p className="py-6 text-center text-sm text-slate-400">
              Memeriksa status sistem...
            </p>
          }
        >
          <CekStatusSetup />
        </Suspense>
      </div>
    </main>
  );
}