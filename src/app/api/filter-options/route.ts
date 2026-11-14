import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { message: "Endpoint opsi filter belum aktif (Tahap 9)." },
    { status: 501 }
  );
}