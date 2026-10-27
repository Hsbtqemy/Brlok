/**
 * Détection des prises par couleur sur une photo (mode salle). Sur une image réduite : pixels classés par
 * teinte, puis regroupés en taches. Les très grandes taches (panneaux peints, bâches) sont écartées.
 * Fiable pour les couleurs vives ; le blanc, le noir et le gris restent à placer à la main.
 */

export interface Blob {
  color: string;
  /** Teinte moyenne de la tache. */
  hex: string;
  /** Centre et taille, en fractions de l'image (0 à 1). */
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
}

type Rule = (h: number, s: number, v: number) => boolean;

export const DETECTED_COLORS: { name: string; rule: Rule }[] = [
  { name: "rouge", rule: (h, s, v) => (h < 12 || h > 352) && s > 0.55 && v > 0.35 },
  { name: "orange", rule: (h, s, v) => h >= 12 && h < 35 && s > 0.6 && v > 0.55 },
  { name: "jaune", rule: (h, s, v) => h > 42 && h < 65 && s > 0.55 && v > 0.6 },
  { name: "vert", rule: (h, s, v) => h > 90 && h < 165 && s > 0.4 && v > 0.3 },
  { name: "bleu", rule: (h, s, v) => h > 200 && h < 240 && s > 0.5 && v > 0.25 },
  { name: "violet", rule: (h, s, v) => h > 265 && h < 305 && s > 0.35 && v > 0.25 },
  { name: "rose", rule: (h, s, v) => h > 315 && h <= 352 && s > 0.35 && v > 0.5 },
];

function hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/**
 * `data` : pixels RGBA (comme ImageData.data). `minArea` en pixels ; les taches de plus de `maxAreaRatio`
 * de l'image sont ignorées.
 */
export function detectBlobs(data: Uint8ClampedArray, width: number, height: number, minArea = 30, maxAreaRatio = 0.02): Blob[] {
  const n = width * height;
  const label = new Int8Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const [h, s, v] = hsv(data[i * 4] / 255, data[i * 4 + 1] / 255, data[i * 4 + 2] / 255);
    for (let c = 0; c < DETECTED_COLORS.length; c++) {
      if (DETECTED_COLORS[c].rule(h, s, v)) {
        label[i] = c;
        break;
      }
    }
  }
  const seen = new Uint8Array(n);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  const maxArea = n * maxAreaRatio;
  for (let start = 0; start < n; start++) {
    const c = label[start];
    if (c < 0 || seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    let area = 0, sx = 0, sy = 0, r = 0, g = 0, b = 0;
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % width;
      const y = (p - x) / width;
      area++;
      sx += x;
      sy += y;
      r += data[p * 4];
      g += data[p * 4 + 1];
      b += data[p * 4 + 2];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const neighbours = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const q of neighbours) {
        if (q >= 0 && !seen[q] && label[q] === c) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (area >= minArea && area <= maxArea) {
      blobs.push({
        color: DETECTED_COLORS[c].name,
        hex: toHex(r / area, g / area, b / area),
        x: sx / area / width,
        y: sy / area / height,
        w: (x1 - x0 + 1) / width,
        h: (y1 - y0 + 1) / height,
        area,
      });
    }
  }
  return blobs;
}

/** Nombre de taches par couleur, de la plus fréquente à la moins fréquente. */
export function countByColor(blobs: readonly Blob[]): { color: string; count: number; hex: string }[] {
  const map = new Map<string, { count: number; hex: string }>();
  for (const b of blobs) {
    const e = map.get(b.color) ?? { count: 0, hex: b.hex };
    e.count++;
    map.set(b.color, e);
  }
  return [...map.entries()].map(([color, e]) => ({ color, ...e })).sort((a, b) => b.count - a.count);
}
