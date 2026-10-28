/**
 * Partie Chesscalade, famille D « intrication » (REGLES.md §4 à §6), en duo.
 * Logique pure : le temps est injecté (`now` en ms) et les blocs sont fournis par une fabrique,
 * pour pouvoir tester sans interface ni horloge réelle.
 */
import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";
import { HANG_PREP_S } from "./beam";
import type { FootRule } from "./feet";
import type { Block } from "./generator";
import type { Piece } from "./pieces";

export type { Color, Square };
export type Format = "blitz" | "classique";
export type Difficulty = "facile" | "modere" | "difficile" | "diabolique";
export type Deviation = "courte" | "libre";
/** Rythme (§5.6) : grimper à chaque déclencheur, ou par séries de blocs mis de côté. */
export type Rhythm = "immediat" | "series";
/** Rythme par séries : nombre de blocs en attente qui envoie au mur. */
export const SERIES_SIZE = 3;
/** Densité de blocs (§5.5) : combien de coups demandent de grimper. */
export type Density = "legere" | "normale" | "intense";
export type Trigger = "capture" | "echec" | "promotion" | "roque" | "mat";
export type BlockKind = "defi" | "parade" | "recharge" | "defense" | "contre-attaque" | "cloche" | "penalite";

/** La poutre dans la partie (POUTRE.md §4). */
export interface BeamSetup {
  /** « seule » : tous les défis à la poutre ; « melee » : ceux de la tour ; « aucun » : seulement recharge ou pénalité. */
  mode: "aucun" | "seule" | "melee";
  /** Durée des suspensions (s). */
  seconds: number;
  /** La recharge est une suspension. */
  recharge: boolean;
  /** Une pénalité de temps d'une chute se rachète par une suspension. */
  penalty: boolean;
}
export type Verdict = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PlayerSetup {
  name: string;
  /** Cote de grimpe du joueur au début de la partie. */
  climbRating: number;
  fatigue: boolean;
}

export interface GameConfig {
  format: Format;
  difficulty: Difficulty;
  deviation: Deviation;
  players: Record<Color, PlayerSetup>;
  /** Solo contre un moteur (§9.1) : couleur jouée par le moteur, qui ne grimpe pas. */
  engine?: { color: Color; elo: number };
  /** Famille C « intrication rythmée » (§3.5) : une cloche force un bloc à intervalle régulier. */
  bell?: boolean;
  /** Règle de pieds des blocs (§7.6) ; « auto » (défaut) : selon le niveau de difficulté. */
  feet?: "auto" | FootRule;
  /** Densité de blocs (§5.5) ; « normale » par défaut. */
  density?: Density;
  /** Rythme (§5.6) ; « immediat » par défaut. */
  rhythm?: Rhythm;
  /** La poutre (POUTRE.md §4) ; absente : pas de poutre. */
  beam?: BeamSetup;
}

export interface BlockRequest {
  climber: Color;
  kind: BlockKind;
  piece: Piece | null;
  targetRating: number;
  length: number;
  cruxLast: boolean;
  feet?: FootRule;
  /** À la poutre : une suspension de `hangS` secondes au lieu d'un bloc (la fabrique la choisit). */
  beam?: boolean;
  hangS?: number;
}

export type BlockFactory = (request: BlockRequest) => Block | null;

export interface PendingBlock {
  request: BlockRequest;
  block: Block | null;
  timeLimitMs: number;
  attemptsLeft: number;
  triggers: Trigger[];
  /** Coup en suspens (bloc-défi). */
  move?: Move;
  /** Recharge « bloc dur ». */
  hard?: boolean;
  /** Rythme par séries : place du bloc dans la série en cours. */
  series?: { index: number; total: number };
  /** Suspension de rachat : la pénalité (ms) qu'elle efface si elle est tenue. */
  debtMs?: number;
  startedAt: number;
}

export interface DeviationChoice {
  /** Joueur dont la pièce est déviée. */
  player: Color;
  /** Joueur qui choisit la case (l'adversaire en V6). */
  chooser: Color;
  from: Square;
  intended: Square;
  options: Move[];
}

export interface Exhaustion {
  square: Square;
  color: Color;
  turnsLeft: number;
  order: number;
}

export type GameOverReason = "mat" | "pat" | "nulle" | "temps" | "abandon";

export interface GameResult {
  winner: Color | null;
  reason: GameOverReason;
}

export type Phase = "move" | "block" | "deviation" | "over";

export interface LogEntry {
  color: Color;
  text: string;
  /** Pour l'affichage : bonne nouvelle, mauvaise, ou simple information. */
  tone?: "bon" | "mauvais" | "neutre";
}

/** Résultat d'un bloc, à reporter dans les cotes et le journal par l'appelant. */
export interface BlockOutcome {
  climber: Color;
  kind: BlockKind;
  block: Block | null;
  success: boolean;
}

// --- Paramètres des règles -------------------------------------------------

export const FORMAT = {
  blitz: { startMs: 3 * 60_000, blockLimitMs: 45_000, length: 5, recharge: { normal: 30_000, hard: 30_000 } },
  classique: { startMs: 10 * 60_000, blockLimitMs: 90_000, length: 7, recharge: { normal: 60_000, hard: 90_000 } },
} as const;

export const DIFFICULTY = {
  facile: { base: 1, cap: 2, attempts: 2, penaltyMs: 10_000, limitFactor: 1, exhaustTurns: 1, ratingBonus: -200 },
  modere: { base: 2, cap: 4, attempts: 1, penaltyMs: 20_000, limitFactor: 1, exhaustTurns: 1, ratingBonus: 0 },
  difficile: { base: 3, cap: 5, attempts: 1, penaltyMs: 30_000, limitFactor: 0.8, exhaustTurns: 2, ratingBonus: 150 },
  diabolique: { base: 3, cap: 6, attempts: 1, penaltyMs: 30_000, limitFactor: 0.65, exhaustTurns: 2, ratingBonus: 300 },
} as const;

const CAPTURE_BONUS: Record<PieceSymbol, number> = { p: -300, n: -100, b: -100, r: 100, q: 300, k: 0 };
const TRIGGER_BONUS = { echec: 0, promotion: 200, roque: -400, mat: 200 } as const;
const PARADE_BONUS = -200;
const HARD_RECHARGE_BONUS = 200;
const MULTI_TRIGGER_BONUS = 100;
const FATIGUE_PER_BLOCK = 15;
const V6_PENALTY_MS = 45_000;
const PARADE_LIMIT_MS = 20_000;
const PARADE_LENGTH = 4;
const RECHARGE_EVERY = 5;
const DEFENSE_BONUS = -200;
/**
 * Solo : le moteur joue en moins d'une seconde, le joueur réfléchit. Sans compensation, le joueur tombe
 * au temps à coup sûr : il reçoit donc un incrément à chaque coup (le moteur, non).
 */
