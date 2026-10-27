/**
 * État partagé de l'application (pans, joueurs, cotes).
 * Toujours gardé dans le navigateur ; en plus, enregistré avec la page quand le stockage partagé
 * est disponible (voir sharedStore.ts), auquel cas c'est lui qui fait foi.
 */
import type { Block } from "../core/generator";
import { recordBlockAttempt, recordGame, recordGameVsEngine, type AttemptRecord, type RatingsState } from "../core/players";
import type { Wall } from "../core/wall";
import { SharedStore, type SyncStatus } from "./sharedStore";
import {
  loadActivePlayerId,
  loadActiveWallId,
  loadRatings,
  loadWalls,
  saveActivePlayerId,
  saveActiveWallId,
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

  selectPlayer(id: string | null) {
    this.activePlayerId = id;
    saveActivePlayerId(id);
  }

  /** Enregistre une tentative de bloc ; renvoie la variation de la cote de grimpe. */
  recordAttempt(playerId: string, block: Block, success: boolean, context: AttemptRecord["context"]): number {
    if (!this.wall) return 0;
    const { state, delta } = recordBlockAttempt(this.snapshotRatings(), playerId, this.wall.id, block, success, context);
    this.setRatings(state);
    return delta;
  }

  recordGame(whiteId: string, blackId: string, score: number, reason: string) {
    this.setRatings(recordGame(this.snapshotRatings(), whiteId, blackId, score, reason));
  }

  recordGameVsEngine(playerId: string, color: "w" | "b", engineElo: number, playerScore: number, reason: string) {
    this.setRatings(recordGameVsEngine(this.snapshotRatings(), playerId, color, engineElo, playerScore, reason));
  }
}

export const app = new AppState();
