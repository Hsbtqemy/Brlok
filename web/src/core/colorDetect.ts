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

// --- Pipette : toucher une prise, retrouver toutes celles de la même teinte (blanc, noir et gris compris) ---

export type Rgb = [number, number, number];

/** sRGB (0–255) → CIELAB, pour comparer des teintes comme l'œil. */
export function toLab([r, g, b]: Rgb): Rgb {
  const lin = (c: number) => {
    const v = c / 255;
    return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const dist = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Teinte d'une prise touchée en (x, y) (fractions de l'image). Le doigt tombe souvent au bord de la prise :
 * on compare les pixels proches au fond (un anneau autour) et on garde ceux qui s'en distinguent, puis leur
 * médiane composante par composante (robuste aux reflets). Sans contraste, simple médiane autour du point.
 */
export function sampleColor(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, radius = 3): Rgb {
  const cx = Math.min(width - 1, Math.max(0, Math.round(x * width)));
  const cy = Math.min(height - 1, Math.max(0, Math.round(y * height)));
  const near: Rgb[] = [];
  const ring: Rgb[] = [];
  const outer = radius * 3;
  for (let dy = -outer; dy <= outer; dy++)
    for (let dx = -outer; dx <= outer; dx++) {
      const px = cx + dx, py = cy + dy;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const d = Math.hypot(dx, dy);
      const i = (py * width + px) * 4;
      const rgb: Rgb = [data[i], data[i + 1], data[i + 2]];
      if (d <= radius) near.push(rgb);
      else if (d >= outer - 1 && d <= outer) ring.push(rgb);
    }
  const median = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1];
  const medianRgb = (px: Rgb[]): Rgb => [median(px.map((p) => p[0])), median(px.map((p) => p[1])), median(px.map((p) => p[2]))];
  if (ring.length) {
    const background = toLab(medianRgb(ring));
    const distinct = near.filter((p) => dist(toLab(p), background) > 12);
    if (distinct.length >= 3) return medianRgb(distinct);
  }
  return medianRgb(near);
}

/**
 * Toutes les taches dont la teinte est à moins de `tolerance` (écart CIELAB) de `target`. Les très grandes
 * taches (le mur lui-même, un panneau peint) sont écartées, comme pour la détection automatique.
 */
