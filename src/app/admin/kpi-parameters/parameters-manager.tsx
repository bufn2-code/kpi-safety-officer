"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { KpiParameter } from "@/app/api/admin/kpi-parameters/route";
import {
  FORMULA_LABELS,
  type FormulaType,
  type GradeThreshold,
  type ScoringPolicy,
} from "@/lib/kpi-engine";

interface Props {
  initialParameters: KpiParameter[];
  initialGrades: GradeThreshold[];
  initialPolicy: ScoringPolicy;
}

const DEFAULT_HSE_TEMPLATES: Array<{
  code: string;
  name: string;
  description: string;
  formulaType: FormulaType;
  unit: string;
  target: number;
  weight: number;
  order: number;
}> = [
  {
    code: "KPI-01",
    name: "Inspeksi Keselamatan Area Kerja (Safety Inspection)",
    description:
      "Pelaksanaan inspeksi rutin area smelter/nikelmatte dan tindak lanjut temuan hazard.",
    formulaType: "higher_better",
    unit: "Inspeksi",
    target: 8,
    weight: 25,
    order: 1,
  },
  {
    code: "KPI-02",
    name: "Safety Talk / Toolbox Meeting (TBM)",
    description:
      "Pelaksanaan pengarahan K3 sebelum pekerjaan dimulai bersama tim lapangan.",
    formulaType: "higher_better",
    unit: "Kegiatan",
    target: 20,
    weight: 20,
    order: 2,
  },
  {
    code: "KPI-03",
    name: "Pelaporan & Penutupan Temuan Hazard (Hazard Report)",
    description:
      "Identifikasi kondisi/tindakan tidak aman (KTA/TTA) dan verifikasi penutupannya.",
    formulaType: "higher_better",
    unit: "Temuan",
    target: 15,
    weight: 25,
    order: 3,
  },
  {
    code: "KPI-04",
    name: "Observasi Tugas Terencana (PTO / JSA Review)",
    description:
      "Pengamatan kepatuhan SOP/JSA pada aktivitas berisiko tinggi di area binaan.",
    formulaType: "higher_better",
    unit: "Observasi",
    target: 4,
    weight: 15,
    order: 4,
  },
  {
    code: "KPI-05",
    name: "Zero Incident / Kasus Kecelakaan Kerja Area Binaan",
    description:
      "Target 0 kasus kecelakaan kerja (LTI/MTC/FAC) di area pengawasan Safety Officer.",
    formulaType: "lower_better",
    unit: "Kasus",
    target: 0,
    weight: 15,
    order: 5,
  },
];