export const SOLO_INCREMENT_MS = { blitz: 5_000, classique: 10_000 } as const;
/** Réussir un bloc rapporte du temps (§4) : le bloc-défi plus que les autres. */
export const SUCCESS_BONUS_MS = {
  defi: { blitz: 10_000, classique: 20_000 },
  autre: { blitz: 5_000, classique: 10_000 },
} as const;

const possessive = (piece: Piece) => (piece === "dame" || piece === "tour" ? `ta ${piece}` : `ton ${piece}`);

/** Conséquence d'un verdict, en clair (§5.2). */
export function verdictText(verdict: Verdict, move: Move, penaltyS: number, exhaustTurns: number): string {
  const piece = possessive(PIECE_OF[move.piece]);
  const turns = exhaustTurns === 1 ? "au prochain tour" : `pendant ${exhaustTurns} tours`;
  switch (verdict) {
    case 0:
      return `${move.san} est joué`;
    case 1:
      return `${move.san} est joué, mais tu perds ${penaltyS} s`;
    case 2:
      return `${move.san} est joué, mais ${piece} ne pourra pas bouger ${turns}`;
    case 3:
      return `${move.san} est annulé : joue un autre coup`;
    case 4:
      return `${move.san} est annulé, et ${piece} est bloqué(e) ce tour-ci puis ${turns}`;
    case 5:
      return `${piece} doit quand même bouger, mais sur une autre case, au plus près de ${move.to}`;
    case 6:
      return `l'adversaire choisit la case de ${piece}, et tu perds 45 s`;
  }
}
const COUNTER_BONUS = { difficile: 300, diabolique: 400 } as const;
const COUNTER_MAJOR_BONUS = 100;
const COUNTER_PENALTY_MS = 30_000;
/** Suspension de rachat d'une pénalité : un peu plus facile que la cote du joueur (POUTRE.md §4). */
const DEBT_HANG_BONUS = -100;

/** « tu perds 20 s », ou la pénalité mise de côté pour la poutre. */
function lossText(ms: number, later: boolean): string {
  return later ? `${ms / 1000} s de pénalité, à racheter à la poutre` : `tu perds ${ms / 1000} s`;
}
/**
 * Densité de blocs (§5.5).
 * - recaptureFree : reprendre aussitôt sur la case de la prise adverse ne déclenche rien (un échange = un bloc) ;
 * - cooldown : nombre de coups du joueur, après un bloc, qui ne déclenchent rien (le mat reste un bloc) ;
 * - defense : en solo, ce qui fait grimper le joueur quand le moteur joue.
 */
export const DENSITY = {
  legere: { recaptureFree: true, cooldown: 2, pawnCaptures: false, check: false, castle: false, defense: "aucune", parade: false },
  normale: { recaptureFree: true, cooldown: 1, pawnCaptures: true, check: true, castle: false, defense: "pieces", parade: true },
  intense: { recaptureFree: false, cooldown: 0, pawnCaptures: true, check: true, castle: true, defense: "toutes", parade: true },
} as const;

/** Famille C : intervalle de la cloche, en temps de jeu (pendules en marche hors blocs). */
export const BELL_INTERVAL_MS = { blitz: 4 * 60_000, classique: 8 * 60_000 } as const;

export const PIECE_OF: Record<PieceSymbol, Piece> = { p: "pion", n: "cavalier", b: "fou", r: "tour", q: "dame", k: "roi" };

export const VERDICT_LABELS: Record<Verdict, string> = {
  0: "Validé",
  1: "Validé + pénalité",
  2: "Limité",
  3: "Annulé",
  4: "Interdit",
  5: "Dévié",
  6: "Dévié par l'adversaire",
};

/** Pièce la plus active d'un camp : celle qui a le plus de coups possibles (§3.3 famille B, §3.5 famille C). */
export function mostActivePiece(fen: string, color: Color): Piece {
  const parts = fen.split(" ");
  parts[1] = color;
  parts[3] = "-"; // la prise en passant n'a de sens que pour le camp au trait
  let chess: Chess;
  try {
    chess = new Chess(parts.join(" "));
  } catch {
    return "roi";
  }
  const mobility = new Map<string, { type: PieceSymbol; count: number }>();
  for (const m of chess.moves({ verbose: true })) {
    const entry = mobility.get(m.from) ?? { type: m.piece, count: 0 };
    entry.count++;
    mobility.set(m.from, entry);
  }
  let best: { type: PieceSymbol; count: number } | null = null;
  for (const e of mobility.values()) if (!best || e.count > best.count) best = e;
  return best ? PIECE_OF[best.type] : "roi";
}

/** Règle de pieds par défaut selon le niveau (§7.6). */
export const AUTO_FEET: Record<Difficulty, FootRule> = {
  facile: "libres",
  modere: "libres",
  difficile: "mains",
  diabolique: "sans-pied",
};

export function other(color: Color): Color {
  return color === "w" ? "b" : "w";
}

/** Verdict d'une chute selon le niveau et le compteur de chutes consécutives (§5.3). */
export function verdictForFall(difficulty: Difficulty, consecutiveFalls: number): Verdict {
  const d = DIFFICULTY[difficulty];
  const n = Math.max(1, consecutiveFalls);
  const escalation = difficulty === "facile" ? Math.floor((n - 1) / 2) : n - 1;
  return Math.min(d.cap, d.base + escalation) as Verdict;
}

/** Déclencheurs d'un coup selon le format (§3.2). */
export function triggersOf(format: Format, move: Move): Trigger[] {
  const triggers: Trigger[] = [];
  const after = new Chess(move.after);
  if (move.captured && (format === "classique" || move.captured !== "p")) triggers.push("capture");
  if (move.promotion) triggers.push("promotion");
  if (format === "classique") {
    if (move.isKingsideCastle() || move.isQueensideCastle()) triggers.push("roque");
    if (after.isCheckmate()) triggers.push("mat");
    else if (after.inCheck()) triggers.push("echec");
  }
  return triggers;
}

