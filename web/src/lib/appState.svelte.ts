/** État partagé de l'application (pans, joueurs, cotes), persisté dans le navigateur. */
import type { Block } from "../core/generator";
import { recordBlockAttempt, recordGame, type AttemptRecord, type RatingsState } from "../core/players";
import type { Wall } from "../core/wall";
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

  wall = $derived(this.walls.find((w) => w.id === this.activeWallId) ?? this.walls[0]);
  activePlayer = $derived(this.ratings.players.find((p) => p.id === this.activePlayerId) ?? this.ratings.players[0]);

  setWalls(walls: Wall[], activeId?: string) {
    this.walls = walls;
    if (activeId) this.activeWallId = activeId;
    saveWalls(this.walls);
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
    saveRatings($state.snapshot(this.ratings) as RatingsState);
  }

  selectPlayer(id: string | null) {
    this.activePlayerId = id;
    saveActivePlayerId(id);
  }

  /** Enregistre une tentative de bloc ; renvoie la variation de la cote de grimpe. */
  recordAttempt(playerId: string, block: Block, success: boolean, context: AttemptRecord["context"]): number {
    if (!this.wall) return 0;
    const { state, delta } = recordBlockAttempt($state.snapshot(this.ratings) as RatingsState, playerId, this.wall.id, block, success, context);
    this.setRatings(state);
    return delta;
  }

  recordGame(whiteId: string, blackId: string, score: number, reason: string) {
    this.setRatings(recordGame($state.snapshot(this.ratings) as RatingsState, whiteId, blackId, score, reason));
  }
}

export const app = new AppState();
