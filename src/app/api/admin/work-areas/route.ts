import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getWorkAreas, saveWorkAreas } from "@/lib/work-areas";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { berhasil: false, pesan: "Sesi tidak valid." },
      { status: 401 }
    );
  }

  const workAreas = await getWorkAreas();
  return NextResponse.json({ berhasil: true, workAreas });
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
    const action = String(body.action || "add_smelter").trim();
    const areas = await getWorkAreas();

    // 1. Tambah BUFN Baru (Khusus Super Admin)
    if (action === "add_bufn") {
      if (user.role !== "super_admin") {
        return NextResponse.json(
          {
            berhasil: false,
            pesan: "Hanya Super Admin yang dapat menambah wilayah BUFN.",
          },
          { status: 403 }
        );
      }

      const bufnName = String(body.bufnName || "").trim();
      if (!bufnName) {
        return NextResponse.json(
          { berhasil: false, pesan: "Nama BUFN wajib diisi." },
          { status: 400 }
        );
      }

      const exists = areas.some(
        (a) => a.name.toLowerCase() === bufnName.toLowerCase()
      );
      if (exists) {
        return NextResponse.json(
          { berhasil: false, pesan: `Wilayah "${bufnName}" sudah terdaftar.` },
          { status: 409 }
        );
      }

      const nextAreas = [...areas, { name: bufnName, smelters: [] }];
      await saveWorkAreas(nextAreas);
      return NextResponse.json({
        berhasil: true,
        pesan: `Wilayah "${bufnName}" berhasil ditambahkan.`,
        workAreas: nextAreas,
      });
    }

    // 2. Hapus BUFN (Khusus Super Admin)
    if (action === "delete_bufn") {
      if (user.role !== "super_admin") {
        return NextResponse.json(
          {
            berhasil: false,
            pesan: "Hanya Super Admin yang dapat menghapus wilayah BUFN.",
          },
          { status: 403 }
        );
      }

      const bufnName = String(body.bufnName || "").trim();
      const nextAreas = areas.filter(
        (a) => a.name.toLowerCase() !== bufnName.toLowerCase()
      );
      await saveWorkAreas(nextAreas);
      return NextResponse.json({
        berhasil: true,
        pesan: `Wilayah "${bufnName}" berhasil dihapus.`,
        workAreas: nextAreas,
      });
    }

    // 3. Hapus Smelter dari BUFN
    if (action === "delete_smelter") {
      const targetBufn =
        user.role === "super_admin"
          ? String(body.bufnName || "").trim()
          : user.bufn;
      const smelterName = String(body.smelterName || "").trim();

      const nextAreas = areas.map((area) => {
        if (area.name.toLowerCase() !== targetBufn.toLowerCase()) return area;
        return {
          ...area,
          smelters: area.smelters.filter(
            (s) => s.toLowerCase() !== smelterName.toLowerCase()
          ),
        };
      });

      await saveWorkAreas(nextAreas);
      return NextResponse.json({
        berhasil: true,
        pesan: `Smelter "${smelterName}" berhasil dihapus dari ${targetBufn}.`,
        workAreas: nextAreas,
      });
    }

    // 4. Tambah Smelter ke BUFN (Default)
    const targetBufn =
      user.role === "super_admin"
        ? String(body.bufnName || "").trim()
        : user.bufn;
    const smelterName = String(body.smelterName || "").trim();

    if (!targetBufn || !smelterName) {
      return NextResponse.json(
        { berhasil: false, pesan: "Nama BUFN dan Nama Smelter wajib diisi." },
        { status: 400 }
      );
    }

    const foundIdx = areas.findIndex(
      (a) => a.name.toLowerCase() === targetBufn.toLowerCase()
    );
    if (foundIdx === -1) {
      return NextResponse.json(
        { berhasil: false, pesan: `Wilayah ${targetBufn} tidak ditemukan.` },
        { status: 404 }
      );
    }

    const duplicate = areas[foundIdx].smelters.some(
      (s) => s.toLowerCase() === smelterName.toLowerCase()
    );
    if (duplicate) {
      return NextResponse.json(
        {
          berhasil: false,
          pesan: `Smelter "${smelterName}" sudah terdaftar di ${areas[foundIdx].name}.`,
        },
        { status: 409 }
      );
    }

    const nextAreas = areas.map((area, idx) =>
      idx === foundIdx
        ? { ...area, smelters: [...area.smelters, smelterName] }
        : area
    );

    await saveWorkAreas(nextAreas);

    return NextResponse.json({
      berhasil: true,
      pesan: `Smelter "${smelterName}" berhasil ditambahkan ke ${areas[foundIdx].name}.`,
      workAreas: nextAreas,
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          error instanceof Error
            ? error.message
            : "Gagal memperbarui wilayah kerja.",
      },
      { status: 500 }
    );
  }
}