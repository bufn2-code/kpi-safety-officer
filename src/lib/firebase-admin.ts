import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, initializeFirestore } from "firebase-admin/firestore";

function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const rawKey = process.env.FIREBASE_PRIVATE_KEY?.trim();

  // Bersihkan tanda petik jika ikut tersalin di Vercel, lalu ubah \n menjadi baris baru asli
  const privateKey = rawKey
    ?.replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      `Variabel Vercel belum terbaca lengkap: FIREBASE_PROJECT_ID=${Boolean(projectId)}, FIREBASE_CLIENT_EMAIL=${Boolean(clientEmail)}, FIREBASE_PRIVATE_KEY=${Boolean(privateKey)}`
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

// Inisialisasi dilakukan saat dipanggil agar error bisa ditangkap oleh try/catch
export function getAdminDb() {
  const isFirst = getApps().length === 0;
  const app = getFirebaseAdminApp();
  return isFirst
    ? initializeFirestore(app, { preferRest: true })
    : getFirestore(app);
}

export function getAdminAuth() {
  const app = getFirebaseAdminApp();
  return getAuth(app);
}

// Pertahankan ekspor lama untuk kompatibilitas
export const adminDb = new Proxy({} as ReturnType<typeof getFirestore>, {
  get(_target, prop) {
    const db = getAdminDb();
    const value = db[prop as keyof typeof db];
    return typeof value === "function" ? value.bind(db) : value;
  },
});

export const adminAuth = new Proxy({} as ReturnType<typeof getAuth>, {
  get(_target, prop) {
    const auth = getAdminAuth();
    const value = auth[prop as keyof typeof auth];
    return typeof value === "function" ? value.bind(auth) : value;
  },
});