/**
 * La poutre (POUTRE.md) : description, import et export Brlok desktop (« grille pieds »), intégration au
 * pan, et suspensions (une prise par main, une durée) avec leur cote.
 */
import { estimateBlockRating, LEVEL_CENTER, POINTS_PER_LEVEL, RATING_CENTER } from "./blockRating";
import type { Block } from "./generator";
import type { Rng } from "./random";
import { clampLevel, holdId, type Beam, type Hold, type Position, type Wall } from "./wall";

export const BEAM_ROWS = 4;
export const BEAM_COLS = 6;
/** Durée des suspensions (s). */
export const HANG_MIN_S = 3;
export const HANG_MAX_S = 60;
export const HANG_DEFAULT_S = 10;
/** Temps pour se placer avant le décompte. */
export const HANG_PREP_S = 3;

/** Suspension : une prise par main (la même ou deux prises), une durée. */
export interface Hang {
  left: string;
  right: string;
  seconds: number;
}

/** Identifiant d'une prise de poutre : P + case (PA1 = colonne A, rangée 1). */
export const beamHoldId = (position: Position) => `P${holdId(position)}`;

export function emptyBeam(rows = BEAM_ROWS, cols = BEAM_COLS): Beam {
  return { rows, cols, holds: [], placement: "agres" };
}

/** Types de prise de poutre connus. */
export const BEAM_TYPE_NAMES = ["bac", "réglette", "plat", "bi-doigt", "mono", "pince"];

/** Types de prise d'après l'étiquette de Brlok desktop : « [Bac] », « [35°] », « bi30 », « 25 » (mm). */
export function specTags(spec: string): string[] {
  const s = spec.trim().toLowerCase();
  if (!s) return [];
  if (s.includes("bac")) return ["bac"];
  if (s.includes("°")) return ["plat"];
  if (s.startsWith("bi")) return ["bi-doigt"];
  if (s.includes("mono")) return ["mono"];
  if (/^\d+(\s*mm)?$/.test(s)) return ["réglette"];
  // Étiquette réduite au type (prise exportée sans étiquette) : « réglette », « plat », « pince »…
  if (BEAM_TYPE_NAMES.includes(s)) return [s];
  return [];
}

/** Étiquette lisible : « [35°] » → « 35° », « bi30 » → « bi 30 », « 25 » → « 25 mm ». */
export function specText(spec: string): string {
  const s = spec.trim().replace(/^\[(.*)\]$/, "$1");
  if (/^\d+$/.test(s)) return `${s} mm`;
  const bi = /^bi\s*(\d+)$/i.exec(s);
  if (bi) return `bi ${bi[1]}`;
  return s;
}

/** Nom affiché d'une prise de poutre : son étiquette, sinon son type, sinon son identifiant. */
export function beamHoldName(hold: Hold): string {
  return hold.label ? specText(hold.label) : (hold.tags[0] ?? hold.id);
}

/** Grille pieds de Brlok desktop → poutre (cases vides écartées). */
export function beamFromDesktop(footGrid: string[][] | undefined, footLevels: number[][] | undefined): Beam | undefined {
  if (!footGrid?.length) return undefined;
  const rows = footGrid.length;
  const cols = Math.max(...footGrid.map((r) => r?.length ?? 0));
  const holds: Hold[] = [];
  footGrid.forEach((cells, row) =>
    (cells ?? []).forEach((raw, col) => {
      const spec = (raw ?? "").trim();
      if (!spec) return;
      const position = { row, col };
      holds.push({ id: beamHoldId(position), level: clampLevel(footLevels?.[row]?.[col] ?? 1), tags: specTags(spec), position, active: true, label: spec });
    }),
  );
  if (holds.length === 0) return undefined;
  return { rows, cols, holds, placement: "agres" };
}

/** Poutre → grille pieds 4 × 6 de Brlok desktop (au-delà, coupée ; niveaux limités à 1–6). */
export function beamToDesktop(beam: Beam): { foot_grid: string[][]; foot_levels: number[][]; cut: number } {
  const grid = Array.from({ length: BEAM_ROWS }, () => Array<string>(BEAM_COLS).fill(""));
  const levels = Array.from({ length: BEAM_ROWS }, () => Array<number>(BEAM_COLS).fill(1));
  let cut = 0;
  for (const h of beam.holds) {
    const { row, col } = h.position;
    if (row >= BEAM_ROWS || col >= BEAM_COLS) {
      cut++;
      continue;
    }
    grid[row][col] = h.label?.trim() || h.tags[0] || h.id;
    levels[row][col] = clampLevel(h.level);
  }
  return { foot_grid: grid, foot_levels: levels, cut };
}

/**
 * Le mur tel qu'on le grimpe : avec sa poutre intégrée, juste au-dessus de la rangée du haut (centrée en
 * largeur). Les prises gardent leurs identifiants ; seules les positions bougent. Sans poutre intégrée :
 * le mur tel quel.
 */
