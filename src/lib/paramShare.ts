// Shareable config URLs (#49).

import { DEFAULT_PARAMS, type ReceptacleParams } from "./types";

const PARAM_KEYS = Object.keys(DEFAULT_PARAMS) as (keyof ReceptacleParams)[];

export function encodeParamsToQuery(params: ReceptacleParams): string {
  const pairs = PARAM_KEYS.map((k) => {
    const v = params[k];
    return `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`;
  });
  return pairs.join("&");
}

export function decodeParamsFromQuery(search: string): Partial<ReceptacleParams> | null {
  if (!search || search.length < 4) return null;
  const q = search.startsWith("?") ? search.slice(1) : search;
  const out: Partial<ReceptacleParams> = {};
  for (const part of q.split("&")) {
    const [rawK, rawV] = part.split("=");
    if (!rawK || rawV === undefined) continue;
    const k = decodeURIComponent(rawK) as keyof ReceptacleParams;
    if (!PARAM_KEYS.includes(k)) continue;
    const base = DEFAULT_PARAMS[k];
    const decoded = decodeURIComponent(rawV);
    if (typeof base === "number") {
      const n = Number.parseFloat(decoded);
      if (!Number.isNaN(n)) (out as Record<string, number>)[k] = n;
    } else if (typeof base === "boolean") {
      (out as Record<string, boolean>)[k] = decoded === "true";
    } else {
      (out as Record<string, string>)[k] = decoded;
    }
  }
  return Object.keys(out).length ? out : null;
}

export function shareableUrl(params: ReceptacleParams): string {
  if (typeof window === "undefined") return "";
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?${encodeParamsToQuery(params)}`;
}
