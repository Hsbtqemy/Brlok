/**
 * Familles A et B : les rounds (REGLES.md §3.3 et §3.4), en duo.
 * Rounds d'échecs et rounds de mur alternent. Pendant un round de mur, le plateau est figé et les deux
 * joueurs s'affrontent dans un duel au mur, à tour de rôle.
 * Logique pure : le temps est injecté et les blocs viennent d'une fabrique ; l'état des duels est en
 * données simples (JSON), pour la sauvegarde.
 */
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { Clock, mostActivePiece, other, type Format, type GameResult } from "./game";

export { mostActivePiece };
import type { Block } from "./generator";
import type { Piece } from "./pieces";

export type Family = "A" | "B";
export type DuelFormat = "ajoute" | "meme" | "impose";
export type Bonus = "temps" | "joker";

export interface RoundsConfig {
  family: Family;
  format: Format;
  duel: DuelFormat;
  players: Record<Color, { name: string; climbRating: number }>;
  /** Solo contre un moteur : il joue les rounds d'échecs ; au mur, le joueur vise un objectif. */
  engine?: { color: Color; elo: number };
}

export interface DuelBlockRequest {
  piece: Piece | null;
  targetRating: number;
  length: number;
}
export type DuelBlockFactory = (request: DuelBlockRequest) => Block | null;

export const ROUNDS = {
  blitz: { chessMs: 2 * 60_000, wallMs: 2 * 60_000, maxRounds: 3, clockMs: 3 * 60_000, blockLength: 5 },
  classique: { chessMs: 4 * 60_000, wallMs: 3 * 60_000, maxRounds: 5, clockMs: 10 * 60_000, blockLength: 7 },
} as const;

export const KO_STREAK = 3;
export const BONUS_TIME_MS = 30_000;
export const AJOUTE_START = 3;
export const IMPOSE_STEP = 100;
export const IMPOSE_MAX_RESTARTS = 2;

/** Solo : objectifs au mur (§3.4 « En solo »). */
export const SOLO = {
  blitz: { progressiveLength: 6, cibleAttempts: 2 },
  classique: { progressiveLength: 8, cibleAttempts: 3 },
  progressiveOffset: -100,
  imposedOffset: 100,
} as const;

export interface MemeResult {
  success: boolean;
  attempts: number;
  /** Index (1 = première prise) de la prise la plus haute atteinte. */
  highest: number;
}

export type Duel =
  | {
      format: "ajoute";
      piece: Piece;
      /** Prises du bloc qui s'allonge (identifiants). */
      sequence: string[];
      climber: Color;
      winner?: Color | null;
    }
  | {
      format: "meme";
      piece: Piece;
      block: string[];
      estimatedRating: number;
      order: [Color, Color];
      results: Partial<Record<Color, MemeResult>>;
      winner?: Color | null;
    }
  | {
      format: "impose";
      budget: number;
      restarts: number;
      /** Ordre : compose (chacun pour l'autre), puis grimpe. */
      step: "compose" | "climb";
      actor: Color;
      /** Bloc composé PAR ce joueur, pour son adversaire. */
      composed: Partial<Record<Color, string[]>>;
      results: Partial<Record<Color, boolean>>;
      winner?: Color | null;
    }
  | {
      /** Solo : le joueur contre un objectif (progressif, cible ou imposé par le moteur). */
      format: "solo";
      kind: DuelFormat;
      piece: Piece | null;
      block: string[];
      estimatedRating: number;
      /** Nombre de prises dévoilées (bloc progressif) ; tout le bloc sinon. */
      shown: number;
      attemptsLeft: number;
      climber: Color;
      winner?: Color | null;
    };

export interface DuelRecord {
  round: number;
  winner: Color | null;
}

export type Stage = "echecs" | "mur" | "bonus" | "over";

export interface RoundsResult extends Omit<GameResult, "reason"> {
  reason: GameResult["reason"] | "ko" | "points";
}

