"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SessionUser } from "@/lib/session";
import {
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
  type BufnArea,
  type KpiCategory,
} from "@/lib/work-areas";
import {
  calculateDynamicScore,
  DEFAULT_SCORING_POLICY,
  evaluateKpiResult,
  evaluateSupervisorKpiResult,
  FORMULA_LABELS,
} from "@/lib/kpi-engine";
import type {
  KpiCardRecord,
  KpiCardStatus,
  KpiEntryItem,
} from "@/app/api/kpi-cards/route";
import type { OfficerOption } from "./page";

interface Props {
  currentUser: SessionUser;
  isWakilSpv: boolean;
  officerList: OfficerOption[];
  workAreas: BufnArea[];
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function KpiCardView({
  currentUser,
  isWakilSpv,
  officerList,
  workAreas,
}: Props) {
  const isSuperAdmin = currentUser.role === "super_admin";
  const isAdmin = currentUser.role === "admin";
  const canEditScores = isSuperAdmin || isAdmin;
  const canSwitchPerson = canEditScores || isWakilSpv;

  const [filterBufn, setFilterBufn] = useState<string>(
    isSuperAdmin ? "ALL" : currentUser.bufn
  );
  const [filterSmelter, setFilterSmelter] = useState<string>("ALL");
  const [filterCategory, setFilterCategory] = useState<"ALL" | KpiCategory>(
    "ALL"
  );
  const [officerSearch, setOfficerSearch] = useState<string>("");

  const availableSmelters =
    filterBufn === "ALL"
      ? Array.from(new Set(workAreas.flatMap((a) => a.smelters)))
      : workAreas.find((a) => a.name === filterBufn)?.smelters || [];

  const filteredOfficers = officerList.filter((o) => {
    if (isSuperAdmin && filterBufn !== "ALL" && o.bufn !== filterBufn) {
      return false;
    }
    if (filterSmelter !== "ALL" && o.smelter !== filterSmelter) {
      return false;
    }
    if (filterCategory !== "ALL" && o.kpiCategory !== filterCategory) {
      return false;
    }
    const q = officerSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      o.name.toLowerCase().includes(q) ||
      o.employeeId.toLowerCase().includes(q) ||
      o.jobTitle.toLowerCase().includes(q) ||
      o.smelter.toLowerCase().includes(q)
    );
  });

