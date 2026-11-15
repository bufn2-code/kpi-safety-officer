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
  email: string;
  role: UserRole;
  jobTitle: JobTitle;
  kpiCategory: KpiCategory;
  bufn: string;
  smelter: string;
  unit: string;
  isActive: boolean;
  createdAt: string;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return NextResponse.json(
      { berhasil: false, pesan: "Akses ditolak." },
      { status: 403 }
    );
  }

  try {
    const docs = await firestoreListCollection("users");
    const users: ManagedUser[] = docs
      .map(
        (doc: {
          name?: string;
          fields?: Record<
            string,
            { stringValue?: string; booleanValue?: boolean }
          >;
        }) => {
          const f = doc.fields || {};
          const uid = f.uid?.stringValue || doc.name?.split("/").pop() || "";
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
              : KPI_CATEGORIES.includes(rawCat) && rawCat !== "wakil_spv"
                ? rawCat
                : "shift_3g2s";

          return {
            uid,
            employeeId: f.employeeId?.stringValue || "",
            name: f.name?.stringValue || "",
            email: f.email?.stringValue || "",
            role,
            jobTitle,
            kpiCategory,
            bufn,
            smelter,
            unit:
              f.unit?.stringValue ||
              (bufn === "ALL" ? "Comprehensive HSE" : `${bufn} - ${smelter}`),
            isActive: f.isActive?.booleanValue ?? true,
            createdAt: f.createdAt?.stringValue || "",
          };
        }
      )
      .filter((u: ManagedUser) => {
        if (!u.uid || !u.employeeId) return false;
        if (user.role === "admin") {
          return u.bufn === user.bufn && u.role !== "super_admin";
        }
        return true;
      })
      .sort((a: ManagedUser, b: ManagedUser) => a.name.localeCompare(b.name));

    return NextResponse.json({ berhasil: true, users });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          error instanceof Error ? error.message : "Gagal memuat daftar akun.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return NextResponse.json(
      { berhasil: false, pesan: "Akses ditolak." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const employeeId = String(body.employeeId || "").trim().toUpperCase();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();

    const requestedRole = String(
      body.role || "safety_officer"
    ).trim() as UserRole;
    const role: UserRole =
      user.role === "super_admin" &&
      (requestedRole === "super_admin" ||
        requestedRole === "admin" ||
        requestedRole === "safety_officer")
        ? requestedRole
        : "safety_officer";

    const rawJob = String(body.jobTitle || "Safety Officer").trim() as JobTitle;
    const jobTitle: JobTitle = JOB_TITLES.includes(rawJob)
      ? rawJob
      : "Safety Officer";

    const rawCat = String(
      body.kpiCategory || "shift_3g2s"
    ).trim() as KpiCategory;
    const kpiCategory: KpiCategory =
      jobTitle === "Wakil Supervisor"
        ? "wakil_spv"
        : KPI_CATEGORIES.includes(rawCat) && rawCat !== "wakil_spv"
          ? rawCat
          : "shift_3g2s";

    const bufn =
      role === "super_admin"
        ? "ALL"
        : user.role === "admin"
          ? user.bufn
          : String(body.bufn || "BUFN 1").trim();

    const smelter =
      role === "super_admin"
        ? "ALL"
        : role === "admin"
          ? "ALL"
          : String(body.smelter || "").trim() || "-";

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

    const existingDocs = await firestoreListCollection("users");
    const duplicate = existingDocs.some(
      (doc: { fields?: Record<string, { stringValue?: string }> }) =>
        (doc.fields?.employeeId?.stringValue || "").toUpperCase() === employeeId
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
          ? `${bufn} (Semua Smelter)`
          : `${bufn} - ${smelter}`;

    await firestoreSetDoc("users", uid, {
      uid: { stringValue: uid },
      employeeId: { stringValue: employeeId },
      name: { stringValue: name },
      email: { stringValue: email },
      role: { stringValue: role },
      jobTitle: { stringValue: jobTitle },
      kpiCategory: { stringValue: kpiCategory },
      bufn: { stringValue: bufn },
      smelter: { stringValue: smelter },
      unit: { stringValue: unitLabel },
      passwordHash: { stringValue: hashPassword(password) },
      isActive: { booleanValue: true },
      createdAt: { stringValue: new Date().toISOString() },
    });

    return NextResponse.json({
      berhasil: true,
      pesan: `Akun ${name} (${employeeId}) berhasil dibuat.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          error instanceof Error ? error.message : "Gagal membuat akun baru.",
      },
      { status: 500 }
    );
  }
}