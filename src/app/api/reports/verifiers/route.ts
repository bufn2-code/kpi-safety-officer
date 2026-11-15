import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { firestoreGetDoc } from "@/lib/firebase-admin";
import { getCurrentUser } from "@/lib/session";
import {
  getAreaVerifiers,
  saveAreaVerifiers,
  saveYearlySpvNote,
  type AreaVerifierConfig,
} from "@/lib/verifiers";
import { JOB_TITLES, type JobTitle } from "@/lib/work-areas";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { berhasil: false, pesan: "Sesi tidak valid." },
      { status: 401 }
    );
  }

  const verifiers = await getAreaVerifiers();
  return NextResponse.json({ berhasil: true, verifiers });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { berhasil: false, pesan: "Sesi tidak valid." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const action = String(body.action || "").trim();

    // Cek jabatan user jika bukan admin/super_admin (misal Wakil Supervisor mengisi catatan tahunan)
    const meDoc = await firestoreGetDoc("users", user.uid);
    const rawJob = meDoc?.fields?.jobTitle?.stringValue as JobTitle;
    const jobTitle: JobTitle = JOB_TITLES.includes(rawJob)
      ? rawJob
      : "Safety Officer";
    const isWakilSpv = jobTitle === "Wakil Supervisor";

    // Aksi 1: Simpan Catatan Evaluasi Tahunan SPV untuk Karyawan
    if (action === "save_yearly_note") {
      if (
        user.role !== "super_admin" &&
        user.role !== "admin" &&
        !isWakilSpv
      ) {
        return NextResponse.json(
          {
            berhasil: false,
            pesan: "Anda tidak memiliki akses mengisi catatan evaluasi tahunan.",
          },
          { status: 403 }
        );
      }

      const year = String(body.year || "").trim();
      const targetUid = String(body.uid || "").trim();
      const note = String(body.note || "").trim();

      if (!/^\d{4}$/.test(year) || !targetUid) {
        return NextResponse.json(
          { berhasil: false, pesan: "Tahun dan karyawan wajib dipilih." },
          { status: 400 }
        );
      }

      await saveYearlySpvNote(year, targetUid, note, user.name);
      return NextResponse.json({
        berhasil: true,
        pesan: `Catatan evaluasi tahunan ${year} berhasil disimpan.`,
      });
    }

    // Aksi 2: Tambah / Update Pejabat Verifikator & TTD Digital
    if (action === "upsert_verifier") {
      if (
        user.role !== "super_admin" &&
        user.role !== "admin" &&
        !isWakilSpv
      ) {
        return NextResponse.json(
          { berhasil: false, pesan: "Akses ditolak." },
          { status: 403 }
        );
      }

      const verifierName = String(body.verifierName || "").trim();
      const verifierTitle = String(body.verifierTitle || "").trim();
      const signatureDataUrl = String(body.signatureDataUrl || "").trim();

      if (!verifierName) {
        return NextResponse.json(
          { berhasil: false, pesan: "Nama pejabat verifikator wajib diisi." },
          { status: 400 }
        );
      }

      // Batasi ukuran gambar tanda tangan (maks ~350KB base64 agar dokumen Firestore tetap ringan)
      if (signatureDataUrl && signatureDataUrl.length > 450_000) {
        return NextResponse.json(
          {
            berhasil: false,
            pesan:
              "Ukuran file tanda tangan terlalu besar. Gunakan gambar PNG/JPG di bawah 300 KB.",
          },
          { status: 400 }
        );
      }

      let scopeType: "global" | "bufn" | "smelter" = "bufn";
      let bufn = user.bufn;
      let smelter = "ALL";

      if (user.role === "super_admin") {
        const reqScope = String(body.scopeType || "bufn");
        scopeType =
          reqScope === "global" || reqScope === "smelter" ? reqScope : "bufn";
        bufn =
          scopeType === "global"
            ? "ALL"
            : String(body.bufn || "BUFN 1").trim();
        smelter =
          scopeType === "smelter" ? String(body.smelter || "").trim() : "ALL";
      } else if (user.role === "admin") {
        const reqScope = String(body.scopeType || "bufn");
        scopeType = reqScope === "smelter" ? "smelter" : "bufn";
        bufn = user.bufn;
        smelter =
          scopeType === "smelter" ? String(body.smelter || "").trim() : "ALL";
      } else {
        // Wakil Supervisor hanya bisa mengatur verifikator untuk Smelter-nya sendiri
        scopeType = "smelter";
        bufn = user.bufn;
        smelter = user.smelter;
      }

      const list = await getAreaVerifiers();
      const existingIdx = list.findIndex(
        (v) =>
          v.scopeType === scopeType &&
          v.bufn.toLowerCase() === bufn.toLowerCase() &&
          v.smelter.toLowerCase() === smelter.toLowerCase()
      );

      const newItem: AreaVerifierConfig = {
        id:
          existingIdx >= 0
            ? list[existingIdx].id
            : `ver_${crypto.randomUUID().slice(0, 8)}`,
        scopeType,
        bufn,
        smelter,
        verifierName,
        verifierTitle: verifierTitle || "Supervisor HSE",
        signatureDataUrl:
          signatureDataUrl ||
          (existingIdx >= 0 ? list[existingIdx].signatureDataUrl : ""),
        updatedAt: new Date().toISOString(),
      };

      const nextList =
        existingIdx >= 0
          ? list.map((item, idx) => (idx === existingIdx ? newItem : item))
          : [...list, newItem];

      await saveAreaVerifiers(nextList);

      return NextResponse.json({
        berhasil: true,
        pesan: `Pejabat verifikator "${verifierName}" berhasil disimpan.`,
        verifiers: nextList,
      });
    }

    // Aksi 3: Hapus Pejabat Verifikator
    if (action === "delete_verifier") {
      if (
        user.role !== "super_admin" &&
        user.role !== "admin" &&
        !isWakilSpv
      ) {
        return NextResponse.json(
          { berhasil: false, pesan: "Akses ditolak." },
          { status: 403 }
        );
      }

      const id = String(body.id || "").trim();
      const list = await getAreaVerifiers();
      const target = list.find((v) => v.id === id);
      if (!target) {
        return NextResponse.json(
          { berhasil: false, pesan: "Data verifikator tidak ditemukan." },
          { status: 404 }
        );
      }

      if (user.role === "admin" && target.bufn !== user.bufn) {
        return NextResponse.json(
          { berhasil: false, pesan: "Akses ditolak untuk wilayah lain." },
          { status: 403 }
        );
      }
      if (
        isWakilSpv &&
        user.role !== "admin" &&
        user.role !== "super_admin" &&
        (target.bufn !== user.bufn || target.smelter !== user.smelter)
      ) {
        return NextResponse.json(
          { berhasil: false, pesan: "Akses ditolak untuk smelter lain." },
          { status: 403 }
        );
      }

      const nextList = list.filter((v) => v.id !== id);
      await saveAreaVerifiers(nextList);

      return NextResponse.json({
        berhasil: true,
        pesan: "Konfigurasi pejabat verifikator berhasil dihapus.",
        verifiers: nextList,
      });
    }

    return NextResponse.json(
      { berhasil: false, pesan: "Aksi tidak dikenali." },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          error instanceof Error
            ? error.message
            : "Gagal memproses pengaturan verifikator.",
      },
      { status: 500 }
    );
  }
}