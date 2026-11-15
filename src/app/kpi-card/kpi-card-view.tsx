"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SessionUser } from "@/lib/session";
import type {
  KpiCardRecord,
  KpiCardStatus,
  KpiEntryItem,
} from "@/app/api/kpi-cards/route";
import type { OfficerOption } from "./page";

interface Props {
  currentUser: SessionUser;
  officerList: OfficerOption[];
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function calcLiveScore(actual: number, target: number, weight: number): number {
  if (target <= 0 || actual <= 0) return 0;
  const raw = (actual / target) * weight;
  return Math.round(Math.min(raw, weight) * 100) / 100;
}

export default function KpiCardView({ currentUser, officerList }: Props) {
  const isAdminOrAbove =
    currentUser.role === "super_admin" || currentUser.role === "admin";

  const defaultOfficerUid = isAdminOrAbove
    ? officerList.find((o) => o.role === "safety_officer")?.uid ||
      currentUser.uid
    : currentUser.uid;

  const [selectedUid, setSelectedUid] = useState<string>(defaultOfficerUid);
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

  async function fetchCard(targetUid: string, targetPeriod: string) {
    setLoading(true);
    setBanner(null);
    try {
      const res = await fetch(
        `/api/kpi-cards?uid=${encodeURIComponent(targetUid)}&period=${encodeURIComponent(targetPeriod)}`,
        { cache: "no-store" }
      );
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
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCard(selectedUid, period);
  }, [selectedUid, period]);

  function handleActualChange(parameterId: string, rawVal: string) {
    const numVal = Math.max(0, Number(rawVal) || 0);
    setEntries((prev) =>
      prev.map((item) => {
        if (item.parameterId !== parameterId) return item;
        return {
          ...item,
          actual: numVal,
          score: calcLiveScore(numVal, item.target, item.weight),
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

      await fetchCard(selectedUid, period);
      setBanner({ type: "ok", text: data.pesan });
    } catch {
      setBanner({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setSaving(false);
    }
  }

  const totalLiveScore =
    Math.round(entries.reduce((sum, item) => sum + item.score, 0) * 100) / 100;

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
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-[#495057] bg-[#2B3035] p-4 sm:grid-cols-3">
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

        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-300">
            Personel Safety Officer
          </label>
          {isAdminOrAbove ? (
            <select
              value={selectedUid}
              onChange={(e) => setSelectedUid(e.target.value)}
              className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
            >
              {officerList.map((o) => (
                <option key={o.uid} value={o.uid}>
                  {o.name} ({o.employeeId}) — {o.unit}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-lg border border-[#495057] bg-[#212529]/70 px-3 py-2 text-sm text-slate-200">
              {currentUser.name} ({currentUser.employeeId}) — {currentUser.unit}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[#495057] bg-[#2B3035] p-8 text-center text-sm text-slate-400">
          Memuat rincian parameter & skor KPI...
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#495057] bg-[#2B3035] p-8 text-center space-y-3">
          <p className="text-sm text-slate-300">
            Belum ada Master Parameter KPI yang aktif di sistem.
          </p>
          {isAdminOrAbove && (
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
          {/* Ringkasan Skor & Status */}
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
              </div>

              {card?.assessedBy ? (
                <p className="text-xs text-slate-400">
                  Dinilai oleh: <span className="text-slate-200">{card.assessedBy}</span>
                </p>
              ) : (
                <p className="text-xs text-slate-400">
                  Belum ada penilaian yang disimpan untuk periode {period}.
                </p>
              )}

              {!isAdminOrAbove && card?.adminFeedback && (
                <div className="mt-2 rounded-lg border border-[#5B7C99]/40 bg-[#212529] px-3 py-2 text-xs text-slate-200">
                  <span className="font-semibold text-[#8BB3D6]">Catatan Admin: </span>
                  {card.adminFeedback}
                </div>
              )}
            </div>

            <div className="text-left sm:text-right">
              <p className="text-xs text-slate-400">Total Skor KPI ({period})</p>
              <p
                className={`text-3xl font-bold ${
                  totalLiveScore >= 85
                    ? "text-emerald-400"
                    : totalLiveScore >= 70
                      ? "text-[#8BB3D6]"
                      : "text-amber-300"
                }`}
              >
                {totalLiveScore}%
              </p>
            </div>
          </div>

          {/* Daftar Parameter KPI */}
          <div className="space-y-4">
            {entries.map((item) => {
              const pct =
                item.target > 0
                  ? Math.min(100, Math.round((item.actual / item.target) * 100))
                  : 0;

              return (
                <div
                  key={item.parameterId}
                  className="rounded-xl border border-[#495057] bg-[#2B3035] p-4 sm:p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="rounded bg-[#5B7C99]/20 px-2 py-0.5 font-mono text-xs font-semibold text-[#8BB3D6]">
                        {item.code}
                      </span>
                      <h3 className="mt-1.5 font-semibold text-[#F1F3F5]">
                        {item.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-400">
                        Target Bulanan:{" "}
                        <strong className="text-slate-200">
                          {item.target} {item.unit}
                        </strong>{" "}
                        • Bobot:{" "}
                        <strong className="text-[#A3BE9F]">{item.weight}%</strong>
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-slate-400">Skor Capaian</p>
                      <p className="text-lg font-bold text-[#F1F3F5]">
                        {item.score}%{" "}
                        <span className="text-xs font-normal text-slate-400">
                          / {item.weight}%
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Progress bar visual */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#212529]">
                    <div
                      className="h-full rounded-full bg-[#7A9278] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Mode Admin (Bisa Input & Revisi) vs Mode Safety Officer (Terima Bersih / Read-Only) */}
                  {isAdminOrAbove ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-300">
                          Realisasi ({item.unit})
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={item.actual}
                          onChange={(e) =>
                            handleActualChange(item.parameterId, e.target.value)
                          }
                          className="w-full rounded-lg border border-[#495057] bg-[#212529] px-3 py-2 text-sm text-[#F1F3F5] focus:border-[#5B7C99] focus:outline-none"
                        />
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
                          {item.actual} {item.unit}
                        </strong>{" "}
                        ({pct}% dari target)
                      </span>
                      {item.notes && (
                        <span className="text-slate-400">
                          Catatan: <span className="text-slate-200">{item.notes}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Panel Catatan & Tombol Simpan khusus Admin / Super Admin */}
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