export function withBeam(wall: Wall): Wall {
  const beam = wall.beam;
  if (!beam || beam.placement !== "integree" || beam.holds.length === 0 || wall.kind !== "pan") return wall;
  const cols = Math.max(wall.cols, beam.cols);
  const panShift = Math.floor((cols - wall.cols) / 2);
  const beamShift = Math.floor((cols - beam.cols) / 2);
  const top = wall.bottom === "last";
  const pan = wall.holds.map((h) => ({
    ...h,
    position: { row: top ? h.position.row + beam.rows : h.position.row, col: h.position.col + panShift },
  }));
  const bar = beam.holds.map((h) => ({
    ...h,
    // Rangée 1 de la poutre = la plus haute.
    position: { row: top ? h.position.row : wall.rows + beam.rows - 1 - h.position.row, col: h.position.col + beamShift },
  }));
  return { ...wall, rows: wall.rows + beam.rows, cols, holds: [...pan, ...bar] };
}

/** Une prise appartient-elle à la poutre ? */
export const isBeamHold = (wall: Wall, id: string) => !!wall.beam?.holds.some((h) => h.id === id);

/** Cote d'une suspension (POUTRE.md §2) : niveau des deux prises, écart entre les mains, durée. */
export function hangRating(levels: readonly number[], seconds: number): number {
  if (levels.length === 0) return RATING_CENTER;
  const mean = levels.reduce((s, l) => s + l, 0) / levels.length;
  const max = Math.max(...levels);
  return Math.round(RATING_CENTER + POINTS_PER_LEVEL * (mean - LEVEL_CENTER) + 100 * (max - mean) + 25 * (seconds - 10));
}

export const clampSeconds = (s: number) => Math.max(HANG_MIN_S, Math.min(HANG_MAX_S, Math.round(Number(s) || HANG_DEFAULT_S)));

/** Le bloc d'une suspension (journal, cotes, favoris) : les prises des deux mains, et la suspension. */
export function hangBlock(beam: Beam, hang: Hang): Block | null {
  const left = beam.holds.find((h) => h.id === hang.left && h.active);
  const right = beam.holds.find((h) => h.id === hang.right && h.active);
  if (!left || !right) return null;
  const seconds = clampSeconds(hang.seconds);
  const holds = (left.id === right.id ? [left] : [left, right]).map((h) => ({ ...h, tags: [...h.tags], position: { ...h.position } }));
  return { holds, estimatedRating: hangRating([left.level, right.level], seconds), relaxations: [], hang: { left: left.id, right: right.id, seconds } };
}

/** « bac / bac · 10 s » (mêmes prises : « bac (2 mains) · 10 s »). */
export function hangText(block: Block): string {
  const hang = block.hang;
  if (!hang) return "";
  const name = (id: string) => {
    const h = block.holds.find((x) => x.id === id);
    return h ? beamHoldName(h) : id;
  };
  const hands = hang.left === hang.right ? `${name(hang.left)} (2 mains)` : `${name(hang.left)} / ${name(hang.right)}`;
  return `${hands} · ${hang.seconds} s`;
}

export interface HangOptions {
  targetRating: number;
  seconds: number;
  /** Compteur d'utilisation des prises (mis à jour), pour varier. */
  usage?: Map<string, number>;
  rng: Rng;
}

/**
 * Suspension choisie par l'app : une main de chaque côté de la poutre (gauche : colonnes de gauche), la paire
 * la plus proche de la cote visée ; les prises jumelles (symétriques) sont préférées.
 */
export function pickHang(beam: Beam, options: HangOptions): Block | null {
  const active = beam.holds.filter((h) => h.active);
  if (active.length === 0) return null;
  const seconds = clampSeconds(options.seconds);
  const middle = beam.cols / 2;
  const lefts = active.filter((h) => h.position.col < middle);
  const rights = active.filter((h) => h.position.col >= middle);
  // Poutre d'un seul côté (ou d'une seule colonne) : les deux mains sur la même prise.
  const pairs: [Hold, Hold][] =
    lefts.length && rights.length ? lefts.flatMap((l) => rights.map((r): [Hold, Hold] => [l, r])) : active.map((h): [Hold, Hold] => [h, h]);
  const usage = options.usage;
  const score = ([l, r]: [Hold, Hold]) => {
    const mirror = l.position.row === r.position.row && l.position.col + r.position.col === beam.cols - 1;
    const used = usage ? (usage.get(l.id) ?? 0) + (usage.get(r.id) ?? 0) : 0;
    return Math.abs(hangRating([l.level, r.level], seconds) - options.targetRating) + (mirror ? 0 : 60) + 25 * used + options.rng() * 40;
  };
  const [l, r] = pairs.reduce((a, b) => (score(b) < score(a) ? b : a));
  if (usage) for (const h of l.id === r.id ? [l] : [l, r]) usage.set(h.id, (usage.get(h.id) ?? 0) + 1);
  return hangBlock(beam, { left: l.id, right: r.id, seconds });
}

/** Cote visée d'une suspension de sortie, d'après le niveau d'une séance de Brlok classique. */
export const levelToRating = (level: number) => estimateBlockRating(Array(6).fill(level));

/** Sortie à la poutre : chaque bloc d'une séance finit par une suspension (cote d'après le niveau de la séance). */
export function withFinishes(blocks: readonly Block[], beam: Beam, options: { level: number; seconds: number; rng: Rng }): Block[] {
  const usage = new Map<string, number>();
  return blocks.map((b) => {
    const finish = pickHang(beam, { targetRating: levelToRating(options.level), seconds: options.seconds, usage, rng: options.rng });
    return finish ? { ...b, finish } : b;
  });
}
