"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionUser, UserRole } from "@/lib/session";
import {
  JOB_TITLES,
  KPI_CATEGORY_LABELS,
  type BufnArea,
  type JobTitle,
  type KpiCategory,
} from "@/lib/work-areas";
import type { ManagedUser } from "@/app/api/admin/users/route";

interface Props {
  currentUser: SessionUser;
  initialUsers: ManagedUser[];
  initialWorkAreas: BufnArea[];
}

export default function UsersManager({
  currentUser,
  initialUsers,
  initialWorkAreas,
}: Props) {
  const router = useRouter();
  const isSuperAdmin = currentUser.role === "super_admin";

  const [users, setUsers] = useState<ManagedUser[]>(initialUsers);
  const [workAreas, setWorkAreas] = useState<BufnArea[]>(initialWorkAreas);
  const [search, setSearch] = useState("");
  const [filterBufn, setFilterBufn] = useState<string>(
    isSuperAdmin ? "ALL" : currentUser.bufn
  );
  const [filterSmelter, setFilterSmelter] = useState<string>("ALL");

  const [showAddForm, setShowAddForm] = useState(false);
  const [showSmelterPanel, setShowSmelterPanel] = useState(false);

  // Form tambah pengguna
  const defaultBufn = isSuperAdmin
    ? workAreas[0]?.name || "BUFN 1"
    : currentUser.bufn;
  const defaultSmelter =
    workAreas.find((a) => a.name === defaultBufn)?.smelters[0] || "Smelter A";

  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("safety_officer");
  const [jobTitle, setJobTitle] = useState<JobTitle>("Safety Officer");
  const [kpiCategory, setKpiCategory] = useState<KpiCategory>("shift_3g2s");
  const [bufn, setBufn] = useState(defaultBufn);
  const [smelter, setSmelter] = useState(defaultSmelter);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Form tambah smelter baru
  const [targetBufnSmelter, setTargetBufnSmelter] = useState(defaultBufn);
  const [newSmelterName, setNewSmelterName] = useState("");
  const [savingSmelter, setSavingSmelter] = useState(false);

  // Modal edit & mutasi
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmployeeId, setEditEmployeeId] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("safety_officer");
  const [editJobTitle, setEditJobTitle] = useState<JobTitle>("Safety Officer");
  const [editKpiCategory, setEditKpiCategory] =
    useState<KpiCategory>("shift_3g2s");
  const [editBufn, setEditBufn] = useState("");
  const [editSmelter, setEditSmelter] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [banner, setBanner] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const availableSmeltersForFilter =
    filterBufn === "ALL"
      ? Array.from(new Set(workAreas.flatMap((a) => a.smelters)))
      : workAreas.find((a) => a.name === filterBufn)?.smelters || [];

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
      u.jobTitle.toLowerCase().includes(q) ||
      u.bufn.toLowerCase().includes(q) ||
      u.smelter.toLowerCase().includes(q)
    );
  });

  async function reloadData() {
    const [uRes, wRes] = await Promise.all([
      fetch("/api/admin/users", { cache: "no-store" }),
      fetch("/api/admin/work-areas", { cache: "no-store" }),
    ]);
    const uData = await uRes.json();
    const wData = await wRes.json();
    if (uRes.ok && uData.berhasil) setUsers(uData.users);
    if (wRes.ok && wData.berhasil) setWorkAreas(wData.workAreas);
    router.refresh();
  }

  function handleAddBufnChange(nextBufn: string) {
    setBufn(nextBufn);
    const list = workAreas.find((a) => a.name === nextBufn)?.smelters || [];
    setSmelter(list[0] || "");
  }

  function handleJobTitleChange(nextJob: JobTitle) {
    setJobTitle(nextJob);
    if (nextJob === "Wakil Supervisor") {
      setKpiCategory("wakil_spv");
    } else if (kpiCategory === "wakil_spv") {
      setKpiCategory("shift_3g2s");
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setBanner(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          name,
          role: isSuperAdmin ? role : "safety_officer",
          jobTitle,
          kpiCategory,
          bufn: isSuperAdmin ? bufn : currentUser.bufn,
          smelter: role === "safety_officer" ? smelter : "ALL",
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
      setPassword("");
      setShowAddForm(false);
      await reloadData();
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddSmelter(e: React.FormEvent) {
    e.preventDefault();
    setSavingSmelter(true);
    setBanner(null);

    try {
      const res = await fetch("/api/admin/work-areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bufnName: isSuperAdmin ? targetBufnSmelter : currentUser.bufn,
          smelterName: newSmelterName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setBanner({
          type: "err",
          text: data.pesan || "Gagal menambah smelter.",
        });
        setSavingSmelter(false);
        return;
      }

      setBanner({ type: "ok", text: data.pesan });
      setNewSmelterName("");
      await reloadData();
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setSavingSmelter(false);
    }
  }

  function openEditModal(u: ManagedUser) {
    setEditingUser(u);
    setEditName(u.name);
    setEditEmployeeId(u.employeeId);
    setEditRole(u.role);
    setEditJobTitle(u.jobTitle || "Safety Officer");
    setEditKpiCategory(u.kpiCategory || "shift_3g2s");
    setEditBufn(u.bufn === "ALL" ? defaultBufn : u.bufn);
    const list =
      workAreas.find(
        (a) => a.name === (u.bufn === "ALL" ? defaultBufn : u.bufn)
      )?.smelters || [];
    setEditSmelter(
      u.smelter && u.smelter !== "ALL" && u.smelter !== "-"
        ? u.smelter
        : list[0] || ""
    );
    setEditPassword("");
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
          employeeId: editEmployeeId,
          role: isSuperAdmin ? editRole : editingUser.role,
          jobTitle: editJobTitle,
          kpiCategory: editKpiCategory,
          bufn: isSuperAdmin ? editBufn : currentUser.bufn,
          smelter: editSmelter,
          newPassword: editPassword || undefined,
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

      setBanner({ type: "ok", text: data.pesan });
      setEditingUser(null);
      await reloadData();
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleActive(u: ManagedUser) {
    setBanner(null);
    const res = await fetch(`/api/admin/users/${u.uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    const data = await res.json();
    if (!res.ok || !data.berhasil) {
      setBanner({ type: "err", text: data.pesan || "Gagal mengubah status." });
      return;
    }
    setBanner({
      type: "ok",
      text: `Status akun ${u.name} diubah menjadi ${!u.isActive ? "Aktif" : "Nonaktif"}.`,
    });
    await reloadData();
  }

  async function handleDeleteUser(u: ManagedUser) {
    if (!window.confirm(`Yakin ingin menghapus akun ${u.name} (${u.employeeId})?`))
      return;
    setBanner(null);
    const res = await fetch(`/api/admin/users/${u.uid}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok || !data.berhasil) {
      setBanner({ type: "err", text: data.pesan || "Gagal menghapus akun." });
      return;
    }
    setBanner({ type: "ok", text: data.pesan });
    await reloadData();
  }

  const addSmelterOptions =
    workAreas.find((a) => a.name === bufn)?.smelters || [];
  const editSmelterOptions =
    workAreas.find((a) => a.name === editBufn)?.smelters || [];

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

      {/* Bar Filter & Tombol Aksi */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#495057] bg-[#2B3035] p-4">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <input
            type="text"
            placeholder="Cari nama, ID, jabatan, atau smelter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 rounded-lg border border-[#495057] bg-[#212529] px-3.5 py-2 text-sm text-[#F1F3F5] placeholder-slate-400 focus:border-[#5B7C99] focus:outline-none"
          />

          {isSuperAdmin && (
            <select
              value={filterBufn}
              onChange={(e) => {
                setFilterBufn(e.target.value);
                setFilterSmelter("ALL");
              }}
              className="rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
            >
              <option value="ALL">Semua BUFN (1 – 5)</option>
              {workAreas.map((area) => (
                <option key={area.name} value={area.name}>
                  {area.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={filterSmelter}
            onChange={(e) => setFilterSmelter(e.target.value)}
            className="rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
          >
            <option value="ALL">Semua Smelter</option>
            {availableSmeltersForFilter.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setShowSmelterPanel((prev) => !prev);
              setShowAddForm(false);
              setBanner(null);
            }}
            className="rounded-lg border border-[#495057] bg-[#212529] px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:border-[#5B7C99]"
          >
            {showSmelterPanel ? "Tutup Kelola Smelter" : "+ Tambah Smelter"}
          </button>

          <button
            type="button"
            onClick={() => {
              setShowAddForm((prev) => !prev);
              setShowSmelterPanel(false);
              setBanner(null);
            }}
            className="rounded-lg bg-[#5B7C99] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#45657F]"
          >
            {showAddForm ? "Tutup Form" : "+ Tambah Personel"}
          </button>
        </div>
      </div>

      {/* Panel Tambah Smelter Baru */}
      {showSmelterPanel && (
        <form
          onSubmit={handleAddSmelter}
          className="space-y-4 rounded-xl border border-[#7A9278]/50 bg-[#2B3035] p-5"
        >
          <h2 className="text-base font-semibold text-[#F1F3F5]">
            Tambah Lokasi Smelter Baru
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Wilayah BUFN
              </label>
              {isSuperAdmin ? (
                <select
                  value={targetBufnSmelter}
                  onChange={(e) => setTargetBufnSmelter(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                >
                  {workAreas.map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg border border-[#495057] bg-[#212529]/60 px-3 py-2 text-sm text-slate-200">
                  {currentUser.bufn}
                </div>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Nama Smelter Baru
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: Smelter U / Nikelmatte Line 2"
                value={newSmelterName}
                onChange={(e) => setNewSmelterName(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowSmelterPanel(false)}
              className="rounded-lg border border-[#495057] bg-[#212529] px-4 py-2 text-sm text-slate-300"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={savingSmelter}
              className="rounded-lg bg-[#7A9278] px-4 py-2 text-sm font-semibold text-white hover:bg-[#667D64] disabled:opacity-50"
            >
              {savingSmelter ? "Menyimpan..." : "Simpan Smelter"}
            </button>
          </div>
        </form>
      )}

      {/* Form Tambah Pengguna Baru */}
      {showAddForm && (
        <form
          onSubmit={handleCreateUser}
          className="space-y-4 rounded-xl border border-[#5B7C99]/50 bg-[#2B3035] p-5"
        >
          <h2 className="text-base font-semibold text-[#F1F3F5]">
            Tambah Personel Baru
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                ID Karyawan
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: 82120"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Nama Lengkap
              </label>
              <input
                type="text"
                required
                placeholder="Nama lengkap"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Password Awal
              </label>
              <input
                type="password"
                required
                minLength={4}
                placeholder="Minimal 4 karakter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500"
              />
            </div>

            {isSuperAdmin && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Hak Akses Sistem
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                >
                  <option value="safety_officer">Personel Lapangan / Wakil SPV</option>
                  <option value="admin">Admin BUFN (Penilai Wilayah)</option>
                  <option value="super_admin">Super Admin (Comprehensive HSE)</option>
                </select>
              </div>
            )}

            {role === "safety_officer" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Jabatan Fungsional
                  </label>
                  <select
                    value={jobTitle}
                    onChange={(e) =>
                      handleJobTitleChange(e.target.value as JobTitle)
                    }
                    className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                  >
                    {JOB_TITLES.map((j) => (
                      <option key={j} value={j}>
                        {j}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Kategori Pola Kerja KPI
                  </label>
                  {jobTitle === "Wakil Supervisor" ? (
                    <div className="rounded-lg border border-[#495057] bg-[#212529]/60 px-3 py-2 text-sm font-medium text-amber-300">
                      Otomatis: Wakil Supervisor
                    </div>
                  ) : (
                    <select
                      value={kpiCategory}
                      onChange={(e) =>
                        setKpiCategory(e.target.value as KpiCategory)
                      }
                      className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                    >
                      <option value="shift_3g2s">
                        {KPI_CATEGORY_LABELS.shift_3g2s}
                      </option>
                      <option value="non_shift">
                        {KPI_CATEGORY_LABELS.non_shift}
                      </option>
                    </select>
                  )}
                </div>
              </>
            )}

            {role !== "super_admin" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Wilayah BUFN
                </label>
                {isSuperAdmin ? (
                  <select
                    value={bufn}
                    onChange={(e) => handleAddBufnChange(e.target.value)}
                    className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                  >
                    {workAreas.map((a) => (
                      <option key={a.name} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-lg border border-[#495057] bg-[#212529]/60 px-3 py-2 text-sm text-slate-200">
                    {currentUser.bufn}
                  </div>
                )}
              </div>
            )}

            {role === "safety_officer" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Lokasi Smelter
                </label>
                <select
                  value={smelter}
                  onChange={(e) => setSmelter(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                >
                  {addSmelterOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
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

      {/* Tabel Pengguna */}
      <div className="overflow-x-auto rounded-xl border border-[#495057] bg-[#2B3035]">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#495057] bg-[#212529]/70 text-xs uppercase text-slate-400">
              <th className="px-4 py-3">ID Karyawan</th>
              <th className="px-4 py-3">Nama & Jabatan</th>
              <th className="px-4 py-3">Kategori KPI</th>
              <th className="px-4 py-3">BUFN & Smelter</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Aksi / Mutasi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#495057]/60">
            {filteredUsers.map((u) => (
              <tr key={u.uid} className="hover:bg-[#212529]/40">
                <td className="px-4 py-3 font-mono text-xs text-slate-300">
                  {u.employeeId}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-[#F1F3F5]">{u.name}</div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {u.role === "super_admin"
                      ? "Super Admin"
                      : u.role === "admin"
                        ? "Admin BUFN"
                        : u.jobTitle}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {u.role === "safety_officer" ? (
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        u.kpiCategory === "wakil_spv"
                          ? "bg-amber-500/20 text-amber-300"
                          : u.kpiCategory === "non_shift"
                            ? "bg-purple-500/20 text-purple-300"
                            : "bg-[#5B7C99]/20 text-[#8BB3D6]"
                      }`}
                    >
                      {KPI_CATEGORY_LABELS[u.kpiCategory]}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {u.role === "super_admin"
                    ? "Semua BUFN & Smelter"
                    : u.role === "admin"
                      ? `${u.bufn} (Semua Smelter)`
                      : `${u.bufn} • ${u.smelter}`}
                </td>
                <td className="px-4 py-3">
                  {u.isActive ? (
                    <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                      Aktif
                    </span>
                  ) : (
                    <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-300">
                      Nonaktif
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex flex-wrap justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(u)}
                      className="rounded border border-[#495057] bg-[#212529] px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-[#5B7C99]"
                    >
                      Edit / Mutasi
                    </button>
                    {u.uid !== currentUser.uid && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(u)}
                          className="rounded border border-[#495057] bg-[#212529] px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white"
                        >
                          {u.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          className="rounded border border-red-500/40 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-950/50"
                        >
                          Hapus
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}

            {filteredUsers.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-slate-400"
                >
                  Tidak ada data pengguna yang sesuai dengan filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Edit & Mutasi Lokasi / Jabatan */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-lg space-y-4 rounded-xl border border-[#495057] bg-[#2B3035] p-6 shadow-xl"
          >
            <h3 className="text-lg font-bold text-[#F1F3F5]">
              Edit & Mutasi: {editingUser.name}
            </h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  ID Karyawan
                </label>
                <input
                  type="text"
                  required
                  value={editEmployeeId}
                  onChange={(e) => setEditEmployeeId(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                />
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
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                />
              </div>

              {isSuperAdmin && (
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Hak Akses Sistem
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                  >
                    <option value="safety_officer">Personel Lapangan / Wakil SPV</option>
                    <option value="admin">Admin BUFN</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
              )}

              {editRole === "safety_officer" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      Jabatan Fungsional
                    </label>
                    <select
                      value={editJobTitle}
                      onChange={(e) => {
                        const j = e.target.value as JobTitle;
                        setEditJobTitle(j);
                        if (j === "Wakil Supervisor") {
                          setEditKpiCategory("wakil_spv");
                        } else if (editKpiCategory === "wakil_spv") {
                          setEditKpiCategory("shift_3g2s");
                        }
                      }}
                      className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                    >
                      {JOB_TITLES.map((j) => (
                        <option key={j} value={j}>
                          {j}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      Kategori Pola KPI
                    </label>
                    {editJobTitle === "Wakil Supervisor" ? (
                      <div className="rounded-lg border border-[#495057] bg-[#212529]/60 px-3 py-2 text-sm text-amber-300">
                        Wakil Supervisor
                      </div>
                    ) : (
                      <select
                        value={editKpiCategory}
                        onChange={(e) =>
                          setEditKpiCategory(e.target.value as KpiCategory)
                        }
                        className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                      >
                        <option value="shift_3g2s">
                          {KPI_CATEGORY_LABELS.shift_3g2s}
                        </option>
                        <option value="non_shift">
                          {KPI_CATEGORY_LABELS.non_shift}
                        </option>
                      </select>
                    )}
                  </div>
                </>
              )}

              {editRole !== "super_admin" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Wilayah BUFN
                  </label>
                  {isSuperAdmin ? (
                    <select
                      value={editBufn}
                      onChange={(e) => {
                        const nb = e.target.value;
                        setEditBufn(nb);
                        const list =
                          workAreas.find((a) => a.name === nb)?.smelters || [];
                        setEditSmelter(list[0] || "");
                      }}
                      className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                    >
                      {workAreas.map((a) => (
                        <option key={a.name} value={a.name}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="rounded-lg border border-[#495057] bg-[#212529]/60 px-3 py-2 text-sm text-slate-200">
                      {currentUser.bufn}
                    </div>
                  )}
                </div>
              )}

              {editRole === "safety_officer" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Mutasi Lokasi Smelter
                  </label>
                  <select
                    value={editSmelter}
                    onChange={(e) => setEditSmelter(e.target.value)}
                    className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                  >
                    {editSmelterOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Reset Password Baru (kosongkan jika tidak diubah)
                </label>
                <input
                  type="password"
                  placeholder="Password baru minimal 4 karakter"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded-lg border border-[#495057] bg-[#212529] px-4 py-2 text-sm text-slate-300"
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