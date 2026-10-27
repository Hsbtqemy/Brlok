/**
 * État partagé de l'application (pans, joueurs, cotes).
 * Toujours gardé dans le navigateur ; en plus, enregistré avec la page quand le stockage partagé
 * est disponible (voir sharedStore.ts), auquel cas c'est lui qui fait foi.
 */
import { makeChallengeBlock, type ChallengeOptions } from "../core/challenge";
import { routeSession, type RouteSessionOptions } from "../core/gym";
import type { Block } from "../core/generator";
import { bestTimeKey, recordBlockAttempt, recordGame, recordGameVsEngine, recordTime, routeKey, type AttemptRecord, type BestTime, type RatingsState } from "../core/players";
import type { Route, Wall } from "../core/wall";
import type { SavedGame } from "../core/game";
import type { SavedRounds } from "../core/rounds";
import { SharedStore, type SyncStatus } from "./sharedStore";
import {
  loadActivePlayerId,
  loadActiveWallId,
  loadLiveGame,
  loadRatings,
  loadWalls,
  saveActivePlayerId,
  saveActiveWallId,
  saveLiveGame,
  saveRatings,
  saveWalls,
} from "./storage";

class AppState {
  walls = $state<Wall[]>(loadWalls());
  activeWallId = $state<string | null>(loadActiveWallId());
  ratings = $state<RatingsState>(loadRatings());
  activePlayerId = $state<string | null>(loadActivePlayerId());
  syncStatus = $state<SyncStatus>("local");
  syncDetail = $state("");
  /** Partie en cours sauvegardée, avec qui joue quoi (identifiants des joueurs). */
  liveGame = $state.raw<LiveGame | null>(loadLiveGame<LiveGame>());

  wall = $derived(this.walls.find((w) => w.id === this.activeWallId) ?? this.walls[0]);
  activePlayer = $derived(this.ratings.players.find((p) => p.id === this.activePlayerId) ?? this.ratings.players[0]);

  private readonly store = new SharedStore({
    onRatings: (state) => {
      this.ratings = state;
      saveRatings(state);
    },
    onWalls: (walls) => {
      this.walls = walls;
      saveWalls(walls);
    },
    onStatus: (status, detail = "") => {
      this.syncStatus = status;
      this.syncDetail = detail;
    },
    onLiveGame: (game) => {
      this.liveGame = game as LiveGame | null;
      saveLiveGame(game);
    },
  });

  constructor() {
    void this.store.connect({ ratings: () => this.snapshotRatings(), walls: () => $state.snapshot(this.walls) as Wall[] });
  }

  private snapshotRatings(): RatingsState {
    return $state.snapshot(this.ratings) as RatingsState;
  }

  setWalls(walls: Wall[], activeId?: string) {
    const prev = $state.snapshot(this.walls) as Wall[];
    this.walls = walls;
    if (activeId) this.activeWallId = activeId;
    saveWalls($state.snapshot(this.walls) as Wall[]);
    if (this.wall) saveActiveWallId(this.wall.id);
    void this.store.syncWalls(prev, $state.snapshot(this.walls) as Wall[]);
  }

  selectWall(id: string) {
    this.activeWallId = id;
    saveActiveWallId(id);
  }

  updateWall(patch: Partial<Wall>) {
    const id = this.wall?.id;
    if (!id) return;
    this.setWalls(this.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }

  setRatings(state: RatingsState) {
    const prev = this.snapshotRatings();
    this.ratings = state;
    const next = this.snapshotRatings();
    saveRatings(next);
    void this.store.syncRatings(prev, next);
  }

  /** Sauvegarde la partie en cours (null quand elle est terminée ou abandonnée). */
  saveGame(game: LiveGame | null) {
    this.liveGame = game;
    saveLiveGame(game);
    void this.store.saveLiveGame(game as unknown as Record<string, unknown> | null);
  }

  selectPlayer(id: string | null) {
    this.activePlayerId = id;
    saveActivePlayerId(id);
  }

  /** Bloc pour un défi : généré sur un pan, choisi parmi les voies d'un mur de salle (cote apprise). */
  challenge(options: Omit<ChallengeOptions, "routeRating">): Block | null {
    const wall = this.wall;
    if (!wall) return null;
    const blocks = this.ratings.blocks;
    return makeChallengeBlock($state.snapshot(wall) as Wall, {
      ...options,
      routeRating: (route: Route) => blocks[routeKey(wall.id, route.id)]?.rating,
    });
  }

  /** Cote apprise d'une voie du mur actif (Glicko-2), si elle a déjà été grimpée. */
  routeRating(route: Route): number | undefined {
    return this.wall ? this.ratings.blocks[routeKey(this.wall.id, route.id)]?.rating : undefined;
  }

  /** Séance de voies sur le mur actif (Brlok classique en salle). */
  routeSession(options: Omit<RouteSessionOptions, "ratingOf">): Block[] {
    if (!this.wall) return [];
    return routeSession($state.snapshot(this.wall) as Wall, { ...options, ratingOf: (r) => this.routeRating(r) });
  }

  /** Enregistre une tentative de bloc ; renvoie la variation de la cote de grimpe. */
  recordAttempt(playerId: string, block: Block, success: boolean, context: AttemptRecord["context"]): number {
    if (!this.wall) return 0;
    const { state, delta } = recordBlockAttempt(this.snapshotRatings(), playerId, this.wall.id, block, success, context);
    this.setRatings(state);
    return delta;
  }

  /** Temps au chrono sur un bloc ; renvoie l'ancien record et s'il est battu. */
  recordTime(playerId: string, block: Block, ms: number): { previous: BestTime | null; isBest: boolean } {
    if (!this.wall) return { previous: null, isBest: false };
    const { state, previous, isBest } = recordTime(this.snapshotRatings(), playerId, this.wall.id, block, ms);
    if (isBest) this.setRatings(state);
    return { previous, isBest };
  }

  bestTime(playerId: string, block: Block): BestTime | null {
    return this.wall ? (this.ratings.bestTimes?.[bestTimeKey(playerId, this.wall.id, block)] ?? null) : null;
  }

  recordGame(whiteId: string, blackId: string, score: number, reason: string) {
    this.setRatings(recordGame(this.snapshotRatings(), whiteId, blackId, score, reason));
  }

  recordGameVsEngine(playerId: string, color: "w" | "b", engineElo: number, playerScore: number, reason: string) {
    this.setRatings(recordGameVsEngine(this.snapshotRatings(), playerId, color, engineElo, playerScore, reason));
  }
}

export type LiveGame =
  | { kind?: "intrication"; game: SavedGame; ids: { w: string; b: string }; humanColor: "w" | "b" }
  | { kind: "rounds"; rounds: SavedRounds; ids: { w: string; b: string }; humanColor: "w" | "b" };

export const app = new AppState();