export interface SavedRounds {
  version: 1;
  savedAt: number;
  config: RoundsConfig;
  moves: string[];
  clock: { remaining: Record<Color, number>; running: Color | null };
  stage: Stage;
  /** Temps déjà écoulé dans le round en cours. */
  stageElapsed: number;
  round: number;
  duel: Duel | null;
  duels: DuelRecord[];
  lossStreak: Record<Color, number>;
  bonusFor: Color | null;
  jokerAvailable: Record<Color, boolean>;
  result: RoundsResult | null;
  log: string[];
}

export class RoundsGame {
  readonly chess = new Chess();
  readonly clock: Clock;
  stage: Stage = "echecs";
  /** Numéro du round (0 = premier round d'échecs et le round de mur qui le suit). */
  round = 0;
  duel: Duel | null = null;
  duels: DuelRecord[] = [];
  lossStreak: Record<Color, number> = { w: 0, b: 0 };
  bonusFor: Color | null = null;
  /** Le joker se gagne au mur (bonus de la famille B) ; personne n'en a au départ. */
  jokerAvailable: Record<Color, boolean> = { w: false, b: false };
  result: RoundsResult | null = null;
  log: string[] = [];
  private stageStartedAt: number;

  constructor(
    readonly config: RoundsConfig,
    private readonly makeBlock: DuelBlockFactory,
    now: number,
  ) {
    this.clock = new Clock(ROUNDS[config.format].clockMs);
    this.clock.run("w", now);
    this.stageStartedAt = now;
  }

  get turn(): Color {
    return this.chess.turn();
  }

  get params() {
    return ROUNDS[this.config.format];
  }

  /** Temps restant dans le round en cours (échecs ou mur). */
  stageRemaining(now: number): number {
    if (this.stage !== "echecs" && this.stage !== "mur") return 0;
    const length = this.stage === "echecs" ? this.params.chessMs : this.params.wallMs;
    // Bornée à la durée du round : l'affichage peut avoir quelques millisecondes de retard sur le début du round.
    return Math.min(length, Math.max(0, length - (now - this.stageStartedAt)));
  }

  duelWins(): Record<Color, number> {
    return {
      w: this.duels.filter((d) => d.winner === "w").length,
      b: this.duels.filter((d) => d.winner === "b").length,
    };
  }

  // --- Échecs ---------------------------------------------------------------------

  play(from: Square, to: Square, promotion: PieceSymbol | undefined, now: number): void {
    if (this.stage !== "echecs") throw new Error("Le plateau est figé pendant le round de mur.");
    const color = this.turn;
    this.chess.move({ from, to, promotion: promotion ?? "q" });
    if (this.chess.isGameOver()) {
      if (this.chess.isCheckmate()) this.finish({ winner: color, reason: "mat" }, now);
      else this.finish({ winner: null, reason: this.chess.isStalemate() ? "pat" : "nulle" }, now);
      return;
    }
    this.clock.run(this.turn, now);
  }

  /** Joker (famille B) : un indice du moteur, une fois par partie et par joueur, à son tour. */
  useJoker(color: Color): void {
    if (this.stage !== "echecs" || this.turn !== color || !this.jokerAvailable[color]) throw new Error("Joker indisponible.");
    this.jokerAvailable[color] = false;
    this.note(`${this.config.players[color].name} utilise son joker.`);
  }

  /** À appeler régulièrement : drapeau, fin du round d'échecs. */
  tick(now: number): void {
    if (this.stage === "over") return;
    for (const color of ["w", "b"] as Color[]) {
      if (this.clock.remainingAt(color, now) <= 0) {
        this.clock.remaining[color] = 0;
        this.finish({ winner: other(color), reason: "temps" }, now);
        return;
      }
    }
    if (this.stage === "echecs" && this.stageRemaining(now) === 0) this.startWall(now);
  }

  // --- Mur --------------------------------------------------------------------------

