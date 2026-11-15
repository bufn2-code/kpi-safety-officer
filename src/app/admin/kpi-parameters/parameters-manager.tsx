"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { KpiParameter } from "@/app/api/admin/kpi-parameters/route";

interface Props {
  initialParameters: KpiParameter[];
}

const DEFAULT_HSE_TEMPLATES = [
  {
    code: "KPI-01",
    name: "Inspeksi Keselamatan Area Kerja (Safety Inspection)",
    description: "Pelaksanaan inspeksi rutin area operasional dan tindak lanjut temuan hazard.",
    unit: "Inspeksi",
    target: 8,
    weight: 25,
    order: 1,
  },
  {
    code: "KPI-02",
    name: "Safety Talk / Toolbox Meeting (TBM)",
    description: "Pelaksanaan pengarahan K3 sebelum pekerjaan dimulai bersama tim lapangan.",
    unit: "Kegiatan",
    target: 20,
    weight: 20,
    order: 2,
  },
  {
    code: "KPI-03",
    name: "Pelaporan & Penutupan Temuan Hazard (Hazard Report)",
    description: "Identifikasi kondisi/tindakan tidak aman (KTA/TTA) dan verifikasi penutupannya.",
    unit: "Temuan",
    target: 15,
    weight: 25,
    order: 3,
  },
  {
    code: "KPI-04",
    name: "Observasi Tugas Terencana (PTO / JSA Review)",
    description: "Pengamatan kepatuhan SOP/JSA pada aktivitas berisiko tinggi di area binaan.",
    unit: "Observasi",
    target: 4,
    weight: 15,
    order: 4,
  },
  {
    code: "KPI-05",
    name: "Kepatuhan Pelaporan Mingguan & SMK3",
    description: "Ketepatan waktu pengumpulan laporan HSE mingguan/bulanan dan kehadiran rapat SMK3.",
    unit: "Laporan",
    target: 4,
    weight: 15,
    order: 5,
  },
];

