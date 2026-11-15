"use client";

import { useState } from "react";

export default function LogoutButton() {
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      window.location.replace("/login");
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="rounded-lg border border-[#495057] bg-[#212529] px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-red-400/50 hover:text-red-300 disabled:opacity-50"
    >
      {loading ? "Keluar..." : "Keluar"}
    </button>
  );
}