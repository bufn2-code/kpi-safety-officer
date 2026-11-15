import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getCurrentUser } from "@/lib/session";
import { buildFullKpiRecap } from "@/lib/kpi-recap";
import {
  renderSinglePersonSlipHtml,
  type PdfExportMode,
} from "@/lib/pdf-slip-generator";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          "Hanya Super Admin atau Admin BUFN yang dapat mengirim slip KPI via email.",
      },
      { status: 403 }
    );
  }

  const smtpHost = process.env.SMTP_HOST || "";
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER || "";
  const smtpPass = process.env.SMTP_PASS || "";
  const smtpFrom =
    process.env.SMTP_FROM || `"Comprehensive HSE PT IWIP" <${smtpUser}>`;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          "Konfigurasi SMTP Email belum diatur di server (.env.local / Vercel Environment Variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).",
      },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const period = String(body.period || "").trim();
    const mode: PdfExportMode =
      body.mode === "yearly_report" ? "yearly_report" : "monthly_slip";
    const targetUids: string[] = Array.isArray(body.uids)
      ? body.uids.map((id: unknown) => String(id).trim()).filter(Boolean)
      : [];

    if (!/^\d{4}-\d{2}$/.test(period) || targetUids.length === 0) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: "Periode atau daftar penerima email tidak valid.",
        },
        { status: 400 }
      );
    }

    const recap = await buildFullKpiRecap({
      period,
      restrictBufn: user.role === "admin" ? user.bufn : undefined,
    });

    const recipients = recap.rows.filter((r) => targetUids.includes(r.uid));
    if (recipients.length === 0) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: "Tidak ada data karyawan yang ditemukan untuk dikirim.",
        },
        { status: 404 }
      );
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    let sentCount = 0;
    const skippedNoEmail: string[] = [];
    const failedList: string[] = [];

    for (const person of recipients) {
      if (!person.email || !person.email.includes("@")) {
        skippedNoEmail.push(`${person.name} (${person.employeeId})`);
        continue;
      }

      const slipHtml = renderSinglePersonSlipHtml(
        person,
        mode,
        `${person.bufn} • ${person.smelter}`
      );

      const emailHtml = `
        <!DOCTYPE html>
        <html lang="id">
        <head><meta charset="UTF-8" /></head>
        <body style="margin:0;padding:18px;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
          <div style="max-width:780px;margin:0 auto 12px;font-size:13px;color:#334155;">
            Yth. <strong>${person.name}</strong> (${person.employeeId}),<br/>
            Berikut adalah ${
              mode === "yearly_report"
                ? `Laporan Evaluasi KPI Tahunan (${person.year})`
                : `Slip Hasil Penilaian Kinerja (KPI HSE) periode ${person.period}`
            } Anda dari Departemen Comprehensive HSE PT IWIP.
          </div>
          <div style="max-width:780px;margin:0 auto;background:#ffffff;padding:20px;border:1px solid #cbd5e1;border-radius:8px;">
            ${slipHtml}
          </div>
        </body>
        </html>
      `;

      const subject =
        mode === "yearly_report"
          ? `[KPI HSE PT IWIP] Laporan Evaluasi KPI Tahunan ${person.year} - ${person.name} (${person.employeeId})`
          : `[KPI HSE PT IWIP] Slip Penilaian KPI Periode ${person.period} - ${person.name} (${person.employeeId})`;

      try {
        await transporter.sendMail({
          from: smtpFrom,
          to: person.email,
          subject,
          html: emailHtml,
        });
        sentCount++;
      } catch {
        failedList.push(`${person.name} (${person.email})`);
      }
    }

    const details: string[] = [`Berhasil terkirim ke ${sentCount} email karyawan.`];
    if (skippedNoEmail.length > 0) {
      details.push(
        `Dilewati (belum ada alamat email): ${skippedNoEmail.join(", ")}.`
      );
    }
    if (failedList.length > 0) {
      details.push(`Gagal terkirim ke: ${failedList.join(", ")}.`);
    }

    return NextResponse.json({
      berhasil: sentCount > 0,
      pesan: details.join(" "),
      sentCount,
      skippedCount: skippedNoEmail.length,
      failedCount: failedList.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat mengirim email slip KPI.",
      },
      { status: 500 }
    );
  }
}