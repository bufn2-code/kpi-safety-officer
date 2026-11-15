import { NextResponse } from "next/server";
import {
  createFirebaseAuthUser,
  firestoreGetDoc,
  firestoreSetDoc,
} from "@/lib/firebase-admin";
import { setSessionCookie } from "@/lib/session";
import { DEFAULT_WORK_AREAS, saveWorkAreas } from "@/lib/work-areas";

export async function POST(request: Request) {
  try {
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

    const authUser = await createFirebaseAuthUser(employeeId, password, name);
    const now = new Date().toISOString();

    await firestoreSetDoc("users", authUser.localId, {
      uid: { stringValue: authUser.localId },
      employeeId: { stringValue: employeeId },
      name: { stringValue: name },
      role: { stringValue: "super_admin" },
      bufn: { stringValue: "ALL" },
      smelter: { stringValue: "Semua Area" },
      unit: { stringValue: unit },
      isActive: { booleanValue: true },
      createdAt: { stringValue: now },
    });

    await saveWorkAreas(DEFAULT_WORK_AREAS);

    await firestoreSetDoc("system_config", "init", {
      initialized: { booleanValue: true },
      superAdminUid: { stringValue: authUser.localId },
      initializedAt: { stringValue: now },
    });

    await setSessionCookie({
      uid: authUser.localId,
      employeeId,
      name,
      role: "super_admin",
      bufn: "ALL",
      smelter: "Semua Area",
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