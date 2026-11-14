import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { initializeFirestore, getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  throw new Error(
    `Variabel Firebase belum lengkap di server: projectId=${Boolean(projectId)}, clientEmail=${Boolean(clientEmail)}, privateKey=${Boolean(privateKey)}`
  );
}

const isNewApp = getApps().length === 0;
const firebaseAdminApp = isNewApp
  ? initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    })
  : getApps()[0];

// Gunakan preferRest: true agar koneksi ke Firestore di Vercel cepat dan tidak menggantung
export const adminDb = isNewApp
  ? initializeFirestore(firebaseAdminApp, { preferRest: true })
  : getFirestore(firebaseAdminApp);

export const adminAuth = getAuth(firebaseAdminApp);