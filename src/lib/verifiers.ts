import { firestoreGetDoc, firestoreSetDoc } from "./firebase-admin";

export interface AreaVerifierConfig {
  id: string;
  scopeType: "global" | "bufn" | "smelter";
  bufn: string; // "ALL" atau nama BUFN
  smelter: string; // "ALL" atau nama Smelter
  verifierName: string; // Hanya nama lengkap (tanpa ID)
  verifierTitle: string; // Misal: "Supervisor HSE BUFN 1" / "Manager Comprehensive HSE"
  signatureDataUrl: string; // Gambar TTD (data:image/png;base64,...)
  updatedAt: string;
}

export async function getAreaVerifiers(): Promise<AreaVerifierConfig[]> {
  try {
    const doc = await firestoreGetDoc("system_config", "area_verifiers");
    const jsonStr = doc?.fields?.verifiersJson?.stringValue;
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr) as AreaVerifierConfig[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // fallback kosong
  }
  return [];
}

export async function saveAreaVerifiers(
  list: AreaVerifierConfig[]
): Promise<AreaVerifierConfig[]> {
  await firestoreSetDoc("system_config", "area_verifiers", {
    verifiersJson: { stringValue: JSON.stringify(list) },
    updatedAt: { stringValue: new Date().toISOString() },
  });
  return list;
}

/**
 * Mencari pejabat verifikator paling spesifik untuk karyawan:
 * 1. Spesifik BUFN + Smelter
 * 2. Tingkat BUFN (semua smelter di BUFN tersebut)
 * 3. Tingkat Global (Comprehensive HSE)
 */
export function resolveVerifierForEmployee(
  verifiers: AreaVerifierConfig[],
  bufn: string,
  smelter: string
): AreaVerifierConfig | null {
  const exactSmelter = verifiers.find(
    (v) =>
      v.scopeType === "smelter" &&
      v.bufn.toLowerCase() === bufn.toLowerCase() &&
      v.smelter.toLowerCase() === smelter.toLowerCase() &&
      v.verifierName.trim().length > 0
  );
  if (exactSmelter) return exactSmelter;

  const byBufn = verifiers.find(
    (v) =>
      v.scopeType === "bufn" &&
      v.bufn.toLowerCase() === bufn.toLowerCase() &&
      v.verifierName.trim().length > 0
  );
  if (byBufn) return byBufn;

  const globalV = verifiers.find(
    (v) => v.scopeType === "global" && v.verifierName.trim().length > 0
  );
  return globalV || null;
}

/**
 * Simpan / Ambil Catatan Evaluasi Tahunan SPV per karyawan per tahun (YYYY)
 */
export async function getYearlySpvNotesMap(
  year: string
): Promise<Record<string, { note: string; authorName: string; updatedAt: string }>> {
  try {
    const doc = await firestoreGetDoc("system_config", `yearly_notes_${year}`);
    const jsonStr = doc?.fields?.notesJson?.stringValue;
    if (jsonStr) {
      return JSON.parse(jsonStr);
    }
  } catch {
    // fallback kosong
  }
  return {};
}

export async function saveYearlySpvNote(
  year: string,
  uid: string,
  note: string,
  authorName: string
): Promise<void> {
  const existing = await getYearlySpvNotesMap(year);
  existing[uid] = {
    note: note.trim(),
    authorName: authorName.trim(),
    updatedAt: new Date().toISOString(),
  };
  await firestoreSetDoc("system_config", `yearly_notes_${year}`, {
    notesJson: { stringValue: JSON.stringify(existing) },
    updatedAt: { stringValue: new Date().toISOString() },
  });
}