export default function ParametersManager({
  initialParameters,
  initialGrades,
  initialPolicy,
}: Props) {
  const router = useRouter();
  const [parameters, setParameters] =
    useState<KpiParameter[]>(initialParameters);
  const [grades, setGrades] = useState<GradeThreshold[]>(initialGrades);
  const [policy, setPolicy] = useState<ScoringPolicy>(initialPolicy);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showPolicyPanel, setShowPolicyPanel] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Form tambah parameter
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formulaType, setFormulaType] =
    useState<FormulaType>("higher_better");
  const [unit, setUnit] = useState("Kegiatan");
  const [target, setTarget] = useState("4");
  const [weight, setWeight] = useState("20");
  const [order, setOrder] = useState(String(initialParameters.length + 1));
  const [submitting, setSubmitting] = useState(false);

  // Form edit parameter
  const [editing, setEditing] = useState<KpiParameter | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editFormula, setEditFormula] =
    useState<FormulaType>("higher_better");
  const [editUnit, setEditUnit] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editOrder, setEditOrder] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [banner, setBanner] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const totalCoreWeight =
    Math.round(
      parameters
        .filter((p) => p.isActive && p.formulaType !== "bonus_point")
        .reduce((sum, p) => sum + p.weight, 0) * 100
    ) / 100;

  const totalMaxBonus =
    Math.round(
      parameters
        .filter((p) => p.isActive && p.formulaType === "bonus_point")
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
        text: "5 Parameter Standar KPI Safety Officer (total bobot utama 100%) berhasil dimuat.",
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
          formulaType,
          unit,
          target: Number(target),
          weight: Number(weight),
          order: Number(order),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setBanner({
          type: "err",
          text: data.pesan || "Gagal menambah parameter.",
        });
        setSubmitting(false);
        return;
      }

      setBanner({ type: "ok", text: data.pesan });
      setCode("");
      setName("");
      setDescription("");
      setFormulaType("higher_better");
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
    setEditFormula(p.formulaType || "higher_better");
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
          formulaType: editFormula,
          unit: editUnit,
          target: Number(editTarget),
          weight: Number(editWeight),
          order: Number(editOrder),
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
    if (
      !window.confirm(
        `Hapus parameter "${p.code} - ${p.name}" dari Master? (Riwayat Kartu KPI bulan-bulan lama tetap aman)`
      )
    )
      return;
    setBanner(null);
    const res = await fetch(`/api/admin/kpi-parameters/${p.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok || !data.berhasil) {
      setBanner({
        type: "err",
        text: data.pesan || "Gagal menghapus parameter.",
      });
      return;
    }
    setBanner({ type: "ok", text: data.pesan });
    await reloadParameters();
  }

  function handleGradeFieldChange(
    idx: number,
    field: keyof GradeThreshold,
    value: string | number
  ) {
    setGrades((prev) =>
      prev.map((g, i) => (i === idx ? { ...g, [field]: value } : g))
    );
  }

  function handleAddGradeRow() {
    setGrades((prev) => [
      ...prev,
      {
        id: `g_${Date.now()}`,
        grade: "E",
        label: "Kategori Baru",
        minScore: 50,
        color: "amber",
      },
    ]);
  }

  function handleRemoveGradeRow(idx: number) {
    if (grades.length <= 1) return;
    setGrades((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSaveGradesAndPolicy(e: React.FormEvent) {
    e.preventDefault();
    setSavingPolicy(true);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/kpi-grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grades, policy }),
      });
      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setBanner({
          type: "err",
          text: data.pesan || "Gagal menyimpan kebijakan & kategori nilai.",
        });
        setSavingPolicy(false);
        return;
      }
      setGrades(data.grades);
      setPolicy(data.policy);
      setBanner({ type: "ok", text: data.pesan });
      router.refresh();
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setSavingPolicy(false);
    }
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

      {/* Bar Kontrol Atas */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#495057] bg-[#2B3035] p-4">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-xs text-slate-400">Bobot Parameter Utama</p>
            <p
              className={`text-xl font-bold ${
                totalCoreWeight === 100
                  ? "text-emerald-400"
                  : totalCoreWeight > 100
                    ? "text-red-400"
                    : "text-amber-300"
              }`}
            >
              {totalCoreWeight}%{" "}
              <span className="text-xs font-normal text-slate-400">
                / 100% ({totalCoreWeight === 100 ? "Ideal" : `Sisa ${100 - totalCoreWeight}%`})
              </span>
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400">Maksimal Poin Bonus</p>
            <p className="text-xl font-bold text-[#8BB3D6]">
              +{totalMaxBonus}{" "}
              <span className="text-xs font-normal text-slate-400">poin ekstra</span>
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
              {seeding ? "Memuat..." : "Muat 5 Parameter Standar HSE"}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setShowPolicyPanel((prev) => !prev);
              setShowAddForm(false);
              setBanner(null);
            }}
            className="rounded-lg border border-[#495057] bg-[#212529] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-[#5B7C99]"
          >
            {showPolicyPanel
              ? "Tutup Kebijakan & Grade"
              : "Kebijakan Nilai & Grade (A/B/C/D)"}
          </button>

          <button
            type="button"
            onClick={() => {
              setOrder(String(parameters.length + 1));
              setShowAddForm((prev) => !prev);
              setShowPolicyPanel(false);
              setBanner(null);
            }}
            className="rounded-lg bg-[#5B7C99] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#45657F]"
          >
            {showAddForm ? "Tutup Form" : "+ Tambah Parameter / Bonus"}
          </button>
        </div>
      </div>

      {/* Panel Pengaturan Kebijakan Kelulusan & Kategori Nilai Standar */}
      {showPolicyPanel && (
        <form
          onSubmit={handleSaveGradesAndPolicy}
          className="space-y-6 rounded-xl border border-[#7A9278]/50 bg-[#2B3035] p-5"
        >
          {/* Bagian A: Saklar Kebijakan Kelulusan */}
          <div className="space-y-3 rounded-lg border border-[#495057] bg-[#212529] p-4">
            <h2 className="text-base font-semibold text-[#F1F3F5]">
              1. Logika Kelulusan & Kompensasi Nilai
            </h2>
            <p className="text-xs text-slate-400">
              Ubah saklar di bawah ini kapan saja sesuai kebijakan manajemen PT IWIP.
            </p>

            <label className="flex items-start gap-3 pt-1">
              <input
                type="checkbox"
                checked={policy.requireAllCoreAchieved}
                onChange={(e) =>
                  setPolicy((prev) => ({
                    ...prev,
                    requireAllCoreAchieved: e.target.checked,
                  }))
                }
                className="mt-1 h-4 w-4 rounded border-[#495057] accent-[#5B7C99]"
              />
              <div className="text-sm">
                <span className="font-semibold text-[#F1F3F5]">
                  Wajib Lulus Semua Indikator Utama (Mode Ketat)
                </span>
                <p className="text-xs text-slate-400">
                  Jika dicentang, seluruh indikator utama wajib tercapai. Jika ada indikator yang gagal, nilai otomatis tertahan di predikat batas bawah. Jika dimatikan (Mode Kompensasi), kekurangan nilai indikator bisa ditutupi oleh Poin Bonus.
                </p>
              </div>
            </label>

            {policy.requireAllCoreAchieved && (
              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Batas Minimal Capaian Tiap Indikator Utama (%)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={policy.minCoreAchievementPct}
                    onChange={(e) =>
                      setPolicy((prev) => ({
                        ...prev,
                        minCoreAchievementPct: Number(e.target.value) || 100,
                      }))
                    }
                    className="w-full rounded border border-[#495057] bg-[#2B3035] px-3 py-1.5 text-sm text-[#F1F3F5]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Predikat Maksimal Jika Ada Indikator Gagal
                  </label>
                  <select
                    value={policy.fallbackGradeIfFailed}
                    onChange={(e) =>
                      setPolicy((prev) => ({
                        ...prev,
                        fallbackGradeIfFailed: e.target.value,
                      }))
                    }
                    className="w-full rounded border border-[#495057] bg-[#2B3035] px-3 py-1.5 text-sm text-[#F1F3F5]"
                  >
                    {grades.map((g) => (
                      <option key={g.id} value={g.grade}>
                        Grade {g.grade} ({g.label})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <label className="flex items-start gap-3 pt-2 border-t border-[#495057]/50">
              <input
                type="checkbox"
                checked={policy.capTotalScoreAt100}
                onChange={(e) =>
                  setPolicy((prev) => ({
                    ...prev,
                    capTotalScoreAt100: e.target.checked,
                  }))
                }
                className="mt-1 h-4 w-4 rounded border-[#495057] accent-[#5B7C99]"
              />
              <div className="text-sm">
                <span className="font-semibold text-[#F1F3F5]">
                  Batasi Skor Akhir Maksimal 100%
                </span>
                <p className="text-xs text-slate-400">
                  Jika dimatikan, total skor utama ditambah poin bonus dapat melampaui 100% (misal 105%).
                </p>
              </div>
            </label>
          </div>

          {/* Bagian B: Rentang Kategori Nilai Standar */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-[#F1F3F5]">
                  2. Kategori Nilai Standar (Grading Scale)
                </h2>
                <p className="text-xs text-slate-400">
                  Tentukan batas skor minimal untuk setiap predikat nilai KPI.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddGradeRow}
                className="rounded border border-[#495057] bg-[#212529] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-[#5B7C99]"
              >
                + Tambah Baris Kategori
              </button>
            </div>

            <div className="space-y-2.5">
              {grades.map((g, idx) => (
                <div
                  key={g.id}
                  className="grid grid-cols-1 gap-2 rounded-lg border border-[#495057] bg-[#212529] p-3 sm:grid-cols-12 items-center"
                >
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-400">
                      Huruf / Kode
                    </label>
                    <input
                      type="text"
                      required
                      value={g.grade}
                      onChange={(e) =>
                        handleGradeFieldChange(idx, "grade", e.target.value)
                      }
                      className="w-full rounded border border-[#495057] bg-[#2B3035] px-2.5 py-1.5 text-sm font-bold text-[#F1F3F5]"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-[11px] text-slate-400">
                      Predikat / Keterangan
                    </label>
                    <input
                      type="text"
                      required
                      value={g.label}
                      onChange={(e) =>
                        handleGradeFieldChange(idx, "label", e.target.value)
                      }
                      className="w-full rounded border border-[#495057] bg-[#2B3035] px-2.5 py-1.5 text-sm text-[#F1F3F5]"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[11px] text-slate-400">
                      Skor Minimal (%)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      required
                      value={g.minScore}
                      onChange={(e) =>
                        handleGradeFieldChange(
                          idx,
                          "minScore",
                          Number(e.target.value)
                        )
                      }
                      className="w-full rounded border border-[#495057] bg-[#2B3035] px-2.5 py-1.5 text-sm text-[#F1F3F5]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-400">
                      Warna Lencana
                    </label>
                    <select
                      value={g.color}
                      onChange={(e) =>
                        handleGradeFieldChange(idx, "color", e.target.value)
                      }
                      className="w-full rounded border border-[#495057] bg-[#2B3035] px-2 py-1.5 text-sm text-[#F1F3F5]"
                    >
                      <option value="emerald">Hijau</option>
                      <option value="blue">Biru</option>
                      <option value="amber">Kuning</option>
                      <option value="red">Merah</option>
                    </select>
                  </div>

                  <div className="sm:col-span-1 text-right">
                    {grades.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveGradeRow(idx)}
                        className="mt-3 sm:mt-4 rounded border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-950/50"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="submit"
              disabled={savingPolicy}
              className="rounded-lg bg-[#7A9278] px-5 py-2 text-sm font-semibold text-white hover:bg-[#667D64] disabled:opacity-50"
            >
              {savingPolicy ? "Menyimpan..." : "Simpan Kebijakan & Kategori Nilai"}
            </button>
          </div>
        </form>
      )}

      {/* Form Tambah Parameter / Poin Bonus */}
      {showAddForm && (
        <form
          onSubmit={handleAdd}
          className="space-y-4 rounded-xl border border-[#5B7C99]/50 bg-[#2B3035] p-5"
        >
          <h2 className="text-base font-semibold text-[#F1F3F5]">
            Tambah Parameter KPI / Indikator Penambah Poin
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Kode KPI
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: KPI-06 / BONUS-01"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Nama Indikator / Kegiatan
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: Inovasi K3 / Pelaporan Nearmiss Ekstra"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Tipe Rumus Perhitungan Skor
              </label>
              <select
                value={formulaType}
                onChange={(e) => setFormulaType(e.target.value as FormulaType)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
              >
                {(Object.keys(FORMULA_LABELS) as FormulaType[]).map((key) => (
                  <option key={key} value={key}>
                    {FORMULA_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Keterangan / Kriteria Bukti (opsional)
              </label>
              <input
                type="text"
                placeholder="Penjelasan singkat cara penilaian indikator ini"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                {formulaType === "bonus_point"
                  ? "Poin per 1 Kegiatan"
                  : "Target Bulanan (Angka)"}
              </label>
              <input
                type="number"
                step="any"
                min="0"
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
                placeholder="Kegiatan / Kasus / %"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                {formulaType === "bonus_point"
                  ? "Maksimal Poin Bonus"
                  : "Bobot Utama (%)"}
              </label>
              <input
                type="number"
                step="any"
                min="0.5"
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

      {/* Daftar Parameter KPI */}
      <div className="space-y-3">
        {parameters.map((p) => {
          const isBonus = p.formulaType === "bonus_point";
          return (
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
                    <span
                      className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ${
                        isBonus
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-[#5B7C99]/20 text-[#8BB3D6]"
                      }`}
                    >
                      {p.code}
                    </span>
                    <h3 className="font-semibold text-[#F1F3F5]">{p.name}</h3>
                    {isBonus && (
                      <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                        Poin Bonus Ekstra
                      </span>
                    )}
                    {!p.isActive && (
                      <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
                        Nonaktif
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#8BB3D6]">
                    Rumus: {FORMULA_LABELS[p.formulaType || "higher_better"]}
                  </p>
                  {p.description && (
                    <p className="text-xs text-slate-400">{p.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-4 text-sm">
                  <div className="text-right">
                    <p className="text-xs text-slate-400">
                      {isBonus ? "Nilai per Kegiatan" : "Target / Bulan"}
                    </p>
                    <p className="font-semibold text-[#F1F3F5]">
                      {isBonus
                        ? `+${p.target} poin / ${p.unit}`
                        : `${p.target} ${p.unit}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">
                      {isBonus ? "Maks. Bonus" : "Bobot"}
                    </p>
                    <p
                      className={`font-bold ${
                        isBonus ? "text-amber-300" : "text-[#A3BE9F]"
                      }`}
                    >
                      {isBonus ? `+${p.weight}` : `${p.weight}%`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-[#495057]/60 pt-3">
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="rounded border border-[#495057] bg-[#212529] px-3 py-1 text-xs font-medium text-slate-200 hover:border-[#5B7C99]"
                >
                  Edit Rumus / Target
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
          );
        })}

        {parameters.length === 0 && (
          <div className="rounded-xl border border-dashed border-[#495057] bg-[#2B3035]/60 p-8 text-center text-sm text-slate-400">
            Belum ada parameter KPI. Klik tombol{" "}
            <strong className="text-slate-200">
              Muat 5 Parameter Standar HSE
            </strong>{" "}
            atau{" "}
            <strong className="text-slate-200">+ Tambah Parameter / Bonus</strong>{" "}
            di atas.
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
              Edit Parameter & Rumus KPI
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
                  Tipe Rumus Perhitungan
                </label>
                <select
                  value={editFormula}
                  onChange={(e) =>
                    setEditFormula(e.target.value as FormulaType)
                  }
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                >
                  {(Object.keys(FORMULA_LABELS) as FormulaType[]).map(
                    (key) => (
                      <option key={key} value={key}>
                        {FORMULA_LABELS[key]}
                      </option>
                    )
                  )}
                </select>
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
                  {editFormula === "bonus_point"
                    ? "Poin / Kegiatan"
                    : "Target"}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
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
                  {editFormula === "bonus_point"
                    ? "Maks. Bonus"
                    : "Bobot (%)"}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.5"
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