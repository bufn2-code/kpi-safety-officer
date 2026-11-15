"use client";

import { useState } from "react";
import type { SessionUser } from "@/lib/session";
import type { PersonRecapRow } from "@/lib/kpi-recap";
import type { GradeThreshold, ScoringPolicy } from "@/lib/kpi-engine";
import {
  JOB_TITLES,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
  type BufnArea,
  type JobTitle,
  type KpiCategory,
} from "@/lib/work-areas";
import {
  openPdfPrintWindow,
  type PdfExportMode,
} from "@/lib/pdf-slip-generator";

interface RecapPayload {
  period: string;
  year: string;
  periodDateRange: string;
  policy: ScoringPolicy;
  grades: GradeThreshold[];
  rows: PersonRecapRow[];
}

interface Props {
  currentUser: SessionUser;
  isWakilSpv: boolean;
  workAreas: BufnArea[];
  initialRecap: RecapPayload;
}

export default function ReportsDashboard({
  currentUser,
  isWakilSpv,
  workAreas,
  initialRecap,
}: Props) {
  const isSuperAdmin = currentUser.role === "super_admin";
  const isAdmin = currentUser.role === "admin";
  const canFilterMulti = isSuperAdmin || isAdmin || isWakilSpv;

  const [recap, setRecap] = useState<RecapPayload>(initialRecap);
  const [period, setPeriod] = useState<string>(initialRecap.period);
  const [loading, setLoading] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<"monthly" | "yearly">("monthly");
  const [filterBufn, setFilterBufn] = useState<string>(
    isSuperAdmin ? "ALL" : currentUser.bufn
  );
  const [filterSmelter, setFilterSmelter] = useState<string>("ALL");
  const [filterCategory, setFilterCategory] = useState<"ALL" | KpiCategory>(
    "ALL"
  );
  const [filterJobTitle, setFilterJobTitle] = useState<"ALL" | JobTitle>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  const [banner, setBanner] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  async function handlePeriodChange(nextPeriod: string) {
    setPeriod(nextPeriod);
    if (!/^\d{4}-\d{2}$/.test(nextPeriod)) return;
    setLoading(true);
    setBanner(null);
    try {
      const res = await fetch(
        `/api/reports/recap?period=${encodeURIComponent(nextPeriod)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setBanner({
          type: "err",
          text: data.pesan || "Gagal memuat rekapitulasi periode tersebut.",
        });
      } else {
        setRecap(data);
      }
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setLoading(false);
    }
  }

  const availableSmelters =
    filterBufn === "ALL"
      ? Array.from(new Set(workAreas.flatMap((a) => a.smelters))).sort((a, b) =>
          a.localeCompare(b, "id", { sensitivity: "base", numeric: true })
        )
      : workAreas.find((a) => a.name === filterBufn)?.smelters || [];

  const filteredRows = recap.rows.filter((r) => {
    if (isSuperAdmin && filterBufn !== "ALL" && r.bufn !== filterBufn) {
      return false;
    }
    if (filterSmelter !== "ALL" && r.smelter !== filterSmelter) {
      return false;
    }
    if (filterCategory !== "ALL" && r.kpiCategory !== filterCategory) {
      return false;
    }
    if (filterJobTitle !== "ALL" && r.jobTitle !== filterJobTitle) {
      return false;
    }
    if (filterStatus !== "ALL" && r.status !== filterStatus) {
      return false;
    }
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      r.employeeId.toLowerCase().includes(q) ||
      r.smelter.toLowerCase().includes(q)
    );
  });

  // Statistik KPI Ringkas dari data terfilter
  const assessedRows = filteredRows.filter((r) => r.hasCard);
  const avgScore =
    assessedRows.length > 0
      ? Math.round(
          (assessedRows.reduce((acc, r) => acc + r.totalScore, 0) /
            assessedRows.length) *
            100
        ) / 100
      : 0;
  const publishedCount = filteredRows.filter(
    (r) => r.status === "published"
  ).length;
  const unassessedCount = filteredRows.filter((r) => !r.hasCard).length;

  function buildFilterDescription(): string {
    const parts: string[] = [];
    parts.push(filterBufn === "ALL" ? "Semua BUFN" : filterBufn);
    if (filterSmelter !== "ALL") parts.push(filterSmelter);
    if (filterCategory !== "ALL")
      parts.push(KPI_CATEGORY_LABELS[filterCategory]);
    if (filterJobTitle !== "ALL") parts.push(filterJobTitle);
    return parts.join(" • ");
  }

  function handleExportPdf(targetRows: PersonRecapRow[], mode: PdfExportMode) {
    if (targetRows.length === 0) {
      setBanner({
        type: "err",
        text: "Tidak ada data karyawan pada filter ini untuk dicetak ke PDF.",
      });
      return;
    }
    const ok = openPdfPrintWindow(targetRows, mode, buildFilterDescription());
    if (!ok) {
      setBanner({
        type: "err",
        text: "Popup browser diblokir. Izinkan popup untuk situs ini agar pratinjau PDF dapat terbuka.",
      });
    }
  }

  function handleExportExcelCsv() {
    if (filteredRows.length === 0) {
      setBanner({
        type: "err",
        text: "Tidak ada data pada filter ini untuk diekspor.",
      });
      return;
    }

    const headers = [
      "ID Karyawan",
      "Nama Lengkap",
      "Jabatan",
      "Kategori Pola KPI",
      "BUFN",
      "Smelter",
      `Periode (${recap.period})`,
      "Status Penilaian",
      `Skor ${recap.period} (%)`,
      `Grade ${recap.period}`,
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Agu",
      "Sep",
      "Okt",
      "Nov",
      "Des",
      `Rata-rata ${recap.year} (%)`,
      `Grade Tahunan ${recap.year}`,
    ];

    const csvLines = [headers.join(";")];

    for (const r of filteredRows) {
      const monthScores = r.yearlyHistory.map((h) =>
        h.hasData ? String(h.totalScore).replace(".", ",") : "-"
      );
      const line = [
        `"${r.employeeId}"`,
        `"${r.name.replace(/"/g, '""')}"`,
        `"${r.jobTitle}"`,
        `"${r.kpiCategoryLabel}"`,
        `"${r.bufn}"`,
        `"${r.smelter}"`,
        `"${r.period}"`,
        `"${r.status === "published" ? "Final" : r.status === "draft" ? "Draft" : "Belum Dinilai"}"`,
        r.hasCard ? String(r.totalScore).replace(".", ",") : "-",
        r.hasCard ? `"${r.grade.grade}"` : "-",
        ...monthScores,
        r.assessedMonthsCount > 0
          ? String(r.yearlyAverageScore).replace(".", ",")
          : "-",
        r.assessedMonthsCount > 0 ? `"${r.yearlyGrade.grade}"` : "-",
      ];
      csvLines.push(line.join(";"));
    }

    // Tambahkan BOM UTF-8 agar karakter dan kolom langsung rapi saat dibuka di Microsoft Excel
    const bom = "\uFEFF";
    const blob = new Blob([bom + csvLines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeLabel = buildFilterDescription().replace(/[^a-zA-Z0-9]+/g, "_");
    link.href = url;
    link.download = `Rekap_KPI_HSE_${recap.period}_${safeLabel}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setBanner({
      type: "ok",
      text: `File Excel/CSV (${filteredRows.length} baris personel) berhasil diunduh.`,
    });
  }

  function gradePillClass(color: string): string {
    if (color === "emerald") return "bg-emerald-500/20 text-emerald-300";
    if (color === "amber") return "bg-amber-500/20 text-amber-300";
    if (color === "red") return "bg-red-500/20 text-red-300";
    return "bg-[#5B7C99]/25 text-[#8BB3D6]";
  }

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={`flex items-center justify-between rounded-lg border p-3.5 text-sm ${
            banner.type === "ok"
              ? "border-[#7A9278]/50 bg-[#7A9278]/15 text-[#C3DEC0]"
              : "border-red-500/40 bg-red-950/50 text-red-200"
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Kartu Ringkasan Statistik */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[#495057] bg-[#2B3035] p-4">
          <p className="text-xs text-slate-400">Total Personel Filter</p>
          <p className="mt-1 text-2xl font-bold text-[#F1F3F5]">
            {filteredRows.length}{" "}
            <span className="text-xs font-normal text-slate-400">orang</span>
          </p>
        </div>

        <div className="rounded-xl border border-[#495057] bg-[#2B3035] p-4">
          <p className="text-xs text-slate-400">Rata-rata Skor ({recap.period})</p>
          <p className="mt-1 text-2xl font-bold text-[#8BB3D6]">
            {avgScore}%
          </p>
        </div>

        <div className="rounded-xl border border-[#495057] bg-[#2B3035] p-4">
          <p className="text-xs text-slate-400">Sudah Final / Terbit</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">
            {publishedCount}{" "}
            <span className="text-xs font-normal text-slate-400">
              / {filteredRows.length}
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-[#495057] bg-[#2B3035] p-4">
          <p className="text-xs text-slate-400">Belum Dinilai</p>
          <p className="mt-1 text-2xl font-bold text-amber-300">
            {unassessedCount}{" "}
            <span className="text-xs font-normal text-slate-400">orang</span>
          </p>
        </div>
      </div>

      {/* Panel Filter Lintas Wilayah & Kategori */}
      <div className="space-y-4 rounded-xl border border-[#495057] bg-[#2B3035] p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Periode Bulan
            </label>
            <input
              type="month"
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value)}
              className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
            />
            <p className="mt-1 text-[10px] text-[#8BB3D6]">
              {recap.periodDateRange}
            </p>
          </div>

          {canFilterMulti && (
            <>
              {isSuperAdmin ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Wilayah BUFN
                  </label>
                  <select
                    value={filterBufn}
                    onChange={(e) => {
                      setFilterBufn(e.target.value);
                      setFilterSmelter("ALL");
                    }}
                    className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                  >
                    <option value="ALL">Semua BUFN</option>
                    {workAreas.map((a) => (
                      <option key={a.name} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Wilayah BUFN
                  </label>
                  <div className="rounded-lg border border-[#495057] bg-[#212529]/60 px-3 py-2 text-sm font-semibold text-[#8BB3D6]">
                    {currentUser.bufn}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Lokasi Smelter
                </label>
                {isWakilSpv && !isSuperAdmin && !isAdmin ? (
                  <div className="rounded-lg border border-[#495057] bg-[#212529]/60 px-3 py-2 text-sm text-slate-200">
                    {currentUser.smelter}
                  </div>
                ) : (
                  <select
                    value={filterSmelter}
                    onChange={(e) => setFilterSmelter(e.target.value)}
                    className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                  >
                    <option value="ALL">Semua Smelter</option>
                    {availableSmelters.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Kategori Pola Kerja
                </label>
                <select
                  value={filterCategory}
                  onChange={(e) =>
                    setFilterCategory(e.target.value as "ALL" | KpiCategory)
                  }
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                >
                  <option value="ALL">Semua Pola Kerja</option>
                  {KPI_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      Khusus {KPI_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Jabatan
                </label>
                <select
                  value={filterJobTitle}
                  onChange={(e) =>
                    setFilterJobTitle(e.target.value as "ALL" | JobTitle)
                  }
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                >
                  <option value="ALL">Semua Jabatan</option>
                  {JOB_TITLES.map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Status / Cari Nama
                </label>
                <input
                  type="text"
                  placeholder="Nama / ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500"
                />
              </div>
            </>
          )}
        </div>

        {/* Bar Tab & Tombol Ekspor Excel + Batch PDF */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#495057]/70 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("monthly")}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                activeTab === "monthly"
                  ? "bg-[#5B7C99] text-white"
                  : "border border-[#495057] bg-[#212529] text-slate-300 hover:text-white"
              }`}
            >
              Rekap Bulanan ({recap.period})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("yearly")}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                activeTab === "yearly"
                  ? "bg-[#5B7C99] text-white"
                  : "border border-[#495057] bg-[#212529] text-slate-300 hover:text-white"
              }`}
            >
              Matriks Tahunan ({recap.year} Jan–Des)
            </button>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-xs text-slate-200"
            >
              <option value="ALL">Semua Status</option>
              <option value="published">Sudah Final</option>
              <option value="draft">Draft</option>
              <option value="unassessed">Belum Dinilai</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcelCsv}
              className="rounded-lg border border-[#7A9278] bg-[#7A9278]/20 px-3.5 py-2 text-xs font-semibold text-[#C3DEC0] transition hover:bg-[#7A9278]/30"
            >
              Ekspor Excel (.CSV)
            </button>

            <button
              type="button"
              onClick={() => handleExportPdf(filteredRows, "monthly_slip")}
              className="rounded-lg bg-[#5B7C99] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#45657F]"
            >
              Batch PDF Slip Bulanan ({filteredRows.length})
            </button>

            <button
              type="button"
              onClick={() => handleExportPdf(filteredRows, "yearly_report")}
              className="rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-amber-500"
            >
              Batch PDF Tahunan {recap.year} ({filteredRows.length})
            </button>
          </div>
        </div>
      </div>

      {/* Konten Utama Tabel */}
      {loading ? (
        <div className="rounded-xl border border-[#495057] bg-[#2B3035] p-8 text-center text-sm text-slate-400">
          Memuat data rekapitulasi periode {period}...
        </div>
      ) : activeTab === "monthly" ? (
        /* TAB 1: REKAP BULANAN & CETAK SLIP PDF SATUAN */
        <div className="overflow-x-auto rounded-xl border border-[#495057] bg-[#2B3035]">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#495057] bg-[#212529]/80 text-xs uppercase text-slate-400">
                <th className="px-4 py-3">Personel & Jabatan</th>
                <th className="px-4 py-3">Wilayah & Pola</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Skor {recap.period}</th>
                <th className="px-4 py-3 text-center">Grade</th>
                <th className="px-4 py-3 text-right">Rata2 {recap.year}</th>
                <th className="px-4 py-3 text-right">Cetak Rapor PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#495057]/60">
              {filteredRows.map((r) => (
                <tr key={r.uid} className="hover:bg-[#212529]/40">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#F1F3F5]">{r.name}</div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      <span className="font-mono">{r.employeeId}</span> •{" "}
                      {r.jobTitle}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-200">
                      {r.bufn} • {r.smelter}
                    </div>
                    <div className="mt-0.5 text-xs text-[#8BB3D6]">
                      {r.kpiCategoryLabel}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "published" ? (
                      <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
                        Final
                      </span>
                    ) : r.status === "draft" ? (
                      <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
                        Draft
                      </span>
                    ) : (
                      <span className="rounded bg-slate-700/60 px-2 py-0.5 text-xs text-slate-400">
                        Belum Dinilai
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-[#F1F3F5]">
                    {r.hasCard ? `${r.totalScore}%` : "—"}
                    {r.jobTitle === "Wakil Supervisor" &&
                      r.supervisorBreakdown && (
                        <div className="text-[10px] font-normal text-amber-300">
                          Pribadi {r.supervisorBreakdown.personalWeightedScore} +
                          Tim {r.supervisorBreakdown.teamWeightedScore}
                        </div>
                      )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.hasCard ? (
                      <span
                        className={`rounded px-2.5 py-0.5 text-xs font-bold ${gradePillClass(r.grade.color)}`}
                      >
                        {r.grade.grade}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-300">
                    {r.assessedMonthsCount > 0 ? (
                      <>
                        <span className="font-semibold text-[#F1F3F5]">
                          {r.yearlyAverageScore}%
                        </span>{" "}
                        <span className="text-slate-400">
                          ({r.assessedMonthsCount} bln)
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex flex-wrap justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleExportPdf([r], "monthly_slip")}
                        className="rounded border border-[#5B7C99]/60 bg-[#5B7C99]/15 px-2.5 py-1 text-xs font-medium text-[#8BB3D6] hover:bg-[#5B7C99]/30"
                      >
                        Slip PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportPdf([r], "yearly_report")}
                        className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20"
                      >
                        PDF {recap.year}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-slate-400"
                  >
                    Tidak ada personel yang sesuai dengan filter saat ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* TAB 2: MATRIKS HISTORI TAHUNAN 12 BULAN (JAN - DES) */
        <div className="overflow-x-auto rounded-xl border border-[#495057] bg-[#2B3035]">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#495057] bg-[#212529]/80 uppercase text-slate-400">
                <th className="px-3 py-3">Personel & Lokasi</th>
                {recap.rows[0]?.yearlyHistory.map((h) => (
                  <th key={h.month} className="px-2 py-3 text-center">
                    {h.label}
                  </th>
                ))}
                <th className="px-3 py-3 text-right">Rata2</th>
                <th className="px-3 py-3 text-center">Grade</th>
                <th className="px-3 py-3 text-right">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#495057]/60">
              {filteredRows.map((r) => (
                <tr key={r.uid} className="hover:bg-[#212529]/40">
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-[#F1F3F5]">{r.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {r.bufn} • {r.smelter} ({r.kpiCategoryLabel})
                    </div>
                  </td>
                  {r.yearlyHistory.map((h) => (
                    <td
                      key={h.month}
                      className={`px-2 py-2.5 text-center ${
                        h.period === recap.period ? "bg-[#5B7C99]/15" : ""
                      }`}
                    >
                      {h.hasData ? (
                        <span className="font-semibold text-[#F1F3F5]">
                          {h.totalScore}
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right font-bold text-[#8BB3D6]">
                    {r.assessedMonthsCount > 0
                      ? `${r.yearlyAverageScore}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {r.assessedMonthsCount > 0 ? (
                      <span
                        className={`rounded px-2 py-0.5 font-bold ${gradePillClass(r.yearlyGrade.color)}`}
                      >
                        {r.yearlyGrade.grade}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleExportPdf([r], "yearly_report")}
                      className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20"
                    >
                      PDF {recap.year}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}