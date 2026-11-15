import { NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  firestoreListCollection,
  firestoreSetDoc,
} from "@/lib/firebase-admin";
import { hashPassword } from "@/lib/password";
import { getCurrentUser, type UserRole } from "@/lib/session";
import {
  JOB_TITLES,
  KPI_CATEGORIES,
  type JobTitle,
  type KpiCategory,
} from "@/lib/work-areas";

export interface ManagedUser {
  uid: string;
  employeeId: string;
  name: string;
  role: UserRole;
  jobTitle: JobTitle;
  kpiCategory: KpiCategory;
  bufn: string;
  smelter: string;
  unit: string;
  isActive: boolean;
}

export async function GET() {
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
    const docs = await firestoreListCollection("users");
    const allUsers: ManagedUser[] = docs.map(
      (doc: {
        name?: string;
        fields?: Record<
          string,
          { stringValue?: string; booleanValue?: boolean }
        >;
      }) => {
        const f = doc.fields || {};
        const fallbackUid = doc.name?.split("/").pop() || "";
        const role = (f.role?.stringValue || "safety_officer") as UserRole;
        const bufn =
          f.bufn?.stringValue || (role === "super_admin" ? "ALL" : "BUFN 1");
        const smelter = f.smelter?.stringValue || "-";

        const rawJob = f.jobTitle?.stringValue as JobTitle;
        const jobTitle: JobTitle = JOB_TITLES.includes(rawJob)
          ? rawJob
          : "Safety Officer";

        const rawCat = f.kpiCategory?.stringValue as KpiCategory;
        const kpiCategory: KpiCategory =
          jobTitle === "Wakil Supervisor"
            ? "wakil_spv"
            : KPI_CATEGORIES.includes(rawCat)
              ? rawCat
              : "shift_3g2s";

        return {
          uid: f.uid?.stringValue || fallbackUid,
          employeeId: f.employeeId?.stringValue || "",
          name: f.name?.stringValue || "",
          role,
          jobTitle,
          kpiCategory,
          bufn,
          smelter,
          unit:
            f.unit?.stringValue ||
            (bufn === "ALL" ? "Comprehensive HSE" : `${bufn} - ${smelter}`),
          isActive: f.isActive?.booleanValue ?? true,
        };
      }
    );

    const visibleUsers =
      currentUser.role === "super_admin"
        ? allUsers
        : allUsers.filter(
            (u) => u.role === "safety_officer" && u.bufn === currentUser.bufn
          );

    visibleUsers.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ berhasil: true, users: visibleUsers });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          error instanceof Error
            ? error.message
            : "Gagal memuat daftar pengguna.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
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
    const body = await request.json();
    const employeeId = String(body.employeeId || "").trim().toUpperCase();
    const name = String(body.name || "").trim();
    const password = String(body.password || "").trim();

    const requestedRole = String(body.role || "safety_officer") as UserRole;
    const role: UserRole =
      currentUser.role === "super_admin" &&
      (requestedRole === "admin" ||
        requestedRole === "super_admin" ||
        requestedRole === "safety_officer")
        ? requestedRole
        : "safety_officer";

    const rawJob = String(body.jobTitle || "Safety Officer") as JobTitle;
    const jobTitle: JobTitle = JOB_TITLES.includes(rawJob)
      ? rawJob
      : "Safety Officer";

    const rawCat = String(body.kpiCategory || "shift_3g2s") as KpiCategory;
    const kpiCategory: KpiCategory =
      jobTitle === "Wakil Supervisor"
        ? "wakil_spv"
        : KPI_CATEGORIES.includes(rawCat) && rawCat !== "wakil_spv"
          ? rawCat
          : "shift_3g2s";

    let bufn = String(body.bufn || "BUFN 1").trim();
    let smelter = String(body.smelter || "").trim();

    if (currentUser.role === "admin") {
      bufn = currentUser.bufn;
    }

    if (role === "super_admin") {
      bufn = "ALL";
      smelter = "ALL";
    } else if (role === "admin") {
      smelter = "ALL";
    }

    if (!employeeId || !name || password.length < 4) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan:
            "ID Karyawan, Nama Lengkap, dan Password (minimal 4 karakter) wajib diisi.",
        },
        { status: 400 }
      );
    }

    if (role === "safety_officer" && (!bufn || !smelter)) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: "BUFN dan Lokasi Smelter wajib dipilih.",
        },
        { status: 400 }
      );
    }

    const docs = await firestoreListCollection("users");
    const duplicate = docs.some(
      (d: { fields?: Record<string, { stringValue?: string }> }) =>
        (d.fields?.employeeId?.stringValue || "").toUpperCase() === employeeId
    );
    if (duplicate) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: `ID Karyawan "${employeeId}" sudah terdaftar.`,
        },
        { status: 409 }
      );
    }

    const uid = `usr_${crypto.randomUUID().slice(0, 8)}`;
    const unitLabel =
      role === "super_admin"
        ? "Comprehensive HSE"
        : role === "admin"
          ? `Admin ${bufn}`
          : `${bufn} - ${smelter}`;

    await firestoreSetDoc("users", uid, {
      uid: { stringValue: uid },
      employeeId: { stringValue: employeeId },
      name: { stringValue: name },
      role: { stringValue: role },
      jobTitle: { stringValue: jobTitle },
      kpiCategory: { stringValue: kpiCategory },
      bufn: { stringValue: bufn },
      smelter: { stringValue: smelter },
      unit: { stringValue: unitLabel },
      passwordHash: { stringValue: hashPassword(password) },
      isActive: { booleanValue: true },
    });

    return NextResponse.json({
      berhasil: true,
      pesan: `Akun ${name} (${jobTitle} • ${bufn}${smelter !== "ALL" ? ` - ${smelter}` : ""}) berhasil ditambahkan.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          error instanceof Error ? error.message : "Gagal menambah pengguna.",
      },
      { status: 500 }
    );
  }
}