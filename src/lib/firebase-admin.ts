import crypto from "node:crypto";

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function getFirebaseEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const webApiKey = process.env.FIREBASE_WEB_API_KEY?.trim();
  const rawKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  const privateKey = rawKey
    ?.replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey || !webApiKey) {
    throw new Error(
      `Variabel lingkungan Firebase belum lengkap: PROJECT_ID=${Boolean(projectId)}, CLIENT_EMAIL=${Boolean(clientEmail)}, PRIVATE_KEY=${Boolean(privateKey)}, WEB_API_KEY=${Boolean(webApiKey)}`
    );
  }

  return { projectId, clientEmail, privateKey, webApiKey };
}

export async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const { clientEmail, privateKey } = getFirebaseEnv();
  const now = Math.floor(Date.now() / 1000);

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope:
        "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );

  const unsignedJwt = `${header}.${payload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  const signature = base64UrlEncode(signer.sign(privateKey));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsignedJwt}.${signature}`,
    }),
    cache: "no-store",
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(
      `Gagal mendapatkan token Google: ${data.error_description || data.error || res.statusText}`
    );
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };

  return data.access_token;
}

export type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { booleanValue: boolean };

export async function firestoreSetDoc(
  collection: string,
  docId: string,
  fields: Record<string, FirestoreValue>
) {
  const { projectId } = getFirebaseEnv();
  const token = await getGoogleAccessToken();
  const fieldPaths = Object.keys(fields)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}?${fieldPaths}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore gagal menulis (${res.status}): ${errText}`);
  }

  return res.json();
}

export async function firestoreGetDoc(collection: string, docId: string) {
  const { projectId } = getFirebaseEnv();
  const token = await getGoogleAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore gagal membaca (${res.status}): ${errText}`);
  }

  return res.json();
}

export async function firestoreListCollection(collection: string) {
  const { projectId } = getFirebaseEnv();
  const token = await getGoogleAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}?pageSize=200`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (res.status === 404) {
    return [];
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore gagal membaca koleksi (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return Array.isArray(data.documents) ? data.documents : [];
}

// Konversi ID Karyawan menjadi format email internal Firebase Auth
export function employeeIdToEmail(employeeId: string): string {
  const cleanId = employeeId.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return `${cleanId}@kpi-bufn.local`;
}

// Membuat akun baru di Firebase Authentication
export async function createFirebaseAuthUser(
  employeeId: string,
  password: string,
  displayName: string
): Promise<{ localId: string; email: string }> {
  const { projectId } = getFirebaseEnv();
  const token = await getGoogleAccessToken();
  const email = employeeIdToEmail(employeeId);

  const url = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      displayName,
      emailVerified: true,
    }),
    cache: "no-store",
  });

  const data = await res.json();
  if (!res.ok) {
    const rawMsg = data?.error?.message || "";
    if (rawMsg.includes("EMAIL_EXISTS")) {
      throw new Error("ID Karyawan tersebut sudah terdaftar.");
    }
    throw new Error(rawMsg || "Gagal membuat akun di Firebase Auth.");
  }

  return { localId: data.localId, email };
}

// Mengubah password atau status aktif akun di Firebase Authentication (oleh Admin)
export async function updateFirebaseAuthAccount(
  localId: string,
  updates: { password?: string; disabled?: boolean; displayName?: string }
) {
  const { projectId } = getFirebaseEnv();
  const token = await getGoogleAccessToken();

  const url = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      localId,
      ...updates,
    }),
    cache: "no-store",
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data?.error?.message || "Gagal memperbarui akun di Firebase Auth."
    );
  }

  return data;
}

// Verifikasi ID Karyawan dan Password saat pengguna login
export async function verifyEmployeePassword(
  employeeId: string,
  password: string
): Promise<{ localId: string; email: string }> {
  const { webApiKey } = getFirebaseEnv();
  const email = employeeIdToEmail(employeeId);

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${webApiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
    cache: "no-store",
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error("ID Karyawan atau Password salah.");
  }

  return { localId: data.localId, email };
}