  private startWall(now: number): void {
    this.clock.run(null, now);
    this.stage = "mur";
    this.stageStartedAt = now;
    const starter: Color = this.round % 2 === 0 ? "w" : "b";
    const piece = this.duelPiece();
    const avgRating = Math.round((this.config.players.w.climbRating + this.config.players.b.climbRating) / 2);
    const engine = this.config.engine;
    if (engine) {
      this.duel = this.soloDuel(other(engine.color), piece);
      this.note(`Round de mur ${this.round + 1} : ${this.duelLabel()}.`);
      return;
    }
    switch (this.config.duel) {
      case "ajoute": {
        const block = this.makeBlock({ piece, targetRating: Math.min(this.config.players.w.climbRating, this.config.players.b.climbRating) - 200, length: AJOUTE_START });
        this.duel = { format: "ajoute", piece, sequence: block?.holds.map((h) => h.id) ?? [], climber: starter };
        break;
      }
      case "meme": {
        const block = this.makeBlock({ piece, targetRating: avgRating, length: this.params.blockLength });
        this.duel = {
          format: "meme",
          piece,
          block: block?.holds.map((h) => h.id) ?? [],
          estimatedRating: block?.estimatedRating ?? avgRating,
          order: [starter, other(starter)],
          results: {},
        };
        break;
      }
      case "impose":
        this.duel = { format: "impose", budget: avgRating, restarts: 0, step: "compose", actor: starter, composed: {}, results: {} };
        break;
    }
    this.note(`Round de mur ${this.round + 1} : ${this.duelLabel()}.`);
  }

  private soloDuel(human: Color, piece: Piece): Duel {
    const rating = this.config.players[human].climbRating;
    const solo = SOLO[this.config.format];
    const kind = this.config.duel;
    const request =
      kind === "ajoute"
        ? { piece, targetRating: rating + SOLO.progressiveOffset, length: solo.progressiveLength }
        : { piece, targetRating: kind === "impose" ? rating + SOLO.imposedOffset : rating, length: this.params.blockLength };
    const block = this.makeBlock(request);
    const ids = block?.holds.map((h) => h.id) ?? [];
    return {
      format: "solo",
      kind,
      piece,
      block: ids,
      estimatedRating: block?.estimatedRating ?? request.targetRating,
      shown: kind === "ajoute" ? Math.min(AJOUTE_START, ids.length) : ids.length,
      attemptsLeft: kind === "meme" ? solo.cibleAttempts : 1,
      climber: human,
    };
  }

  /** Solo : résultat de la tentative en cours. */
  soloResult(success: boolean, now: number): void {
    const duel = this.requireDuel("solo");
    const engine = other(duel.climber);
    if (success) {
      if (duel.kind === "ajoute" && duel.shown < duel.block.length) {
        duel.shown++;
        return;
      }
      this.endDuel(duel.climber, now);
      return;
    }
    duel.attemptsLeft--;
    if (duel.attemptsLeft <= 0) this.endDuel(engine, now);
  }

  /** Famille A : une pièce au hasard. Famille B : la pièce la plus active du camp au trait. */
  private duelPiece(): Piece {
    if (this.config.family === "B") return mostActivePiece(this.chess.fen(), this.turn);
    const pieces: Piece[] = ["pion", "cavalier", "fou", "tour", "dame", "roi"];
    return pieces[Math.floor(Math.random() * pieces.length)];
  }

  private duelLabel(): string {
    if (this.config.engine) {
      return { ajoute: "bloc progressif", meme: "bloc cible", impose: "bloc imposé par le moteur" }[this.config.duel];
    }
    return { ajoute: "Ajoute une prise", meme: "Même bloc", impose: "Bloc imposé" }[this.config.duel];
  }

  /** « Ajoute une prise » : le grimpeur a répété le bloc et ajoute une prise. */
  ajouteSuccess(holdId: string): void {
    const duel = this.requireDuel("ajoute");
    if (duel.sequence.includes(holdId)) throw new Error("Cette prise est déjà dans le bloc.");
    duel.sequence = [...duel.sequence, holdId];
    duel.climber = other(duel.climber);
  }

  /** « Ajoute une prise » : chute ou erreur, l'adversaire gagne le duel. */
  ajouteFall(now: number): void {
    const duel = this.requireDuel("ajoute");
    this.endDuel(other(duel.climber), now);
  }