export function findSimilar(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  target: Rgb,
  tolerance = 18,
  minArea = 12,
  maxAreaRatio = 0.02,
): Blob[] {
  const n = width * height;
  const lab = toLab(target);
  const inside = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (dist(toLab([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]), lab) <= tolerance) inside[i] = 1;
  }
  const name = nearestColorName(target);
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  const blobs: Blob[] = [];
  const maxArea = n * maxAreaRatio;
  for (let start = 0; start < n; start++) {
    if (!inside[start] || seen[start]) continue;
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
        if (q >= 0 && inside[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (area >= minArea && area <= maxArea) {
      blobs.push({
        color: name,
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

/**
 * Tolérance adaptée à la prise touchée. On mesure la tache qui contient le point touché pour des tolérances
 * décroissantes : tant qu'elle grossit brutalement d'un cran à l'autre, c'est qu'elle déborde sur le mur (une
 * prise claire sur un mur clair) ; on garde la plus grande tolérance où sa taille est stable, sous la limite
 * d'une grande prise. Renvoie `null` si aucune tolérance ne l'isole.
 */
export function seedTolerance(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  target: Rgb,
  start = 30,
  maxAreaRatio = 0.02,
): number | null {
  const lab = toLab(target);
  const n = width * height;
  const maxArea = n * maxAreaRatio;
  const cx = Math.min(width - 1, Math.max(0, Math.round(x * width)));
  const cy = Math.min(height - 1, Math.max(0, Math.round(y * height)));
  const pixelLab = new Map<number, Rgb>();
  const labAt = (p: number) => {
    let v = pixelLab.get(p);
    if (!v) pixelLab.set(p, (v = toLab([data[p * 4], data[p * 4 + 1], data[p * 4 + 2]])));
    return v;
  };
  /** Taille de la tache du point touché (plafonnée juste au-dessus de la limite), 0 si le point n'entre pas. */
  const seedArea = (tol: number) => {
    let seed = -1;
    for (let r = 0; r <= 2 && seed < 0; r++)
      for (let dy = -r; dy <= r && seed < 0; dy++)
        for (let dx = -r; dx <= r && seed < 0; dx++) {
          const px = cx + dx, py = cy + dy;
          if (px < 0 || py < 0 || px >= width || py >= height) continue;
          if (dist(labAt(py * width + px), lab) <= tol) seed = py * width + px;
        }
    if (seed < 0) return 0;
    const seen = new Set<number>([seed]);
    const stack = [seed];
    while (stack.length && seen.size <= maxArea) {
      const p = stack.pop()!;
      const px = p % width;
      const py = (p - px) / width;
      for (const q of [px > 0 ? p - 1 : -1, px < width - 1 ? p + 1 : -1, py > 0 ? p - width : -1, py < height - 1 ? p + width : -1]) {
        if (q >= 0 && !seen.has(q) && dist(labAt(q), lab) <= tol) {
          seen.add(q);
          stack.push(q);
        }
      }
    }
    return seen.size;
  };
  const tols: number[] = [];
  for (let tol = start; tol >= 4; tol = Math.floor(tol * 0.85)) tols.push(tol);
  const areas = tols.map(seedArea);
  for (let i = 0; i < tols.length; i++) {
    if (areas[i] === 0 || areas[i] > maxArea) continue;
    const below = areas[i + 1] ?? areas[i];
    if (below > 0 && areas[i] <= below * 1.6) return tols[i];
  }
  const fit = tols.findIndex((_, i) => areas[i] > 0 && areas[i] <= maxArea);
  return fit >= 0 ? tols[fit] : null;
}

/** Couleurs de prises nommées, pour baptiser une teinte prélevée. */
const NAMED: { name: string; rgb: Rgb }[] = [
  { name: "jaune", rgb: [242, 197, 0] },
  { name: "orange", rgb: [245, 124, 0] },
  { name: "rouge", rgb: [211, 47, 47] },
  { name: "rose", rgb: [233, 30, 140] },
  { name: "violet", rgb: [123, 31, 162] },
  { name: "bleu", rgb: [30, 91, 214] },
  { name: "vert", rgb: [46, 157, 58] },
  { name: "noir", rgb: [34, 34, 34] },
  { name: "blanc", rgb: [242, 242, 242] },
  { name: "gris", rgb: [138, 138, 138] },
];

/** Nom de couleur le plus proche : d'abord blanc, noir ou gris si la teinte est peu saturée. */
export function nearestColorName(rgb: Rgb): string {
  const [, s, v] = hsv(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
  if (s < 0.22 || v < 0.18) return v < 0.3 ? "noir" : v > 0.75 ? "blanc" : "gris";
  const lab = toLab(rgb);
  return NAMED.filter((c) => !["noir", "blanc", "gris"].includes(c.name)).reduce((a, b) =>
    dist(toLab(b.rgb), lab) < dist(toLab(a.rgb), lab) ? b : a,
  ).name;
}

/** Ne garde que les points dans le rectangle (fractions de l'image). */
export function inZone<T extends { x: number; y: number }>(points: readonly T[], zone: { x0: number; y0: number; x1: number; y1: number }): T[] {
  const [xa, xb] = [Math.min(zone.x0, zone.x1), Math.max(zone.x0, zone.x1)];
  const [ya, yb] = [Math.min(zone.y0, zone.y1), Math.max(zone.y0, zone.y1)];
  return points.filter((p) => p.x >= xa && p.x <= xb && p.y >= ya && p.y <= yb);
}
