/**
 * Caractère des pièces (REGLES.md §7.1) : la pièce donne la forme globale du bloc,
 * les mouvements entre prises restent des mouvements d'escalade à portée.
 */
import { distance, upDirection, type Hold, type Wall } from "./wall";

export type Piece = "pion" | "cavalier" | "fou" | "tour" | "dame" | "roi";

export const PIECES: { id: Piece; label: string; symbol: string; character: string }[] = [
  { id: "pion", label: "Pion", symbol: "♟", character: "Court, montée directe" },
  { id: "cavalier", label: "Cavalier", symbol: "♞", character: "Trajectoire décalée, changements de direction" },
  { id: "fou", label: "Fou", symbol: "♝", character: "Trajectoire diagonale sur le pan" },
  { id: "tour", label: "Tour", symbol: "♜", character: "Montée verticale ou traversée horizontale" },
  { id: "dame", label: "Dame", symbol: "♛", character: "Long et varié, crux marqué" },
  { id: "roi", label: "Roi", symbol: "♚", character: "Court et compact, sans relâche" },
];

/** Longueur max imposée par certaines pièces (le pion fait des blocs courts). */
export const PIECE_MAX_LENGTH: Partial<Record<Piece, number>> = { pion: 5, roi: 6 };
/** Longueur min (la dame fait des blocs longs). */
export const PIECE_MIN_LENGTH: Partial<Record<Piece, number>> = { dame: 6 };

interface Step {
  up: number;
  side: number;
}

function step(wall: Wall, a: Hold, b: Hold): Step {
  return { up: (b.position.row - a.position.row) * upDirection(wall), side: b.position.col - a.position.col };
}

function steps(wall: Wall, path: readonly Hold[]): Step[] {
  return path.slice(1).map((h, i) => step(wall, path[i], h));
}

function bbox(path: readonly Hold[]): { rows: number; cols: number } {
  const rows = path.map((h) => h.position.row);
  const cols = path.map((h) => h.position.col);
  return { rows: Math.max(...rows) - Math.min(...rows) + 1, cols: Math.max(...cols) - Math.min(...cols) + 1 };
}

/**
 * Contrainte vérifiée à chaque ajout de prise (élagage de la recherche).
 * `path` contient déjà la nouvelle prise en dernier.
 */
export function stepAllowed(wall: Wall, piece: Piece, path: readonly Hold[]): boolean {
  if (path.length < 2) return true;
  const last = step(wall, path[path.length - 2], path[path.length - 1]);
  const all = steps(wall, path);
  switch (piece) {
    case "pion":
      return last.up >= 1 && Math.abs(last.side) <= 1;
    case "roi": {
      const box = bbox(path);
      return distance(path[path.length - 2].position, path[path.length - 1].position) === 1 && box.rows <= 3 && box.cols <= 3;
    }
    case "tour": {
      // Soit tout vertical (montée, colonne à ±1), soit tout horizontal (traversée, rangée à ±1).
      const box = bbox(path);
      const vertical = box.cols <= 2 && all.every((s) => s.up >= 1);
      const sideSign = Math.sign(all.find((s) => s.side !== 0)?.side ?? 0);
      const horizontal = box.rows <= 2 && all.every((s) => s.side !== 0 && Math.sign(s.side) === sideSign);
      return vertical || horizontal;
    }
    case "fou": {
      const sideSign = Math.sign(all.find((s) => s.side !== 0)?.side ?? 0);
      return last.up >= 0 && (last.side === 0 || Math.sign(last.side) === sideSign) && (last.up > 0 || last.side !== 0);
    }
    case "cavalier":
    case "dame":
      return true;
  }
}

/** Contrainte vérifiée sur le bloc complet. */
export function pathFits(wall: Wall, piece: Piece, path: readonly Hold[]): boolean {
  for (let i = 2; i <= path.length; i++) {
    if (!stepAllowed(wall, piece, path.slice(0, i))) return false;
  }
  const all = steps(wall, path);
  switch (piece) {
    case "fou": {
      const up = all.reduce((s, x) => s + x.up, 0);
      const side = Math.abs(all.reduce((s, x) => s + x.side, 0));
      return up >= 2 && side >= 2 && up / side <= 2.5 && side / up <= 2.5;
    }
    case "cavalier": {
      // Au moins deux changements de direction latérale et un mouvement latéral marqué.
      const signs = all.map((s) => Math.sign(s.side)).filter((s) => s !== 0);
      let changes = 0;
      for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) changes++;
      const marked = all.some((s) => Math.abs(s.side) >= 2 && Math.abs(s.up) <= 1);
      return changes >= 2 && marked;
    }
    case "dame": {
      // Crux marqué : la prise la plus dure dépasse la moyenne d'au moins un niveau.
      const levels = path.map((h) => h.level);
      const mean = levels.reduce((s, l) => s + l, 0) / levels.length;
      return Math.max(...levels) - mean >= 1;
    }
    default:
      return true;
  }
}
