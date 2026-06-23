import type { ReceptacleParams } from "./types";

const STORAGE_KEY = "receptacle-gen-user-presets";

export interface SavedPreset {
  id: string;
  name: string;
  params: ReceptacleParams;
  updatedAt: number;
}

function readAll(): SavedPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(presets: SavedPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function listUserPresets(): SavedPreset[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveUserPreset(name: string, params: ReceptacleParams): SavedPreset {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Preset name is required");
  const all = readAll();
  const existing = all.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const entry: SavedPreset = existing
    ? { ...existing, name: trimmed, params, updatedAt: Date.now() }
    : { id: crypto.randomUUID(), name: trimmed, params, updatedAt: Date.now() };
  const next = existing
    ? all.map((p) => (p.id === existing.id ? entry : p))
    : [entry, ...all];
  writeAll(next);
  return entry;
}

export function renameUserPreset(id: string, name: string): SavedPreset | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const all = readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], name: trimmed, updatedAt: Date.now() };
  writeAll(all);
  return all[idx];
}

export function deleteUserPreset(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id));
}

export function getUserPreset(id: string): SavedPreset | undefined {
  return readAll().find((p) => p.id === id);
}
