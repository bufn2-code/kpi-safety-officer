import { connection } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export default async function UjiKoneksiPage() {
  // Beri tahu Next.js 16 bahwa halaman ini harus dijalankan secara dinamis saat dibuka
  await connection();

  let berhasil = false;
  let pesan = "";
  let waktuServer = "";

  try {
    const docRef = adminDb.collection("_connection_test").doc("ping_vercel");
    const sekarang = new Date().toISOString();

    await docRef.set({
      status: "ok_vercel",
      updatedAt: sekarang,
    });

    const snapshot = await docRef.get();
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
        : "Terjadi kesalahan saat menghubungi Firestore dari Vercel.";
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-xl rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">
          Uji Koneksi Vercel ke Firestore
        </h1>

        {berhasil ? (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <p className="font-semibold">Koneksi Vercel → Firestore Berhasil!</p>
            <p className="mt-1 text-sm">{pesan}</p>
            <p className="mt-2 font-mono text-xs text-emerald-700">
              Timestamp tersimpan: {waktuServer}
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-900">
            <p className="font-semibold">Koneksi Vercel Gagal</p>
            <p className="mt-1 font-mono text-xs break-all">{pesan}</p>
          </div>
        )}
      </div>
    </main>
  );
}