function squareDistance(a: Square, b: Square): number {
  return Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1])));
}

/** Partie sauvegardée (JSON) : de quoi la reprendre après un rechargement ou sur un autre appareil. */
export interface SavedGame {
  version: 1;
  savedAt: number;
  config: GameConfig;
  /** Coups joués depuis la position initiale (format UCI). */
  moves: string[];
  clock: { remaining: Record<Color, number>; running: Color | null };
  phase: Phase;
  pending: (Omit<PendingBlock, "move"> & { move?: string }) | null;
  deviation: (Omit<DeviationChoice, "options"> & { options: string[] }) | null;
  result: GameResult | null;
  log: LogEntry[];
  lastVerdict: ChesscaladeGame["lastVerdict"];
  consecutiveFalls: Record<Color, number>;
  blocksClimbed: Record<Color, number>;
  movesSinceRecharge: Record<Color, number>;
  exhausted: Exhaustion[];
  forbiddenThisTurn: string[];
  kingOnly: Color | null;
  lastEngineMove: string | null;
  counterAttackUsed: boolean;
  engineExcluded: string[];
  exhaustionOrder: number;
  bell?: { playTimeMs: number; rung: number; queue: Color[] };
  lastBlockPly?: Record<Color, number>;
  queue?: Record<Color, BlockRequest[]>;
  seriesRest?: BlockRequest[];
  beamDebt?: Record<Color, number>;
}

const SAVED_LOG_LIMIT = 60;

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// --- Pendule -----------------------------------------------------------------

export class Clock {
  remaining: Record<Color, number>;
  running: Color | null = null;
  private since = 0;

  constructor(startMs: number) {
    this.remaining = { w: startMs, b: startMs };
  }

  remainingAt(color: Color, now: number): number {
    return this.running === color ? this.remaining[color] - (now - this.since) : this.remaining[color];
  }

  run(color: Color | null, now: number): void {
    this.settle(now);
    this.running = color;
    this.since = now;
  }

  add(color: Color, ms: number, now: number): void {
    this.settle(now);
    this.remaining[color] += ms;
  }

  private settle(now: number): void {
    if (this.running) this.remaining[this.running] -= now - this.since;
    this.since = now;
  }
}

// --- Partie --------------------------------------------------------------------

export class ChesscaladeGame {
  readonly chess = new Chess();
  readonly clock: Clock;
  phase: Phase = "move";
  pending: PendingBlock | null = null;
  deviation: DeviationChoice | null = null;
  result: GameResult | null = null;
  log: LogEntry[] = [];
  lastVerdict: { color: Color; verdict: Verdict; move: string } | null = null;
  consecutiveFalls: Record<Color, number> = { w: 0, b: 0 };
  blocksClimbed: Record<Color, number> = { w: 0, b: 0 };
  movesSinceRecharge: Record<Color, number> = { w: RECHARGE_EVERY, b: RECHARGE_EVERY };
  exhausted: Exhaustion[] = [];
  /** Coups (lan) interdits pour le tour en cours. */
  forbiddenThisTurn = new Set<string>();
  /** Après une parade ratée (Difficile et au-dessus) : parer avec le roi si c'est légal. */
  kingOnly: Color | null = null;
  /** Solo : dernier coup du moteur, contre-attaque utilisée, coups exclus pour sa nouvelle recherche. */
  lastEngineMove: Move | null = null;
  counterAttackUsed = false;
  engineExcluded: string[] = [];
  private exhaustionOrder = 0;
  /** Famille C : temps de jeu écoulé, cloches déjà sonnées, grimpeurs en attente. */
  bellPlayTimeMs = 0;
  bellsRung = 0;
  bellQueue: Color[] = [];
  /** Demi-coup du dernier bloc de chaque joueur (temps de récupération, §5.5). */
  lastBlockPly: Record<Color, number> = { w: -100, b: -100 };
  /** Rythme par séries : blocs mis de côté pour chaque joueur, et suite de la série en cours. */
  queue: Record<Color, BlockRequest[]> = { w: [], b: [] };
  private seriesRest: BlockRequest[] = [];
  /** Pénalités à racheter à la poutre (ms), en attente d'un moment pour la suspension. */
  beamDebt: Record<Color, number> = { w: 0, b: 0 };
  private lastTickAt: number | null = null;

  constructor(
    readonly config: GameConfig,
    private readonly makeBlock: BlockFactory,
    now: number,
  ) {
    this.clock = new Clock(FORMAT[config.format].startMs);
    this.clock.run("w", now);
  }

  // --- Sauvegarde ------------------------------------------------------------------

  save(now: number): SavedGame {
    return {
      version: 1,
      savedAt: now,
      config: jsonClone(this.config),
      moves: this.chess.history({ verbose: true }).map((m) => m.lan),
      clock: {
        remaining: { w: this.clock.remainingAt("w", now), b: this.clock.remainingAt("b", now) },
        running: this.clock.running,
      },
      phase: this.phase,
      // Copie JSON : le bloc peut contenir des objets réactifs de l'interface, que le clonage natif refuse.
      pending: this.pending ? { ...jsonClone({ ...this.pending, move: undefined }), move: this.pending.move?.lan } : null,
      deviation: this.deviation ? { ...this.deviation, options: this.deviation.options.map((m) => m.lan) } : null,
      result: this.result,
      log: this.log.slice(-SAVED_LOG_LIMIT),
      lastVerdict: this.lastVerdict,
      consecutiveFalls: { ...this.consecutiveFalls },
      blocksClimbed: { ...this.blocksClimbed },
      movesSinceRecharge: { ...this.movesSinceRecharge },
      exhausted: this.exhausted.map((e) => ({ ...e })),
      forbiddenThisTurn: [...this.forbiddenThisTurn],
      kingOnly: this.kingOnly,
      lastEngineMove: this.lastEngineMove?.lan ?? null,
      counterAttackUsed: this.counterAttackUsed,
      engineExcluded: [...this.engineExcluded],
      exhaustionOrder: this.exhaustionOrder,
      bell: { playTimeMs: this.bellPlayTimeMs, rung: this.bellsRung, queue: [...this.bellQueue] },
      lastBlockPly: { ...this.lastBlockPly },
      queue: jsonClone(this.queue),
      seriesRest: jsonClone(this.seriesRest),
      beamDebt: { ...this.beamDebt },
    };
  }

