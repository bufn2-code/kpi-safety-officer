"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { KpiParameter } from "@/app/api/admin/kpi-parameters/route";
import {
  FORMULA_LABELS,
  formatPeriodDateRange,
  type FormulaType,
  type GradeThreshold,
  type ScoringPolicy,
  type SpvTeamCalcMode,
} from "@/lib/kpi-engine";
import {
  getParamTargetForCategory,
  getParamWeightForCategory,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
  type KpiCategory,
} from "@/lib/work-areas";

interface Props {
  initialParameters: KpiParameter[];
  initialGrades: GradeThreshold[];
  initialPolicy: ScoringPolicy;
}

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

  const [filterCat, setFilterCat] = useState<"ALL" | KpiCategory>("ALL");
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
  const [selectedCats, setSelectedCats] = useState<KpiCategory[]>([
    "shift_3g2s",
    "non_shift",
  ]);
  const [catTargets, setCatTargets] = useState<Record<KpiCategory, string>>({
    shift_3g2s: "8",
    non_shift: "6",
    wakil_spv: "4",
  });
  const [catWeights, setCatWeights] = useState<Record<KpiCategory, string>>({
    shift_3g2s: "20",
    non_shift: "20",
    wakil_spv: "25",
  });
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
  const [editCats, setEditCats] = useState<KpiCategory[]>([]);
  const [editCatTargets, setEditCatTargets] = useState<
    Record<KpiCategory, string>
  >({
    shift_3g2s: "0",
    non_shift: "0",
    wakil_spv: "0",
  });
  const [editCatWeights, setEditCatWeights] = useState<
    Record<KpiCategory, string>
  >({
    shift_3g2s: "0",
    non_shift: "0",
    wakil_spv: "0",
  });
  const [editOrder, setEditOrder] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [banner, setBanner] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  function getCategoryTotalWeight(cat: KpiCategory): number {
    const sum = parameters
      .filter(
        (p) =>
          p.isActive &&
          p.formulaType !== "bonus_point" &&
          p.applicableCategories.includes(cat)
      )
      .reduce((acc, p) => acc + getParamWeightForCategory(p, cat), 0);
    return Math.round(sum * 100) / 100;
  }

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
    const templates = [
      {
        code: "KPI-01",
        name: "Inspeksi Keselamatan Area Smelter (Safety Inspection)",
        description:
          "Pelaksanaan inspeksi rutin area kerja dan tindak lanjut temuan hazard.",
        formulaType: "higher_better" as FormulaType,
        unit: "Inspeksi",
        target: 8,
        weight: 25,
        applicableCategories: ["shift_3g2s", "non_shift", "wakil_spv"] as KpiCategory[],
        categoryTargets: { shift_3g2s: 8, non_shift: 12, wakil_spv: 4 },
        categoryWeights: { shift_3g2s: 25, non_shift: 25, wakil_spv: 30 },
        order: 1,
      },
      {
        code: "KPI-02",
        name: "Safety Talk / Toolbox Meeting (TBM)",
        description:
          "Pelaksanaan pengarahan K3 sebelum pekerjaan dimulai bersama tim.",
        formulaType: "higher_better" as FormulaType,
        unit: "Kegiatan",
        target: 20,
        weight: 25,
        applicableCategories: ["shift_3g2s", "non_shift", "wakil_spv"] as KpiCategory[],
        categoryTargets: { shift_3g2s: 20, non_shift: 22, wakil_spv: 8 },
        categoryWeights: { shift_3g2s: 25, non_shift: 25, wakil_spv: 25 },
        order: 2,
      },
      {
        code: "KPI-03",
        name: "Pelaporan & Penutupan Temuan Hazard (Hazard Report)",
        description:
          "Identifikasi kondisi/tindakan tidak aman (KTA/TTA) dan verifikasi penutupannya.",
        formulaType: "higher_better" as FormulaType,
        unit: "Temuan",
        target: 15,
        weight: 25,
        applicableCategories: ["shift_3g2s", "non_shift"] as KpiCategory[],
        categoryTargets: { shift_3g2s: 15, non_shift: 20 },
        categoryWeights: { shift_3g2s: 25, non_shift: 25 },
        order: 3,
      },
      {
        code: "KPI-04",
        name: "Verifikasi JSA / P5M & Kepatuhan SOP Area Binaan",
        description:
          "Pengawasan kelengkapan dokumen kerja aman dan review JSA harian.",
        formulaType: "higher_better" as FormulaType,
        unit: "Dokumen",
        target: 10,
        weight: 10,
        applicableCategories: ["shift_3g2s", "non_shift", "wakil_spv"] as KpiCategory[],
        categoryTargets: { shift_3g2s: 10, non_shift: 15, wakil_spv: 12 },
        categoryWeights: { shift_3g2s: 10, non_shift: 10, wakil_spv: 25 },
        order: 4,
      },
      {
        code: "KPI-05",
        name: "Zero Incident / Kasus Kecelakaan Kerja Area Pengawasan",
        description:
          "Target 0 kasus kecelakaan kerja (LTI/MTC/FAC) di area pengawasan.",
        formulaType: "lower_better" as FormulaType,
        unit: "Kasus",
        target: 0,
        weight: 15,
        applicableCategories: ["shift_3g2s", "non_shift", "wakil_spv"] as KpiCategory[],
        categoryTargets: { shift_3g2s: 0, non_shift: 0, wakil_spv: 0 },
        categoryWeights: { shift_3g2s: 15, non_shift: 15, wakil_spv: 20 },
        order: 5,
      },
    ];

    try {
      for (const item of templates) {
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
        text: "Template Parameter Standar untuk 3 Grup 2 Shift, Non Shift, dan Wakil Supervisor (masing-masing bobot 100%) berhasil dimuat.",
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

  function toggleAddCategory(cat: KpiCategory) {
    setSelectedCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (selectedCats.length === 0) {
      setBanner({
        type: "err",
        text: "Centang minimal 1 Kategori Pola Kerja KPI.",
      });
      return;
    }

    setSubmitting(true);
    setBanner(null);

    const firstCat = selectedCats[0];
    const fallbackTarget = Number(catTargets[firstCat]) || 0;
    const fallbackWeight = Number(catWeights[firstCat]) || 10;

    const numericTargets: Partial<Record<KpiCategory, number>> = {};
    const numericWeights: Partial<Record<KpiCategory, number>> = {};
    for (const c of selectedCats) {
      numericTargets[c] = Math.max(0, Number(catTargets[c]) || 0);
      numericWeights[c] = Math.max(0.5, Number(catWeights[c]) || 1);
    }

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
          target: fallbackTarget,
          weight: fallbackWeight,
          applicableCategories: selectedCats,
          categoryTargets: numericTargets,
          categoryWeights: numericWeights,
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
    setEditCats(
      p.applicableCategories?.length
        ? [...p.applicableCategories]
        : [...KPI_CATEGORIES]
    );
    setEditCatTargets({
      shift_3g2s: String(getParamTargetForCategory(p, "shift_3g2s")),
      non_shift: String(getParamTargetForCategory(p, "non_shift")),
      wakil_spv: String(getParamTargetForCategory(p, "wakil_spv")),
    });
    setEditCatWeights({
      shift_3g2s: String(getParamWeightForCategory(p, "shift_3g2s")),
      non_shift: String(getParamWeightForCategory(p, "non_shift")),
      wakil_spv: String(getParamWeightForCategory(p, "wakil_spv")),
    });
    setEditOrder(String(p.order));
    setBanner(null);
  }

  function toggleEditCategory(cat: KpiCategory) {
    setEditCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (editCats.length === 0) {
      setBanner({
        type: "err",
        text: "Pilih minimal 1 kategori pola kerja.",
      });
      return;
    }

    setSavingEdit(true);
    setBanner(null);

    const firstCat = editCats[0];
    const numericTargets: Partial<Record<KpiCategory, number>> = {};
    const numericWeights: Partial<Record<KpiCategory, number>> = {};
    for (const c of editCats) {
      numericTargets[c] = Math.max(0, Number(editCatTargets[c]) || 0);
      numericWeights[c] = Math.max(0.5, Number(editCatWeights[c]) || 1);
    }

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
          target: numericTargets[firstCat],
          weight: numericWeights[firstCat],
          applicableCategories: editCats,
          categoryTargets: numericTargets,
          categoryWeights: numericWeights,
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
        `Hapus parameter "${p.code} - ${p.name}"? (Riwayat Kartu KPI bulan-bulan lama tetap aman)`
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

  const displayedParameters =
    filterCat === "ALL"
      ? parameters
      : parameters.filter((p) => p.applicableCategories.includes(filterCat));

  const sampleMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

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

      {/* Ringkasan Bobot per Kategori KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {KPI_CATEGORIES.map((cat) => {
          const w = getCategoryTotalWeight(cat);
          return (
            <div
              key={cat}
              className="rounded-xl border border-[#495057] bg-[#2B3035] p-4"
            >
              <p className="text-xs text-slate-400">
                Bobot Utama • {KPI_CATEGORY_LABELS[cat]}
              </p>
              <p
                className={`mt-1 text-xl font-bold ${
                  w === 100
                    ? "text-emerald-400"
                    : w > 100
                      ? "text-red-400"
                      : "text-amber-300"
                }`}
              >
                {w}%{" "}
                <span className="text-xs font-normal text-slate-400">
                  / 100% ({w === 100 ? "Ideal" : `Sisa ${100 - w}%`})
                </span>
              </p>
            </div>
          );
        })}
      </div>

      {/* Bar Filter & Tombol Aksi */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#495057] bg-[#2B3035] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">Tampilkan Kategori:</span>
          <select
            value={filterCat}
            onChange={(e) =>
              setFilterCat(e.target.value as "ALL" | KpiCategory)
            }
            className="rounded-lg border border-[#495057] bg-[#212529] px-3 py-1.5 text-sm text-[#F1F3F5]"
          >
            <option value="ALL">Semua Kategori (3 Pola Kerja)</option>
            {KPI_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {KPI_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {parameters.length === 0 && (
            <button
              type="button"
              onClick={handleSeedDefaults}
              disabled={seeding}
              className="rounded-lg border border-[#7A9278] bg-[#7A9278]/20 px-4 py-2 text-sm font-semibold text-[#C3DEC0] transition hover:bg-[#7A9278]/30 disabled:opacity-50"
            >
              {seeding ? "Memuat..." : "Muat Template 3 Kategori HSE"}
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
              ? "Tutup Pengaturan Kebijakan"
              : "Atur Cut-Off, Wakil SPV & Grade"}
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

      {/* Panel Kebijakan Cut-Off, Wakil SPV, Kelulusan & Grade */}
      {showPolicyPanel && (
        <form
          onSubmit={handleSaveGradesAndPolicy}
          className="space-y-6 rounded-xl border border-[#7A9278]/50 bg-[#2B3035] p-5"
        >
          {/* 1. Periode Cut-Off KPI */}
          <div className="space-y-3 rounded-lg border border-[#495057] bg-[#212529] p-4">
            <h2 className="text-base font-semibold text-[#F1F3F5]">
              1. Rentang Tanggal Periode Penilaian KPI (Cut-Off)
            </h2>
            <p className="text-xs text-slate-400">
              Contoh tampilan periode bulan ini:{" "}
              <strong className="text-[#8BB3D6]">
                {formatPeriodDateRange(sampleMonth, policy)}
              </strong>
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-1">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Tanggal Mulai (Tgl 1 – 31)
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={policy.periodStartDay}
                  onChange={(e) =>
                    setPolicy((prev) => ({
                      ...prev,
                      periodStartDay: Number(e.target.value) || 20,
                    }))
                  }
                  className="w-full rounded border border-[#495057] bg-[#2B3035] px-3 py-1.5 text-sm text-[#F1F3F5]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Tanggal Selesai (Tgl 1 – 31)
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={policy.periodEndDay}
                  onChange={(e) =>
                    setPolicy((prev) => ({
                      ...prev,
                      periodEndDay: Number(e.target.value) || 20,
                    }))
                  }
                  className="w-full rounded border border-[#495057] bg-[#2B3035] px-3 py-1.5 text-sm text-[#F1F3F5]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Siklus Bulan Tutup Buku
                </label>
                <select
                  value={policy.periodSpansNextMonth ? "next" : "same"}
                  onChange={(e) =>
                    setPolicy((prev) => ({
                      ...prev,
                      periodSpansNextMonth: e.target.value === "next",
                    }))
                  }
                  className="w-full rounded border border-[#495057] bg-[#2B3035] px-3 py-1.5 text-sm text-[#F1F3F5]"
                >
                  <option value="next">
                    Lintas Bulan (Tgl {policy.periodStartDay} s/d Tgl{" "}
                    {policy.periodEndDay} Bulan Berikutnya)
                  </option>
                  <option value="same">
                    Dalam 1 Bulan Kalender yang Sama
                  </option>
                </select>
              </div>
            </div>
          </div>

          {/* 2. Kebijakan Nilai Wakil Supervisor */}
          <div className="space-y-3 rounded-lg border border-[#495057] bg-[#212529] p-4">
            <h2 className="text-base font-semibold text-[#F1F3F5]">
              2. Aturan Komposisi Nilai Wakil Supervisor (Pribadi vs Tim Smelter)
            </h2>
            <p className="text-xs text-slate-400">
              Nilai akhir Wakil SPV digabung dari indikator pribadinya (
              <strong className="text-slate-200">
                {100 - (Number(policy.spvTeamWeightPct) || 0)}%
              </strong>
              ) dan hasil anggota di Smelter-nya (
              <strong className="text-amber-300">
                {Number(policy.spvTeamWeightPct) || 0}%
              </strong>
              ).
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-1">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Porsi Nilai Tim Area (%) — Fleksibel
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={policy.spvTeamWeightPct}
                  onChange={(e) =>
                    setPolicy((prev) => ({
                      ...prev,
                      spvTeamWeightPct: Math.max(
                        0,
                        Math.min(100, Number(e.target.value) || 0)
                      ),
                    }))
                  }
                  className="w-full rounded border border-[#495057] bg-[#2B3035] px-3 py-1.5 text-sm text-[#F1F3F5]"
                />
                <span className="text-[11px] text-slate-400">
                  Porsi Pribadi otomatis:{" "}
                  {Math.round((100 - (Number(policy.spvTeamWeightPct) || 0)) * 100) /
                    100}
                  %
                </span>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Pengurangan per Anggota Gagal (Poin)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={policy.spvPenaltyPerFailedMember}
                  onChange={(e) =>
                    setPolicy((prev) => ({
                      ...prev,
                      spvPenaltyPerFailedMember: Math.max(
                        0,
                        Number(e.target.value) || 0
                      ),
                    }))
                  }
                  className="w-full rounded border border-[#495057] bg-[#2B3035] px-3 py-1.5 text-sm text-[#F1F3F5]"
                />
                <span className="text-[11px] text-slate-400">
                  Dihitung per anggota yang indikator wajibnya gagal
                </span>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Metode Hitung Porsi Tim
                </label>
                <select
                  value={policy.spvTeamCalcMode}
                  onChange={(e) =>
                    setPolicy((prev) => ({
                      ...prev,
                      spvTeamCalcMode: e.target.value as SpvTeamCalcMode,
                    }))
                  }
                  className="w-full rounded border border-[#495057] bg-[#2B3035] px-3 py-1.5 text-sm text-[#F1F3F5]"
                >
                  <option value="option_a">
                    Opsi A: Mulai Penuh ({policy.spvTeamWeightPct} Poin) lalu
                    Dipotong Penalti
                  </option>
                  <option value="option_b">
                    Opsi B: Rata-rata Skor Tim × {policy.spvTeamWeightPct}% lalu
                    Dipotong Penalti
                  </option>
                </select>
              </div>
            </div>
          </div>

          {/* 3. Logika Kelulusan & Kompensasi Nilai */}
          <div className="space-y-3 rounded-lg border border-[#495057] bg-[#212529] p-4">
            <h2 className="text-base font-semibold text-[#F1F3F5]">
              3. Logika Kelulusan Indikator Wajib & Kompensasi Bonus
            </h2>

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

            <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Batas Minimal Capaian Indikator Wajib (%)
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
                <span className="text-[11px] text-slate-400">
                  Juga menjadi patokan penalti anggota untuk Wakil SPV
                </span>
              </div>

              {policy.requireAllCoreAchieved && (
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
              )}
            </div>

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
              </div>
            </label>
          </div>

          {/* 4. Kategori Nilai Standar (Grade A/B/C/D) */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[#F1F3F5]">
                4. Kategori Nilai Standar (Grading Scale)
              </h2>
              <button
                type="button"
                onClick={() =>
                  setGrades((prev) => [
                    ...prev,
                    {
                      id: `g_${Date.now()}`,
                      grade: "E",
                      label: "Kategori Baru",
                      minScore: 50,
                      color: "amber",
                    },
                  ])
                }
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
                      Huruf
                    </label>
                    <input
                      type="text"
                      required
                      value={g.grade}
                      onChange={(e) =>
                        setGrades((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, grade: e.target.value } : item
                          )
                        )
                      }
                      className="w-full rounded border border-[#495057] bg-[#2B3035] px-2.5 py-1.5 text-sm font-bold text-[#F1F3F5]"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-[11px] text-slate-400">
                      Predikat
                    </label>
                    <input
                      type="text"
                      required
                      value={g.label}
                      onChange={(e) =>
                        setGrades((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, label: e.target.value } : item
                          )
                        )
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
                        setGrades((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? { ...item, minScore: Number(e.target.value) }
                              : item
                          )
                        )
                      }
                      className="w-full rounded border border-[#495057] bg-[#2B3035] px-2.5 py-1.5 text-sm text-[#F1F3F5]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-400">
                      Warna
                    </label>
                    <select
                      value={g.color}
                      onChange={(e) =>
                        setGrades((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? {
                                  ...item,
                                  color: e.target
                                    .value as GradeThreshold["color"],
                                }
                              : item
                          )
                        )
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
                        onClick={() =>
                          setGrades((prev) => prev.filter((_, i) => i !== idx))
                        }
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
              {savingPolicy ? "Menyimpan..." : "Simpan Seluruh Kebijakan & Grade"}
            </button>
          </div>
        </form>
      )}

      {/* Form Tambah Parameter / Poin Bonus Multi-Kategori */}
      {showAddForm && (
        <form
          onSubmit={handleAdd}
          className="space-y-4 rounded-xl border border-[#5B7C99]/50 bg-[#2B3035] p-5"
        >
          <h2 className="text-base font-semibold text-[#F1F3F5]">
            Tambah Parameter KPI / Poin Bonus (Target per Kategori)
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
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Nama Indikator / Kegiatan
              </label>
              <input
                type="text"
                required
                placeholder="Nama indikator kinerja"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Tipe Rumus Perhitungan
              </label>
              <select
                value={formulaType}
                onChange={(e) => setFormulaType(e.target.value as FormulaType)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
              >
                {(Object.keys(FORMULA_LABELS) as FormulaType[]).map((key) => (
                  <option key={key} value={key}>
                    {FORMULA_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Satuan Kegiatan
              </label>
              <input
                type="text"
                required
                placeholder="Inspeksi / Kegiatan / Kasus"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Keterangan / Kriteria Bukti (opsional)
              </label>
              <input
                type="text"
                placeholder="Penjelasan singkat penilaian indikator ini"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
              />
            </div>
          </div>

          {/* Pemilihan Kategori & Target Spesifik per Kategori */}
          <div className="space-y-2.5 rounded-lg border border-[#495057] bg-[#212529] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8BB3D6]">
              Berlaku untuk Kategori KPI & Target Masing-Masing:
            </p>
            <div className="space-y-2">
              {KPI_CATEGORIES.map((cat) => {
                const checked = selectedCats.includes(cat);
                return (
                  <div
                    key={cat}
                    className={`grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-12 items-center ${
                      checked
                        ? "border-[#5B7C99]/60 bg-[#2B3035]"
                        : "border-[#495057]/50 bg-[#212529] opacity-60"
                    }`}
                  >
                    <label className="sm:col-span-5 flex items-center gap-2.5 text-sm font-medium text-[#F1F3F5] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAddCategory(cat)}
                        className="h-4 w-4 accent-[#5B7C99]"
                      />
                      {KPI_CATEGORY_LABELS[cat]}
                    </label>

                    <div className="sm:col-span-4">
                      <label className="block text-[11px] text-slate-400">
                        {formulaType === "bonus_point"
                          ? "Poin / Kegiatan"
                          : `Target (${unit})`}
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        disabled={!checked}
                        value={catTargets[cat]}
                        onChange={(e) =>
                          setCatTargets((prev) => ({
                            ...prev,
                            [cat]: e.target.value,
                          }))
                        }
                        className="w-full rounded border border-[#495057] bg-[#212529] px-2.5 py-1 text-sm text-[#F1F3F5]"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[11px] text-slate-400">
                        {formulaType === "bonus_point"
                          ? "Maks. Bonus"
                          : "Bobot (%)"}
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.5"
                        max="100"
                        disabled={!checked}
                        value={catWeights[cat]}
                        onChange={(e) =>
                          setCatWeights((prev) => ({
                            ...prev,
                            [cat]: e.target.value,
                          }))
                        }
                        className="w-full rounded border border-[#495057] bg-[#212529] px-2.5 py-1 text-sm text-[#F1F3F5]"
                      />
                    </div>
                  </div>
                );
              })}
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
        {displayedParameters.map((p) => {
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
              <div className="space-y-2">
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

                {/* Rincian target & bobot per kategori yang dicentang */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {p.applicableCategories.map((cat) => {
                    const t = getParamTargetForCategory(p, cat);
                    const w = getParamWeightForCategory(p, cat);
                    return (
                      <span
                        key={cat}
                        className="rounded-lg border border-[#495057] bg-[#212529] px-2.5 py-1 text-xs text-slate-200"
                      >
                        <strong className="text-[#8BB3D6]">
                          {KPI_CATEGORY_LABELS[cat]}:
                        </strong>{" "}
                        {isBonus
                          ? `+${t} poin/${p.unit} (Maks +${w})`
                          : `Target ${t} ${p.unit} • Bobot ${w}%`}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-[#495057]/60 pt-3">
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="rounded border border-[#495057] bg-[#212529] px-3 py-1 text-xs font-medium text-slate-200 hover:border-[#5B7C99]"
                >
                  Edit Target / Kategori
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

        {displayedParameters.length === 0 && (
          <div className="rounded-xl border border-dashed border-[#495057] bg-[#2B3035]/60 p-8 text-center text-sm text-slate-400">
            Belum ada parameter KPI pada filter ini.
          </div>
        )}
      </div>

      {/* Modal Edit Parameter */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-xl space-y-4 rounded-xl border border-[#495057] bg-[#2B3035] p-6 shadow-xl my-8"
          >
            <h3 className="text-lg font-bold text-[#F1F3F5]">
              Edit Parameter & Target per Kategori
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
              <div className="sm:col-span-2">
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
            </div>

            <div className="space-y-2 rounded-lg border border-[#495057] bg-[#212529] p-3.5">
              <p className="text-xs font-semibold text-[#8BB3D6]">
                Kategori Pola KPI & Target Spesifik:
              </p>
              {KPI_CATEGORIES.map((cat) => {
                const checked = editCats.includes(cat);
                return (
                  <div
                    key={cat}
                    className={`grid grid-cols-1 gap-2 rounded border p-2.5 sm:grid-cols-12 items-center ${
                      checked
                        ? "border-[#5B7C99]/60 bg-[#2B3035]"
                        : "border-[#495057]/50 opacity-60"
                    }`}
                  >
                    <label className="sm:col-span-5 flex items-center gap-2 text-xs font-medium text-[#F1F3F5] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEditCategory(cat)}
                        className="h-4 w-4 accent-[#5B7C99]"
                      />
                      {KPI_CATEGORY_LABELS[cat]}
                    </label>
                    <div className="sm:col-span-4">
                      <label className="block text-[10px] text-slate-400">
                        {editFormula === "bonus_point" ? "Poin/Keg" : "Target"}
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        disabled={!checked}
                        value={editCatTargets[cat]}
                        onChange={(e) =>
                          setEditCatTargets((prev) => ({
                            ...prev,
                            [cat]: e.target.value,
                          }))
                        }
                        className="w-full rounded border border-[#495057] bg-[#212529] px-2 py-1 text-xs text-[#F1F3F5]"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] text-slate-400">
                        {editFormula === "bonus_point" ? "Maks" : "Bobot %"}
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.5"
                        max="100"
                        disabled={!checked}
                        value={editCatWeights[cat]}
                        onChange={(e) =>
                          setEditCatWeights((prev) => ({
                            ...prev,
                            [cat]: e.target.value,
                          }))
                        }
                        className="w-full rounded border border-[#495057] bg-[#212529] px-2 py-1 text-xs text-[#F1F3F5]"
                      />
                    </div>
                  </div>
                );
              })}
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