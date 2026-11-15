import { NextResponse } from "next/server";
import {
  createFirebaseAuthUser,
  firestoreListCollection,
  firestoreSetDoc,
} from "@/lib/firebase-admin";
import { getCurrentUser, type UserRole } from "@/lib/session";

export interface ManagedUser {
  uid: string;
  employeeId: string;
  name: string;
  role: UserRole;
  unit: string;
  isActive: boolean;
  createdAt: string;
}

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.role !== "admin")) {
    return NextResponse.json(
      { berhasil: false, pesan: "Akses ditolak." },
      { status: 403 }
    );
  }

  try {
    const docs = await firestoreListCollection("users");
    const users: ManagedUser[] = docs.map((doc: { fields?: Record<string, { stringValue?: string; booleanValue?: boolean }> }) => {
      const f = doc.fields || {};
      return {
        uid: f.uid?.stringValue || "",
        employeeId: f.employeeId?.stringValue || "",
        name: f.name?.stringValue || "",
        role: (f.role?.stringValue || "safety_officer") as UserRole,
        unit: f.unit?.stringValue || "-",
        isActive: f.isActive?.booleanValue ?? true,
        createdAt: f.createdAt?.stringValue || "",
      };
    });

    users.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ berhasil: true, users });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan: error instanceof Error ? error.message : "Gagal memuat daftar pengguna.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.role !== "admin")) {
    return NextResponse.json(
      { berhasil: false, pesan: "Anda tidak memiliki izin menambah pengguna." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const employeeId = String(body.employeeId || "").trim().toUpperCase();
    const name = String(body.name || "").trim();
    const unit = String(body.unit || "").trim();
    const password = String(body.password || "");
    const requestedRole = String(body.role || "safety_officer") as UserRole;

    if (!employeeId || !name || !unit || password.length < 6) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: "ID Karyawan, Nama, Unit wajib diisi, dan Password minimal 6 karakter.",
        },
        { status: 400 }
      );
    }

    // Admin biasa hanya boleh membuat akun Safety Officer; Super Admin boleh membuat Admin atau Safety Officer
    let finalRole: UserRole = "safety_officer";
    if (currentUser.role === "super_admin" && (requestedRole === "admin" || requestedRole === "safety_officer")) {
      finalRole = requestedRole;
    } else if (currentUser.role === "admin" && requestedRole !== "safety_officer") {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: "Admin hanya dapat menambahkan akun dengan peran Safety Officer.",
        },
        { status: 403 }
      );
    }

    const authUser = await createFirebaseAuthUser(employeeId, password, name);
    const now = new Date().toISOString();

    await firestoreSetDoc("users", authUser.localId, {
      uid: { stringValue: authUser.localId },
      employeeId: { stringValue: employeeId },
      name: { stringValue: name },
      role: { stringValue: finalRole },
      unit: { stringValue: unit },
      isActive: { booleanValue: true },
      createdAt: { stringValue: now },
    });

    return NextResponse.json({
      berhasil: true,
      pesan: `Akun ${name} (${employeeId}) berhasil ditambahkan.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan: error instanceof Error ? error.message : "Gagal menambahkan pengguna.",
      },
      { status: 500 }
    );
  }
}