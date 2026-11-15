"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupAdminForm() {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("Comprehensive HSE");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/setup-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, name, unit, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setErrorMsg(data.pesan || "Gagal membuat akun Super Admin.");
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {errorMsg && (
        <div className="rounded-md border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
          {errorMsg}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-200">
          ID Karyawan (untuk Login)
        </label>
        <input
          type="text"
          required
          placeholder="Contoh: IWIP-001"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3.5 py-2.5 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-200">
          Nama Lengkap
        </label>
        <input
          type="text"
          required
          placeholder="Masukkan nama lengkap Anda"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3.5 py-2.5 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-200">
          Departemen / Unit
        </label>
        <input
          type="text"
          required
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3.5 py-2.5 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-200">
          Password (minimal 6 karakter)
        </label>
        <input
          type="password"
          required
          minLength={6}
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
        {loading ? "Menyimpan Akun..." : "Buat Akun Super Admin"}
      </button>
    </form>
  );
}