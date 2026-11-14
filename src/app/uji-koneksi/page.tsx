import { Suspense } from "react";
import { connection } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

async function HasilUjiFirestore() {
  await connection();

  let berhasil = false;
  let pesan = "";
  let waktuServer = "";

  try {
    const db = getAdminDb();
    const docRef = db.collection("_connection_test").doc("ping_vercel");
    const sekarang = new Date().toISOString();

    // Batasi waktu tunggu maksimal 8 detik agar tidak menggantung
    const ujiFirestore = async () => {
      await docRef.set({
        status: "ok_vercel",
        updatedAt: sekarang,
      });
      return await docRef.get();
    };

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              "Waktu habis (8 detik) saat menghubungi Firestore. Periksa apakah FIREBASE_PRIVATE_KEY di Vercel sudah benar."
            )
          ),
        8000
      )
    );

    const snapshot = await Promise.race([ujiFirestore(), timeout]);
    const data = snapshot.data();

    if (snapshot.exists && data?.status === "ok_vercel") {
      berhasil = true;
      waktuServer = data.updatedAt;
      pesan = "Server Vercel berhasil menulis dan membaca data dari Google Firestore!";
    } else {
      pesan = "Dokumen tersimpan tetapi isi tidak sesuai.";
    }
  } catch (error) {
    pesan =
      error instanceof Error
        ? error.message
        : "Terjadi kesalahan tidak dikenal saat menghubungi Firestore.";
  }

  if (berhasil) {
    return (
      <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
        <p className="font-semibold">Koneksi Vercel → Firestore Berhasil!</p>
        <p className="mt-1 text-sm">{pesan}</p>
        <p className="mt-2 font-mono text-xs text-emerald-700">
          Timestamp tersimpan: {waktuServer}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-900">
      <p className="font-semibold">Koneksi Vercel Gagal</p>
      <p className="mt-1 font-mono text-xs break-all">{pesan}</p>
    </div>
  );
}

export default function UjiKoneksiPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-xl rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">
          Uji Koneksi Vercel ke Firestore
        </h1>
        <Suspense
          fallback={
            <p className="mt-4 text-sm text-slate-500">
              Menguji koneksi ke Firestore...
            </p>
          }
        >
          <HasilUjiFirestore />
        </Suspense>
      </div>
    </main>
  );
}