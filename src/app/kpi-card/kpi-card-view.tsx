"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SessionUser } from "@/lib/session";
import type { BufnArea } from "@/lib/work-areas";
import {
  calculateDynamicScore,
  DEFAULT_SCORING_POLICY,
  evaluateKpiResult,
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
  officerList: OfficerOption[];
  workAreas: BufnArea[];
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function KpiCardView({
  currentUser,
  officerList,
  workAreas,
}: Props) {
  const isSuperAdmin = currentUser.role === "super_admin";
  const isAdmin = currentUser.role === "admin";
  const isAdminOrAbove = isSuperAdmin || isAdmin;

  const [filterBufn, setFilterBufn] = useState<string>(
    isSuperAdmin ? "ALL" : currentUser.bufn
  );
  const [filterSmelter, setFilterSmelter] = useState<string>("ALL");
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
    const q = officerSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      o.name.toLowerCase().includes(q) ||
      o.employeeId.toLowerCase().includes(q) ||
      o.smelter.toLowerCase().includes(q)
    );
  });

  const [selectedUid, setSelectedUid] = useState<string>(
    isAdminOrAbove ? officerList[0]?.uid || "" : currentUser.uid
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
    if (!isAdminOrAbove) return;
    if (filteredOfficers.length === 0) {
      setSelectedUid("");
      return;
    }
    if (!filteredOfficers.some((o) => o.uid === selectedUid)) {
      setSelectedUid(filteredOfficers[0].uid);
    }
  }, [filterBufn, filterSmelter, officerSearch]);

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

  const liveEval = card
    ? evaluateKpiResult(
        entries,
        card.gradesScale,
        card.policy || DEFAULT_SCORING_POLICY
      )
    : null;

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          </div>

          {isAdminOrAbove && (
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
                    className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
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
                  Filter Lokasi Smelter
                </label>
                <select
                  value={filterSmelter}
                  onChange={(e) => setFilterSmelter(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
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
                  Cari Nama / ID Karyawan
                </label>
                <input
                  type="text"
                  placeholder="Ketik nama atau ID..."
                  value={officerSearch}
                  onChange={(e) => setOfficerSearch(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
                />
              </div>
            </>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-300">
            Personel Safety Officer{" "}
            {isAdminOrAbove && (
              <span className="text-slate-400">
                ({filteredOfficers.length} personel tersedia)
              </span>
            )}
          </label>
          {isAdminOrAbove ? (
            filteredOfficers.length > 0 ? (
              <select
                value={selectedUid}
                onChange={(e) => setSelectedUid(e.target.value)}
                className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2.5 text-sm font-medium text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
              >
                {filteredOfficers.map((o) => (
                  <option key={o.uid} value={o.uid}>
                    {o.name} ({o.employeeId}) — {o.bufn} • {o.smelter}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-lg border border-dashed border-[#495057] bg-[#212529]/50 px-3 py-2.5 text-sm text-slate-400">
                Tidak ada Safety Officer pada filter wilayah/pencarian ini.
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

      {isAdminOrAbove && !selectedUid ? null : loading ? (
        <div className="rounded-xl border border-[#495057] bg-[#2B3035] p-8 text-center text-sm text-slate-400">
          Memuat rincian parameter & skor KPI...
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#495057] bg-[#2B3035] p-8 text-center space-y-3">
          <p className="text-sm text-slate-300">
            Belum ada Master Parameter KPI yang aktif di sistem.
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
          {/* Ringkasan Skor Utama, Poin Bonus, Predikat Grade & Status */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#495057] bg-[#2B3035] p-5">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Status Penilaian:
                </span>
                {card?.status === "published" ? (
                  <span className="rounded bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                    Final / Dipublikasikan
                  </span>
                ) : (
                  <span className="rounded bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-300">
                    Draft / Dalam Evaluasi Admin
                  </span>
                )}

                {card?.isHistoricalSnapshot && isAdminOrAbove && (
                  <button
                    type="button"
                    onClick={() => fetchCard(selectedUid, period, true)}
                    className="rounded border border-[#495057] bg-[#212529] px-2.5 py-1 text-[11px] text-slate-300 hover:border-[#5B7C99] hover:text-white"
                    title="Perbarui struktur parameter & kebijakan kartu ini agar mengikuti aturan terbaru"
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
                  Belum ada penilaian tersimpan untuk periode {period}.
                </p>
              )}

              {liveEval?.gateTriggered && (
                <p className="rounded border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 text-xs text-amber-200">
                  Aturan Kelulusan Aktif: Indikator wajib (
                  <strong>{liveEval.failedCoreCodes.join(", ")}</strong>) belum
                  mencapai batas minimal, sehingga predikat tertahan di{" "}
                  <strong>Grade {liveEval.grade.grade}</strong>.
                </p>
              )}

              {!isAdminOrAbove && card?.adminFeedback && (
                <div className="mt-2 rounded-lg border border-[#5B7C99]/40 bg-[#212529] px-3 py-2 text-xs text-slate-200">
                  <span className="font-semibold text-[#8BB3D6]">
                    Catatan Admin:{" "}
                  </span>
                  {card.adminFeedback}
                </div>
              )}
            </div>

            {liveEval && (
              <div className="flex items-center gap-4">
                <div
                  className={`rounded-xl border px-3.5 py-2 text-center ${gradeBadgeClass(liveEval.grade.color)}`}
                >
                  <p className="text-[10px] uppercase tracking-wider opacity-80">
                    Kategori
                  </p>
                  <p className="text-xl font-extrabold leading-tight">
                    {liveEval.grade.grade}
                  </p>
                  <p className="text-[11px] font-medium">
                    {liveEval.grade.label}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-slate-400">
                    Total Skor KPI ({period})
                  </p>
                  <p className="text-3xl font-bold text-[#F1F3F5]">
                    {liveEval.totalScore}%
                  </p>
                  {liveEval.bonusScore > 0 && (
                    <p className="text-[11px] text-amber-300">
                      Utama {liveEval.coreScore}% + Bonus {liveEval.bonusScore}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Daftar Parameter KPI */}
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
                              : "Target Bulanan"}
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
                        {isBonus ? "Poin Bonus" : "Skor Capaian"}
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

                  {/* Progress bar visual */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#212529]">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isBonus ? "bg-amber-400" : "bg-[#7A9278]"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Mode Admin (Input & Revisi) vs Mode Safety Officer (Terima Bersih / Read-Only) */}
                  {isAdminOrAbove ? (
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
                            className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
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
                            className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
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
                          className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
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

          {/* Panel Catatan & Tombol Simpan khusus Admin BUFN / Super Admin */}
          {isAdminOrAbove && (
            <>
              <div className="rounded-xl border border-[#495057] bg-[#2B3035] p-4 sm:p-5 space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#8BB3D6]">
                  Catatan Evaluasi Umum untuk Safety Officer
                </label>
                <textarea
                  rows={2}
                  placeholder="Tulis catatan evaluasi bulanan atau arahan perbaikan..."
                  value={adminFeedback}
                  onChange={(e) => setAdminFeedback(e.target.value)}
                  className="w-full rounded-lg border border-[#495057] bg-[#212529] p-3 text-sm text-[#F1F3F5] placeholder-slate-500 focus:border-[#5B7C99] focus:outline-none"
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