  const [selectedUid, setSelectedUid] = useState<string>(
    canSwitchPerson ? officerList[0]?.uid || currentUser.uid : currentUser.uid
  );
  const [period, setPeriod] = useState<string>(getCurrentPeriod());
  const [card, setCard] = useState<KpiCardRecord | null>(null);
  const [entries, setEntries] = useState<KpiEntryItem[]>([]);
  const [adminFeedback, setAdminFeedback] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [banner, setBanner] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!canSwitchPerson) return;
    if (filteredOfficers.length === 0) {
      setSelectedUid("");
      return;
    }
    if (!filteredOfficers.some((o) => o.uid === selectedUid)) {
      setSelectedUid(filteredOfficers[0].uid);
    }
  }, [filterBufn, filterSmelter, filterCategory, officerSearch]);

  async function fetchCard(
    targetUid: string,
    targetPeriod: string,
    syncMaster = false
  ) {
    if (!targetUid) {
      setCard(null);
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setBanner(null);
    try {
      const url = `/api/kpi-cards?uid=${encodeURIComponent(targetUid)}&period=${encodeURIComponent(targetPeriod)}${syncMaster ? "&syncMaster=1" : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setBanner({
          type: "err",
          text: data.pesan || "Gagal memuat data Kartu KPI.",
        });
        setLoading(false);
        return;
      }

      const loadedCard = data.card as KpiCardRecord;
      setCard(loadedCard);
      setEntries(loadedCard.entries);
      setAdminFeedback(loadedCard.adminFeedback || "");
      if (syncMaster) {
        setBanner({
          type: "ok",
          text: "Struktur parameter & kebijakan disinkronkan dengan aturan terbaru. Klik Simpan untuk mengunci perubahan.",
        });
      }
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCard(selectedUid, period, false);
  }, [selectedUid, period]);

  function handleActualChange(parameterId: string, rawVal: string) {
    const numVal = Math.max(0, Number(rawVal) || 0);
    setEntries((prev) =>
      prev.map((item) => {
        if (item.parameterId !== parameterId) return item;
        return {
          ...item,
          actual: numVal,
          score: calculateDynamicScore(
            item.formulaType || "higher_better",
            numVal,
            item.target,
            item.weight
          ),
        };
      })
    );
  }

  function handleNotesChange(parameterId: string, val: string) {
    setEntries((prev) =>
      prev.map((item) =>
        item.parameterId === parameterId ? { ...item, notes: val } : item
      )
    );
  }

  async function handleSaveAssessment(status: KpiCardStatus) {
    if (!selectedUid) return;
    setSaving(true);
    setBanner(null);

    try {
      const res = await fetch("/api/kpi-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: selectedUid,
          period,
          status,
          adminFeedback,
          entries: entries.map((e) => ({
            parameterId: e.parameterId,
            code: e.code,
            name: e.name,
            formulaType: e.formulaType,
            unit: e.unit,
            target: e.target,
            weight: e.weight,
            actual: e.actual,
            notes: e.notes,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.berhasil) {
        setBanner({
          type: "err",
          text: data.pesan || "Gagal menyimpan penilaian KPI.",
        });
        setSaving(false);
        return;
      }

      await fetchCard(selectedUid, period, false);
      setBanner({ type: "ok", text: data.pesan });
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setSaving(false);
    }
  }

  const isTargetWakilSpv = card?.jobTitle === "Wakil Supervisor";

  const liveStandardEval =
    card && !isTargetWakilSpv
      ? evaluateKpiResult(
          entries,
          card.gradesScale,
          card.policy || DEFAULT_SCORING_POLICY
        )
      : null;

  const liveSpvEval =
    card && isTargetWakilSpv && card.supervisorBreakdown
      ? evaluateSupervisorKpiResult(
          entries,
          card.supervisorBreakdown.teamMembers,
          card.gradesScale,
          card.policy || DEFAULT_SCORING_POLICY
        )
      : null;

  const activeGrade = isTargetWakilSpv
    ? liveSpvEval?.grade
    : liveStandardEval?.grade;
  const activeTotalScore = isTargetWakilSpv
    ? liveSpvEval?.totalScore ?? 0
    : liveStandardEval?.totalScore ?? 0;
  const activeGateTriggered = isTargetWakilSpv
    ? liveSpvEval?.gateTriggered ?? false
    : liveStandardEval?.gateTriggered ?? false;
  const activeFailedCodes = isTargetWakilSpv
    ? liveSpvEval?.failedCoreCodes ?? []
    : liveStandardEval?.failedCoreCodes ?? [];

  function gradeBadgeClass(color?: string): string {
    if (color === "emerald")
      return "border-emerald-500/40 bg-emerald-500/20 text-emerald-300";
    if (color === "amber")
      return "border-amber-500/40 bg-amber-500/20 text-amber-300";
    if (color === "red")
      return "border-red-500/40 bg-red-500/20 text-red-300";
    return "border-[#5B7C99]/50 bg-[#5B7C99]/25 text-[#8BB3D6]";
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

      {/* Filter Periode & Pemilihan Personel */}
      <div className="space-y-4 rounded-xl border border-[#495057] bg-[#2B3035] p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Periode Bulan
            </label>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
            />
            {card?.periodDateRange && (
              <p className="mt-1 text-[11px] font-medium text-[#8BB3D6]">
                Cut-off: {card.periodDateRange}
              </p>
            )}
          </div>

          {canEditScores && (
            <>
              {isSuperAdmin ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Filter BUFN
                  </label>
                  <select
                    value={filterBufn}
                    onChange={(e) => {
                      setFilterBufn(e.target.value);
                      setFilterSmelter("ALL");
                    }}
                    className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                  >
                    <option value="ALL">Semua BUFN (1 – 5)</option>
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
                    Wilayah Wewenang
                  </label>
                  <div className="rounded-lg border border-[#495057] bg-[#212529]/60 px-3 py-2 text-sm font-semibold text-[#8BB3D6]">
                    {currentUser.bufn}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Filter Smelter
                </label>
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
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Kategori Pola KPI
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
                      {KPI_CATEGORY_LABELS[c]}
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
                  placeholder="Ketik nama / ID..."
                  value={officerSearch}
                  onChange={(e) => setOfficerSearch(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500"
                />
              </div>
            </>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-300">
            {isWakilSpv && !canEditScores
              ? "Pilih Kartu Pribadi atau Anggota Wilayah Anda"
              : "Personel HSE"}{" "}
            {canSwitchPerson && (
              <span className="text-slate-400">
                ({filteredOfficers.length} personel tersedia)
              </span>
            )}
          </label>
          {canSwitchPerson ? (
            filteredOfficers.length > 0 ? (
              <select
                value={selectedUid}
                onChange={(e) => setSelectedUid(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2.5 text-sm font-medium text-[#F1F3F5]"
              >
                {filteredOfficers.map((o) => (
                  <option key={o.uid} value={o.uid}>
                    {o.name} ({o.employeeId}) — {o.jobTitle} [
                    {KPI_CATEGORY_LABELS[o.kpiCategory]}] • {o.bufn} -{" "}
                    {o.smelter}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-lg border border-dashed border-[#495057] bg-[#212529]/50 px-3 py-2.5 text-sm text-slate-400">
                Tidak ada personel pada filter wilayah/kategori ini.
              </div>
            )
          ) : (
            <div className="rounded-lg border border-[#495057] bg-[#212529]/70 px-3 py-2.5 text-sm text-slate-200">
              {currentUser.name} ({currentUser.employeeId}) —{" "}
              {currentUser.bufn} • {currentUser.smelter}
            </div>
          )}
        </div>
      </div>

      {canSwitchPerson && !selectedUid ? null : loading ? (
        <div className="rounded-xl border border-[#495057] bg-[#2B3035] p-8 text-center text-sm text-slate-400">
          Memuat rincian parameter & skor KPI...
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#495057] bg-[#2B3035] p-8 text-center space-y-3">
          <p className="text-sm text-slate-300">
            Belum ada Master Parameter KPI yang aktif untuk kategori{" "}
            <strong>{card?.kpiCategoryLabel}</strong>.
          </p>
          {isSuperAdmin && (
            <Link
              href="/admin/kpi-parameters"
              className="inline-block rounded-lg bg-[#5B7C99] px-4 py-2 text-sm font-semibold text-white hover:bg-[#45657F]"
            >
              Atur Master Parameter KPI Sekarang
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Ringkasan Skor, Jabatan, Kategori Pola Kerja & Grade */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#495057] bg-[#2B3035] p-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-[#5B7C99]/25 px-2.5 py-0.5 text-xs font-semibold text-[#8BB3D6]">
                  {card?.jobTitle}
                </span>
                <span className="rounded bg-purple-500/20 px-2.5 py-0.5 text-xs font-semibold text-purple-300">
                  Pola: {card?.kpiCategoryLabel}
                </span>
                {card?.status === "published" ? (
                  <span className="rounded bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                    Final / Dipublikasikan
                  </span>
                ) : (
                  <span className="rounded bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                    Draft / Evaluasi Admin
                  </span>
                )}

                {card?.isHistoricalSnapshot && canEditScores && (
                  <button
                    type="button"
                    onClick={() => fetchCard(selectedUid, period, true)}
                    className="rounded border border-[#495057] bg-[#212529] px-2.5 py-0.5 text-[11px] text-slate-300 hover:border-[#5B7C99] hover:text-white"
                  >
                    Sinkronkan ke Aturan Terbaru
                  </button>
                )}
              </div>

              {card?.assessedBy ? (
                <p className="text-xs text-slate-400">
                  Dinilai oleh:{" "}
                  <span className="text-slate-200">{card.assessedBy}</span>
                </p>
              ) : (
                <p className="text-xs text-slate-400">
                  Belum ada penilaian tersimpan untuk periode {period} (
                  {card?.periodDateRange}).
                </p>
              )}

              {activeGateTriggered && (
                <p className="rounded border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 text-xs text-amber-200">
                  Aturan Kelulusan Aktif: Indikator wajib (
                  <strong>{activeFailedCodes.join(", ")}</strong>) belum
                  mencapai batas minimal, sehingga predikat tertahan di{" "}
                  <strong>Grade {activeGrade?.grade}</strong>.
                </p>
              )}

              {!canEditScores && card?.adminFeedback && (
                <div className="mt-2 rounded-lg border border-[#5B7C99]/40 bg-[#212529] px-3 py-2 text-xs text-slate-200">
                  <span className="font-semibold text-[#8BB3D6]">
                    Catatan Admin:{" "}
                  </span>
                  {card.adminFeedback}
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              {activeGrade && (
                <div
                  className={`rounded-xl border px-3.5 py-2 text-center ${gradeBadgeClass(activeGrade.color)}`}
                >
                  <p className="text-[10px] uppercase tracking-wider opacity-80">
                    Kategori
                  </p>
                  <p className="text-xl font-extrabold leading-tight">
                    {activeGrade.grade}
                  </p>
                  <p className="text-[11px] font-medium">
                    {activeGrade.label}
                  </p>
                </div>
              )}

              <div className="text-right">
                <p className="text-xs text-slate-400">
                  Skor Akhir ({period})
                </p>
                <p className="text-3xl font-bold text-[#F1F3F5]">
                  {activeTotalScore}%
                </p>
                {!isTargetWakilSpv &&
                  liveStandardEval &&
                  liveStandardEval.bonusScore > 0 && (
                    <p className="text-[11px] text-amber-300">
                      Utama {liveStandardEval.coreScore}% + Bonus{" "}
                      {liveStandardEval.bonusScore}
                    </p>
                  )}
              </div>
            </div>
          </div>

          {/* Rincian Komposisi Nilai Khusus Wakil Supervisor */}
          {isTargetWakilSpv && liveSpvEval && card?.supervisorBreakdown && (
            <div className="space-y-4 rounded-xl border border-amber-500/40 bg-[#2B3035] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-amber-300">
                    Komposisi Nilai Wakil Supervisor ({card.bufn} •{" "}
                    {card.smelter})
                  </h2>
                  <p className="text-xs text-slate-300">
                    Gabungan {liveSpvEval.personalWeightPct}% Indikator Pribadi
                    + {liveSpvEval.teamWeightPct}% Kinerja Anggota Wilayah
                    Smelter
                  </p>
                </div>
                <span className="rounded bg-[#212529] px-2.5 py-1 text-xs text-slate-300">
                  Metode Tim:{" "}
                  <strong className="text-amber-300">
                    {liveSpvEval.teamCalcMode === "option_a"
                      ? "Opsi A (Penuh lalu Dipotong)"
                      : "Opsi B (Rata-rata Tim × Porsi %)"}
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-[#495057] bg-[#212529] p-3.5">
                  <p className="text-xs text-slate-400">
                    1. Porsi Pribadi ({liveSpvEval.personalWeightPct}%)
                  </p>
                  <p className="mt-1 text-xl font-bold text-[#F1F3F5]">
                    {liveSpvEval.personalWeightedScore}{" "}
                    <span className="text-xs font-normal text-slate-400">
                      / {liveSpvEval.personalWeightPct} poin
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Skor indikator pribadi: {liveSpvEval.personalRawScore}%
                  </p>
                </div>

                <div className="rounded-lg border border-[#495057] bg-[#212529] p-3.5">
                  <p className="text-xs text-slate-400">
                    2. Porsi Tim Smelter ({liveSpvEval.teamWeightPct}%)
                  </p>
                  <p className="mt-1 text-xl font-bold text-[#F1F3F5]">
                    {liveSpvEval.teamWeightedScore}{" "}
                    <span className="text-xs font-normal text-slate-400">
                      / {liveSpvEval.teamWeightPct} poin
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Awal {liveSpvEval.baseTeamPoints} − Penalti{" "}
                    {liveSpvEval.totalPenalty} ({liveSpvEval.failedMembersCount}{" "}
                    anggota × {liveSpvEval.penaltyPerMember} poin)
                  </p>
                </div>

                <div className="rounded-lg border border-[#7A9278]/50 bg-[#212529] p-3.5">
                  <p className="text-xs text-slate-400">
                    3. Total Skor Akhir Wakil SPV
                  </p>
                  <p className="mt-1 text-xl font-bold text-emerald-400">
                    {liveSpvEval.totalScore}%
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Rata-rata skor tim: {liveSpvEval.teamAverageScore}% (
                    {card.supervisorBreakdown.teamMembers.length} anggota)
                  </p>
                </div>
              </div>

              {/* Tabel Anggota di Smelter-nya */}
              <div className="overflow-x-auto rounded-lg border border-[#495057] bg-[#212529]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#495057] text-slate-400">
                      <th className="px-3 py-2">Anggota di {card.smelter}</th>
                      <th className="px-3 py-2">Jabatan & Pola</th>
                      <th className="px-3 py-2">Skor KPI</th>
                      <th className="px-3 py-2">Status Indikator Wajib</th>
                      <th className="px-3 py-2 text-right">Dampak ke SPV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#495057]/50">
                    {card.supervisorBreakdown.teamMembers.map((m) => (
                      <tr key={m.uid}>
                        <td className="px-3 py-2 font-medium text-[#F1F3F5]">
                          {m.name}{" "}
                          <span className="font-mono text-[11px] text-slate-400">
                            ({m.employeeId})
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {m.jobTitle} • {m.kpiCategory}
                        </td>
                        <td className="px-3 py-2 font-semibold text-[#F1F3F5]">
                          {m.hasCardSaved ? `${m.totalScore}%` : "Belum Dinilai"}
                        </td>
                        <td className="px-3 py-2">
                          {!m.hasFailedCore ? (
                            <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
                              Semua Tercapai
                            </span>
                          ) : (
                            <span className="rounded bg-red-500/15 px-2 py-0.5 text-red-300">
                              Gagal: {m.failedCoreCodes.join(", ")}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {!m.hasFailedCore ? (
                            <span className="text-slate-400">0 poin</span>
                          ) : (
                            <span className="text-red-400">
                              -{liveSpvEval.penaltyPerMember} poin
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {card.supervisorBreakdown.teamMembers.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-4 text-center text-slate-400"
                        >
                          Belum ada anggota yang terdaftar di {card.bufn} -{" "}
                          {card.smelter}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Daftar Indikator KPI */}
          <div className="space-y-4">
            {entries.map((item) => {
              const pct =
                item.weight > 0
                  ? Math.min(100, Math.round((item.score / item.weight) * 100))
                  : 0;
              const fType = item.formulaType || "higher_better";
              const isBonus = fType === "bonus_point";

              return (
                <div
                  key={item.parameterId}
                  className="rounded-xl border border-[#495057] bg-[#2B3035] p-4 sm:p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ${
                            isBonus
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-[#5B7C99]/20 text-[#8BB3D6]"
                          }`}
                        >
                          {item.code}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {FORMULA_LABELS[fType]}
                        </span>
                      </div>
                      <h3 className="mt-1.5 font-semibold text-[#F1F3F5]">
                        {item.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {isBonus ? (
                          <>
                            Nilai Tambah:{" "}
                            <strong className="text-amber-300">
                              +{item.target} poin / {item.unit}
                            </strong>{" "}
                            • Maksimal Bonus:{" "}
                            <strong className="text-amber-300">
                              +{item.weight} poin
                            </strong>
                          </>
                        ) : fType === "yes_no" ? (
                          <>
                            Standar:{" "}
                            <strong className="text-slate-200">
                              Wajib Tercapai (Ya)
                            </strong>{" "}
                            • Bobot:{" "}
                            <strong className="text-[#A3BE9F]">
                              {item.weight}%
                            </strong>
                          </>
                        ) : fType === "direct_percentage" ? (
                          <>
                            Standar Maksimal:{" "}
                            <strong className="text-slate-200">100%</strong> •
                            Bobot:{" "}
                            <strong className="text-[#A3BE9F]">
                              {item.weight}%
                            </strong>
                          </>
                        ) : (
                          <>
                            {fType === "lower_better"
                              ? "Batas Maksimal"
                              : "Target Periode"}
                            :{" "}
                            <strong className="text-slate-200">
                              {item.target} {item.unit}
                            </strong>{" "}
                            • Bobot:{" "}
                            <strong className="text-[#A3BE9F]">
                              {item.weight}%
                            </strong>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-slate-400">
                        {isBonus ? "Poin Bonus" : "Skor Indikator"}
                      </p>
                      <p
                        className={`text-lg font-bold ${
                          isBonus ? "text-amber-300" : "text-[#F1F3F5]"
                        }`}
                      >
                        {isBonus ? `+${item.score}` : `${item.score}%`}{" "}
                        <span className="text-xs font-normal text-slate-400">
                          / {isBonus ? `+${item.weight}` : `${item.weight}%`}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#212529]">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isBonus ? "bg-amber-400" : "bg-[#7A9278]"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {canEditScores ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-300">
                          {fType === "yes_no"
                            ? "Status Kepatuhan"
                            : fType === "direct_percentage"
                              ? "Capaian (%)"
                              : `Realisasi (${item.unit})`}
                        </label>
                        {fType === "yes_no" ? (
                          <select
                            value={item.actual >= 1 ? "1" : "0"}
                            onChange={(e) =>
                              handleActualChange(
                                item.parameterId,
                                e.target.value
                              )
                            }
                            className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                          >
                            <option value="0">0 — Tidak Tercapai</option>
                            <option value="1">1 — Tercapai (Ya)</option>
                          </select>
                        ) : (
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max={fType === "direct_percentage" ? 100 : undefined}
                            value={item.actual}
                            onChange={(e) =>
                              handleActualChange(
                                item.parameterId,
                                e.target.value
                              )
                            }
                            className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5]"
                          />
                        )}
                      </div>

                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-300">
                          Catatan Penilaian / Keterangan Bukti
                        </label>
                        <input
                          type="text"
                          placeholder="Catatan pencapaian atau referensi dokumen..."
                          value={item.notes}
                          onChange={(e) =>
                            handleNotesChange(item.parameterId, e.target.value)
                          }
                          className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#495057]/60 bg-[#212529]/60 px-3.5 py-2.5 text-xs">
                      <span className="text-slate-300">
                        Realisasi Tercatat:{" "}
                        <strong className="text-[#F1F3F5]">
                          {fType === "yes_no"
                            ? item.actual >= 1
                              ? "Tercapai (Ya)"
                              : "Tidak Tercapai"
                            : fType === "direct_percentage"
                              ? `${item.actual}%`
                              : `${item.actual} ${item.unit}`}
                        </strong>
                      </span>
                      {item.notes && (
                        <span className="text-slate-400">
                          Catatan:{" "}
                          <span className="text-slate-200">{item.notes}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {canEditScores && (
            <>
              <div className="rounded-xl border border-[#495057] bg-[#2B3035] p-4 sm:p-5 space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#8BB3D6]">
                  Catatan Evaluasi Umum
                </label>
                <textarea
                  rows={2}
                  placeholder="Tulis catatan evaluasi bulanan atau arahan perbaikan..."
                  value={adminFeedback}
                  onChange={(e) => setAdminFeedback(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] p-3 text-sm text-[#F1F3F5] placeholder-slate-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[#495057] bg-[#2B3035] p-4">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveAssessment("draft")}
                  className="rounded-lg border border-[#495057] bg-[#212529] px-4 py-2.5 text-sm font-medium text-slate-200 hover:border-[#5B7C99] disabled:opacity-50"
                >
                  {saving ? "Menyimpan..." : "Simpan sebagai Draft"}
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveAssessment("published")}
                  className="rounded-lg bg-[#7A9278] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#667D64] disabled:opacity-50"
                >
                  {saving ? "Menyimpan..." : "Simpan & Publikasikan Hasil"}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}