import type { PersonRecapRow } from "@/lib/kpi-recap";
import { FORMULA_LABELS } from "@/lib/kpi-engine";

export type PdfExportMode = "monthly_slip" | "yearly_report";

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getGradeBadgeStyle(color: string): string {
  if (color === "emerald") {
    return "background:#dcfce7;color:#166534;border:1px solid #86efac;";
  }
  if (color === "amber") {
    return "background:#fef3c7;color:#92400e;border:1px solid #fcd34d;";
  }
  if (color === "red") {
    return "background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;";
  }
  return "background:#e0f2fe;color:#075985;border:1px solid #7dd3fc;";
}

function formatLocationLabel(row: PersonRecapRow): string {
  const b = (row.bufn || "").trim();
  const s = (row.smelter || "").trim();
  if (b && s && s !== "-" && s !== "ALL") {
    return `${b} — ${s}`;
  }
  return b || "-";
}

function renderSignatureBlock(row: PersonRecapRow): string {
  const sigImg = row.verifierSignatureDataUrl
    ? `<img src="${row.verifierSignatureDataUrl}" alt="Tanda Tangan" style="max-height:46px;max-width:150px;object-fit:contain;display:block;margin:2px auto;" />`
    : `<div style="height:42px;"></div>`;

  return `
    <div style="width:195px;text-align:center;font-size:10px;color:#334155;">
      <div style="font-weight:600;color:#475569;">Diverifikasi Oleh,</div>
      <div style="min-height:48px;display:flex;align-items:center;justify-content:center;">
        ${sigImg}
      </div>
      <div style="border-top:1px solid #64748b;padding-top:3px;font-weight:700;color:#0f172a;font-size:10.5px;">
        ${escapeHtml(row.verifierName)}
      </div>
      ${
        row.verifierTitle
          ? `<div style="font-size:9px;color:#64748b;">${escapeHtml(row.verifierTitle)}</div>`
          : ""
      }
    </div>
  `;
}

