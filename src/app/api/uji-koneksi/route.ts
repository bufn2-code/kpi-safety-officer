import { NextResponse } from "next/server";
import { firestoreGetDoc, firestoreSetDoc } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const sekarang = new Date().toISOString();

    await firestoreSetDoc("_connection_test", "ping_vercel_api", {
      status: { stringValue: "ok_vercel_api" },
      updatedAt: { stringValue: sekarang },
    });

    const doc = await firestoreGetDoc("_connection_test", "ping_vercel_api");
    const savedTime = doc?.fields?.updatedAt?.stringValue;

    return NextResponse.json({
      berhasil: true,
      pesan: "Koneksi Vercel ke Google Firestore BERHASIL!",
      timestamp: savedTime,
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}