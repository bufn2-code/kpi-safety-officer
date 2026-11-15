"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ManagedUser } from "@/app/api/admin/users/route";
import type { SessionUser, UserRole } from "@/lib/session";
import type { BufnArea } from "@/lib/work-areas";

interface Props {
  initialUsers: ManagedUser[];
  currentUser: SessionUser;
  initialWorkAreas: BufnArea[];
}

export default function UsersManager({
  initialUsers,
  currentUser,
  initialWorkAreas,
}: Props) {
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>(initialUsers);
  const [workAreas, setWorkAreas] = useState<BufnArea[]>(initialWorkAreas);

  const isSuperAdmin = currentUser.role === "super_admin";

  // Filter daftar pengguna
  const [search, setSearch] = useState("");
  const [filterBufn, setFilterBufn] = useState<string>(
    isSuperAdmin ? "ALL" : currentUser.bufn
  );
  const [filterSmelter, setFilterSmelter] = useState<string>("ALL");

  // Form tambah pengguna
  const defaultNewBufn = isSuperAdmin
    ? workAreas[0]?.name || "BUFN 1"
    : currentUser.bufn;
  const defaultNewSmelter =
    workAreas.find((a) => a.name === defaultNewBufn)?.smelters[0] || "";

  const [showAddForm, setShowAddForm] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("safety_officer");
  const [newBufn, setNewBufn] = useState(defaultNewBufn);
  const [newSmelter, setNewSmelter] = useState(defaultNewSmelter);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Modal edit & mutasi smelter
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("safety_officer");
  const [editBufn, setEditBufn] = useState("");
  const [editSmelter, setEditSmelter] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Panel Kelola Struktur BUFN & Smelter (khusus Super Admin)
  const [showAreaPanel, setShowAreaPanel] = useState(false);
  const [targetAreaForNewSmelter, setTargetAreaForNewSmelter] = useState(
    workAreas[0]?.name || "BUFN 1"
  );
  const [newSmelterName, setNewSmelterName] = useState("");
  const [newBufnName, setNewBufnName] = useState("");
  const [savingAreas, setSavingAreas] = useState(false);

  const [banner, setBanner] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  function getSmeltersForBufn(bufnName: string): string[] {
    return workAreas.find((a) => a.name === bufnName)?.smelters || [];
  }

  function canManage(target: ManagedUser): boolean {
    if (target.role === "super_admin") return false;
    if (isSuperAdmin) return true;
    return (
      currentUser.role === "admin" &&
      target.role === "safety_officer" &&
      target.bufn === currentUser.bufn
    );
  }

  function formatRole(r: UserRole): string {
    if (r === "super_admin") return "Super Admin";
    if (r === "admin") return "Admin BUFN";
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

  function handleNewBufnChange(val: string) {
    setNewBufn(val);
    const list = getSmeltersForBufn(val);
    setNewSmelter(list[0] || "");
  }

  function handleEditBufnChange(val: string) {
    setEditBufn(val);
    const list = getSmeltersForBufn(val);
    setEditSmelter(list[0] || "");
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setBanner(null);

    try {
      const effectiveBufn = isSuperAdmin ? newBufn : currentUser.bufn;
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          name,
          role,
          bufn: effectiveBufn,
          smelter:
            role === "admin" && !newSmelter
              ? "Semua Smelter BUFN"
              : newSmelter,
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setBanner({
          type: "err",
          text: data.pesan || "Gagal menambah pengguna.",
        });
        setSubmitting(false);
        return;
      }

      setBanner({ type: "ok", text: data.pesan });
      setEmployeeId("");
      setName("");
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
    setEditRole(u.role);
    const initialB = isSuperAdmin ? u.bufn : currentUser.bufn;
    setEditBufn(initialB);
    const availableSmelters = getSmeltersForBufn(initialB);
    setEditSmelter(
      availableSmelters.includes(u.smelter)
        ? u.smelter
        : availableSmelters[0] || u.smelter
    );
    setNewPassword("");
    setBanner(null);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    setBanner(null);

    try {
      const effectiveBufn = isSuperAdmin ? editBufn : currentUser.bufn;
      const res = await fetch(`/api/admin/users/${editingUser.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          role: editRole,
          bufn: effectiveBufn,
          smelter: editSmelter,
          newPassword: newPassword.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setBanner({
          type: "err",
          text: data.pesan || "Gagal menyimpan perubahan.",
        });
        setSavingEdit(false);
        return;
      }

      setBanner({
        type: "ok",
        text: newPassword.trim()
          ? `Data & password baru untuk ${editName} berhasil disimpan.`
          : `Data & lokasi tugas ${editName} berhasil diperbarui.`,
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
        setBanner({
          type: "err",
          text: data.pesan || "Gagal mengubah status akun.",
        });
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

  // Fungsi Super Admin menambah Smelter baru atau BUFN baru
  async function handlePersistWorkAreas(updatedAreas: BufnArea[], successMsg: string) {
    setSavingAreas(true);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/work-areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areas: updatedAreas }),
      });
      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setBanner({ type: "err", text: data.pesan || "Gagal menyimpan wilayah." });
        setSavingAreas(false);
        return;
      }
      setWorkAreas(data.areas);
      setBanner({ type: "ok", text: successMsg });
      router.refresh();
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setSavingAreas(false);
    }
  }

  async function handleAddSmelterToBufn(e: React.FormEvent) {
    e.preventDefault();
    const cleanSmelter = newSmelterName.trim();
    if (!cleanSmelter) return;

    const updated = workAreas.map((area) => {
      if (area.name !== targetAreaForNewSmelter) return area;
      if (area.smelters.includes(cleanSmelter)) return area;
      return { ...area, smelters: [...area.smelters, cleanSmelter] };
    });

    await handlePersistWorkAreas(
      updated,
      `Lokasi "${cleanSmelter}" berhasil ditambahkan ke ${targetAreaForNewSmelter}.`
    );
    setNewSmelterName("");
  }

  async function handleAddNewBufn(e: React.FormEvent) {
    e.preventDefault();
    const cleanBufn = newBufnName.trim().toUpperCase();
    if (!cleanBufn) return;
    if (workAreas.some((a) => a.name.toUpperCase() === cleanBufn)) {
      setBanner({ type: "err", text: `${cleanBufn} sudah ada.` });
      return;
    }

    const updated: BufnArea[] = [
      ...workAreas,
      { id: cleanBufn, name: cleanBufn, smelters: [] },
    ];
    await handlePersistWorkAreas(updated, `Wilayah ${cleanBufn} berhasil ditambahkan.`);
    setNewBufnName("");
    setTargetAreaForNewSmelter(cleanBufn);
  }

  // Filter daftar pengguna di sisi client (instan untuk ratusan data)
  const availableFilterSmelters =
    filterBufn === "ALL"
      ? Array.from(new Set(workAreas.flatMap((a) => a.smelters)))
      : getSmeltersForBufn(filterBufn);

  const filteredUsers = users.filter((u) => {
    if (isSuperAdmin && filterBufn !== "ALL" && u.bufn !== filterBufn) {
      return false;
    }
    if (filterSmelter !== "ALL" && u.smelter !== filterSmelter) {
      return false;
    }
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.employeeId.toLowerCase().includes(q) ||
      u.smelter.toLowerCase().includes(q) ||
      u.bufn.toLowerCase().includes(q)
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

      {/* Info Wilayah Kerja Aktif & Tombol Aksi */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#495057] bg-[#2B3035] p-4">
        <div>
          <p className="text-xs text-slate-400">
            Cakupan Wewenang:{" "}
            <strong className="text-[#8BB3D6]">
              {isSuperAdmin ? "Seluruh Area (BUFN 1 – BUFN 5)" : currentUser.bufn}
            </strong>
          </p>
          <p className="text-sm font-semibold text-[#F1F3F5]">
            Menampilkan {filteredUsers.length} dari {users.length} personel terdaftar
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => {
                setShowAreaPanel((prev) => !prev);
                setShowAddForm(false);
                setBanner(null);
              }}
              className="rounded-lg border border-[#7A9278] bg-[#7A9278]/20 px-4 py-2 text-sm font-semibold text-[#C3DEC0] transition hover:bg-[#7A9278]/30"
            >
              {showAreaPanel ? "Tutup Panel Wilayah" : "Kelola BUFN & Smelter"}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setShowAddForm((prev) => !prev);
              setShowAreaPanel(false);
              setBanner(null);
            }}
            className="rounded-lg bg-[#5B7C99] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#45657F]"
          >
            {showAddForm ? "Tutup Form" : "+ Tambah Anggota Baru"}
          </button>
        </div>
      </div>

      {/* Panel Kelola BUFN & Smelter (Khusus Super Admin) */}
      {isSuperAdmin && showAreaPanel && (
        <div className="space-y-4 rounded-xl border border-[#7A9278]/50 bg-[#2B3035] p-5">
          <div>
            <h2 className="text-base font-semibold text-[#F1F3F5]">
              Master Wilayah BUFN & Lokasi Smelter
            </h2>
            <p className="text-xs text-slate-400">
              Tambahkan lokasi Smelter baru atau BUFN baru jika terdapat ekspansi operasional di PT IWIP.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Tambah Smelter ke BUFN */}
            <form
              onSubmit={handleAddSmelterToBufn}
              className="space-y-3 rounded-lg border border-[#495057] bg-[#212529] p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-[#8BB3D6]">
                Tambah Smelter / Nikelmatte Baru
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  value={targetAreaForNewSmelter}
                  onChange={(e) => setTargetAreaForNewSmelter(e.target.value)}
                  className="rounded-lg border border-[#495057] bg-[#2B3035] px-3 py-2 text-sm text-[#F1F3F5]"
                >
                  {workAreas.map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Smelter Y"
                  value={newSmelterName}
                  onChange={(e) => setNewSmelterName(e.target.value)}
                  className="rounded-lg border border-[#495057] bg-[#2B3035] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500"
                />
              </div>
              <button
                type="submit"
                disabled={savingAreas}
                className="rounded-lg bg-[#7A9278] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#667D64] disabled:opacity-50"
              >
                {savingAreas ? "Menyimpan..." : "+ Tambah Smelter"}
              </button>
            </form>

            {/* Tambah BUFN Baru */}
            <form
              onSubmit={handleAddNewBufn}
              className="space-y-3 rounded-lg border border-[#495057] bg-[#212529] p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-[#8BB3D6]">
                Tambah BUFN Baru
              </p>
              <input
                type="text"
                required
                placeholder="Contoh: BUFN 6"
                value={newBufnName}
                onChange={(e) => setNewBufnName(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#2B3035] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500"
              />
              <button
                type="submit"
                disabled={savingAreas}
                className="rounded-lg bg-[#5B7C99] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#45657F] disabled:opacity-50"
              >
                {savingAreas ? "Menyimpan..." : "+ Tambah BUFN"}
              </button>
            </form>
          </div>

          {/* Ringkasan Daftar BUFN & Smelter Saat Ini */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workAreas.map((area) => (
              <div
                key={area.name}
                className="rounded-lg border border-[#495057]/70 bg-[#212529]/70 p-3"
              >
                <p className="text-xs font-bold text-[#8BB3D6]">{area.name}</p>
                <p className="mt-1 text-xs text-slate-300">
                  {area.smelters.length > 0
                    ? area.smelters.join(", ")
                    : "Belum ada smelter"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form Tambah Anggota Baru */}
      {showAddForm && (
        <form
          onSubmit={handleAddUser}
          className="space-y-4 rounded-xl border border-[#5B7C99]/50 bg-[#2B3035] p-5"
        >
          <h2 className="text-base font-semibold text-[#F1F3F5]">
            Tambah Akun Personel Baru
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                ID Karyawan
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: 8221026045"
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
                placeholder="Nama lengkap Safety Officer / Admin BUFN"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
                {isSuperAdmin && <option value="admin">Admin BUFN</option>}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Wilayah BUFN
              </label>
              {isSuperAdmin ? (
                <select
                  value={newBufn}
                  onChange={(e) => handleNewBufnChange(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
                >
                  {workAreas.map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  disabled
                  value={currentUser.bufn}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529]/60 px-3 py-2 text-sm text-slate-400"
                />
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Lokasi Smelter / Nikelmatte
              </label>
              <select
                required={role === "safety_officer"}
                value={newSmelter}
                onChange={(e) => setNewSmelter(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
              >
                {role === "admin" && (
                  <option value="Semua Smelter BUFN">Semua Smelter BUFN</option>
                )}
                {getSmeltersForBufn(
                  isSuperAdmin ? newBufn : currentUser.bufn
                ).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Password Awal (minimal 6 karakter)
              </label>
              <input
                type="password"
                required
                minLength={6}
                placeholder="Minimal 6 karakter"
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
              {submitting ? "Menyimpan..." : "Simpan Akun"}
            </button>
          </div>
        </form>
      )}

      {/* Bar Filter Pencarian, BUFN, dan Smelter */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#495057] bg-[#2B3035] p-4 sm:grid-cols-3">
        <input
          type="text"
          placeholder="Cari nama atau ID Karyawan..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-[#495057] bg-[#212529] px-3.5 py-2 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
        />

        {isSuperAdmin ? (
          <select
            value={filterBufn}
            onChange={(e) => {
              setFilterBufn(e.target.value);
              setFilterSmelter("ALL");
            }}
            className="rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
          >
            <option value="ALL">Semua BUFN (BUFN 1 – 5)</option>
            {workAreas.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="rounded-lg border border-[#495057] bg-[#212529]/60 px-3 py-2 text-sm text-slate-300">
            Wilayah: <strong>{currentUser.bufn}</strong>
          </div>
        )}

        <select
          value={filterSmelter}
          onChange={(e) => setFilterSmelter(e.target.value)}
          className="rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
        >
          <option value="ALL">Semua Lokasi Smelter</option>
          {availableFilterSmelters.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Tabel Desktop */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-[#495057] bg-[#2B3035]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#495057] bg-[#212529]/70 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">ID Karyawan</th>
              <th className="px-4 py-3">Nama Lengkap</th>
              <th className="px-4 py-3">BUFN</th>
              <th className="px-4 py-3">Lokasi Smelter</th>
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
                <td className="px-4 py-3 text-xs font-semibold text-[#8BB3D6]">
                  {u.bufn}
                </td>
                <td className="px-4 py-3 text-slate-200">{u.smelter}</td>
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
                        type="button"
                        onClick={() => openEditModal(u)}
                        className="rounded border border-[#495057] bg-[#212529] px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-[#5B7C99] hover:text-white"
                      >
                        Edit / Mutasi Smelter
                      </button>
                      <button
                        type="button"
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
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-slate-400"
                >
                  Tidak ada anggota yang sesuai dengan filter wilayah/pencarian.
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
                  ID: {u.employeeId}
                </p>
                <p className="mt-1 text-xs text-[#8BB3D6]">
                  {u.bufn} • {u.smelter}
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
              <span className="text-xs font-medium text-slate-300">
                {formatRole(u.role)}
              </span>

              {canManage(u) ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(u)}
                    className="rounded border border-[#495057] bg-[#212529] px-2.5 py-1 text-xs text-slate-200"
                  >
                    Edit / Mutasi
                  </button>
                  <button
                    type="button"
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

      {/* Modal Edit Profil, Mutasi Smelter & Reset Password */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-md space-y-4 rounded-xl border border-[#495057] bg-[#2B3035] p-6 shadow-xl"
          >
            <div>
              <h3 className="text-lg font-bold text-[#F1F3F5]">
                Edit Anggota & Mutasi Lokasi Smelter
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
                  <option value="admin">Admin BUFN</option>
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Wilayah BUFN{" "}
                {!isSuperAdmin && (
                  <span className="text-slate-500">(Terkunci sesuai BUFN Anda)</span>
                )}
              </label>
              {isSuperAdmin ? (
                <select
                  value={editBufn}
                  onChange={(e) => handleEditBufnChange(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
                >
                  {workAreas.map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  disabled
                  value={currentUser.bufn}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529]/60 px-3 py-2 text-sm text-slate-400"
                />
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Lokasi Smelter (dalam {isSuperAdmin ? editBufn : currentUser.bufn})
              </label>
              <select
                value={editSmelter}
                onChange={(e) => setEditSmelter(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
              >
                {editRole === "admin" && (
                  <option value="Semua Smelter BUFN">Semua Smelter BUFN</option>
                )}
                {getSmeltersForBufn(
                  isSuperAdmin ? editBufn : currentUser.bufn
                ).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Reset Password (kosongkan jika tidak diubah)
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