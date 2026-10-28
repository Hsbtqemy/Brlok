/**
 * Minuteur de séance (port du minuteur de Brlok desktop, brlok/gui/timer_widget.py) :
 * 40/20 (travail/repos fixes), pyramide (travail croissant, repos = moitié), EMOM (une minute par round),
 * et chrono (temps qui monte, pour les meilleurs temps).
 * Logique pure : un plan d'intervalles, et l'état à un instant donné.
 */

export type TimerMode = "fixe" | "pyramide" | "emom" | "chrono";

export interface TimerConfig {
  mode: TimerMode;
  workS: number;
  restS: number;
  rounds: number;
  /** Pyramide : travail du premier et du dernier round. */
  workMinS?: number;
  workMaxS?: number;
}

export interface Interval {
  phase: "travail" | "repos";
  round: number;
  seconds: number;
}

export const TIMER_PRESETS: { id: string; label: string; config: TimerConfig }[] = [
  { id: "40-20", label: "40/20 classique (× 3)", config: { mode: "fixe", workS: 40, restS: 20, rounds: 3 } },
  { id: "50-28", label: "50/28 (× 3)", config: { mode: "fixe", workS: 50, restS: 28, rounds: 3 } },
  { id: "pyramide", label: "Pyramide 20 → 60 s (× 5)", config: { mode: "pyramide", workS: 40, restS: 20, rounds: 5, workMinS: 20, workMaxS: 60 } },
  { id: "emom", label: "EMOM 6 min (40 s de travail)", config: { mode: "emom", workS: 40, restS: 20, rounds: 6 } },
  { id: "chrono", label: "Chrono (meilleur temps)", config: { mode: "chrono", workS: 0, restS: 0, rounds: 1 } },
];

const clampS = (s: number) => Math.max(5, Math.round(s));

/** Travail et repos d'un round (1 = premier), mêmes règles que Brlok desktop. */
export function workRest(config: TimerConfig, round: number): { work: number; rest: number } {
  switch (config.mode) {
    case "emom": {
      const work = Math.min(clampS(config.workS), 55);
      return { work, rest: 60 - work };
    }
    case "pyramide": {
      const min = config.workMinS ?? config.workS;
      const max = config.workMaxS ?? config.workS;
      if (config.rounds <= 1) return { work: clampS(max), rest: clampS(max / 2) };
      const work = Math.floor(min + ((max - min) * (round - 1)) / (config.rounds - 1));
      return { work: clampS(work), rest: clampS(work / 2) };
    }
    default:
      return { work: clampS(config.workS), rest: clampS(config.restS) };
  }
}

/** Plan complet. Le repos du dernier round est omis : la séance se termine sur l'effort. */
export function planIntervals(config: TimerConfig): Interval[] {
  if (config.mode === "chrono") return [];
  const plan: Interval[] = [];
  const rounds = Math.max(1, Math.round(config.rounds));
  for (let round = 1; round <= rounds; round++) {
    const { work, rest } = workRest(config, round);
    plan.push({ phase: "travail", round, seconds: work });
    if (round < rounds) plan.push({ phase: "repos", round, seconds: rest });
  }
  return plan;
}

export function totalSeconds(plan: readonly Interval[]): number {
  return plan.reduce((s, i) => s + i.seconds, 0);
}

export interface TimerState {
  /** Index de l'intervalle en cours (-1 : chrono). */
  index: number;
  interval: Interval | null;
  /** Temps restant dans l'intervalle (ms) ; temps écoulé en chrono. */
  remainingMs: number;
  elapsedMs: number;
  finished: boolean;
}

export function timerState(plan: readonly Interval[], elapsedMs: number): TimerState {
  if (plan.length === 0) return { index: -1, interval: null, remainingMs: elapsedMs, elapsedMs, finished: false };
  let t = elapsedMs;
  for (let i = 0; i < plan.length; i++) {
    const ms = plan[i].seconds * 1000;
    if (t < ms) return { index: i, interval: plan[i], remainingMs: ms - t, elapsedMs, finished: false };
    t -= ms;
  }
  return { index: plan.length, interval: null, remainingMs: 0, elapsedMs, finished: true };
}

export function formatClock(ms: number): string {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