  /**
   * Reprend une partie sauvegardée. Les pendules repartent de leur temps sauvegardé (le temps passé
   * page fermée ne compte pas) et le bloc en cours repart avec sa limite complète.
   */
  static restore(saved: SavedGame, makeBlock: BlockFactory, now: number): ChesscaladeGame {
    const game = new ChesscaladeGame(jsonClone(saved.config), makeBlock, now);
    for (const lan of saved.moves) {
      game.chess.move({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan[4] });
    }
    const history = game.chess.history({ verbose: true });
    const legal = game.chess.moves({ verbose: true });
    // Coup en suspens : encore à jouer (bloc-défi), ou déjà joué (défense, contre-attaque).
    const findMove = (lan: string): Move | undefined => legal.find((m) => m.lan === lan) ?? (history.at(-1)?.lan === lan ? history.at(-1) : undefined);

    game.clock.remaining = { ...saved.clock.remaining };
    game.clock.run(saved.clock.running, now);
    game.phase = saved.phase;
    game.pending = saved.pending ? { ...saved.pending, move: saved.pending.move ? findMove(saved.pending.move) : undefined, startedAt: now } : null;
    game.deviation = saved.deviation
      ? { ...saved.deviation, options: saved.deviation.options.map((lan) => legal.find((m) => m.lan === lan)).filter((m): m is Move => !!m) }
      : null;
    game.result = saved.result;
    game.log = [...saved.log];
    game.lastVerdict = saved.lastVerdict;
    game.consecutiveFalls = { ...saved.consecutiveFalls };
    game.blocksClimbed = { ...saved.blocksClimbed };
    game.movesSinceRecharge = { ...saved.movesSinceRecharge };
    game.exhausted = saved.exhausted.map((e) => ({ ...e }));
    game.forbiddenThisTurn = new Set(saved.forbiddenThisTurn);
    game.kingOnly = saved.kingOnly;
    game.lastEngineMove = saved.lastEngineMove && history.at(-1)?.lan === saved.lastEngineMove ? history.at(-1)! : null;
    game.counterAttackUsed = saved.counterAttackUsed;
    game.engineExcluded = [...saved.engineExcluded];
    game.exhaustionOrder = saved.exhaustionOrder;
    game.bellPlayTimeMs = saved.bell?.playTimeMs ?? 0;
    game.bellsRung = saved.bell?.rung ?? 0;
    game.bellQueue = [...(saved.bell?.queue ?? [])];
    game.lastBlockPly = { ...(saved.lastBlockPly ?? { w: -100, b: -100 }) };
    game.queue = jsonClone(saved.queue ?? { w: [], b: [] });
    game.seriesRest = jsonClone(saved.seriesRest ?? []);
    game.beamDebt = { ...(saved.beamDebt ?? { w: 0, b: 0 }) };
    return game;
  }

  get turn(): Color {
    return this.chess.turn();
  }

  // --- Coups autorisés ---------------------------------------------------------

  /** Coups jouables par le joueur au trait, contraintes comprises (§6). */
  allowedMoves(): Move[] {
    const color = this.turn;
    const legal = this.chess.moves({ verbose: true });
    const notForbidden = legal.filter((m) => !this.forbiddenThisTurn.has(m.lan));

    const kingOnly = this.kingOnly === color ? notForbidden.filter((m) => m.piece === "k") : notForbidden;
    const pool = kingOnly.length > 0 ? kingOnly : notForbidden;

    // Règle 1 : lever les épuisements du plus récent au plus ancien jusqu'à ce qu'il reste un coup.
    const active = this.exhausted.filter((e) => e.color === color).sort((a, b) => b.order - a.order);
    for (let lifted = 0; lifted <= active.length; lifted++) {
      const blocked = new Set(active.slice(lifted).map((e) => e.square));
      const moves = pool.filter((m) => !blocked.has(m.from));
      if (moves.length > 0) return moves;
    }
    return [];
  }

  isExhausted(square: Square): boolean {
    return this.exhausted.some((e) => e.square === square && e.color === this.chess.get(square)?.color);
  }

  canRecharge(): boolean {
    return this.phase === "move" && !this.isEngineTurn() && this.movesSinceRecharge[this.turn] >= RECHARGE_EVERY;
  }

  isEngineTurn(): boolean {
    return this.phase === "move" && this.config.engine?.color === this.turn;
  }

  /** Coups que le moteur peut jouer (au format UCI), hors coup annulé par une contre-attaque. */
  engineCandidates(): string[] {
    return this.chess
      .moves({ verbose: true })
      .map((m) => m.lan)
      .filter((lan) => !this.engineExcluded.includes(lan));
  }

  /** Contre-attaque (§9.1) : Difficile et au-dessus, une fois par partie, juste après un coup du moteur. */
  canCounterAttack(): boolean {
    const engine = this.config.engine;
    if (!engine || this.counterAttackUsed || this.phase !== "move" || this.turn === engine.color) return false;
    if (this.config.difficulty !== "difficile" && this.config.difficulty !== "diabolique") return false;
    const last = this.chess.history({ verbose: true }).at(-1);
    return !!last && !!this.lastEngineMove && last.lan === this.lastEngineMove.lan && last.after === this.lastEngineMove.after;
  }

  requestCounterAttack(now: number): void {
    if (!this.canCounterAttack()) throw new Error("Contre-attaque indisponible.");
    const move = this.lastEngineMove!;
    const color = this.turn;
    const difficulty = this.config.difficulty as keyof typeof COUNTER_BONUS;
    const major = move.captured === "r" || move.captured === "q";
    this.counterAttackUsed = true;
    const request: BlockRequest = {
      climber: color,
      kind: "contre-attaque",
      piece: PIECE_OF[move.piece],
      targetRating: this.baseTarget(color) + COUNTER_BONUS[difficulty] + (major ? COUNTER_MAJOR_BONUS : 0),
      length: FORMAT[this.config.format].length,
      cruxLast: false,
    };
    this.startBlock({ request, triggers: [], move }, now);
  }

  // --- Actions -------------------------------------------------------------------

