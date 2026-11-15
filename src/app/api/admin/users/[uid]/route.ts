import { NextResponse } from "next/server";
import {
  firestoreGetDoc,
  firestoreSetDoc,
  updateFirebaseAuthAccount,
  type FirestoreValue,
} from "@/lib/firebase-admin";
import { getCurrentUser, type UserRole } from "@/lib/session";
import { getWorkAreas, isValidSmelterInBufn } from "@/lib/work-areas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ uid: string }> }
) {
  const currentUser = await getCurrentUser();
  if (
    !currentUser ||
    (currentUser.role !== "super_admin" && currentUser.role !== "admin")
  ) {
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

    const f = targetDoc.fields;
    const targetRole = (f.role?.stringValue || "safety_officer") as UserRole;
    const currentTargetBufn = f.bufn?.stringValue || "BUFN 1";
    const currentTargetSmelter = f.smelter?.stringValue || "-";

    if (targetRole === "super_admin") {
      return NextResponse.json(
        { berhasil: false, pesan: "Akun Super Admin tidak dapat diubah dari menu ini." },
        { status: 403 }
      );
    }

    // Isolasi ketat Admin BUFN: hanya boleh mengelola Safety Officer di BUFN-nya sendiri
    if (currentUser.role === "admin") {
      if (targetRole !== "safety_officer") {
        return NextResponse.json(
          { berhasil: false, pesan: "Admin BUFN hanya dapat mengelola akun Safety Officer." },
          { status: 403 }
        );
      }
      if (currentTargetBufn !== currentUser.bufn) {
        return NextResponse.json(
          {
            berhasil: false,
            pesan: `Anda hanya memiliki wewenang untuk anggota di ${currentUser.bufn}.`,
          },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const firestoreUpdates: Record<string, FirestoreValue> = {};
    const authUpdates: {
      password?: string;
      disabled?: boolean;
      displayName?: string;
    } = {};

    if (typeof body.name === "string" && body.name.trim()) {
      firestoreUpdates.name = { stringValue: body.name.trim() };
      authUpdates.displayName = body.name.trim();
    }

    const nextRole: UserRole =
      currentUser.role === "super_admin" &&
      (body.role === "admin" || body.role === "safety_officer")
        ? body.role
        : targetRole;

    if (currentUser.role === "super_admin" && body.role) {
      firestoreUpdates.role = { stringValue: nextRole };
    }

    // Pembaruan lokasi BUFN & Smelter
    const requestedBufn =
      typeof body.bufn === "string" && body.bufn.trim()
        ? body.bufn.trim()
        : currentTargetBufn;
    const requestedSmelter =
      typeof body.smelter === "string" && body.smelter.trim()
        ? body.smelter.trim()
        : currentTargetSmelter;

    if (body.bufn !== undefined || body.smelter !== undefined) {
      // Admin BUFN tidak boleh memindahkan anggota ke luar BUFN-nya
      const effectiveBufn =
        currentUser.role === "admin" ? currentUser.bufn : requestedBufn;

      const areas = await getWorkAreas();
      const bufnObj = areas.find((a) => a.name === effectiveBufn);
      if (!bufnObj) {
        return NextResponse.json(
          { berhasil: false, pesan: "Wilayah BUFN tidak valid." },
          { status: 400 }
        );
      }

      if (
        nextRole === "safety_officer" &&
        !isValidSmelterInBufn(areas, effectiveBufn, requestedSmelter)
      ) {
        return NextResponse.json(
          {
            berhasil: false,
            pesan: `Smelter "${requestedSmelter}" tidak berada di dalam ${effectiveBufn}.`,
          },
          { status: 400 }
        );
      }

      const finalSmelter =
        nextRole === "admin" && !requestedSmelter
          ? "Semua Smelter BUFN"
          : requestedSmelter;

      firestoreUpdates.bufn = { stringValue: effectiveBufn };
      firestoreUpdates.smelter = { stringValue: finalSmelter };
      firestoreUpdates.unit = {
        stringValue: `${effectiveBufn} - ${finalSmelter}`,
      };
    }

    if (typeof body.isActive === "boolean") {
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
        pesan:
          error instanceof Error
            ? error.message
            : "Gagal memperbarui pengguna.",
      },
      { status: 500 }
    );
  }
}