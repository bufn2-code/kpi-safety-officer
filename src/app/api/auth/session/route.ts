import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "Endpoint session belum aktif (Tahap 3)." },
    { status: 501 }
  );
}