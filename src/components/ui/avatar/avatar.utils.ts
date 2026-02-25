import { GRADIENT_PAIRS } from "./avatar.constants";

export function getGradientIndex(name: string): number {
  const normalized = name.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % GRADIENT_PAIRS.length;
}

export function getInitials(name: string): string {
  const cleaned = name.replace(/[^\p{L}\s-]/gu, "").trim();
  if (!cleaned) {
    return "?";
  }
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return parts[0][0].toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getGradientStyle(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return `linear-gradient(135deg, ${GRADIENT_PAIRS[4][0]}, ${GRADIENT_PAIRS[4][1]})`;
  }
  const index = getGradientIndex(trimmed);
  return `linear-gradient(135deg, ${GRADIENT_PAIRS[index][0]}, ${GRADIENT_PAIRS[index][1]})`;
}