export default function ParametersManager({ initialParameters }: Props) {
  const router = useRouter();
  const [parameters, setParameters] = useState<KpiParameter[]>(initialParameters);
  const [showAddForm, setShowAddForm] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // State form tambah
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("Kegiatan");
  const [target, setTarget] = useState("4");
  const [weight, setWeight] = useState("20");
  const [order, setOrder] = useState(String(initialParameters.length + 1));
  const [submitting, setSubmitting] = useState(false);

  // State edit
  const [editing, setEditing] = useState<KpiParameter | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editOrder, setEditOrder] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const totalActiveWeight =
    Math.round(
      parameters
        .filter((p) => p.isActive)
        .reduce((sum, p) => sum + p.weight, 0) * 100
    ) / 100;

  async function reloadParameters() {
    const res = await fetch("/api/admin/kpi-parameters", { cache: "no-store" });
    const data = await res.json();
    if (res.ok && data.berhasil) {
      setParameters(data.parameters);
    }
    router.refresh();
  }

  async function handleSeedDefaults() {
    setSeeding(true);
    setBanner(null);
    try {
      for (const item of DEFAULT_HSE_TEMPLATES) {
        const res = await fetch("/api/admin/kpi-parameters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        const data = await res.json();
        if (!res.ok || !data.berhasil) {
          throw new Error(data.pesan || "Gagal memuat template standar.");
        }
      }
      setBanner({
        type: "ok",
        text: "5 Parameter Standar KPI Safety Officer (total bobot 100%) berhasil dimuat.",
      });
      await reloadParameters();
    } catch (err) {
      setBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Gagal memuat template.",
      });
    } finally {
      setSeeding(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setBanner(null);

    try {
      const res = await fetch("/api/admin/kpi-parameters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          description,
          unit,
          target: Number(target),
          weight: Number(weight),
          order: Number(order),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setBanner({ type: "err", text: data.pesan || "Gagal menambah parameter." });
        setSubmitting(false);
        return;
      }

      setBanner({ type: "ok", text: data.pesan });
      setCode("");
      setName("");
      setDescription("");
      setUnit("Kegiatan");
      setTarget("4");
      setWeight("10");
      setOrder(String(parameters.length + 2));
      setShowAddForm(false);
      await reloadParameters();
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(p: KpiParameter) {
    setEditing(p);
    setEditCode(p.code);
    setEditName(p.name);
    setEditDesc(p.description);
    setEditUnit(p.unit);
    setEditTarget(String(p.target));
    setEditWeight(String(p.weight));
    setEditOrder(String(p.order));
    setBanner(null);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    setBanner(null);

    try {
      const res = await fetch(`/api/admin/kpi-parameters/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: editCode,
          name: editName,
          description: editDesc,
          unit: editUnit,
          target: Number(editTarget),
          weight: Number(editWeight),
          order: Number(editOrder),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setBanner({ type: "err", text: data.pesan || "Gagal menyimpan perubahan." });
        setSavingEdit(false);
        return;
      }

      setBanner({ type: "ok", text: data.pesan });
      setEditing(null);
      await reloadParameters();
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleActive(p: KpiParameter) {
    setBanner(null);
    const res = await fetch(`/api/admin/kpi-parameters/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    const data = await res.json();
    if (!res.ok || !data.berhasil) {
      setBanner({ type: "err", text: data.pesan || "Gagal mengubah status." });
      return;
    }
    setBanner({
      type: "ok",
      text: `Parameter "${p.name}" sekarang ${!p.isActive ? "Aktif" : "Nonaktif"}.`,
    });
    await reloadParameters();
  }

  async function handleDelete(p: KpiParameter) {
    if (!window.confirm(`Hapus permanen parameter "${p.code} - ${p.name}"?`)) return;
    setBanner(null);
    const res = await fetch(`/api/admin/kpi-parameters/${p.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok || !data.berhasil) {
      setBanner({ type: "err", text: data.pesan || "Gagal menghapus parameter." });
      return;
    }
    setBanner({ type: "ok", text: data.pesan });
    await reloadParameters();
  }

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

      {/* Ringkasan Total Bobot & Tombol Aksi */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#495057] bg-[#2B3035] p-4">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs text-slate-400">Total Bobot Parameter Aktif</p>
            <p
              className={`text-xl font-bold ${
                totalActiveWeight === 100
                  ? "text-emerald-400"
                  : totalActiveWeight > 100
                    ? "text-red-400"
                    : "text-amber-300"
              }`}
            >
              {totalActiveWeight}%{" "}
              <span className="text-xs font-normal text-slate-400">
                / 100% ({totalActiveWeight === 100 ? "Ideal" : `Sisa ${100 - totalActiveWeight}%`})
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {parameters.length === 0 && (
            <button
              type="button"
              onClick={handleSeedDefaults}
              disabled={seeding}
              className="rounded-lg border border-[#7A9278] bg-[#7A9278]/20 px-4 py-2 text-sm font-semibold text-[#C3DEC0] transition hover:bg-[#7A9278]/30 disabled:opacity-50"
            >
              {seeding ? "Memuat Template..." : "Muat 5 Parameter Standar HSE"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOrder(String(parameters.length + 1));
              setShowAddForm((prev) => !prev);
              setBanner(null);
            }}
            className="rounded-lg bg-[#5B7C99] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#45657F]"
          >
            {showAddForm ? "Tutup Form" : "+ Tambah Parameter KPI"}
          </button>
        </div>
      </div>

      {/* Form Tambah Parameter */}
      {showAddForm && (
        <form
          onSubmit={handleAdd}
          className="space-y-4 rounded-xl border border-[#5B7C99]/50 bg-[#2B3035] p-5"
        >
          <h2 className="text-base font-semibold text-[#F1F3F5]">
            Tambah Parameter KPI Baru
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Kode KPI
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: KPI-01"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Nama Indikator / Parameter KPI
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: Inspeksi Keselamatan Area Kerja"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Keterangan / Kriteria Bukti (opsional)
              </label>
              <input
                type="text"
                placeholder="Penjelasan singkat cara perhitungan atau bukti yang dilampirkan"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Target Bulanan (Angka)
              </label>
              <input
                type="number"
                step="any"
                min="0.1"
                required
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Satuan
              </label>
              <input
                type="text"
                required
                placeholder="Kegiatan / Dokumen / %"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Bobot (%)
              </label>
              <input
                type="number"
                step="any"
                min="1"
                max="100"
                required
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
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
              {submitting ? "Menyimpan..." : "Simpan Parameter"}
            </button>
          </div>
        </form>
      )}

      {/* Daftar Parameter */}
      <div className="space-y-3">
        {parameters.map((p) => (
          <div
            key={p.id}
            className={`rounded-xl border p-4 transition ${
              p.isActive
                ? "border-[#495057] bg-[#2B3035]"
                : "border-[#495057]/50 bg-[#2B3035]/50 opacity-65"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[#5B7C99]/20 px-2 py-0.5 font-mono text-xs font-semibold text-[#8BB3D6]">
                    {p.code}
                  </span>
                  <h3 className="font-semibold text-[#F1F3F5]">{p.name}</h3>
                  {!p.isActive && (
                    <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
                      Nonaktif
                    </span>
                  )}
                </div>
                {p.description && (
                  <p className="text-xs text-slate-400">{p.description}</p>
                )}
              </div>

              <div className="flex items-center gap-4 text-sm">
                <div className="text-right">
                  <p className="text-xs text-slate-400">Target / Bulan</p>
                  <p className="font-semibold text-[#F1F3F5]">
                    {p.target} {p.unit}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Bobot</p>
                  <p className="font-bold text-[#A3BE9F]">{p.weight}%</p>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-[#495057]/60 pt-3">
              <button
                type="button"
                onClick={() => openEdit(p)}
                className="rounded border border-[#495057] bg-[#212529] px-3 py-1 text-xs font-medium text-slate-200 hover:border-[#5B7C99]"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleToggleActive(p)}
                className="rounded border border-[#495057] bg-[#212529] px-3 py-1 text-xs font-medium text-slate-300 hover:text-white"
              >
                {p.isActive ? "Nonaktifkan" : "Aktifkan"}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(p)}
                className="rounded border border-red-500/40 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-950/50"
              >
                Hapus
              </button>
            </div>
          </div>
        ))}

        {parameters.length === 0 && (
          <div className="rounded-xl border border-dashed border-[#495057] bg-[#2B3035]/60 p-8 text-center text-sm text-slate-400">
            Belum ada parameter KPI. Klik tombol{" "}
            <strong className="text-slate-200">Muat 5 Parameter Standar HSE</strong>{" "}
            atau <strong className="text-slate-200">+ Tambah Parameter KPI</strong> di atas untuk memulai.
          </div>
        )}
      </div>

      {/* Modal Edit Parameter */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-lg space-y-4 rounded-xl border border-[#495057] bg-[#2B3035] p-6 shadow-xl"
          >
            <h3 className="text-lg font-bold text-[#F1F3F5]">
              Edit Parameter KPI
            </h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Kode
                </label>
                <input
                  type="text"
                  required
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Nama Parameter
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Keterangan
                </label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Target
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  required
                  value={editTarget}
                  onChange={(e) => setEditTarget(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Satuan
                </label>
                <input
                  type="text"
                  required
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Bobot (%)
                </label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  max="100"
                  required
                  value={editWeight}
                  onChange={(e) => setEditWeight(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-[#495057] bg-[#212529] px-4 py-2 text-sm text-slate-300"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="rounded-lg bg-[#5B7C99] px-4 py-2 text-sm font-semibold text-white hover:bg-[#45657F] disabled:opacity-50"
              >
                {savingEdit ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}