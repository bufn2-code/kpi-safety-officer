import { NextResponse } from "next/server";
import {
  createFirebaseAuthUser,
  firestoreListCollection,
  firestoreSetDoc,
} from "@/lib/firebase-admin";
import { getCurrentUser, type UserRole } from "@/lib/session";
import { getWorkAreas, isValidSmelterInBufn } from "@/lib/work-areas";

export interface ManagedUser {
  uid: string;
  employeeId: string;
  name: string;
  role: UserRole;
  bufn: string;
  smelter: string;
  unit: string;
  isActive: boolean;
  createdAt: string;
}

export async function GET() {
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
    const docs = await firestoreListCollection("users");
    let users: ManagedUser[] = docs.map(
      (doc: {
        fields?: Record<
          string,
          { stringValue?: string; booleanValue?: boolean }
        >;
      }) => {
        const f = doc.fields || {};
        const role = (f.role?.stringValue || "safety_officer") as UserRole;
        const bufn =
          f.bufn?.stringValue || (role === "super_admin" ? "ALL" : "BUFN 1");
        const smelter = f.smelter?.stringValue || "-";
        return {
          uid: f.uid?.stringValue || "",
          employeeId: f.employeeId?.stringValue || "",
          name: f.name?.stringValue || "",
          role,
          bufn,
          smelter,
          unit:
            f.unit?.stringValue ||
            (bufn === "ALL" ? "Comprehensive HSE" : `${bufn} - ${smelter}`),
          isActive: f.isActive?.booleanValue ?? true,
          createdAt: f.createdAt?.stringValue || "",
        };
      }
    );

    // Isolasi data: Admin BUFN hanya melihat anggota di BUFN-nya sendiri
    if (currentUser.role === "admin") {
      users = users.filter((u) => u.bufn === currentUser.bufn);
    }

    users.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ berhasil: true, users });
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
    (currentUser.role !== "super_admin" && currentUser.role !== "admin")
  ) {
    return NextResponse.json(
      { berhasil: false, pesan: "Anda tidak memiliki izin menambah pengguna." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const employeeId = String(body.employeeId || "").trim().toUpperCase();
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    const requestedRole = String(
      body.role || "safety_officer"
    ) as UserRole;

    if (!employeeId || !name || password.length < 6) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan:
            "ID Karyawan, Nama Lengkap wajib diisi, dan Password minimal 6 karakter.",
        },
        { status: 400 }
      );
    }

    // Tentukan peran & BUFN sesuai hak akses pembuat akun
    let finalRole: UserRole = "safety_officer";
    let targetBufn = String(body.bufn || "").trim();
    const targetSmelter = String(body.smelter || "").trim();

    if (currentUser.role === "admin") {
      // Admin BUFN hanya boleh menambah Safety Officer di BUFN-nya sendiri
      if (requestedRole !== "safety_officer") {
        return NextResponse.json(
          {
            berhasil: false,
            pesan: "Admin BUFN hanya dapat menambahkan akun Safety Officer.",
          },
          { status: 403 }
        );
      }
      finalRole = "safety_officer";
      targetBufn = currentUser.bufn;
    } else {
      // Super Admin dapat membuat Admin BUFN atau Safety Officer
      finalRole =
        requestedRole === "admin" ? "admin" : "safety_officer";
    }

    const areas = await getWorkAreas();
    const bufnObj = areas.find((a) => a.name === targetBufn);
    if (!bufnObj) {
      return NextResponse.json(
        { berhasil: false, pesan: "Wilayah BUFN wajib dipilih." },
        { status: 400 }
      );
    }

    // Untuk Admin BUFN, smelter boleh dipilih spesifik atau "Semua Smelter BUFN"
    let finalSmelter = targetSmelter;
    if (finalRole === "admin" && !finalSmelter) {
      finalSmelter = "Semua Smelter BUFN";
    } else if (
      finalRole === "safety_officer" &&
      !isValidSmelterInBufn(areas, targetBufn, finalSmelter)
    ) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: `Smelter "${finalSmelter}" tidak terdaftar di ${targetBufn}.`,
        },
        { status: 400 }
      );
    }

    const unitLabel = `${targetBufn} - ${finalSmelter}`;
    const authUser = await createFirebaseAuthUser(employeeId, password, name);
    const now = new Date().toISOString();

    await firestoreSetDoc("users", authUser.localId, {
      uid: { stringValue: authUser.localId },
      employeeId: { stringValue: employeeId },
      name: { stringValue: name },
      role: { stringValue: finalRole },
      bufn: { stringValue: targetBufn },
      smelter: { stringValue: finalSmelter },
      unit: { stringValue: unitLabel },
      isActive: { booleanValue: true },
      createdAt: { stringValue: now },
    });

    return NextResponse.json({
      berhasil: true,
      pesan: `Akun ${name} (${employeeId}) berhasil ditambahkan ke ${unitLabel}.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          error instanceof Error
            ? error.message
            : "Gagal menambahkan pengguna.",
      },
      { status: 500 }
    );
  }
}