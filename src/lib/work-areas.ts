import { firestoreGetDoc, firestoreSetDoc } from "./firebase-admin";

export interface BufnArea {
  id: string;
  name: string;
  smelters: string[];
}

export const DEFAULT_WORK_AREAS: BufnArea[] = [
  {
    id: "BUFN 1",
    name: "BUFN 1",
    smelters: ["Smelter A", "Smelter B", "Smelter G"],
  },
  {
    id: "BUFN 2",
    name: "BUFN 2",
    smelters: ["Smelter C", "Smelter E", "Smelter F"],
  },
  {
    id: "BUFN 3",
    name: "BUFN 3",
    smelters: ["Smelter K", "Smelter L", "Smelter RS", "Nikelmatte S"],
  },
  {
    id: "BUFN 4",
    name: "BUFN 4",
    smelters: [
      "Smelter M",
      "Smelter O",
      "Smelter Q",
      "Nikelmatte M",
      "Nikelmatte Q",
    ],
  },
  {
    id: "BUFN 5",
    name: "BUFN 5",
    smelters: ["Smelter U", "Smelter W", "Smelter X"],
  },
];

export async function getWorkAreas(): Promise<BufnArea[]> {
  try {
    const doc = await firestoreGetDoc("system_config", "work_areas");
    const jsonStr = doc?.fields?.areasJson?.stringValue;
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr) as BufnArea[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Gunakan default jika belum tersimpan di Firestore
  }
  return DEFAULT_WORK_AREAS;
}

export async function saveWorkAreas(areas: BufnArea[]): Promise<void> {
  await firestoreSetDoc("system_config", "work_areas", {
    areasJson: { stringValue: JSON.stringify(areas) },
    updatedAt: { stringValue: new Date().toISOString() },
  });
}

export function isValidSmelterInBufn(
  areas: BufnArea[],
  bufn: string,
  smelter: string
): boolean {
  const found = areas.find((a) => a.name === bufn || a.id === bufn);
  if (!found) return false;
  return found.smelters.includes(smelter);
}