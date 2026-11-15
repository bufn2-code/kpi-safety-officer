import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getWorkAreas, saveWorkAreas, type BufnArea } from "@/lib/work-areas";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { berhasil: false, pesan: "Sesi tidak valid." },
      { status: 401 }
    );
  }

  const areas = await getWorkAreas();
  return NextResponse.json({ berhasil: true, areas });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin") {
    return NextResponse.json(
      {
        berhasil: false,
        pesan: "Hanya Super Admin yang dapat mengubah struktur BUFN & Smelter.",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const rawAreas = Array.isArray(body.areas) ? body.areas : [];

    const sanitized: BufnArea[] = rawAreas
      .map((item: { id?: string; name?: string; smelters?: string[] }) => {
        const name = String(item.name || item.id || "").trim();
        const smelters = Array.isArray(item.smelters)
          ? Array.from(
              new Set(
                item.smelters
                  .map((s) => String(s || "").trim())
                  .filter(Boolean)
              )
            )
          : [];
        return {
          id: name,
          name,
          smelters,
        };
      })
      .filter((a: BufnArea) => a.name.length > 0);

    if (sanitized.length === 0) {
      return NextResponse.json(
        { berhasil: false, pesan: "Minimal harus ada 1 BUFN." },
        { status: 400 }
      );
    }

    await saveWorkAreas(sanitized);

    return NextResponse.json({
      berhasil: true,
      pesan: "Struktur BUFN & Smelter berhasil disimpan.",
      areas: sanitized,
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan:
          error instanceof Error
            ? error.message
            : "Gagal menyimpan struktur wilayah kerja.",
      },
      { status: 500 }
    );
  }
}