  /** « Même bloc » : résultat d'un joueur (dans l'ordre de passage). */
  memeResult(color: Color, result: MemeResult, now: number): void {
    const duel = this.requireDuel("meme");
    if (duel.results[color]) throw new Error("Ce joueur a déjà grimpé.");
    duel.results = { ...duel.results, [color]: result };
    const [a, b] = duel.order;
    const ra = duel.results[a];
    const rb = duel.results[b];
    if (ra && rb) this.endDuel(compareMeme(a, ra, b, rb), now);
  }

  /** « Bloc imposé » : un joueur a composé le bloc de son adversaire (cote estimée dans le budget). */
  imposeCompose(color: Color, holds: string[], estimatedRating: number): void {
    const duel = this.requireDuel("impose");
    if (duel.step !== "compose" || duel.actor !== color) throw new Error("Ce n'est pas à ce joueur de composer.");
    if (holds.length < 3) throw new Error("Un bloc compte au moins 3 prises.");
    if (estimatedRating > duel.budget) throw new Error(`Bloc trop dur : ${estimatedRating} pour un budget de ${duel.budget}.`);
    duel.composed = { ...duel.composed, [color]: holds };
    if (duel.composed[other(color)]) {
      duel.step = "climb";
      duel.actor = this.round % 2 === 0 ? "w" : "b";
    } else {
      duel.actor = other(color);
    }
  }

  /** « Bloc imposé » : un joueur a tenté le bloc composé par son adversaire. */
  imposeResult(color: Color, success: boolean, now: number): void {
    const duel = this.requireDuel("impose");
    if (duel.step !== "climb" || duel.actor !== color) throw new Error("Ce n'est pas à ce joueur de grimper.");
    duel.results = { ...duel.results, [color]: success };
    if (duel.results[other(color)] === undefined) {
      duel.actor = other(color);
      return;
    }
    const w = duel.results.w!;
    const b = duel.results.b!;
    if (w !== b) {
      this.endDuel(w ? "w" : "b", now);
    } else if (duel.restarts < IMPOSE_MAX_RESTARTS) {
      // Les deux réussissent ou les deux tombent : on recommence avec un budget plus élevé.
      duel.restarts++;
      duel.budget += IMPOSE_STEP;
      duel.step = "compose";
      duel.actor = this.round % 2 === 0 ? "w" : "b";
      duel.composed = {};
      duel.results = {};
      this.note(`Égalité : nouveau bloc imposé, budget ${duel.budget}.`);
    } else {
      this.endDuel(null, now);
    }
  }

  /** Temps du round de mur écoulé : le duel en cours est départagé à la main (prise la plus haute). */
  decideDuel(winner: Color | null, now: number): void {
    if (this.stage !== "mur" || !this.duel) throw new Error("Aucun duel en cours.");
    this.endDuel(winner, now);
  }

  /** Famille B : le gagnant du duel choisit son bonus pour le round d'échecs suivant. */
  chooseBonus(bonus: Bonus, now: number): void {
    if (this.stage !== "bonus" || !this.bonusFor) throw new Error("Aucun bonus à choisir.");
    const color = this.bonusFor;
    if (bonus === "temps") {
      this.clock.add(color, BONUS_TIME_MS, now);
      this.note(`${this.config.players[color].name} prend +30 s.`);
    } else {
      this.jokerAvailable[color] = true;
      this.note(`${this.config.players[color].name} récupère un joker.`);
    }
    this.bonusFor = null;
    this.nextChessRound(now);
  }

  resign(color: Color, now: number): void {
    this.finish({ winner: other(color), reason: "abandon" }, now);
  }

  // --- Interne ------------------------------------------------------------------

  private requireDuel<F extends Duel["format"]>(format: F): Extract<Duel, { format: F }> {
    if (this.stage !== "mur" || this.duel?.format !== format) throw new Error("Aucun duel de ce type en cours.");
    return this.duel as Extract<Duel, { format: F }>;
  }

