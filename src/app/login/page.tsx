"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setErrorMsg(data.pesan || "ID Karyawan atau Password salah.");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setErrorMsg("Gagal terhubung ke server.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#212529] p-4 text-[#F1F3F5]">
      <div className="w-full max-w-md rounded-xl border border-[#495057] bg-[#2B3035] p-6 shadow-lg">
        <div className="mb-6">
          <span className="inline-block rounded bg-[#7A9278]/20 px-2.5 py-1 text-xs font-medium text-[#A3BE9F]">
            HSE Performance Portal
          </span>
          <h1 className="mt-2 text-2xl font-bold text-[#F1F3F5]">
            Sistem KPI Safety Officer
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Masuk menggunakan ID Karyawan dan Password Anda.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {errorMsg && (
            <div className="rounded-md border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-200">
              ID Karyawan
            </label>
            <input
              type="text"
              required
              autoComplete="username"
              placeholder="Contoh: IWIP-001"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3.5 py-2.5 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-200">
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3.5 py-2.5 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#5B7C99] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#45657F] disabled:opacity-50"
          >
            {loading ? "Memeriksa Akun..." : "Masuk"}
          </button>
        </form>
      </div>
    </main>
  );
}