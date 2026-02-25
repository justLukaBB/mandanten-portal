export const GRADIENT_PAIRS = [
  ["#1E3A5F", "#2E5C8A"], // Deep Navy → Steel Blue
  ["#4A2545", "#7B3F72"], // Plum → Mauve
  ["#1A4D3E", "#2E7D5B"], // Forest → Emerald
  ["#8B4513", "#C4733B"], // Walnut → Copper
  ["#2D3748", "#4A5568"], // Charcoal → Slate
  ["#6B2FA0", "#9B59B6"], // Violet → Amethyst
  ["#1A365D", "#3182CE"], // Midnight → Cobalt
  ["#7C2D12", "#C2410C"], // Mahogany → Rust
] as const;

export const SIZE_CONFIG = {
  sm: { px: 36, fontSize: 14 },
  md: { px: 40, fontSize: 15 },
  lg: { px: 56, fontSize: 20 },
  xl: { px: 80, fontSize: 28 },
} as const;

export type AvatarSize = keyof typeof SIZE_CONFIG;
