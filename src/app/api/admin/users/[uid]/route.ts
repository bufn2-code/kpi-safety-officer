import { NextResponse } from "next/server";
import {
  firestoreGetDoc,
  firestoreSetDoc,
  updateFirebaseAuthAccount,
  type FirestoreValue,
} from "@/lib/firebase-admin";
import { getCurrentUser, type UserRole } from "@/lib/session";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ uid: string }> }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.role !== "admin")) {
    return NextResponse.json(
      { berhasil: false, pesan: "Akses ditolak." },
      { status: 403 }
    );
  }

  try {
    const { uid } = await context.params;
    const targetDoc = await firestoreGetDoc("users", uid);
    if (!targetDoc || !targetDoc.fields) {
      return NextResponse.json(
        { berhasil: false, pesan: "Pengguna tidak ditemukan." },
        { status: 404 }
      );
    }

    const targetRole = (targetDoc.fields.role?.stringValue || "safety_officer") as UserRole;

    // Proteksi hierarki peran:
    // 1. Akun super_admin tidak boleh dinonaktifkan atau diturunkan perannya
    if (targetRole === "super_admin" && currentUser.uid !== uid) {
      return NextResponse.json(
        { berhasil: false, pesan: "Akun Super Admin tidak dapat diubah oleh akun lain." },
        { status: 403 }
      );
    }

    // 2. Admin biasa tidak boleh mengedit akun Admin lain atau Super Admin
    if (currentUser.role === "admin" && targetRole !== "safety_officer") {
      return NextResponse.json(
        { berhasil: false, pesan: "Admin hanya dapat mengelola akun Safety Officer." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const firestoreUpdates: Record<string, FirestoreValue> = {};
    const authUpdates: { password?: string; disabled?: boolean; displayName?: string } = {};

    if (typeof body.name === "string" && body.name.trim()) {
      firestoreUpdates.name = { stringValue: body.name.trim() };
      authUpdates.displayName = body.name.trim();
    }

    if (typeof body.unit === "string" && body.unit.trim()) {
      firestoreUpdates.unit = { stringValue: body.unit.trim() };
    }

    if (
      currentUser.role === "super_admin" &&
      targetRole !== "super_admin" &&
      (body.role === "admin" || body.role === "safety_officer")
    ) {
      firestoreUpdates.role = { stringValue: body.role };
    }

    if (typeof body.isActive === "boolean") {
      if (targetRole === "super_admin" && body.isActive === false) {
        return NextResponse.json(
          { berhasil: false, pesan: "Akun Super Admin tidak dapat dinonaktifkan." },
          { status: 400 }
        );
      }
      firestoreUpdates.isActive = { booleanValue: body.isActive };
      authUpdates.disabled = !body.isActive;
    }

    if (typeof body.newPassword === "string" && body.newPassword.length > 0) {
      if (body.newPassword.length < 6) {
        return NextResponse.json(
          { berhasil: false, pesan: "Password baru minimal 6 karakter." },
          { status: 400 }
        );
      }
      authUpdates.password = body.newPassword;
    }

    if (Object.keys(authUpdates).length > 0) {
      await updateFirebaseAuthAccount(uid, authUpdates);
    }

    if (Object.keys(firestoreUpdates).length > 0) {
      await firestoreSetDoc("users", uid, firestoreUpdates);
    }

    return NextResponse.json({
      berhasil: true,
      pesan: "Data pengguna berhasil diperbarui.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan: error instanceof Error ? error.message : "Gagal memperbarui pengguna.",
      },
      { status: 500 }
    );
  }
}