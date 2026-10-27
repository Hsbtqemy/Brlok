/**
 * Partie Chesscalade, famille D « intrication » (REGLES.md §4 à §6), en duo.
 * Logique pure : le temps est injecté (`now` en ms) et les blocs sont fournis par une fabrique,
 * pour pouvoir tester sans interface ni horloge réelle.
 */
import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";
import type { Block } from "./generator";
import type { Piece } from "./pieces";

export type { Color, Square };
export type Format = "blitz" | "classique";
export type Difficulty = "facile" | "modere" | "difficile" | "diabolique";
export type Deviation = "courte" | "libre";
export type Trigger = "capture" | "echec" | "promotion" | "roque" | "mat";
export type BlockKind = "defi" | "parade" | "recharge" | "defense" | "contre-attaque";
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
}

export interface BlockRequest {
  climber: Color;
  kind: BlockKind;
  piece: Piece | null;
  targetRating: number;
  length: number;
  cruxLast: boolean;
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
}

/** Résultat d'un bloc, à reporter dans les cotes et le journal par l'appelant. */
export interface BlockOutcome {
  climber: Color;
  kind: BlockKind;
  block: Block | null;
  success: boolean;
}

// --- Paramètres des règles -------------------------------------------------

const FORMAT = {
  blitz: { startMs: 3 * 60_000, blockLimitMs: 45_000, length: 5, recharge: { normal: 30_000, hard: 30_000 } },
  classique: { startMs: 10 * 60_000, blockLimitMs: 90_000, length: 7, recharge: { normal: 60_000, hard: 90_000 } },
} as const;

