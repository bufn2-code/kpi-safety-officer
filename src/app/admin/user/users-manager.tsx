"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ManagedUser } from "@/app/api/admin/users/route";
import type { SessionUser, UserRole } from "@/lib/session";

interface Props {
  initialUsers: ManagedUser[];
  currentUser: SessionUser;
}

export default function UsersManager({ initialUsers, currentUser }: Props) {
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>(initialUsers);
  const [search, setSearch] = useState("");

  // State form tambah pengguna baru
  const [showAddForm, setShowAddForm] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("Comprehensive HSE");
  const [role, setRole] = useState<UserRole>("safety_officer");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // State modal edit / reset password
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("safety_officer");
  const [newPassword, setNewPassword] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Notifikasi umpan balik
  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const isSuperAdmin = currentUser.role === "super_admin";

  function canManage(target: ManagedUser): boolean {
    if (target.role === "super_admin") return false;
    if (isSuperAdmin) return true;
    return currentUser.role === "admin" && target.role === "safety_officer";
  }

  function formatRole(r: UserRole): string {
    if (r === "super_admin") return "Super Admin";
    if (r === "admin") return "Admin";
    return "Safety Officer";
  }

  async function reloadUsers() {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    const data = await res.json();
    if (res.ok && data.berhasil) {
      setUsers(data.users);
    }
    router.refresh();
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setBanner(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, name, unit, role, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setBanner({ type: "err", text: data.pesan || "Gagal menambah pengguna." });
        setSubmitting(false);
        return;
      }

      setBanner({ type: "ok", text: data.pesan });
      setEmployeeId("");
      setName("");
      setUnit("Comprehensive HSE");
      setRole("safety_officer");
      setPassword("");
      setShowAddForm(false);
      await reloadUsers();
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setSubmitting(false);
    }
  }

  function openEditModal(u: ManagedUser) {
    setEditingUser(u);
    setEditName(u.name);
    setEditUnit(u.unit);
    setEditRole(u.role);
    setNewPassword("");
    setBanner(null);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    setBanner(null);

    try {
      const res = await fetch(`/api/admin/users/${editingUser.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          unit: editUnit,
          role: editRole,
          newPassword: newPassword.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setBanner({ type: "err", text: data.pesan || "Gagal menyimpan perubahan." });
        setSavingEdit(false);
        return;
      }

      setBanner({
        type: "ok",
        text: newPassword.trim()
          ? `Profil dan password baru untuk ${editName} berhasil disimpan.`
          : `Profil ${editName} berhasil diperbarui.`,
      });
      setEditingUser(null);
      await reloadUsers();
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleActive(u: ManagedUser) {
    const nextState = !u.isActive;
    const konfirmasi = window.confirm(
      nextState
        ? `Aktifkan kembali akun ${u.name} (${u.employeeId})?`
        : `Nonaktifkan akun ${u.name} (${u.employeeId})? Pengguna tidak akan bisa login.`
    );
    if (!konfirmasi) return;

    setBanner(null);
    try {
      const res = await fetch(`/api/admin/users/${u.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextState }),
      });

      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setBanner({ type: "err", text: data.pesan || "Gagal mengubah status akun." });
        return;
      }

      setBanner({
        type: "ok",
        text: `Akun ${u.name} sekarang ${nextState ? "Aktif" : "Nonaktif"}.`,
      });
      await reloadUsers();
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    }
  }

  const filteredUsers = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.employeeId.toLowerCase().includes(q) ||
      u.unit.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={`rounded-lg border p-3.5 text-sm ${
            banner.type === "ok"
              ? "border-[#7A9278]/50 bg-[#7A9278]/15 text-[#C3DEC0]"
              : "border-red-500/40 bg-red-950/50 text-red-200"
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* Bar Kontrol Atas */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#495057] bg-[#2B3035] p-4">
        <input
          type="text"
          placeholder="Cari nama, ID Karyawan, atau unit..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80 rounded-lg border border-[#495057] bg-[#212529] px-3.5 py-2 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
        />

        <button
          onClick={() => {
            setShowAddForm((prev) => !prev);
            setBanner(null);
          }}
          className="w-full sm:w-auto rounded-lg bg-[#5B7C99] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#45657F]"
        >
          {showAddForm ? "Tutup Form" : "+ Tambah Pengguna Baru"}
        </button>
      </div>

      {/* Form Tambah Pengguna Baru */}
      {showAddForm && (
        <form
          onSubmit={handleAddUser}
          className="space-y-4 rounded-xl border border-[#5B7C99]/50 bg-[#2B3035] p-5"
        >
          <h2 className="text-base font-semibold text-[#F1F3F5]">
            Tambah Akun Pengguna Baru
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                ID Karyawan
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: 8221026041"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Nama Lengkap
              </label>
              <input
                type="text"
                required
                placeholder="Nama lengkap Safety Officer / Admin"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Departemen / Unit
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: BUFN / Comprehensive HSE"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Peran (Role)
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
              >
                <option value="safety_officer">Safety Officer</option>
                {isSuperAdmin && <option value="admin">Admin</option>}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Password Awal (minimal 6 karakter)
              </label>
              <input
                type="password"
                required
                minLength={6}
                placeholder="Masukkan password awal untuk login pertama"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-[#495057] bg-[#212529] px-4 py-2 text-sm text-slate-300 hover:text-white"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#5B7C99] px-4 py-2 text-sm font-semibold text-white hover:bg-[#45657F] disabled:opacity-50"
            >
              {submitting ? "Menyimpan..." : "Simpan Pengguna"}
            </button>
          </div>
        </form>
      )}

      {/* Tampilan Tabel Desktop */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-[#495057] bg-[#2B3035]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#495057] bg-[#212529]/70 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">ID Karyawan</th>
              <th className="px-4 py-3">Nama Lengkap</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Peran</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#495057]/60">
            {filteredUsers.map((u) => (
              <tr key={u.uid} className="hover:bg-[#212529]/40">
                <td className="px-4 py-3 font-mono text-xs text-slate-200">
                  {u.employeeId}
                </td>
                <td className="px-4 py-3 font-medium text-[#F1F3F5]">
                  {u.name}
                </td>
                <td className="px-4 py-3 text-slate-300">{u.unit}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      u.role === "super_admin"
                        ? "bg-[#7A9278]/25 text-[#A3BE9F]"
                        : u.role === "admin"
                          ? "bg-[#5B7C99]/25 text-[#8BB3D6]"
                          : "bg-slate-700/60 text-slate-200"
                    }`}
                  >
                    {formatRole(u.role)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      u.isActive ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        u.isActive ? "bg-emerald-400" : "bg-red-400"
                      }`}
                    />
                    {u.isActive ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {canManage(u) ? (
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(u)}
                        className="rounded border border-[#495057] bg-[#212529] px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-[#5B7C99] hover:text-white"
                      >
                        Edit / Reset Password
                      </button>
                      <button
                        onClick={() => handleToggleActive(u)}
                        className={`rounded border px-2.5 py-1 text-xs font-medium ${
                          u.isActive
                            ? "border-red-500/40 text-red-300 hover:bg-red-950/50"
                            : "border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/50"
                        }`}
                      >
                        {u.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500">Terproteksi</span>
                  )}
                </td>
              </tr>
            ))}

            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  Tidak ada pengguna yang cocok dengan pencarian.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Tampilan Kartu Mobile */}
      <div className="space-y-3 md:hidden">
        {filteredUsers.map((u) => (
          <div
            key={u.uid}
            className="rounded-xl border border-[#495057] bg-[#2B3035] p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-[#F1F3F5]">{u.name}</p>
                <p className="font-mono text-xs text-slate-400">
                  ID: {u.employeeId} • {u.unit}
                </p>
              </div>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  u.isActive
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-red-500/15 text-red-300"
                }`}
              >
                {u.isActive ? "Aktif" : "Nonaktif"}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-[#495057]/60 pt-3">
              <span className="text-xs font-medium text-[#8BB3D6]">
                {formatRole(u.role)}
              </span>

              {canManage(u) ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditModal(u)}
                    className="rounded border border-[#495057] bg-[#212529] px-2.5 py-1 text-xs text-slate-200"
                  >
                    Edit / Password
                  </button>
                  <button
                    onClick={() => handleToggleActive(u)}
                    className={`rounded border px-2.5 py-1 text-xs ${
                      u.isActive
                        ? "border-red-500/40 text-red-300"
                        : "border-emerald-500/40 text-emerald-300"
                    }`}
                  >
                    {u.isActive ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </div>
              ) : (
                <span className="text-xs text-slate-500">Terproteksi</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal Edit Profil & Reset Password */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-md space-y-4 rounded-xl border border-[#495057] bg-[#2B3035] p-6 shadow-xl"
          >
            <div>
              <h3 className="text-lg font-bold text-[#F1F3F5]">
                Edit Pengguna & Reset Password
              </h3>
              <p className="font-mono text-xs text-slate-400">
                ID Karyawan: {editingUser.employeeId}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Nama Lengkap
              </label>
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Departemen / Unit
              </label>
              <input
                type="text"
                required
                value={editUnit}
                onChange={(e) => setEditUnit(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
              />
            </div>

            {isSuperAdmin && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Peran (Role)
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
                >
                  <option value="safety_officer">Safety Officer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Password Baru (kosongkan jika tidak ingin mereset)
              </label>
              <input
                type="password"
                minLength={6}
                placeholder="Isi minimal 6 karakter untuk reset password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded-lg border border-[#495057] bg-[#212529] px-4 py-2 text-sm text-slate-300 hover:text-white"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="rounded-lg bg-[#5B7C99] px-4 py-2 text-sm font-semibold text-white hover:bg-[#45657F] disabled:opacity-50"
              >
                {savingEdit ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}