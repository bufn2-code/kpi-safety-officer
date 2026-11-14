import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Ambil konfigurasi rahasia dari .env.local / Environment Variables (hanya berjalan di server)
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
// Ubah teks "\n" menjadi baris baru asli agar kunci privat valid
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  throw new Error(
    "Konfigurasi Firebase Admin belum lengkap. Periksa FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, dan FIREBASE_PRIVATE_KEY di .env.local"
  );
}

// Pola Singleton: cegah inisialisasi ganda saat Next.js reload di mode development
const firebaseAdminApp =
  getApps().length === 0
    ? initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      })
    : getApps()[0];

export const adminDb = getFirestore(firebaseAdminApp);
export const adminAuth = getAuth(firebaseAdminApp);