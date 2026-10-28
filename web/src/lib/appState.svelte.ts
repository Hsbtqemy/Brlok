/**
 * État de l'application (murs, joueurs, cotes, bibliothèque), gardé dans le stockage du navigateur.
 * D'un appareil à l'autre : la sauvegarde complète (Joueurs → Données de l'app).
 */
import { withBeam } from "../core/beam";
import { makeChallengeBlock, type ChallengeOptions } from "../core/challenge";
import { routeSession, type RouteSessionOptions } from "../core/gym";
import type { Block } from "../core/generator";
import type { Library } from "../core/library";
import { bestTimeKey, recordBlockAttempt, recordGame, recordGameVsEngine, recordTime, routeKey, type AttemptRecord, type BestTime, type RatingsState } from "../core/players";
import type { Route, Wall } from "../core/wall";
import type { SavedGame } from "../core/game";
import type { SavedRounds } from "../core/rounds";
import {
  loadActivePlayerId,
  loadActiveWallId,
  loadLibrary,
  loadLiveGame,
  loadRatings,
  loadWalls,
  saveActivePlayerId,
  saveActiveWallId,
  saveLibrary,
  saveLiveGame,
  saveRatings,
  saveWalls,
} from "./storage";

class AppState {
  walls = $state<Wall[]>(loadWalls());
  activeWallId = $state<string | null>(loadActiveWallId());
  ratings = $state<RatingsState>(loadRatings());
  activePlayerId = $state<string | null>(loadActivePlayerId());
  /** Partie en cours sauvegardée, avec qui joue quoi (identifiants des joueurs). */
  liveGame = $state.raw<LiveGame | null>(loadLiveGame<LiveGame>());
  /** Favoris, modèles, historique et séance en cours (Brlok classique). */
  library = $state.raw<Library>(loadLibrary());
  /** Le stockage du navigateur a refusé la dernière écriture de la bibliothèque (plein ?). */
  libraryStorageFull = $state(false);

  wall = $derived(this.walls.find((w) => w.id === this.activeWallId) ?? this.walls[0]);
  /** Le mur tel qu'on le grimpe : avec sa poutre si elle est intégrée au pan (POUTRE.md). */
  playWall = $derived(this.wall ? withBeam(this.wall) : undefined);
  activePlayer = $derived(this.ratings.players.find((p) => p.id === this.activePlayerId) ?? this.ratings.players[0]);

  private snapshotRatings(): RatingsState {
    return $state.snapshot(this.ratings) as RatingsState;
  }

  setWalls(walls: Wall[], activeId?: string) {
    this.walls = walls;
    if (activeId) this.activeWallId = activeId;
    saveWalls($state.snapshot(this.walls) as Wall[]);
    if (this.wall) saveActiveWallId(this.wall.id);
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
    this.ratings = state;
    saveRatings(this.snapshotRatings());
  }

  /** Sauvegarde la partie en cours (null quand elle est terminée ou abandonnée). */
  saveGame(game: LiveGame | null) {
    this.liveGame = game;
    saveLiveGame(game);
  }

  /** Remplace la bibliothèque (valeur neuve, jamais modifiée sur place). */
  setLibrary(next: Library) {
    if (next === this.library) return;
    this.library = next;
    this.libraryStorageFull = !saveLibrary(next);
  }

  updateLibrary(change: (library: Library) => Library) {
    this.setLibrary(change(this.library));
  }

  selectPlayer(id: string | null) {
    this.activePlayerId = id;
    saveActivePlayerId(id);
  }

  /** Bloc pour un défi : généré sur un pan, choisi parmi les voies d'un mur de salle (cote apprise). */
  challenge(options: Omit<ChallengeOptions, "routeRating" | "variantRating">): Block | null {
    const wall = this.wall;
    if (!wall) return null;
    const blocks = this.ratings.blocks;
    return makeChallengeBlock(withBeam($state.snapshot(wall) as Wall), {
      ...options,
      routeRating: (route: Route) => blocks[routeKey(wall.id, route.id)]?.rating,
      variantRating: (route, variant) => blocks[routeKey(wall.id, route.id, variant)]?.rating,
    });
  }

  /** Cote apprise d'une voie du mur actif (Glicko-2), si elle a déjà été grimpée. */
  routeRating(route: Route): number | undefined {
    return this.wall ? this.ratings.blocks[routeKey(this.wall.id, route.id)]?.rating : undefined;
  }

  /** Séance de voies sur le mur actif (Brlok classique en salle). */
  routeSession(options: Omit<RouteSessionOptions, "ratingOf" | "variantRatingOf">): Block[] {
    const wall = this.wall;
    if (!wall) return [];
    const blocks = this.ratings.blocks;
    return routeSession($state.snapshot(wall) as Wall, {
      ...options,
      ratingOf: (r) => this.routeRating(r),
      variantRatingOf: (route, variant) => blocks[routeKey(wall.id, route.id, variant)]?.rating,
    });
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
