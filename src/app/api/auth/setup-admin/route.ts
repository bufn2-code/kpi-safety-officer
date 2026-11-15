import { NextResponse } from "next/server";
import {
  createFirebaseAuthUser,
  firestoreGetDoc,
  firestoreSetDoc,
} from "@/lib/firebase-admin";
import { setSessionCookie } from "@/lib/session";

export async function POST(request: Request) {
  try {
    // Cek apakah Super Admin pertama sudah pernah dibuat
    const initDoc = await firestoreGetDoc("system_config", "init");
    if (initDoc?.fields?.initialized?.booleanValue === true) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: "Akun Super Admin sudah pernah dibuat. Silakan login melalui halaman Login.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const employeeId = String(body.employeeId || "").trim().toUpperCase();
    const name = String(body.name || "").trim();
    const unit = String(body.unit || "Comprehensive HSE").trim();
    const password = String(body.password || "");

    if (!employeeId || !name || password.length < 6) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: "ID Karyawan, Nama Lengkap wajib diisi, dan Password minimal 6 karakter.",
        },
        { status: 400 }
      );
    }

    // 1. Buat akun di Firebase Authentication
    const authUser = await createFirebaseAuthUser(employeeId, password, name);
    const now = new Date().toISOString();

    // 2. Simpan profil lengkap beserta role 'super_admin' di Firestore
    await firestoreSetDoc("users", authUser.localId, {
      uid: { stringValue: authUser.localId },
      employeeId: { stringValue: employeeId },
      name: { stringValue: name },
      role: { stringValue: "super_admin" },
      unit: { stringValue: unit },
      isActive: { booleanValue: true },
      createdAt: { stringValue: now },
    });

    // 3. Tandai sistem sudah diinisialisasi agar halaman setup terkunci
    await firestoreSetDoc("system_config", "init", {
      initialized: { booleanValue: true },
      superAdminUid: { stringValue: authUser.localId },
      initializedAt: { stringValue: now },
    });

    // 4. Langsung pasang cookie sesi login
    await setSessionCookie({
      uid: authUser.localId,
      employeeId,
      name,
      role: "super_admin",
      unit,
    });

    return NextResponse.json({
      berhasil: true,
      pesan: "Akun Super Admin berhasil dibuat!",
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan: error instanceof Error ? error.message : "Terjadi kesalahan pada server.",
      },
      { status: 500 }
    );
  }
}