  private endDuel(winner: Color | null, now: number): void {
    if (!this.duel) return;
    this.duel.winner = winner;
    this.duels.push({ round: this.round, winner });
    this.note(winner ? `${this.config.players[winner].name} gagne le duel au mur.` : "Duel au mur nul.");
    if (winner) {
      this.lossStreak[other(winner)]++;
      this.lossStreak[winner] = 0;
      if (this.lossStreak[other(winner)] >= KO_STREAK) {
        this.finish({ winner, reason: "ko" }, now);
        return;
      }
    }
    if (this.round + 1 >= this.params.maxRounds) {
      const wins = this.duelWins();
      const pointsWinner = wins.w > wins.b ? "w" : wins.b > wins.w ? "b" : null;
      this.finish({ winner: pointsWinner, reason: "points" }, now);
      return;
    }
    if (this.config.family === "B" && winner) {
      if (winner === this.config.engine?.color) {
        // Le moteur ne choisit pas : il prend le temps.
        this.clock.add(winner, BONUS_TIME_MS, now);
        this.note(`${this.config.players[winner].name} prend +30 s.`);
        this.nextChessRound(now);
        return;
      }
      this.bonusFor = winner;
      this.stage = "bonus";
      return;
    }
    this.nextChessRound(now);
  }

  private nextChessRound(now: number): void {
    this.round++;
    this.duel = null;
    this.stage = "echecs";
    this.stageStartedAt = now;
    this.clock.run(this.turn, now);
    this.note(`Round d'échecs ${this.round + 1}.`);
  }

  private finish(result: RoundsResult, now: number): void {
    this.result = result;
    this.stage = "over";
    this.clock.run(null, now);
  }

  private note(text: string): void {
    this.log.push(text);
  }

  // --- Sauvegarde ---------------------------------------------------------------------

  save(now: number): SavedRounds {
    return {
      version: 1,
      savedAt: now,
      config: JSON.parse(JSON.stringify(this.config)),
      moves: this.chess.history({ verbose: true }).map((m) => m.lan),
      clock: { remaining: { w: this.clock.remainingAt("w", now), b: this.clock.remainingAt("b", now) }, running: this.clock.running },
      stage: this.stage,
      stageElapsed: now - this.stageStartedAt,
      round: this.round,
      duel: this.duel ? JSON.parse(JSON.stringify(this.duel)) : null,
      duels: this.duels.map((d) => ({ ...d })),
      lossStreak: { ...this.lossStreak },
      bonusFor: this.bonusFor,
      jokerAvailable: { ...this.jokerAvailable },
      result: this.result,
      log: this.log.slice(-60),
    };
  }

  /** Reprise : les pendules et le round repartent là où ils en étaient (le temps page fermée ne compte pas). */
  static restore(saved: SavedRounds, makeBlock: DuelBlockFactory, now: number): RoundsGame {
    const game = new RoundsGame(JSON.parse(JSON.stringify(saved.config)), makeBlock, now);
    for (const lan of saved.moves) game.chess.move({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan[4] });
    game.clock.remaining = { ...saved.clock.remaining };
    game.clock.run(saved.clock.running, now);
    game.stage = saved.stage;
    game.stageStartedAt = now - saved.stageElapsed;
    game.round = saved.round;
    game.duel = saved.duel;
    game.duels = saved.duels.map((d) => ({ ...d }));
    game.lossStreak = { ...saved.lossStreak };
    game.bonusFor = saved.bonusFor;
    game.jokerAvailable = { ...saved.jokerAvailable };
    game.result = saved.result;
    game.log = [...saved.log];
    return game;
  }
}

/** « Même bloc » : la réussite en moins d'essais, sinon la prise la plus haute ; sinon nul. */
export function compareMeme(a: Color, ra: MemeResult, b: Color, rb: MemeResult): Color | null {
  if (ra.success !== rb.success) return ra.success ? a : b;
  if (ra.success && rb.success) return ra.attempts === rb.attempts ? null : ra.attempts < rb.attempts ? a : b;
  return ra.highest === rb.highest ? null : ra.highest > rb.highest ? a : b;
}