  /** Le joueur au trait joue un coup : appliqué directement, ou mis en suspens derrière un bloc-défi. */
  play(from: Square, to: Square, promotion: PieceSymbol | undefined, now: number): void {
    if (this.phase !== "move") throw new Error("Ce n'est pas le moment de jouer un coup.");
    const move = this.allowedMoves().find((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === (promotion ?? "q")));
    if (!move) throw new Error("Coup non autorisé.");

    const triggers = triggersOf(this.config.format, move);
    if (this.config.engine?.color === this.turn) {
      this.playEngineMove(move, triggers, now);
      return;
    }
    const color = this.turn;
    const kept = this.densityFilter(color, move, triggers);
    if (kept.length === 0) {
      this.applyMove(move, now);
      return;
    }
    this.lastBlockPly[color] = this.chess.history().length;
    const request = this.defiRequest(color, move, kept);
    if (this.config.rhythm === "series" && !kept.includes("mat")) {
      // Par séries : le coup est joué tout de suite, le bloc attend (le mat, lui, se grimpe aussitôt).
      this.applyMove(move, now);
      this.enqueue(color, request, `${move.san}`, now);
      return;
    }
    this.startBlock({ request, triggers: kept, move }, now);
  }

  /** Rythme par séries : aller au mur maintenant avec les blocs en attente. */
  canGoToWall(): boolean {
    return this.phase === "move" && !this.isEngineTurn() && this.queue[this.turn].length > 0;
  }

  goToWall(now: number): void {
    if (!this.canGoToWall()) throw new Error("Aucun bloc en attente.");
    this.startSeries(this.turn, now);
  }

  private enqueue(color: Color, request: BlockRequest, label: string, now: number): void {
    this.queue[color].push(request);
    const n = this.queue[color].length;
    this.note(color, `Bloc mis de côté (${label}) : ${n}/${SERIES_SIZE}.`);
    if (n >= SERIES_SIZE && this.phase === "move") this.startSeries(color, now);
  }

  private startSeries(color: Color, now: number): void {
    const [first, ...rest] = this.queue[color];
    this.queue[color] = [];
    if (!first) return;
    this.seriesRest = rest;
    this.note(color, `Passage au mur : ${rest.length + 1} bloc(s) d'affilée.`);
    this.startBlock({ request: first, triggers: [], series: { index: 1, total: rest.length + 1 } }, now);
  }

  /** Bloc d'une série : la réussite rapporte du temps, la chute en coûte (les coups sont déjà joués). */
  private resolveSeriesBlock(pending: PendingBlock, success: boolean, now: number): void {
    const climber = pending.request.climber;
    const series = pending.series!;
    const kind = pending.request.kind === "defi" ? "defi" : "autre";
    if (success) {
      this.consecutiveFalls[climber] = 0;
      this.note(climber, `Bloc ${series.index}/${series.total} réussi : +${this.reward(climber, kind, now)} s.`, "bon");
    } else {
      const penaltyMs = DIFFICULTY[this.config.difficulty].penaltyMs;
      const later = this.fallPenalty(climber, penaltyMs, now);
      this.note(climber, `Bloc ${series.index}/${series.total} raté : ${lossText(penaltyMs, later)}.`, "mauvais");
    }
    const [next, ...rest] = this.seriesRest;
    if (next) {
      this.seriesRest = rest;
      this.startBlock({ request: next, triggers: [], series: { index: series.index + 1, total: series.total } }, now);
      return;
    }
    this.phase = "move";
    this.clock.run(this.turn, now);
  }

  /** Recharge volontaire : la pendule du grimpeur continue de tourner (§4). */
  requestRecharge(hard: boolean, now: number): void {
    if (!this.canRecharge()) throw new Error("Recharge indisponible.");
    const color = this.turn;
    const request: BlockRequest = {
      climber: color,
      kind: "recharge",
      piece: null,
      targetRating: this.baseTarget(color) + (hard ? HARD_RECHARGE_BONUS : 0),
      length: FORMAT[this.config.format].length,
      cruxLast: false,
    };
    this.startBlock({ request, triggers: [], hard }, now);
  }

  /** Résultat du bloc en cours (validé sur l'honneur ou par l'adversaire). */
  blockResult(success: boolean, now: number): BlockOutcome {
    const pending = this.pending;
    if (this.phase !== "block" || !pending) throw new Error("Aucun bloc en cours.");
    const { request } = pending;
    const climber = request.climber;

    if (!success && pending.attemptsLeft > 1 && request.kind === "defi") {
      pending.attemptsLeft--;
      pending.startedAt = now;
      this.note(climber, "Chute — nouvel essai.");
      return { climber, kind: request.kind, block: pending.block, success: false };
    }

    this.blocksClimbed[climber]++;
    this.pending = null;
    this.phase = "move";
    const outcome: BlockOutcome = { climber, kind: request.kind, block: pending.block, success };
    if (pending.series) {
      this.resolveSeriesBlock(pending, success, now);
      this.startDebtHang(now);
      this.checkFlag(now);
      return outcome;
    }

    switch (request.kind) {
      case "recharge":
        this.movesSinceRecharge[climber] = 0;
        if (success) {
          const gain = FORMAT[this.config.format].recharge[pending.hard ? "hard" : "normal"];
          this.clock.add(climber, gain, now);
          this.note(climber, `Recharge réussie : +${gain / 1000} s.`, "bon");
        } else {
          this.note(climber, "Recharge ratée : aucun temps gagné.", "mauvais");
        }
        this.clock.run(climber, now);
        break;
      case "parade":
        if (success) {
          this.note(climber, `Parade réussie : +${this.reward(climber, "autre", now)} s.`, "bon");
        } else if (this.config.difficulty === "difficile" || this.config.difficulty === "diabolique") {
          this.kingOnly = climber;
          this.note(climber, "Parade ratée : il faut parer avec le roi si c'est possible.", "mauvais");
        } else {
          const ms = DIFFICULTY[this.config.difficulty].penaltyMs;
          this.note(climber, `Parade ratée : ${lossText(ms, this.fallPenalty(climber, ms, now))}.`, "mauvais");
        }
        this.clock.run(climber, now);
        break;
      case "defi":
        this.resolveDefi(pending, success, now);
        break;
      case "cloche":
        if (success) {
          this.note(climber, `Bloc de la cloche réussi : +${this.reward(climber, "autre", now)} s.`, "bon");
        } else {
          const ms = DIFFICULTY[this.config.difficulty].penaltyMs;
          this.note(climber, `Bloc de la cloche raté : ${lossText(ms, this.fallPenalty(climber, ms, now))}.`, "mauvais");
        }
        this.nextBellClimber(now);
        break;
      case "defense":
        if (success) {
          this.note(climber, `Défense réussie : pas de pénalité, et +${this.reward(climber, "autre", now)} s.`, "bon");
        } else {
          const ms = DIFFICULTY[this.config.difficulty].penaltyMs;
          this.note(climber, `Défense ratée : ${lossText(ms, this.fallPenalty(climber, ms, now))}.`, "mauvais");
        }
        this.clock.run(climber, now);
        break;
      case "penalite": {
        const ms = pending.debtMs ?? 0;
        if (success) {
          this.note(climber, `Suspension tenue : la pénalité de ${ms / 1000} s est rachetée.`, "bon");
        } else {
          this.penalize(climber, ms, now);
          this.note(climber, `Suspension lâchée : tu perds ${ms / 1000} s.`, "mauvais");
        }
        this.clock.run(this.turn, now);
        break;
      }
      case "contre-attaque": {
        const move = pending.move!;
        if (success) {
          this.chess.undo();
          this.engineExcluded = [move.lan];
          this.lastEngineMove = null;
          this.note(climber, `Contre-attaque réussie : ${move.san} est annulé, le moteur rejoue.`, "bon");
          this.clock.run(move.color, now);
        } else {
          this.penalize(climber, COUNTER_PENALTY_MS, now);
          this.note(climber, `Contre-attaque ratée : tu perds ${COUNTER_PENALTY_MS / 1000} s.`, "mauvais");
          this.clock.run(climber, now);
        }
        break;
      }
    }
    this.startDebtHang(now);
    this.checkFlag(now);
    return outcome;
  }

