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

function renderSinglePersonSlipHtml(
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

  const historyColsHeader = row.yearlyHistory
    .map(
      (h) =>
        `<th style="border:1px solid #cbd5e1;padding:5px 4px;text-align:center;font-size:10px;background:#f1f5f9;color:#334155;">${escapeHtml(h.label)}</th>`
    )
    .join("");

  const historyColsScore = row.yearlyHistory
    .map((h) => {
      const isCurrent = !isYearly && h.period === row.period;
      const bg = isCurrent ? "background:#eff6ff;font-weight:700;" : "";
      const val = h.hasData ? `${h.totalScore}%` : "-";
      return `<td style="border:1px solid #cbd5e1;padding:5px 4px;text-align:center;font-size:10px;${bg}">${val}</td>`;
    })
    .join("");

  const historyColsGrade = row.yearlyHistory
    .map((h) => {
      const isCurrent = !isYearly && h.period === row.period;
      const bg = isCurrent ? "background:#eff6ff;font-weight:700;" : "";
      const val = h.hasData ? escapeHtml(h.gradeLetter) : "-";
      return `<td style="border:1px solid #cbd5e1;padding:4px;text-align:center;font-size:10px;color:#475569;${bg}">${val}</td>`;
    })
    .join("");

  // Rincian Indikator (untuk Slip Bulanan)
  const entriesTableHtml =
    !isYearly && row.entries.length > 0
      ? `
      <div style="margin-top:14px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#1e293b;margin-bottom:6px;">
          Rincian Penilaian Indikator KPI (${escapeHtml(row.period)})
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:10.5px;">
          <thead>
            <tr style="background:#f8fafc;color:#334155;">
              <th style="border:1px solid #cbd5e1;padding:6px;text-align:left;width:68px;">Kode</th>
              <th style="border:1px solid #cbd5e1;padding:6px;text-align:left;">Indikator Kinerja</th>
              <th style="border:1px solid #cbd5e1;padding:6px;text-align:center;width:78px;">Target</th>
              <th style="border:1px solid #cbd5e1;padding:6px;text-align:center;width:78px;">Realisasi</th>
              <th style="border:1px solid #cbd5e1;padding:6px;text-align:center;width:62px;">Bobot</th>
              <th style="border:1px solid #cbd5e1;padding:6px;text-align:right;width:68px;">Skor</th>
            </tr>
          </thead>
          <tbody>
            ${row.entries
              .map((item) => {
                const isBonus = item.formulaType === "bonus_point";
                const targetStr =
                  item.formulaType === "yes_no"
                    ? "Wajib (Ya)"
                    : item.formulaType === "direct_percentage"
                      ? "100%"
                      : isBonus
                        ? `+${item.target}/${item.unit}`
                        : `${item.target} ${item.unit}`;
                const actualStr =
                  item.formulaType === "yes_no"
                    ? item.actual >= 1
                      ? "Tercapai"
                      : "Tidak"
                    : item.formulaType === "direct_percentage"
                      ? `${item.actual}%`
                      : `${item.actual} ${item.unit}`;
                const weightStr = isBonus
                  ? `Maks +${item.weight}`
                  : `${item.weight}%`;
                const scoreStr = isBonus
                  ? `+${item.score}`
                  : `${item.score}%`;

                return `
                  <tr>
                    <td style="border:1px solid #cbd5e1;padding:5px 6px;font-family:monospace;font-weight:600;">${escapeHtml(item.code)}</td>
                    <td style="border:1px solid #cbd5e1;padding:5px 6px;">
                      <div style="font-weight:600;color:#0f172a;">${escapeHtml(item.name)}</div>
                      <div style="font-size:9px;color:#64748b;">${escapeHtml(FORMULA_LABELS[item.formulaType || "higher_better"])}${item.notes ? ` • Catatan: ${escapeHtml(item.notes)}` : ""}</div>
                    </td>
                    <td style="border:1px solid #cbd5e1;padding:5px 6px;text-align:center;">${escapeHtml(targetStr)}</td>
                    <td style="border:1px solid #cbd5e1;padding:5px 6px;text-align:center;font-weight:600;">${escapeHtml(actualStr)}</td>
                    <td style="border:1px solid #cbd5e1;padding:5px 6px;text-align:center;">${escapeHtml(weightStr)}</td>
                    <td style="border:1px solid #cbd5e1;padding:5px 6px;text-align:right;font-weight:700;color:#0f172a;">${escapeHtml(scoreStr)}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `
      : !isYearly
        ? `<div style="margin-top:14px;padding:10px;border:1px dashed #cbd5e1;border-radius:6px;font-size:11px;color:#64748b;text-align:center;">Belum ada rincian indikator bulanan yang diinput untuk periode ${escapeHtml(row.period)}.</div>`
        : "";

  // Rincian Komposisi Khusus Wakil Supervisor
  const spvSectionHtml =
    !isYearly && isWakilSpv && row.supervisorBreakdown
      ? `
      <div style="margin-top:12px;border:1px solid #cbd5e1;border-radius:6px;padding:10px;background:#f8fafc;">
        <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;color:#1e293b;margin-bottom:6px;">
          Komposisi Nilai Wakil Supervisor (${row.supervisorBreakdown.personalWeightPct}% Pribadi + ${row.supervisorBreakdown.teamWeightPct}% Tim ${escapeHtml(row.smelter)})
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:10px;">
          <tr>
            <td style="padding:3px 0;color:#475569;">1. Skor Indikator Pribadi (${row.supervisorBreakdown.personalWeightPct}%):</td>
            <td style="padding:3px 0;text-align:right;font-weight:700;">${row.supervisorBreakdown.personalWeightedScore} poin (dari skor ${row.supervisorBreakdown.personalRawScore}%)</td>
          </tr>
          <tr>
            <td style="padding:3px 0;color:#475569;">2. Porsi Kinerja Tim Area (${row.supervisorBreakdown.teamWeightPct}% — ${row.supervisorBreakdown.teamCalcMode === "option_a" ? "Opsi A" : "Opsi B"}):</td>
            <td style="padding:3px 0;text-align:right;font-weight:700;">${row.supervisorBreakdown.teamWeightedScore} poin (Awal ${row.supervisorBreakdown.baseTeamPoints} − Penalti ${row.supervisorBreakdown.totalPenalty} dari ${row.supervisorBreakdown.failedMembersCount} anggota gagal)</td>
          </tr>
          <tr style="border-top:1px solid #cbd5e1;">
            <td style="padding:4px 0 0;font-weight:700;color:#0f172a;">Total Nilai Gabungan Wakil Supervisor:</td>
            <td style="padding:4px 0 0;text-align:right;font-weight:800;font-size:11px;color:#0f172a;">${row.totalScore}%</td>
          </tr>
        </table>
      </div>
    `
      : "";

  // Ringkasan Evaluasi Tahunan (untuk Rapor Tahunan)
  const yearlySummaryHtml = isYearly
    ? `
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

  return `
    <section class="slip-page">
      <!-- Header Korporat -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:10px;">
        <div>
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#475569;">
            PT INDONESIA WEDA BAY INDUSTRIAL PARK (PT IWIP)
          </div>
          <div style="font-size:16px;font-weight:800;color:#0f172a;margin-top:2px;">
            ${isYearly ? `LAPORAN EVALUASI KPI TAHUNAN (${escapeHtml(row.year)})` : "SLIP HASIL PENILAIAN KINERJA (KPI HSE)"}
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
            <td style="padding:2.5px 0;font-weight:600;color:#0f172a;">: ${escapeHtml(row.bufn)} — ${escapeHtml(row.smelter)}</td>
          </tr>
        </table>

        <div style="display:flex;align-items:center;gap:10px;border-left:1px solid #e2e8f0;padding-left:14px;">
          <div style="text-align:right;">
            <div style="font-size:9.5px;text-transform:uppercase;color:#64748b;">
              ${isYearly ? "Rata-rata Tahunan" : "Skor Akhir KPI"}
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

      <!-- Tabel Histori Nilai 1 Tahun Berjalan (Jan - Des) -->
      <div style="margin-top:14px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#1e293b;margin-bottom:5px;">
          Rekam Jejak Nilai KPI Tahun ${escapeHtml(row.year)} (Januari – Desember)
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="border:1px solid #cbd5e1;padding:5px 6px;text-align:left;font-size:10px;background:#f1f5f9;color:#334155;width:62px;">Bulan</th>
              ${historyColsHeader}
              <th style="border:1px solid #cbd5e1;padding:5px 6px;text-align:center;font-size:10px;background:#e2e8f0;color:#0f172a;width:62px;">Rata2</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border:1px solid #cbd5e1;padding:5px 6px;font-size:10px;font-weight:700;background:#f8fafc;">Skor</td>
              ${historyColsScore}
              <td style="border:1px solid #cbd5e1;padding:5px 6px;text-align:center;font-size:10px;font-weight:800;background:#f1f5f9;">${row.assessedMonthsCount > 0 ? `${row.yearlyAverageScore}%` : "-"}</td>
            </tr>
            <tr>
              <td style="border:1px solid #cbd5e1;padding:4px 6px;font-size:10px;font-weight:600;background:#f8fafc;color:#475569;">Grade</td>
              ${historyColsGrade}
              <td style="border:1px solid #cbd5e1;padding:4px 6px;text-align:center;font-size:10px;font-weight:700;background:#f1f5f9;">${row.assessedMonthsCount > 0 ? escapeHtml(row.yearlyGrade.grade) : "-"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      ${entriesTableHtml}
      ${spvSectionHtml}
      ${yearlySummaryHtml}

      <!-- Catatan Evaluasi & Tanda Tangan -->
      <div style="margin-top:14px;display:flex;justify-content:space-between;gap:16px;align-items:flex-end;">
        <div style="flex:1;border:1px solid #cbd5e1;border-radius:6px;padding:8px 10px;min-height:54px;background:#f8fafc;">
          <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;color:#475569;">Catatan Evaluasi Admin / Supervisor:</div>
          <div style="font-size:10.5px;color:#1e293b;margin-top:3px;">
            ${escapeHtml(row.adminFeedback || "Pertahankan kedisiplinan pelaksanaan standar K3 dan pelaporan tepat waktu.")}
          </div>
          ${
            row.gateTriggered
              ? `<div style="font-size:9.5px;color:#b45309;font-weight:600;margin-top:4px;">* Catatan Sistem: Predikat tertahan di Grade ${escapeHtml(row.grade.grade)} karena indikator wajib (${escapeHtml(row.failedCoreCodes.join(", "))}) belum tercapai.</div>`
              : ""
          }
        </div>

        <div style="width:190px;text-align:center;font-size:10px;color:#334155;">
          <div>Diverifikasi Oleh,</div>
          <div style="height:36px;"></div>
          <div style="border-top:1px solid #64748b;padding-top:3px;font-weight:700;color:#0f172a;">
            ${escapeHtml(row.assessedBy || "Comprehensive HSE Dept.")}
          </div>
        </div>
      </div>

      <div style="margin-top:10px;border-top:1px dashed #cbd5e1;padding-top:5px;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8;">
        <span>Dokumen Rahasia Internal • Slip Evaluasi KPI HSE PT IWIP</span>
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

  const printWin = window.open("", "_blank", "width=960,height=800");
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
          padding: 14mm;
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