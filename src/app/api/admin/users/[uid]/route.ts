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
    const existingDoc = await firestoreGetDoc("users", uid);
    if (!existingDoc?.fields) {
      return NextResponse.json(
        { berhasil: false, pesan: "Pengguna tidak ditemukan." },
        { status: 404 }
      );
    }

    const existingFields = existingDoc.fields;
    const targetRole = (existingFields.role?.stringValue ||
      "safety_officer") as UserRole;
    const targetBufn = existingFields.bufn?.stringValue || "BUFN 1";

    if (currentUser.role === "admin") {
      if (targetRole !== "safety_officer" || targetBufn !== currentUser.bufn) {
        return NextResponse.json(
          {
            berhasil: false,
            pesan: `Anda hanya dapat mengelola anggota di wilayah ${currentUser.bufn}.`,
          },
          { status: 403 }
        );
      }
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

    let nextRole = targetRole;
    if (
      currentUser.role === "super_admin" &&
      (body.role === "safety_officer" ||
        body.role === "admin" ||
        body.role === "super_admin")
    ) {
      nextRole = body.role;
      updates.role = { stringValue: nextRole };
    }

    const currentJob = (existingFields.jobTitle?.stringValue ||
      "Safety Officer") as JobTitle;
    const nextJob: JobTitle =
      typeof body.jobTitle === "string" &&
      JOB_TITLES.includes(body.jobTitle as JobTitle)
        ? (body.jobTitle as JobTitle)
        : currentJob;
    updates.jobTitle = { stringValue: nextJob };

    const currentCat = (existingFields.kpiCategory?.stringValue ||
      "shift_3g2s") as KpiCategory;
    let nextCat: KpiCategory =
      typeof body.kpiCategory === "string" &&
      KPI_CATEGORIES.includes(body.kpiCategory as KpiCategory)
        ? (body.kpiCategory as KpiCategory)
        : currentCat;

    if (nextJob === "Wakil Supervisor") {
      nextCat = "wakil_spv";
    } else if (nextCat === "wakil_spv") {
      nextCat = "shift_3g2s";
    }
    updates.kpiCategory = { stringValue: nextCat };

    let nextBufn = targetBufn;
    if (
      currentUser.role === "super_admin" &&
      typeof body.bufn === "string" &&
      body.bufn.trim()
    ) {
      nextBufn = body.bufn.trim();
    } else if (currentUser.role === "admin") {
      nextBufn = currentUser.bufn;
    }

    let nextSmelter = existingFields.smelter?.stringValue || "-";
    if (typeof body.smelter === "string" && body.smelter.trim()) {
      nextSmelter = body.smelter.trim();
    }

    if (nextRole === "super_admin") {
      nextBufn = "ALL";
      nextSmelter = "ALL";
    } else if (nextRole === "admin") {
      nextSmelter = "ALL";
    }

    updates.bufn = { stringValue: nextBufn };
    updates.smelter = { stringValue: nextSmelter };
    updates.unit = {
      stringValue:
        nextRole === "super_admin"
          ? "Comprehensive HSE"
          : nextRole === "admin"
            ? `Admin ${nextBufn}`
            : `${nextBufn} - ${nextSmelter}`,
    };

    if (typeof body.isActive === "boolean") {
      updates.isActive = { booleanValue: body.isActive };
    }
    if (typeof body.newPassword === "string" && body.newPassword.trim()) {
      if (body.newPassword.trim().length < 4) {
        return NextResponse.json(
          { berhasil: false, pesan: "Password baru minimal 4 karakter." },
          { status: 400 }
        );
      }
      updates.passwordHash = {
        stringValue: hashPassword(body.newPassword.trim()),
      };
    }

    if (Object.keys(updates).length > 0) {
      await firestoreSetDoc("users", uid, updates);
    }

    return NextResponse.json({
      berhasil: true,
      pesan: "Data personel berhasil diperbarui.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          error instanceof Error
            ? error.message
            : "Gagal memperbarui data pengguna.",
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

    const existingDoc = await firestoreGetDoc("users", uid);
    if (!existingDoc?.fields) {
      return NextResponse.json(
        { berhasil: false, pesan: "Pengguna tidak ditemukan." },
        { status: 404 }
      );
    }

    if (currentUser.role === "admin") {
      const targetRole = existingDoc.fields.role?.stringValue || "";
      const targetBufn = existingDoc.fields.bufn?.stringValue || "";
      if (targetRole !== "safety_officer" || targetBufn !== currentUser.bufn) {
        return NextResponse.json(
          {
            berhasil: false,
            pesan: `Anda hanya dapat menghapus anggota di wilayah ${currentUser.bufn}.`,
          },
          { status: 403 }
        );
      }
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
          error instanceof Error
            ? error.message
            : "Gagal menghapus pengguna.",
      },
      { status: 500 }
    );
  }
}