  /** Choix de la case en cas de déviation (V5 par le joueur, V6 par l'adversaire). */
  chooseDeviation(to: Square, now: number): void {
    const deviation = this.deviation;
    if (this.phase !== "deviation" || !deviation) throw new Error("Aucune déviation en cours.");
    const move = deviation.options.find((m) => m.to === to);
    if (!move) throw new Error("Case de déviation non autorisée.");
    this.deviation = null;
    this.phase = "move";
    this.note(deviation.player, `Coup dévié : ${move.san}.`);
    this.applyMove(move, now);
    this.startDebtHang(now);
  }

  resign(color: Color, now: number): void {
    this.finish({ winner: other(color), reason: "abandon" }, now);
  }

  setFatigue(color: Color, enabled: boolean): void {
    this.config.players[color].fatigue = enabled;
  }

  /** À appeler régulièrement par l'interface : drapeau, et cloche en famille C. */
  tick(now: number): void {
    this.checkFlag(now);
    if (!this.config.bell || this.phase === "over") {
      this.lastTickAt = now;
      return;
    }
    // Temps de jeu : seulement quand on réfléchit à un coup (pas pendant les blocs).
    if (this.lastTickAt !== null && this.phase === "move" && this.clock.running) this.bellPlayTimeMs += now - this.lastTickAt;
    this.lastTickAt = now;
    if (this.phase === "move" && this.bellPlayTimeMs >= this.nextBellAt()) this.ringBell(now);
  }

  /** Temps de jeu auquel sonnera la prochaine cloche. */
  nextBellAt(): number {
    return BELL_INTERVAL_MS[this.config.format] * (this.bellsRung + 1);
  }

  private ringBell(now: number): void {
    this.bellsRung++;
    const climbers: Color[] = [this.turn, other(this.turn)].filter((c) => c !== this.config.engine?.color);
    this.bellQueue = climbers;
    this.note(this.turn, `Cloche ${this.bellsRung} : chacun grimpe un bloc.`);
    this.nextBellClimber(now);
  }

  private nextBellClimber(now: number): void {
    const climber = this.bellQueue.shift();
    if (!climber) {
      this.phase = "move";
      this.clock.run(this.turn, now);
      return;
    }
    const request: BlockRequest = {
      climber,
      kind: "cloche",
      piece: mostActivePiece(this.chess.fen(), climber),
      targetRating: this.baseTarget(climber),
      length: FORMAT[this.config.format].length,
      cruxLast: false,
    };
    this.startBlock({ request, triggers: [] }, now);
  }

  /** Chute du drapeau. */
  checkFlag(now: number): void {
    if (this.phase === "over") return;
    for (const color of ["w", "b"] as Color[]) {
      if (this.clock.remainingAt(color, now) <= 0) {
        this.clock.remaining[color] = 0;
        const winner = other(color);
        // Matériel insuffisant pour mater : nulle (règle standard).
        const winnerCanMate = !insufficientMaterialFor(this.chess, winner);
        this.finish({ winner: winnerCanMate ? winner : null, reason: winnerCanMate ? "temps" : "nulle" }, now);
        return;
      }
    }
  }

  // --- Interne -------------------------------------------------------------------

  private baseTarget(color: Color): number {
    const player = this.config.players[color];
    const fatigue = player.fatigue ? FATIGUE_PER_BLOCK * this.blocksClimbed[color] : 0;
    return player.climbRating + DIFFICULTY[this.config.difficulty].ratingBonus - fatigue;
  }

  private defiRequest(color: Color, move: Move, triggers: Trigger[]): BlockRequest {
    const bonuses = triggers.map((t) => (t === "capture" ? CAPTURE_BONUS[move.captured ?? "p"] : TRIGGER_BONUS[t]));
    const bonus = Math.max(...bonuses) + (triggers.length > 1 ? MULTI_TRIGGER_BONUS : 0);
    const baseLength = FORMAT[this.config.format].length;
    let piece: Piece = PIECE_OF[move.piece];
    let length = baseLength;
    if (triggers.includes("promotion")) {
      piece = "tour"; // traversée longue
      length = baseLength + 2;
    } else if (triggers.includes("roque")) {
      piece = "roi";
    }
    return {
      climber: color,
      kind: "defi",
      piece,
      targetRating: this.baseTarget(color) + bonus,
      length,
      cruxLast: triggers.includes("capture"),
    };
  }

  /** Règle de pieds de la partie (la parade, courte et pressée, reste toujours pieds libres). */
  footRule(kind: BlockKind): FootRule {
    if (kind === "parade") return "libres";
    const rule = this.config.feet ?? "auto";
    return rule === "auto" ? AUTO_FEET[this.config.difficulty] : rule;
  }

  /** Ce défi se fait-il à la poutre (POUTRE.md §4) ? */
  private atBeam(request: BlockRequest): boolean {
    const b = this.config.beam;
    if (!b) return false;
    if (request.kind === "penalite") return true;
    if (request.kind === "recharge" && b.recharge) return true;
    if (b.mode === "seule") return true;
    return b.mode === "melee" && request.piece === "tour";
  }