const DIFFICULTY = {
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
const COUNTER_BONUS = { difficile: 300, diabolique: 400 } as const;
const COUNTER_MAJOR_BONUS = 100;
const COUNTER_PENALTY_MS = 30_000;

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

  constructor(
    readonly config: GameConfig,
    private readonly makeBlock: BlockFactory,
    now: number,
  ) {
    this.clock = new Clock(FORMAT[config.format].startMs);
    this.clock.run("w", now);
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
    if (triggers.length === 0) {
      this.applyMove(move, now);
      return;
    }
    const color = this.turn;
    const request = this.defiRequest(color, move, triggers);
    this.startBlock({ request, triggers, move }, now);
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

    switch (request.kind) {
      case "recharge":
        this.movesSinceRecharge[climber] = 0;
        if (success) {
          const gain = FORMAT[this.config.format].recharge[pending.hard ? "hard" : "normal"];
          this.clock.add(climber, gain, now);
          this.note(climber, `Recharge réussie : +${gain / 1000} s.`);
        } else {
          this.note(climber, "Recharge ratée : aucun temps gagné.");
        }
        this.clock.run(climber, now);
        break;
      case "parade":
        if (success) {
          this.note(climber, "Parade réussie.");
        } else if (this.config.difficulty === "difficile" || this.config.difficulty === "diabolique") {
          this.kingOnly = climber;
          this.note(climber, "Parade ratée : il faut parer avec le roi si c'est possible.");
        } else {
          this.penalize(climber, DIFFICULTY[this.config.difficulty].penaltyMs, now);
          this.note(climber, "Parade ratée : pénalité de temps.");
        }
        this.clock.run(climber, now);
        break;
      case "defi":
        this.resolveDefi(pending, success, now);
        break;
      case "defense":
        if (success) {
          this.note(climber, "Bloc de défense réussi.");
        } else {
          this.penalize(climber, DIFFICULTY[this.config.difficulty].penaltyMs, now);
          this.note(climber, "Bloc de défense raté : pénalité de temps.");
        }
        this.clock.run(climber, now);
        break;
      case "contre-attaque": {
        const move = pending.move!;
        if (success) {
          this.chess.undo();
          this.engineExcluded = [move.lan];
          this.lastEngineMove = null;
          this.note(climber, `Contre-attaque réussie : ${move.san} est annulé, le moteur rejoue.`);
          this.clock.run(move.color, now);
        } else {
          this.penalize(climber, COUNTER_PENALTY_MS, now);
          this.note(climber, "Contre-attaque ratée : pénalité de temps.");
          this.clock.run(climber, now);
        }
        break;
      }
    }
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
  }

  resign(color: Color, now: number): void {
    this.finish({ winner: other(color), reason: "abandon" }, now);
  }

  setFatigue(color: Color, enabled: boolean): void {
    this.config.players[color].fatigue = enabled;
  }

  /** À appeler régulièrement par l'interface : chute du drapeau. */
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

  private startBlock(init: { request: BlockRequest; triggers: Trigger[]; move?: Move; hard?: boolean }, now: number): void {
    const { request } = init;
    const d = DIFFICULTY[this.config.difficulty];
    const baseLimit = request.kind === "parade" ? PARADE_LIMIT_MS : FORMAT[this.config.format].blockLimitMs;
    this.pending = {
      ...init,
      block: this.makeBlock(request),
      timeLimitMs: Math.round(baseLimit * d.limitFactor),
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
    this.note(color, success ? `Bloc réussi : ${move.san} validé.` : `Chute → V${verdict} ${VERDICT_LABELS[verdict]} (${move.san}).`);
    this.clock.run(color, now);

    switch (verdict) {
      case 0:
        this.applyMove(move, now);
        return;
      case 1:
        this.penalize(color, d.penaltyMs, now);
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
    this.phase = "move";

    if (this.chess.isGameOver()) {
      if (this.chess.isCheckmate()) this.finish({ winner: color, reason: "mat" }, now);
      else this.finish({ winner: null, reason: this.chess.isStalemate() ? "pat" : "nulle" }, now);
      return;
    }

    const opponent = other(color);
    this.clock.run(opponent, now);

    // Être mis en échec : bloc de parade, en Classique uniquement (§5.4). En solo, le bloc de défense le remplace.
    if (this.config.format === "classique" && this.chess.inCheck() && !this.config.engine) {
      const request: BlockRequest = {
        climber: opponent,
        kind: "parade",
        piece: "roi",
        targetRating: this.baseTarget(opponent) + PARADE_BONUS,
        length: PARADE_LENGTH,
        cruxLast: false,
      };
      this.startBlock({ request, triggers: [] }, now);
    }
  }

  /** Coup du moteur : toujours appliqué ; s'il déclenche un événement, le joueur grimpe un bloc de défense. */
  private playEngineMove(move: Move, triggers: Trigger[], now: number): void {
    this.applyMove(move, now);
    this.lastEngineMove = move;
    this.engineExcluded = [];
    if (this.phase !== "move" || triggers.length === 0) return;
    const human = other(move.color);
    const bonuses = triggers.map((t) => (t === "capture" ? CAPTURE_BONUS[move.captured ?? "p"] : TRIGGER_BONUS[t]));
    const request: BlockRequest = {
      climber: human,
      kind: "defense",
      piece: PIECE_OF[move.piece],
      targetRating: this.baseTarget(human) + Math.max(...bonuses) + DEFENSE_BONUS,
      length: FORMAT[this.config.format].length - 1,
      cruxLast: false,
    };
    this.startBlock({ request, triggers, move }, now);
  }

  private exhaust(square: Square, color: Color, turns: number): void {
    this.exhausted = this.exhausted.filter((e) => e.square !== square);
    this.exhausted.push({ square, color, turnsLeft: turns, order: this.exhaustionOrder++ });
  }

  private penalize(color: Color, ms: number, now: number): void {
    this.clock.add(color, -ms, now);
  }

  private finish(result: GameResult, now: number): void {
    this.result = result;
    this.phase = "over";
    this.pending = null;
    this.deviation = null;
    this.clock.run(null, now);
  }

  private note(color: Color, text: string): void {
    this.log.push({ color, text });
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
