import { NextResponse } from "next/server";
import { firestoreGetDoc, verifyEmployeePassword } from "@/lib/firebase-admin";
import { setSessionCookie, type UserRole } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const employeeId = String(body.employeeId || "").trim().toUpperCase();
    const password = String(body.password || "");

    if (!employeeId || !password) {
      return NextResponse.json(
        { berhasil: false, pesan: "ID Karyawan dan Password wajib diisi." },
        { status: 400 }
      );
    }

    // 1. Verifikasi ID Karyawan & Password ke Firebase Auth
    const authUser = await verifyEmployeePassword(employeeId, password);

    // 2. Ambil data profil & role dari Firestore
    const userDoc = await firestoreGetDoc("users", authUser.localId);
    if (!userDoc || !userDoc.fields) {
      return NextResponse.json(
        { berhasil: false, pesan: "Profil pengguna tidak ditemukan di database." },
        { status: 404 }
      );
    }

    const fields = userDoc.fields;
    const isActive = fields.isActive?.booleanValue ?? true;
    if (!isActive) {
      return NextResponse.json(
        { berhasil: false, pesan: "Akun Anda dinonaktifkan. Hubungi Admin HSE." },
        { status: 403 }
      );
    }

    const name = fields.name?.stringValue || employeeId;
    const role = (fields.role?.stringValue || "safety_officer") as UserRole;
    const unit = fields.unit?.stringValue || "-";

    // 3. Simpan tiket sesi login ke cookie browser
    await setSessionCookie({
      uid: authUser.localId,
      employeeId,
      name,
      role,
      unit,
    });

    return NextResponse.json({
      berhasil: true,
      pesan: "Login berhasil!",
      user: { employeeId, name, role, unit },
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan: error instanceof Error ? error.message : "ID Karyawan atau Password salah.",
      },
      { status: 401 }
    );
  }
}