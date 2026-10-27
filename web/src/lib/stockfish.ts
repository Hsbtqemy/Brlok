/**
 * Stockfish dans un Web Worker (fichiers dans public/engine/, servis à côté de la page).
 * Une recherche à la fois ; `bestMove` renvoie le coup au format UCI (ex. « e2e4 », « e7e8q »).
 */
import { uciCommands, type EngineSettings } from "../core/engine";

const ENGINE_PATH = "engine/stockfish-19-lite-single.js";

export class Stockfish {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private waiting: ((line: string) => boolean) | null = null;

  private start(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(new URL(ENGINE_PATH, document.baseURI));
      } catch (e) {
        reject(e);
        return;
      }
      this.worker.onmessage = (ev: MessageEvent) => {
        const line = String(ev.data);
        if (this.waiting?.(line)) this.waiting = null;
      };
      this.worker.onerror = () => reject(new Error("Le moteur d'échecs n'a pas pu démarrer."));
      this.waiting = (line) => {
        if (line === "uciok") {
          resolve();
          return true;
        }
        return false;
      };
      this.worker.postMessage("uci");
    });
    return this.ready;
  }

  async bestMove(fen: string, settings: EngineSettings, searchmoves?: readonly string[]): Promise<string> {
    await this.start();
    const worker = this.worker!;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Le moteur ne répond pas.")), settings.movetimeMs + 15_000);
      this.waiting = (line) => {
        const m = line.match(/^bestmove (\S+)/);
        if (!m) return false;
        clearTimeout(timeout);
        if (m[1] === "(none)") reject(new Error("Aucun coup trouvé."));
        else resolve(m[1]);
        return true;
      };
      for (const command of uciCommands(fen, settings, searchmoves)) worker.postMessage(command);
    });
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.waiting = null;
  }
}