  private startBlock(
    init: { request: BlockRequest; triggers: Trigger[]; move?: Move; hard?: boolean; series?: { index: number; total: number }; debtMs?: number },
    now: number,
  ): void {
    const beam = this.atBeam(init.request);
    const request: BlockRequest = beam
      ? { ...init.request, beam: true, hangS: this.config.beam!.seconds, feet: undefined }
      : { ...init.request, feet: this.footRule(init.request.kind) };
    init = { ...init, request };
    const d = DIFFICULTY[this.config.difficulty];
    const baseLimit = request.kind === "parade" ? PARADE_LIMIT_MS : FORMAT[this.config.format].blockLimitMs;
    const limit = Math.round(baseLimit * d.limitFactor);
    this.pending = {
      ...init,
      block: this.makeBlock(request),
      // Une suspension a sa durée : la limite laisse le temps de se placer et de la tenir.
      timeLimitMs: beam ? Math.max(limit, (request.hangS! + HANG_PREP_S + 15) * 1000) : limit,
      attemptsLeft: request.kind === "defi" ? d.attempts : 1,
      startedAt: now,
    };
    this.phase = "block";
    // Pendule : en pause pendant un bloc-défi ou une parade, sauf en Diabolique ; tourne pendant une recharge.
    const clockRuns = request.kind === "recharge" || this.config.difficulty === "diabolique";
    this.clock.run(clockRuns ? request.climber : null, now);
  }

  private resolveDefi(pending: PendingBlock, success: boolean, now: number): void {
    const move = pending.move!;
    const color = pending.request.climber;
    const d = DIFFICULTY[this.config.difficulty];

    let verdict: Verdict = 0;
    if (success) {
      this.consecutiveFalls[color] = 0;
    } else {
      this.consecutiveFalls[color]++;
      verdict = verdictForFall(this.config.difficulty, this.consecutiveFalls[color]);
      if (pending.triggers.includes("mat") && verdict < 3) verdict = 3; // §6 règle 5
    }
    this.lastVerdict = { color, verdict, move: move.san };
    if (success) {
      this.note(color, `Bloc réussi : ${move.san} est joué, et +${this.reward(color, "defi", now)} s.`, "bon");
    } else {
      this.note(color, `Chute : ${verdictText(verdict, move, d.penaltyMs / 1000, d.exhaustTurns)}.`, "mauvais");
    }
    this.clock.run(color, now);

    switch (verdict) {
      case 0:
        this.applyMove(move, now);
        return;
      case 1:
        if (this.fallPenalty(color, d.penaltyMs, now)) this.note(color, `Les ${d.penaltyMs / 1000} s de pénalité peuvent se racheter à la poutre.`);
        this.applyMove(move, now);
        return;
      case 2:
        this.applyMove(move, now);
        this.exhaust(move.to, color, d.exhaustTurns);
        return;
      case 3:
        this.forbiddenThisTurn.add(move.lan);
        this.lastResortIfStuck(move, now);
        return;
      case 4:
        for (const m of this.chess.moves({ square: move.from, verbose: true })) this.forbiddenThisTurn.add(m.lan);
        // Interdite ce tour-ci, puis épuisée pendant N tours.
        this.exhaust(move.from, color, d.exhaustTurns + 1);
        this.lastResortIfStuck(move, now);
        return;
      case 5:
      case 6:
        this.startDeviation(move, verdict, now);
        return;
    }
  }

  /** §6 règle 3 : si plus aucun coup n'est possible ce tour-ci, le dernier coup tenté est joué en V1. */
  private lastResortIfStuck(move: Move, now: number): void {
    if (this.allowedMoves().length > 0) return;
    this.note(move.color, "Dernier recours : plus aucun autre coup possible, le coup est joué avec pénalité.");
    this.penalize(move.color, DIFFICULTY[this.config.difficulty].penaltyMs, now);
    this.applyMove(move, now);
  }

  private startDeviation(move: Move, verdict: 5 | 6, now: number): void {
    const color = move.color;
    const castle = move.isKingsideCastle() || move.isQueensideCastle();
    let options = castle
      ? []
      : this.chess
          .moves({ square: move.from, verbose: true })
          .filter((m) => m.to !== move.to && (!m.promotion || m.promotion === move.promotion));
    if (options.length > 0 && this.config.deviation === "courte") {
      const best = Math.min(...options.map((m) => squareDistance(m.to, move.to)));
      options = options.filter((m) => squareDistance(m.to, move.to) === best);
    }
    if (options.length === 0) {
      // Pas de déviation possible → V3 Annulé (§5.2 bis).
      this.note(color, "Aucune déviation possible : le coup est annulé.");
      this.forbiddenThisTurn.add(move.lan);
      this.lastResortIfStuck(move, now);
      return;
    }
    if (verdict === 6) this.penalize(color, V6_PENALTY_MS, now);
    this.deviation = {
      player: color,
      chooser: verdict === 6 ? other(color) : color,
      from: move.from,
      intended: move.to,
      options,
    };
    this.phase = "deviation";
  }

  private applyMove(move: Move, now: number): void {
    const color = move.color;
    this.chess.move({ from: move.from, to: move.to, promotion: move.promotion });

    // Fin du tour du joueur : décompte des épuisements, levée des contraintes du tour.
    this.exhausted = this.exhausted
      .map((e) => (e.color === color ? { ...e, turnsLeft: e.turnsLeft - 1 } : e))
      .filter((e) => e.turnsLeft > 0 && this.chess.get(e.square)?.color === e.color);
    this.forbiddenThisTurn.clear();
    if (this.kingOnly === color) this.kingOnly = null;
    this.movesSinceRecharge[color]++;
    if (this.config.engine && this.config.engine.color !== color) {
      this.clock.add(color, SOLO_INCREMENT_MS[this.config.format], now);
    }
    this.phase = "move";

    if (this.chess.isGameOver()) {
      if (this.chess.isCheckmate()) this.finish({ winner: color, reason: "mat" }, now);
      else this.finish({ winner: null, reason: this.chess.isStalemate() ? "pat" : "nulle" }, now);
      return;
    }

    const opponent = other(color);
    this.clock.run(opponent, now);

    // Être mis en échec : bloc de parade, en Classique uniquement (§5.4). En solo, le bloc de défense le remplace.
    if (this.config.format === "classique" && this.chess.inCheck() && !this.config.engine && this.density.parade) {
      const request: BlockRequest = {
        climber: opponent,
        kind: "parade",
        piece: "roi",
        targetRating: this.baseTarget(opponent) + PARADE_BONUS,
        length: PARADE_LENGTH,
        cruxLast: false,
      };
      if (this.config.rhythm === "series") this.enqueue(opponent, request, "parade", now);
      else this.startBlock({ request, triggers: [] }, now);
    }
  }

