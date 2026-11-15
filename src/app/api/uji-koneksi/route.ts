import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export async function GET() {
  const cekEnv = {
    hasProjectId: Boolean(process.env.FIREBASE_PROJECT_ID),
    hasClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
    hasPrivateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY),
    privateKeyLength: process.env.FIREBASE_PRIVATE_KEY?.length ?? 0,
  };

  try {
    const db = getAdminDb();
    const docRef = db.collection("_connection_test").doc("ping_vercel_api");
    const sekarang = new Date().toISOString();

    await docRef.set({
      status: "ok_vercel_api",
      updatedAt: sekarang,
    });

    const snapshot = await docRef.get();

    return NextResponse.json({
      berhasil: true,
      pesan: "Koneksi Vercel ke Google Firestore BERHASIL!",
      timestamp: snapshot.data()?.updatedAt,
      cekEnv,
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan: error instanceof Error ? error.message : String(error),
        cekEnv,
      },
      { status: 500 }
    );
  }
}