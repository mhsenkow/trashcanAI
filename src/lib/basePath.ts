// GitHub Pages serves project sites from a subpath (e.g. /trashcanAI/).
// NEXT_PUBLIC_BASE_PATH is set in CI; empty locally.

export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function publicUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${basePath}${normalized}`;
}
