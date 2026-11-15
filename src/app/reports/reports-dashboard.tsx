"use client";

import { useState } from "react";
import type { SessionUser } from "@/lib/session";
import type { PersonRecapRow } from "@/lib/kpi-recap";
import type { AreaVerifierConfig } from "@/lib/verifiers";
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
  verifiers: AreaVerifierConfig[];
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
  const canSendEmail = isSuperAdmin || isAdmin;

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

  // Panel Verifikator & Tanda Tangan Digital
  const [showVerifierPanel, setShowVerifierPanel] = useState<boolean>(false);
  const [verScope, setVerScope] = useState<"global" | "bufn" | "smelter">(
    isSuperAdmin ? "bufn" : isAdmin ? "bufn" : "smelter"
  );
  const [verBufn, setVerBufn] = useState<string>(
    isSuperAdmin ? workAreas[0]?.name || "BUFN 1" : currentUser.bufn
  );
  const [verSmelter, setVerSmelter] = useState<string>(
    isWakilSpv
      ? currentUser.smelter
      : workAreas[0]?.smelters[0] || ""
  );
  const [verName, setVerName] = useState<string>("");
  const [verTitle, setVerTitle] = useState<string>("Supervisor HSE");
  const [verSigDataUrl, setVerSigDataUrl] = useState<string>("");
  const [savingVerifier, setSavingVerifier] = useState<boolean>(false);

  // Modal Catatan Evaluasi Tahunan SPV
  const [noteModalRow, setNoteModalRow] = useState<PersonRecapRow | null>(null);
  const [yearlyNoteText, setYearlyNoteText] = useState<string>("");
  const [savingNote, setSavingNote] = useState<boolean>(false);

  // Modal Konfirmasi Kirim Email
  const [emailConfirm, setEmailConfirm] = useState<{
    rows: PersonRecapRow[];
    mode: PdfExportMode;
  } | null>(null);
  const [sendingEmail, setSendingEmail] = useState<boolean>(false);

  const [banner, setBanner] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  async function reloadRecap(targetPeriod = period) {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reports/recap?period=${encodeURIComponent(targetPeriod)}`,
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

  async function handlePeriodChange(nextPeriod: string) {
    setPeriod(nextPeriod);
    if (!/^\d{4}-\d{2}$/.test(nextPeriod)) return;
    setBanner(null);
    await reloadRecap(nextPeriod);
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

  function handleSignatureFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300 * 1024) {
      setBanner({
        type: "err",
        text: "Ukuran file tanda tangan maksimal 300 KB (format PNG/JPG).",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setVerSigDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveVerifier(e: React.FormEvent) {
    e.preventDefault();
    setSavingVerifier(true);
    setBanner(null);
    try {
      const res = await fetch("/api/reports/verifiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_verifier",
          scopeType: verScope,
          bufn: verBufn,
          smelter: verSmelter,
          verifierName: verName,
          verifierTitle: verTitle,
          signatureDataUrl: verSigDataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setBanner({
          type: "err",
          text: data.pesan || "Gagal menyimpan verifikator.",
        });
      } else {
        setBanner({ type: "ok", text: data.pesan });
        setVerName("");
        setVerSigDataUrl("");
        await reloadRecap();
      }
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setSavingVerifier(false);
    }
  }

  async function handleDeleteVerifier(id: string) {
    setSavingVerifier(true);
    setBanner(null);
    try {
      const res = await fetch("/api/reports/verifiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_verifier", id }),
      });
      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setBanner({
          type: "err",
          text: data.pesan || "Gagal menghapus verifikator.",
        });
      } else {
        setBanner({ type: "ok", text: data.pesan });
        await reloadRecap();
      }
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setSavingVerifier(false);
    }
  }

  async function handleSaveYearlySpvNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteModalRow) return;
    setSavingNote(true);
    setBanner(null);
    try {
      const res = await fetch("/api/reports/verifiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_yearly_note",
          year: recap.year,
          uid: noteModalRow.uid,
          note: yearlyNoteText,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setBanner({
          type: "err",
          text: data.pesan || "Gagal menyimpan catatan tahunan.",
        });
      } else {
        setBanner({ type: "ok", text: data.pesan });
        setNoteModalRow(null);
        await reloadRecap();
      }
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setSavingNote(false);
    }
  }

  async function executeSendEmail() {
    if (!emailConfirm) return;
    setSendingEmail(true);
    setBanner(null);
    try {
      const res = await fetch("/api/reports/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: recap.period,
          mode: emailConfirm.mode,
          uids: emailConfirm.rows.map((r) => r.uid),
        }),
      });
      const data = await res.json();
      setBanner({
        type: data.berhasil ? "ok" : "err",
        text: data.pesan || "Proses pengiriman email selesai.",
      });
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server email." });
    } finally {
      setSendingEmail(false);
      setEmailConfirm(null);
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
      "Email",
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
        `"${r.email}"`,
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

  const verSmelterOptions =
    workAreas.find((a) => a.name === verBufn)?.smelters || [];

  const visibleVerifiers = recap.verifiers.filter((v) => {
    if (isSuperAdmin) return true;
    if (isAdmin) return v.bufn === currentUser.bufn || v.scopeType === "global";
    return (
      (v.bufn === currentUser.bufn &&
        (v.smelter === currentUser.smelter || v.smelter === "ALL")) ||
      v.scopeType === "global"
    );
  });

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

      {/* Panel Pengaturan Verifikator & Upload Tanda Tangan Digital */}
      {canFilterMulti && (
        <div className="rounded-xl border border-[#495057] bg-[#2B3035] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[#F1F3F5]">
                Pejabat Verifikator & Tanda Tangan Digital Slip KPI
              </h2>
              <p className="text-xs text-slate-400">
                Atur nama verifikator (tanpa ID) dan unggah gambar tanda tangan digital untuk dicetak otomatis pada Slip Bulanan & Rapor Tahunan.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowVerifierPanel((prev) => !prev)}
              className="rounded-lg border border-[#5B7C99] bg-[#5B7C99]/15 px-3.5 py-2 text-xs font-semibold text-[#8BB3D6] hover:bg-[#5B7C99]/30"
            >
              {showVerifierPanel
                ? "Tutup Pengaturan TTD"
                : "Atur Verifikator & Upload TTD"}
            </button>
          </div>

          {showVerifierPanel && (
            <div className="mt-4 space-y-4 border-t border-[#495057]/70 pt-4">
              <form
                onSubmit={handleSaveVerifier}
                className="grid grid-cols-1 gap-3 rounded-lg border border-[#495057] bg-[#212529] p-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Cakupan Wilayah Verifikasi
                  </label>
                  <select
                    value={verScope}
                    onChange={(e) =>
                      setVerScope(
                        e.target.value as "global" | "bufn" | "smelter"
                      )
                    }
                    className="w-full rounded-lg border border-[#495057] bg-[#2B3035] px-3 py-2 text-sm text-[#F1F3F5]"
                  >
                    {isSuperAdmin && (
                      <option value="global">Global (Semua BUFN)</option>
                    )}
                    {(isSuperAdmin || isAdmin) && (
                      <option value="bufn">Tingkat BUFN</option>
                    )}
                    <option value="smelter">Spesifik Smelter</option>
                  </select>
                </div>

                {verScope !== "global" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      Wilayah BUFN
                    </label>
                    {isSuperAdmin ? (
                      <select
                        value={verBufn}
                        onChange={(e) => {
                          const nb = e.target.value;
                          setVerBufn(nb);
                          const list =
                            workAreas.find((a) => a.name === nb)?.smelters ||
                            [];
                          setVerSmelter(list[0] || "");
                        }}
                        className="w-full rounded-lg border border-[#495057] bg-[#2B3035] px-3 py-2 text-sm text-[#F1F3F5]"
                      >
                        {workAreas.map((a) => (
                          <option key={a.name} value={a.name}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="rounded-lg border border-[#495057] bg-[#2B3035]/60 px-3 py-2 text-sm text-slate-200">
                        {currentUser.bufn}
                      </div>
                    )}
                  </div>
                )}

                {verScope === "smelter" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      Lokasi Smelter
                    </label>
                    {isSuperAdmin || isAdmin ? (
                      <select
                        value={verSmelter}
                        onChange={(e) => setVerSmelter(e.target.value)}
                        className="w-full rounded-lg border border-[#495057] bg-[#2B3035] px-3 py-2 text-sm text-[#F1F3F5]"
                      >
                        {verSmelterOptions.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="rounded-lg border border-[#495057] bg-[#2B3035]/60 px-3 py-2 text-sm text-slate-200">
                        {currentUser.smelter}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Nama Lengkap Verifikator (Tanpa ID)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Budi Santoso"
                    value={verName}
                    onChange={(e) => setVerName(e.target.value)}
                    className="w-full rounded-lg border border-[#495057] bg-[#2B3035] px-3 py-2 text-sm text-[#F1F3F5]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Jabatan Verifikator (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Supervisor HSE BUFN 1"
                    value={verTitle}
                    onChange={(e) => setVerTitle(e.target.value)}
                    className="w-full rounded-lg border border-[#495057] bg-[#2B3035] px-3 py-2 text-sm text-[#F1F3F5]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Upload Tanda Tangan (PNG/JPG maks 300KB)
                  </label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={handleSignatureFileChange}
                    className="w-full rounded-lg border border-[#495057] bg-[#2B3035] px-2.5 py-1.5 text-xs text-slate-200"
                  />
                  {verSigDataUrl && (
                    <div className="mt-1.5 inline-block rounded bg-white p-1.5">
                      <img
                        src={verSigDataUrl}
                        alt="Preview TTD"
                        className="h-10 object-contain"
                      />
                    </div>
                  )}
                </div>

                <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingVerifier}
                    className="rounded-lg bg-[#7A9278] px-4 py-2 text-xs font-semibold text-white hover:bg-[#667D64] disabled:opacity-50"
                  >
                    {savingVerifier
                      ? "Menyimpan..."
                      : "Simpan Verifikator & Tanda Tangan"}
                  </button>
                </div>
              </form>

              {/* Daftar Verifikator Tersimpan */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleVerifiers.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[#495057] bg-[#212529] p-3"
                  >
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-[#8BB3D6]">
                        {v.scopeType === "global"
                          ? "Global (Semua BUFN)"
                          : v.scopeType === "bufn"
                            ? `${v.bufn} (Semua Smelter)`
                            : `${v.bufn} • ${v.smelter}`}
                      </div>
                      <div className="mt-0.5 text-sm font-bold text-[#F1F3F5]">
                        {v.verifierName}
                      </div>
                      <div className="text-xs text-slate-400">
                        {v.verifierTitle}
                      </div>
                      {v.signatureDataUrl ? (
                        <div className="mt-1.5 inline-block rounded bg-white px-2 py-1">
                          <img
                            src={v.signatureDataUrl}
                            alt="TTD"
                            className="h-8 object-contain"
                          />
                        </div>
                      ) : (
                        <div className="mt-1 text-[11px] italic text-amber-400">
                          Belum ada gambar TTD
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteVerifier(v.id)}
                      className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-950/60"
                    >
                      Hapus
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
                  Cari Nama / ID
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

        {/* Bar Tab & Tombol Ekspor Excel + Batch PDF + Kirim Email 1-Klik */}
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
              className="rounded-lg border border-[#7A9278] bg-[#7A9278]/20 px-3 py-2 text-xs font-semibold text-[#C3DEC0] transition hover:bg-[#7A9278]/30"
            >
              Ekspor Excel (.CSV)
            </button>

            <button
              type="button"
              onClick={() => handleExportPdf(filteredRows, "monthly_slip")}
              className="rounded-lg bg-[#5B7C99] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#45657F]"
            >
              Batch PDF Bulanan ({filteredRows.length})
            </button>

            <button
              type="button"
              onClick={() => handleExportPdf(filteredRows, "yearly_report")}
              className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-500"
            >
              Batch PDF {recap.year} ({filteredRows.length})
            </button>

            {canSendEmail && (
              <button
                type="button"
                onClick={() =>
                  setEmailConfirm({
                    rows: filteredRows,
                    mode:
                      activeTab === "yearly" ? "yearly_report" : "monthly_slip",
                  })
                }
                className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
              >
                Kirim Semua ke Email ({filteredRows.length})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Konten Utama Tabel */}
      {loading ? (
        <div className="rounded-xl border border-[#495057] bg-[#2B3035] p-8 text-center text-sm text-slate-400">
          Memuat data rekapitulasi periode {period}...
        </div>
      ) : activeTab === "monthly" ? (
        <div className="overflow-x-auto rounded-xl border border-[#495057] bg-[#2B3035]">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#495057] bg-[#212529]/80 text-xs uppercase text-slate-400">
                <th className="px-4 py-3">Personel & Email</th>
                <th className="px-4 py-3">Wilayah & Pola</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Skor {recap.period}</th>
                <th className="px-4 py-3 text-center">Grade</th>
                <th className="px-4 py-3 text-right">Rata2 {recap.year}</th>
                <th className="px-4 py-3 text-right">Aksi PDF, Catatan & Email</th>
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
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {r.email || (
                        <span className="italic text-amber-400/80">
                          Email belum diisi
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-200">
                      {r.bufn} — {r.smelter}
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
                        className="rounded border border-[#5B7C99]/60 bg-[#5B7C99]/15 px-2 py-1 text-xs font-medium text-[#8BB3D6] hover:bg-[#5B7C99]/30"
                      >
                        Slip PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportPdf([r], "yearly_report")}
                        className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20"
                      >
                        PDF {recap.year}
                      </button>
                      {canFilterMulti && (
                        <button
                          type="button"
                          onClick={() => {
                            setNoteModalRow(r);
                            setYearlyNoteText(r.yearlySpvNote || "");
                          }}
                          className="rounded border border-[#495057] bg-[#212529] px-2 py-1 text-xs text-slate-200 hover:border-[#7A9278]"
                        >
                          Catatan SPV
                        </button>
                      )}
                      {canSendEmail && (
                        <button
                          type="button"
                          onClick={() =>
                            setEmailConfirm({
                              rows: [r],
                              mode: "monthly_slip",
                            })
                          }
                          className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25"
                        >
                          Kirim Email
                        </button>
                      )}
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
        /* TAB 2: MATRIKS HISTORI TAHUNAN 12 BULAN */
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
                <th className="px-3 py-3 text-right">Aksi Tahunan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#495057]/60">
              {filteredRows.map((r) => (
                <tr key={r.uid} className="hover:bg-[#212529]/40">
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-[#F1F3F5]">{r.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {r.bufn} — {r.smelter} ({r.kpiCategoryLabel})
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
                    <div className="inline-flex gap-1.5">
                      {canFilterMulti && (
                        <button
                          type="button"
                          onClick={() => {
                            setNoteModalRow(r);
                            setYearlyNoteText(r.yearlySpvNote || "");
                          }}
                          className="rounded border border-[#495057] bg-[#212529] px-2 py-1 text-[11px] text-slate-200 hover:border-[#7A9278]"
                        >
                          Catatan SPV
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleExportPdf([r], "yearly_report")}
                        className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20"
                      >
                        PDF {recap.year}
                      </button>
                      {canSendEmail && (
                        <button
                          type="button"
                          onClick={() =>
                            setEmailConfirm({
                              rows: [r],
                              mode: "yearly_report",
                            })
                          }
                          className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25"
                        >
                          Email
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Catatan Evaluasi Tahunan SPV Area */}
      {noteModalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={handleSaveYearlySpvNote}
            className="w-full max-w-lg space-y-4 rounded-xl border border-[#495057] bg-[#2B3035] p-6 shadow-2xl"
          >
            <div>
              <h3 className="text-base font-bold text-[#F1F3F5]">
                Catatan Evaluasi Tahunan SPV ({recap.year})
              </h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Personel: <strong className="text-slate-200">{noteModalRow.name}</strong> ({noteModalRow.bufn} — {noteModalRow.smelter})
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Isi Evaluasi Tahunan Supervisor Area
              </label>
              <textarea
                rows={4}
                required
                placeholder="Tuliskan catatan evaluasi kinerja tahunan untuk personel ini..."
                value={yearlyNoteText}
                onChange={(e) => setYearlyNoteText(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] p-3 text-sm text-[#F1F3F5] placeholder-slate-500"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNoteModalRow(null)}
                className="rounded-lg border border-[#495057] bg-[#212529] px-4 py-2 text-xs text-slate-300"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingNote}
                className="rounded-lg bg-[#7A9278] px-4 py-2 text-xs font-semibold text-white hover:bg-[#667D64] disabled:opacity-50"
              >
                {savingNote ? "Menyimpan..." : "Simpan Catatan Tahunan"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Konfirmasi Pengiriman Email 1-Klik */}
      {emailConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-[#495057] bg-[#2B3035] shadow-2xl">
            <div className="p-5 space-y-2">
              <h3 className="text-base font-bold text-[#F1F3F5]">
                Konfirmasi Pengiriman Slip KPI via Email
              </h3>
              <p className="text-xs leading-relaxed text-slate-300">
                Sistem akan mengirimkan{" "}
                <strong>
                  {emailConfirm.mode === "yearly_report"
                    ? `Rapor Tahunan ${recap.year}`
                    : `Slip KPI Bulanan (${recap.period})`}
                </strong>{" "}
                secara otomatis ke alamat email{" "}
                <strong>{emailConfirm.rows.length} personel</strong> terpilih.
              </p>
              <p className="text-[11px] text-amber-300">
                * Personel yang belum memiliki alamat email akan dilewati secara otomatis.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-[#495057]/70 bg-[#212529]/80 px-5 py-3.5">
              <button
                type="button"
                disabled={sendingEmail}
                onClick={() => setEmailConfirm(null)}
                className="rounded-lg border border-[#495057] bg-[#2B3035] px-4 py-2 text-xs font-semibold text-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={sendingEmail}
                onClick={executeSendEmail}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {sendingEmail
                  ? "Mengirim Email..."
                  : `Kirim Sekarang (${emailConfirm.rows.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}