  /** Coup du moteur : toujours appliqué ; s'il déclenche un événement, le joueur grimpe un bloc de défense. */
  private playEngineMove(move: Move, allTriggers: Trigger[], now: number): void {
    const human = other(move.color);
    const ply = this.chess.history().length;
    const triggers = this.defenseTriggers(human, move, allTriggers);
    this.applyMove(move, now);
    this.lastEngineMove = move;
    this.engineExcluded = [];
    if (this.phase !== "move" || triggers.length === 0) return;
    this.lastBlockPly[human] = ply;
    const bonuses = triggers.map((t) => (t === "capture" ? CAPTURE_BONUS[move.captured ?? "p"] : TRIGGER_BONUS[t]));
    const request: BlockRequest = {
      climber: human,
      kind: "defense",
      piece: PIECE_OF[move.piece],
      targetRating: this.baseTarget(human) + Math.max(...bonuses) + DEFENSE_BONUS,
      length: FORMAT[this.config.format].length - 1,
      cruxLast: false,
    };
    if (this.config.rhythm === "series") {
      this.enqueue(human, request, `défense sur ${move.san}`, now);
      return;
    }
    this.startBlock({ request, triggers, move }, now);
  }

  get density() {
    return DENSITY[this.config.density ?? "normale"];
  }

  /** Reprise : on prend sur la case où l'adversaire vient de prendre (un échange). */
  private isRecapture(move: Move): boolean {
    const last = this.chess.history({ verbose: true }).at(-1);
    return !!move.captured && !!last?.captured && last.to === move.to;
  }

  /** Déclencheurs retenus selon la densité (§5.5) ; le mat déclenche toujours. */
  private densityFilter(color: Color, move: Move, triggers: Trigger[]): Trigger[] {
    if (triggers.includes("mat")) return triggers;
    const d = this.density;
    let kept = triggers.filter(
      (t) =>
        (t !== "roque" || d.castle) &&
        (t !== "echec" || d.check) &&
        (t !== "capture" || ((d.pawnCaptures || move.captured !== "p") && !(d.recaptureFree && this.isRecapture(move)))),
    );
    // Temps de récupération : les coups qui suivent un bloc du joueur ne déclenchent rien. Le coup rejoué
    // au même demi-coup après une annulation n'en profite pas (sinon rater une prise rendrait la suivante gratuite).
    const ply = this.chess.history().length;
    const ownMovesSince = Math.floor((ply - this.lastBlockPly[color]) / 2);
    if (kept.length > 0 && d.cooldown > 0 && ply > this.lastBlockPly[color] && ownMovesSince <= d.cooldown) kept = [];
    return kept;
  }

  /** Solo : ce qui fait grimper le joueur quand le moteur joue (§9.1, §5.5). */
  private defenseTriggers(human: Color, move: Move, triggers: Trigger[]): Trigger[] {
    const d = this.density;
    if (d.defense === "toutes") return triggers;
    if (d.defense === "aucune") return [];
    const pieceCapture = triggers.includes("capture") && move.captured !== "p" && !(d.recaptureFree && this.isRecapture(move));
    if (!pieceCapture) return [];
    const ownMovesSince = Math.floor((this.chess.history().length - this.lastBlockPly[human]) / 2);
    return d.cooldown > 0 && ownMovesSince <= d.cooldown ? [] : ["capture"];
  }

  private exhaust(square: Square, color: Color, turns: number): void {
    this.exhausted = this.exhausted.filter((e) => e.square !== square);
    this.exhausted.push({ square, color, turnsLeft: turns, order: this.exhaustionOrder++ });
  }

  private penalize(color: Color, ms: number, now: number): void {
    this.clock.add(color, -ms, now);
  }

  /** Pénalité d'une chute : tout de suite, ou à racheter à la poutre ; vrai si elle attend la poutre. */
  private fallPenalty(color: Color, ms: number, now: number): boolean {
    if (this.config.beam?.penalty) {
      this.beamDebt[color] += ms;
      return true;
    }
    this.penalize(color, ms, now);
    return false;
  }

  /** Dès que la partie le permet, une suspension pour racheter les pénalités en attente (une seule pour le total). */
  private startDebtHang(now: number): void {
    if (this.phase !== "move" || this.result) return;
    const color = ([this.turn, other(this.turn)] as Color[]).find((c) => this.beamDebt[c] > 0);
    if (!color) return;
    const debtMs = this.beamDebt[color];
    this.beamDebt[color] = 0;
    this.note(color, `À la poutre pour racheter ${debtMs / 1000} s de pénalité.`);
    const request: BlockRequest = {
      climber: color,
      kind: "penalite",
      piece: null,
      targetRating: this.baseTarget(color) + DEBT_HANG_BONUS,
      length: FORMAT[this.config.format].length,
      cruxLast: false,
    };
    this.startBlock({ request, triggers: [], debtMs }, now);
  }

  private finish(result: GameResult, now: number): void {
    this.result = result;
    this.phase = "over";
    this.pending = null;
    this.deviation = null;
    this.clock.run(null, now);
  }

  /** Bonus de temps pour un bloc réussi ; renvoie les secondes gagnées. */
  private reward(color: Color, kind: keyof typeof SUCCESS_BONUS_MS, now: number): number {
    const ms = SUCCESS_BONUS_MS[kind][this.config.format];
    this.clock.add(color, ms, now);
    return ms / 1000;
  }

  private note(color: Color, text: string, tone: LogEntry["tone"] = "neutre"): void {
    this.log.push({ color, text, tone });
  }
}

/** Le camp `color` n'a pas assez de matériel pour mater (roi seul, ou roi + une pièce mineure). */
function insufficientMaterialFor(chess: Chess, color: Color): boolean {
  const pieces = chess
    .board()
    .flat()
    .filter((p): p is NonNullable<typeof p> => p !== null && p.color === color && p.type !== "k");
  if (pieces.length === 0) return true;
  return pieces.length === 1 && (pieces[0].type === "n" || pieces[0].type === "b");
}
