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
  const rawKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  const privateKey = rawKey
    ?.replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      `Variabel lingkungan belum lengkap: PROJECT_ID=${Boolean(projectId)}, CLIENT_EMAIL=${Boolean(clientEmail)}, PRIVATE_KEY=${Boolean(privateKey)}`
    );
  }

  return { projectId, clientEmail, privateKey };
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

export async function firestoreSetDoc(
  collection: string,
  docId: string,
  fields: Record<string, { stringValue: string }>
) {
  const { projectId } = getFirebaseEnv();
  const token = await getGoogleAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}`;

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

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore gagal membaca (${res.status}): ${errText}`);
  }

  return res.json();
}