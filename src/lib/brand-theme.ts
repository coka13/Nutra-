/**
 * Turns a coach's brand color into the app's accent tokens (--green, --green-dark, --soft-green).
 * Any color the coach picks stays readable: in the light theme the accent is darkened until white
 * text on it has 4.5:1 contrast; in the dark theme it is lightened until it has 4.5:1 against
 * the dark panel (primary buttons there use dark text on the accent).
 */
type Rgb = [number, number, number];

const DARK_PANEL: Rgb = [0x1c, 0x26, 0x22];
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

function parse(hex: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(rgb: Rgb) {
  return '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
}
function mix(a: Rgb, b: Rgb, amountOfB: number): Rgb {
  return a.map((c, i) => c + (b[i] - c) * amountOfB) as Rgb;
}
function luminance(rgb: Rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [la, lb] = [luminance(parse(a)!), luminance(parse(b)!)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** Moves the color toward `target` in small steps until it contrasts enough with `against`. */
function readable(color: Rgb, target: Rgb, against: Rgb, ratio = 4.5) {
  for (let step = 0; step <= 20; step++) {
    const candidate = mix(color, target, step / 20);
    if (contrast(toHex(candidate), toHex(against)) >= ratio) return candidate;
  }
  return target;
}

export type BrandTokens = { '--green': string; '--green-dark': string; '--soft-green': string };

export function brandTokens(color: string, theme: 'light' | 'dark'): BrandTokens | null {
  const rgb = parse(color);
  if (!rgb) return null;
  if (theme === 'dark') {
    const accent = readable(rgb, WHITE, DARK_PANEL);
    return {
      '--green': toHex(accent),
      '--green-dark': toHex(mix(accent, BLACK, 0.2)),
      '--soft-green': toHex(mix(DARK_PANEL, accent, 0.18)),
    };
  }
  const accent = readable(rgb, BLACK, WHITE);
  return {
    '--green': toHex(accent),
    '--green-dark': toHex(mix(accent, BLACK, 0.25)),
    '--soft-green': toHex(mix(WHITE, accent, 0.08)),
  };
}
