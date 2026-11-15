import { NextResponse } from "next/server";
import {
  firestoreDeleteDoc,
  firestoreGetDoc,
  firestoreSetDoc,
  type FirestoreValue,
} from "@/lib/firebase-admin";
import { hashPassword } from "@/lib/password";
import { getCurrentUser, type UserRole } from "@/lib/session";
import {
  JOB_TITLES,
  KPI_CATEGORIES,
  type JobTitle,
  type KpiCategory,
} from "@/lib/work-areas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ uid: string }> }
) {
  const currentUser = await getCurrentUser();
  if (
    !currentUser ||
    (currentUser.role !== "admin" && currentUser.role !== "super_admin")
  ) {
    return NextResponse.json(
      { berhasil: false, pesan: "Akses ditolak." },
      { status: 403 }
    );
  }

  try {
    const { uid } = await context.params;
    const doc = await firestoreGetDoc("users", uid);
    if (!doc?.fields) {
      return NextResponse.json(
        { berhasil: false, pesan: "Akun pengguna tidak ditemukan." },
        { status: 404 }
      );
    }

    const f = doc.fields;
    const existingBufn = f.bufn?.stringValue || "BUFN 1";
    const existingRole = (f.role?.stringValue || "safety_officer") as UserRole;

    if (
      currentUser.role === "admin" &&
      (existingBufn !== currentUser.bufn || existingRole === "super_admin")
    ) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: `Anda hanya dapat mengelola akun di wilayah ${currentUser.bufn}.`,
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const updates: Record<string, FirestoreValue> = {};

    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = { stringValue: body.name.trim() };
    }
    if (typeof body.employeeId === "string" && body.employeeId.trim()) {
      updates.employeeId = {
        stringValue: body.employeeId.trim().toUpperCase(),
      };
    }
    if (typeof body.email === "string") {
      updates.email = { stringValue: body.email.trim().toLowerCase() };
    }

    const nextRole: UserRole =
      currentUser.role === "super_admin" &&
      (body.role === "super_admin" ||
        body.role === "admin" ||
        body.role === "safety_officer")
        ? body.role
        : existingRole;

    if (currentUser.role === "super_admin" && body.role) {
      updates.role = { stringValue: nextRole };
    }

    const existingJob = (f.jobTitle?.stringValue ||
      "Safety Officer") as JobTitle;
    const nextJob: JobTitle =
      typeof body.jobTitle === "string" &&
      JOB_TITLES.includes(body.jobTitle as JobTitle)
        ? (body.jobTitle as JobTitle)
        : existingJob;

    if (body.jobTitle) {
      updates.jobTitle = { stringValue: nextJob };
    }

    const existingCat = (f.kpiCategory?.stringValue ||
      "shift_3g2s") as KpiCategory;
    const nextCat: KpiCategory =
      nextJob === "Wakil Supervisor"
        ? "wakil_spv"
        : typeof body.kpiCategory === "string" &&
            KPI_CATEGORIES.includes(body.kpiCategory as KpiCategory) &&
            body.kpiCategory !== "wakil_spv"
          ? (body.kpiCategory as KpiCategory)
          : existingCat === "wakil_spv"
            ? "shift_3g2s"
            : existingCat;

    updates.kpiCategory = { stringValue: nextCat };

    const nextBufn =
      nextRole === "super_admin"
        ? "ALL"
        : currentUser.role === "admin"
          ? currentUser.bufn
          : typeof body.bufn === "string" && body.bufn.trim()
            ? body.bufn.trim()
            : existingBufn;

    const existingSmelter = f.smelter?.stringValue || "-";
    const nextSmelter =
      nextRole === "super_admin" || nextRole === "admin"
        ? "ALL"
        : typeof body.smelter === "string" && body.smelter.trim()
          ? body.smelter.trim()
          : existingSmelter;

    updates.bufn = { stringValue: nextBufn };
    updates.smelter = { stringValue: nextSmelter };

    const unitLabel =
      nextRole === "super_admin"
        ? "Comprehensive HSE"
        : nextRole === "admin"
          ? `${nextBufn} (Semua Smelter)`
          : `${nextBufn} - ${nextSmelter}`;
    updates.unit = { stringValue: unitLabel };

    if (typeof body.isActive === "boolean") {
      updates.isActive = { booleanValue: body.isActive };
    }

    if (typeof body.newPassword === "string" && body.newPassword.trim()) {
      const pw = body.newPassword.trim();
      if (pw.length < 4) {
        return NextResponse.json(
          { berhasil: false, pesan: "Password baru minimal 4 karakter." },
          { status: 400 }
        );
      }
      updates.passwordHash = { stringValue: hashPassword(pw) };
    }

    await firestoreSetDoc("users", uid, updates);

    return NextResponse.json({
      berhasil: true,
      pesan: "Data akun & penempatan lokasi berhasil diperbarui.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          error instanceof Error ? error.message : "Gagal memperbarui akun.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ uid: string }> }
) {
  const currentUser = await getCurrentUser();
  if (
    !currentUser ||
    (currentUser.role !== "admin" && currentUser.role !== "super_admin")
  ) {
    return NextResponse.json(
      { berhasil: false, pesan: "Akses ditolak." },
      { status: 403 }
    );
  }

  try {
    const { uid } = await context.params;
    if (uid === currentUser.uid) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: "Anda tidak dapat menghapus akun Anda sendiri.",
        },
        { status: 400 }
      );
    }

    const doc = await firestoreGetDoc("users", uid);
    if (!doc?.fields) {
      return NextResponse.json(
        { berhasil: false, pesan: "Akun tidak ditemukan." },
        { status: 404 }
      );
    }

    const existingBufn = doc.fields.bufn?.stringValue || "";
    const existingRole = doc.fields.role?.stringValue || "";
    if (
      currentUser.role === "admin" &&
      (existingBufn !== currentUser.bufn || existingRole === "super_admin")
    ) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: `Anda hanya dapat menghapus akun di wilayah ${currentUser.bufn}.`,
        },
        { status: 403 }
      );
    }

    await firestoreDeleteDoc("users", uid);
    return NextResponse.json({
      berhasil: true,
      pesan: "Akun pengguna berhasil dihapus.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          error instanceof Error ? error.message : "Gagal menghapus akun.",
      },
      { status: 500 }
    );
  }
}