export function renderSinglePersonSlipHtml(
  row: PersonRecapRow,
  mode: PdfExportMode,
  filterSubtitle: string
): string {
  const isWakilSpv = row.jobTitle === "Wakil Supervisor";
  const isYearly = mode === "yearly_report";

  const activeGrade = isYearly ? row.yearlyGrade : row.grade;
  const headlineScore = isYearly
    ? `${row.yearlyAverageScore}%`
    : row.hasCard
      ? `${row.totalScore}%`
      : "Belum Dinilai";

  const locationDisplay = formatLocationLabel(row);

  // Rincian Indikator Bulan Berjalan (Kolom Kiri Slip Bulanan)
  const entriesTableHtml =
    !isYearly && row.entries.length > 0
      ? `
      <div>
        <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;color:#1e293b;margin-bottom:5px;">
          Rincian Penilaian Indikator Bulan Berjalan (${escapeHtml(row.period)})
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:10px;">
          <thead>
            <tr style="background:#f1f5f9;color:#334155;">
              <th style="border:1px solid #cbd5e1;padding:5px;text-align:left;width:54px;">Kode</th>
              <th style="border:1px solid #cbd5e1;padding:5px;text-align:left;">Indikator Kinerja</th>
              <th style="border:1px solid #cbd5e1;padding:5px;text-align:center;width:62px;">Target</th>
              <th style="border:1px solid #cbd5e1;padding:5px;text-align:center;width:64px;">Aktual</th>
              <th style="border:1px solid #cbd5e1;padding:5px;text-align:center;width:48px;">Bobot</th>
              <th style="border:1px solid #cbd5e1;padding:5px;text-align:right;width:52px;">Skor</th>
            </tr>
          </thead>
          <tbody>
            ${row.entries
              .map((item) => {
                const isBonus = item.formulaType === "bonus_point";
                const targetStr =
                  item.formulaType === "yes_no"
                    ? "Wajib"
                    : item.formulaType === "direct_percentage"
                      ? "100%"
                      : isBonus
                        ? `+${item.target}`
                        : `${item.target} ${item.unit}`;
                const actualStr =
                  item.formulaType === "yes_no"
                    ? item.actual >= 1
                      ? "Ya"
                      : "Tidak"
                    : item.formulaType === "direct_percentage"
                      ? `${item.actual}%`
                      : `${item.actual} ${item.unit}`;
                const weightStr = isBonus
                  ? `+${item.weight}`
                  : `${item.weight}%`;
                const scoreStr = isBonus
                  ? `+${item.score}`
                  : `${item.score}%`;

                return `
                  <tr>
                    <td style="border:1px solid #cbd5e1;padding:4.5px 5px;font-family:monospace;font-weight:600;">${escapeHtml(item.code)}</td>
                    <td style="border:1px solid #cbd5e1;padding:4.5px 5px;">
                      <div style="font-weight:600;color:#0f172a;">${escapeHtml(item.name)}</div>
                      <div style="font-size:8.5px;color:#64748b;">${escapeHtml(FORMULA_LABELS[item.formulaType || "higher_better"])}${item.notes ? ` • ${escapeHtml(item.notes)}` : ""}</div>
                    </td>
                    <td style="border:1px solid #cbd5e1;padding:4.5px 5px;text-align:center;">${escapeHtml(targetStr)}</td>
                    <td style="border:1px solid #cbd5e1;padding:4.5px 5px;text-align:center;font-weight:600;">${escapeHtml(actualStr)}</td>
                    <td style="border:1px solid #cbd5e1;padding:4.5px 5px;text-align:center;">${escapeHtml(weightStr)}</td>
                    <td style="border:1px solid #cbd5e1;padding:4.5px 5px;text-align:right;font-weight:700;color:#0f172a;">${escapeHtml(scoreStr)}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `
      : !isYearly
        ? `<div style="padding:12px;border:1px dashed #cbd5e1;border-radius:6px;font-size:10.5px;color:#64748b;text-align:center;">Belum ada rincian indikator bulanan yang diinput untuk periode ${escapeHtml(row.period)}.</div>`
        : "";

  // Rincian Komposisi Khusus Wakil Supervisor
  const spvSectionHtml =
    !isYearly && isWakilSpv && row.supervisorBreakdown
      ? `
      <div style="margin-top:10px;border:1px solid #cbd5e1;border-radius:6px;padding:8px 10px;background:#f8fafc;">
        <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;color:#1e293b;margin-bottom:4px;">
          Komposisi Nilai Wakil Supervisor (${row.supervisorBreakdown.personalWeightPct}% Pribadi + ${row.supervisorBreakdown.teamWeightPct}% Tim ${escapeHtml(row.smelter)})
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:9.5px;">
          <tr>
            <td style="padding:2px 0;color:#475569;">1. Skor Pribadi (${row.supervisorBreakdown.personalWeightPct}%):</td>
            <td style="padding:2px 0;text-align:right;font-weight:700;">${row.supervisorBreakdown.personalWeightedScore} poin</td>
          </tr>
          <tr>
            <td style="padding:2px 0;color:#475569;">2. Porsi Tim (${row.supervisorBreakdown.teamWeightPct}%):</td>
            <td style="padding:2px 0;text-align:right;font-weight:700;">${row.supervisorBreakdown.teamWeightedScore} poin (Awal ${row.supervisorBreakdown.baseTeamPoints} − Penalti ${row.supervisorBreakdown.totalPenalty})</td>
          </tr>
          <tr style="border-top:1px solid #cbd5e1;">
            <td style="padding:3px 0 0;font-weight:700;color:#0f172a;">Total Gabungan:</td>
            <td style="padding:3px 0 0;text-align:right;font-weight:800;color:#0f172a;">${row.totalScore}%</td>
          </tr>
        </table>
      </div>
    `
      : "";

  // Tabel Histori Terpisah di Kolom Kanan (untuk Slip Bulanan)
  const sideHistoryHtml = !isYearly
    ? `
      <div style="width:185px;shrink:0;border:1px solid #cbd5e1;border-radius:6px;padding:8px;background:#f8fafc;">
        <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;color:#334155;border-bottom:1px solid #cbd5e1;padding-bottom:4px;margin-bottom:5px;text-align:center;">
          Rekam Jejak ${escapeHtml(row.year)}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:9.5px;">
          <thead>
            <tr style="color:#64748b;border-bottom:1px solid #e2e8f0;">
              <th style="padding:2.5px 3px;text-align:left;">Bln</th>
              <th style="padding:2.5px 3px;text-align:right;">Skor</th>
              <th style="padding:2.5px 3px;text-align:center;">Grd</th>
            </tr>
          </thead>
          <tbody>
            ${row.yearlyHistory
              .map((h) => {
                const isCurrent = h.period === row.period;
                const rowBg = isCurrent
                  ? "background:#dbeafe;font-weight:700;color:#1e3a8a;"
                  : "";
                return `
                  <tr style="border-bottom:1px solid #f1f5f9;${rowBg}">
                    <td style="padding:2.5px 3px;">${escapeHtml(h.label)}</td>
                    <td style="padding:2.5px 3px;text-align:right;">${h.hasData ? `${h.totalScore}%` : "-"}</td>
                    <td style="padding:2.5px 3px;text-align:center;">${h.hasData ? escapeHtml(h.gradeLetter) : "-"}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
          <tfoot>
            <tr style="border-top:1px solid #94a3b8;background:#e2e8f0;font-weight:800;color:#0f172a;">
              <td style="padding:4px 3px;">Rata2</td>
              <td style="padding:4px 3px;text-align:right;">${row.assessedMonthsCount > 0 ? `${row.yearlyAverageScore}%` : "-"}</td>
              <td style="padding:4px 3px;text-align:center;">${row.assessedMonthsCount > 0 ? escapeHtml(row.yearlyGrade.grade) : "-"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `
    : "";

  // Layout Khusus Rapor Tahunan (Tabel 12 Bulan Penuh + Ringkasan Tahunan)
  const yearlyBodyHtml = isYearly
    ? `
      <div style="margin-top:14px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#1e293b;margin-bottom:6px;">
          Rekapitulasi Capaian Kinerja Tahun ${escapeHtml(row.year)} (Januari – Desember)
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="border:1px solid #cbd5e1;padding:5px 6px;text-align:left;font-size:10px;background:#f1f5f9;color:#334155;width:62px;">Bulan</th>
              ${row.yearlyHistory
                .map(
                  (h) =>
                    `<th style="border:1px solid #cbd5e1;padding:5px 4px;text-align:center;font-size:10px;background:#f1f5f9;color:#334155;">${escapeHtml(h.label)}</th>`
                )
                .join("")}
              <th style="border:1px solid #cbd5e1;padding:5px 6px;text-align:center;font-size:10px;background:#e2e8f0;color:#0f172a;width:62px;">Rata2</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border:1px solid #cbd5e1;padding:5px 6px;font-size:10px;font-weight:700;background:#f8fafc;">Skor</td>
              ${row.yearlyHistory
                .map(
                  (h) =>
                    `<td style="border:1px solid #cbd5e1;padding:5px 4px;text-align:center;font-size:10px;">${h.hasData ? `${h.totalScore}%` : "-"}</td>`
                )
                .join("")}
              <td style="border:1px solid #cbd5e1;padding:5px 6px;text-align:center;font-size:10px;font-weight:800;background:#f1f5f9;">${row.assessedMonthsCount > 0 ? `${row.yearlyAverageScore}%` : "-"}</td>
            </tr>
            <tr>
              <td style="border:1px solid #cbd5e1;padding:4px 6px;font-size:10px;font-weight:600;background:#f8fafc;color:#475569;">Grade</td>
              ${row.yearlyHistory
                .map(
                  (h) =>
                    `<td style="border:1px solid #cbd5e1;padding:4px;text-align:center;font-size:10px;color:#475569;">${h.hasData ? escapeHtml(h.gradeLetter) : "-"}</td>`
                )
                .join("")}
              <td style="border:1px solid #cbd5e1;padding:4px 6px;text-align:center;font-size:10px;font-weight:700;background:#f1f5f9;">${row.assessedMonthsCount > 0 ? escapeHtml(row.yearlyGrade.grade) : "-"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="margin-top:14px;border:1px solid #cbd5e1;border-radius:6px;padding:12px;background:#f8fafc;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#1e293b;margin-bottom:8px;">
          Ringkasan Evaluasi Kinerja Tahun ${escapeHtml(row.year)}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <tr>
            <td style="padding:4px 0;color:#475569;">Jumlah Bulan Dinilai (Jan – Des ${escapeHtml(row.year)}):</td>
            <td style="padding:4px 0;text-align:right;font-weight:700;">${row.assessedMonthsCount} dari 12 Bulan</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#475569;">Rata-rata Skor KPI Tahunan:</td>
            <td style="padding:4px 0;text-align:right;font-weight:800;font-size:12px;color:#0f172a;">${row.yearlyAverageScore}%</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#475569;">Predikat Akhir Kinerja Tahunan:</td>
            <td style="padding:4px 0;text-align:right;font-weight:700;">Grade ${escapeHtml(row.yearlyGrade.grade)} (${escapeHtml(row.yearlyGrade.label)})</td>
          </tr>
        </table>
      </div>
    `
    : "";

  const evaluationNoteTitle = isYearly
    ? `Catatan Evaluasi Tahunan Supervisor Area (${escapeHtml(row.year)}):`
    : "Catatan Evaluasi Admin / Supervisor:";

  const evaluationNoteBody = isYearly
    ? row.yearlySpvNote ||
      "Evaluasi tahunan kinerja K3 dan kepatuhan standar operasional berjalan baik."
    : row.adminFeedback ||
      "Pertahankan kedisiplinan pelaksanaan standar K3 dan pelaporan tepat waktu.";

  return `
    <section class="slip-page">
      <!-- Header Korporat -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:10px;">
        <div>
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#475569;">
            KPI SAFETY OFFICER BUFN
          </div>
          <div style="font-size:15.5px;font-weight:800;color:#0f172a;margin-top:2px;">
            ${isYearly ? `LAPORAN EVALUASI KPI TAHUNAN (${escapeHtml(row.year)})` : "SLIP HASIL PENILAIAN KINERJA"}
          </div>
          <div style="font-size:10px;color:#64748b;margin-top:2px;">
            Comprehensive Health, Safety & Environment Department • ${escapeHtml(filterSubtitle)}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:10px;color:#64748b;">Periode Penilaian</div>
          <div style="font-size:12px;font-weight:700;color:#0f172a;">
            ${isYearly ? `Tahun Berjalan ${escapeHtml(row.year)}` : escapeHtml(row.period)}
          </div>
          ${
            !isYearly
              ? `<div style="font-size:9.5px;color:#475569;">Cut-off: ${escapeHtml(row.periodDateRange)}</div>`
              : ""
          }
        </div>
      </div>

      <!-- Identitas Karyawan & Kotak Skor Utama -->
      <div style="display:flex;justify-content:space-between;gap:14px;margin-top:12px;border:1px solid #cbd5e1;border-radius:6px;padding:10px 12px;background:#ffffff;">
        <table style="border-collapse:collapse;font-size:11px;flex:1;">
          <tr>
            <td style="padding:2.5px 0;color:#64748b;width:120px;">Nama Personel</td>
            <td style="padding:2.5px 0;font-weight:700;color:#0f172a;">: ${escapeHtml(row.name)}</td>
          </tr>
          <tr>
            <td style="padding:2.5px 0;color:#64748b;">ID Karyawan</td>
            <td style="padding:2.5px 0;font-family:monospace;font-weight:600;color:#0f172a;">: ${escapeHtml(row.employeeId)}</td>
          </tr>
          <tr>
            <td style="padding:2.5px 0;color:#64748b;">Jabatan / Pola</td>
            <td style="padding:2.5px 0;color:#0f172a;">: ${escapeHtml(row.jobTitle)} (${escapeHtml(row.kpiCategoryLabel)})</td>
          </tr>
          <tr>
            <td style="padding:2.5px 0;color:#64748b;">Wilayah / Lokasi</td>
            <td style="padding:2.5px 0;font-weight:700;color:#0f172a;">: ${escapeHtml(locationDisplay)}</td>
          </tr>
        </table>

        <div style="display:flex;align-items:center;gap:10px;border-left:1px solid #e2e8f0;padding-left:14px;">
          <div style="text-align:right;">
            <div style="font-size:9.5px;text-transform:uppercase;color:#64748b;">
              ${isYearly ? "Rata-rata Tahunan" : `Skor ${escapeHtml(row.period)}`}
            </div>
            <div style="font-size:22px;font-weight:800;color:#0f172a;line-height:1.1;">
              ${escapeHtml(headlineScore)}
            </div>
            <div style="font-size:9px;color:#64748b;margin-top:2px;">
              ${
                isYearly
                  ? `${row.assessedMonthsCount} Bulan Tercatat`
                  : row.status === "published"
                    ? "Status: Final"
                    : row.status === "draft"
                      ? "Status: Draft"
                      : "Belum Dinilai"
              }
            </div>
          </div>

          ${
            row.hasCard || isYearly
              ? `
            <div style="border-radius:6px;padding:6px 10px;text-align:center;${getGradeBadgeStyle(activeGrade.color)}">
              <div style="font-size:8.5px;text-transform:uppercase;font-weight:700;">Grade</div>
              <div style="font-size:18px;font-weight:800;line-height:1.1;">${escapeHtml(activeGrade.grade)}</div>
              <div style="font-size:8.5px;font-weight:600;">${escapeHtml(activeGrade.label)}</div>
            </div>
          `
              : ""
          }
        </div>
      </div>

      ${
        isYearly
          ? yearlyBodyHtml
          : `
        <!-- Layout 2 Kolom Terpisah: Kiri = Data Bulan Berjalan, Kanan = Histori Jan-Des -->
        <div style="display:flex;align-items:flex-start;gap:12px;margin-top:12px;">
          <div style="flex:1;min-width:0;">
            ${entriesTableHtml}
            ${spvSectionHtml}
          </div>
          ${sideHistoryHtml}
        </div>
      `
      }

      <!-- Catatan Evaluasi & Kolom Verifikasi dengan Tanda Tangan Digital -->
      <div style="margin-top:14px;display:flex;justify-content:space-between;gap:16px;align-items:flex-end;">
        <div style="flex:1;border:1px solid #cbd5e1;border-radius:6px;padding:8px 10px;min-height:66px;background:#f8fafc;">
          <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;color:#475569;">${evaluationNoteTitle}</div>
          <div style="font-size:10.5px;color:#1e293b;margin-top:3px;line-height:1.4;">
            ${escapeHtml(evaluationNoteBody)}
          </div>
          ${
            !isYearly && row.gateTriggered
              ? `<div style="font-size:9px;color:#b45309;font-weight:600;margin-top:4px;">* Catatan Sistem: Predikat tertahan di Grade ${escapeHtml(row.grade.grade)} karena indikator wajib (${escapeHtml(row.failedCoreCodes.join(", "))}) belum tercapai.</div>`
              : ""
          }
        </div>

        ${renderSignatureBlock(row)}
      </div>

      <div style="margin-top:10px;border-top:1px dashed #cbd5e1;padding-top:5px;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8;">
        <span>Dokumen Rahasia Internal • Slip Evaluasi KPI HSE BUFN</span>
        <span>Dicetak pada: ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</span>
      </div>
    </section>
  `;
}

export function openPdfPrintWindow(
  rows: PersonRecapRow[],
  mode: PdfExportMode,
  filterSubtitle: string
): boolean {
  if (rows.length === 0) return false;

  const printWin = window.open("", "_blank", "width=980,height=820");
  if (!printWin) return false;

  const pagesHtml = rows
    .map((row) => renderSinglePersonSlipHtml(row, mode, filterSubtitle))
    .join("");

  const titleText =
    rows.length === 1
      ? `Slip_KPI_${rows[0].employeeId}_${rows[0].name.replace(/\s+/g, "_")}_${mode === "yearly_report" ? rows[0].year : rows[0].period}`
      : `Batch_Slip_KPI_${filterSubtitle.replace(/[^a-zA-Z0-9]+/g, "_")}_${mode === "yearly_report" ? rows[0].year : rows[0].period}`;

  printWin.document.open();
  printWin.document.write(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8" />
      <title>${escapeHtml(titleText)}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm;
        }
        * {
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        }
        body {
          margin: 0;
          padding: 0;
          background: #e2e8f0;
          color: #0f172a;
        }
        .toolbar {
          position: sticky;
          top: 0;
          z-index: 99;
          background: #1e293b;
          color: #f8fafc;
          padding: 10px 18px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        }
        .toolbar button {
          background: #10b981;
          color: #ffffff;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
        }
        .toolbar button:hover {
          background: #059669;
        }
        .slip-page {
          width: 210mm;
          min-height: 270mm;
          margin: 14px auto;
          background: #ffffff;
          padding: 13mm;
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12);
          page-break-after: always;
          break-after: page;
        }
        .slip-page:last-child {
          page-break-after: auto;
          break-after: auto;
        }
        @media print {
          body {
            background: #ffffff;
          }
          .toolbar {
            display: none !important;
          }
          .slip-page {
            width: 100%;
            min-height: auto;
            margin: 0;
            padding: 0;
            box-shadow: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="toolbar">
        <div>
          <strong>Pratinjau Dokumen PDF (${rows.length} Halaman Karyawan)</strong>
          <span style="font-size:12px;color:#cbd5e1;margin-left:10px;">Pilih "Save as PDF" / "Simpan sebagai PDF" pada jendela cetak</span>
        </div>
        <button onclick="window.print()">Simpan PDF / Cetak Sekarang</button>
      </div>
      ${pagesHtml}
      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 350);
        };
      </script>
    </body>
    </html>
  `);
  printWin.document.close();
  return true;
}