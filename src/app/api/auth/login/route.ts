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

    const authUser = await verifyEmployeePassword(employeeId, password);

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
    const bufn =
      fields.bufn?.stringValue || (role === "super_admin" ? "ALL" : "BUFN 1");
    const smelter = fields.smelter?.stringValue || "-";
    const unit =
      fields.unit?.stringValue ||
      (bufn === "ALL" ? "Comprehensive HSE" : `${bufn} - ${smelter}`);

    await setSessionCookie({
      uid: authUser.localId,
      employeeId,
      name,
      role,
      bufn,
      smelter,
      unit,
    });

    return NextResponse.json({
      berhasil: true,
      pesan: "Login berhasil!",
      user: { employeeId, name, role, bufn, smelter, unit },
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