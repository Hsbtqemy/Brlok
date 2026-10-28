<script lang="ts">
  import { onDestroy } from "svelte";
  import { HANG_PREP_S, hangText } from "../core/beam";
  import type { Block } from "../core/generator";
  import { formatClock } from "../core/intervals";
  import type { Beam } from "../core/wall";
  import BeamView from "./BeamView.svelte";

  /**
   * Une suspension (POUTRE.md §2) : « Démarrer », 3 s pour se placer, puis le décompte de la durée.
   * Arrivé à zéro : réussi. « Lâché » avant : chute.
   */
  interface Props {
    beam: Beam;
    block: Block;
    onResult: (success: boolean, heldMs: number) => void;
    /** Démarre seul (série de suspensions, après le repos). */
    autoStart?: boolean;
    /** Libellé du bouton de départ. */
    startLabel?: string;
    /** Montrer la poutre (faux quand l'écran la montre déjà en grand). */
    showBeam?: boolean;
  }

  let { beam, block, onResult, autoStart = false, startLabel = "Démarrer", showBeam = true }: Props = $props();

  type Stage = "pret" | "placement" | "suspension" | "fini";
  let stage = $state<Stage>("pret");
  let startedAt = $state(0);
  let now = $state(Date.now());
  let outcome = $state<{ success: boolean; heldMs: number } | null>(null);

  const seconds = $derived(block.hang?.seconds ?? 0);
  const prepMs = HANG_PREP_S * 1000;
  const elapsed = $derived(stage === "placement" || stage === "suspension" ? now - startedAt : 0);
  const left = $derived(stage === "placement" ? prepMs - elapsed : stage === "suspension" ? prepMs + seconds * 1000 - elapsed : seconds * 1000);

  // Le bloc change (suspension suivante) : on revient au départ.
  let shownKey = "";
  $effect(() => {
    const key = `${block.hang?.left}|${block.hang?.right}|${block.hang?.seconds}`;
    if (key === shownKey) return;
    shownKey = key;
    stop();
    stage = "pret";
    outcome = null;
    if (autoStart) start();
  });

  let tick: ReturnType<typeof setInterval> | null = null;
  function stop() {
    lockToken++;
    if (tick !== null) clearInterval(tick);
    tick = null;
    void lock?.release().catch(() => {});
    lock = null;
  }
  onDestroy(stop);

  let lock: { release: () => Promise<void> } | null = null;
  let lockToken = 0;
  let audio: AudioContext | null = null;
  function beep(times: number) {
    try {
      audio ??= new AudioContext();
      for (let i = 0; i < times; i++) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.frequency.value = 880;
        gain.gain.value = 0.25;
        osc.connect(gain).connect(audio.destination);
        const t = audio.currentTime + i * 0.25;
        osc.start(t);
        osc.stop(t + 0.15);
      }
    } catch {
      // sans son
    }
    try {
      navigator.vibrate?.(times > 1 ? [200, 100, 200] : 200);
    } catch {
      // sans vibration
    }
  }

  function start() {
    stop();
    try {
      audio ??= new AudioContext();
      void audio.resume();
    } catch {
      // sans son
    }
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    // Le verrou arrive après coup : si la suspension est déjà finie (lâchée tout de suite), on le rend aussitôt.
    const token = ++lockToken;
    nav.wakeLock
      ?.request("screen")
      .then((l) => {
        if (token === lockToken && tick !== null) lock = l;
        else void l.release().catch(() => {});
      })
      .catch(() => {});
    outcome = null;
    startedAt = Date.now();
    now = startedAt;
    stage = "placement";
    tick = setInterval(() => {
      now = Date.now();
      if (stage === "placement" && now - startedAt >= prepMs) {
        stage = "suspension";
        beep(1);
      } else if (stage === "suspension" && now - startedAt >= prepMs + seconds * 1000) {
        finish(true);
      }
    }, 100);
  }

  function finish(success: boolean) {
    const heldMs = Math.max(0, Math.min(seconds * 1000, Date.now() - startedAt - prepMs));
    stop();
    stage = "fini";
    outcome = { success, heldMs };
    beep(success ? 3 : 1);
    onResult(success, heldMs);
  }

  /** Annuler pendant le placement : pas de résultat. */
  function cancel() {
    stop();
    stage = "pret";
  }
</script>

<div class="hang">
  <p class="what"><strong>{hangText(block)}</strong> · cote {block.estimatedRating}</p>
  {#if showBeam}<BeamView {beam} left={block.hang?.left} right={block.hang?.right} />{/if}
  <div class="clock {stage}" role="timer">
    <!-- Seule la phase est annoncée (« Place-toi », « Tiens ! »…), pas chaque dixième de seconde. -->
    <span class="phase" aria-live="polite">
      {stage === "pret" ? "Prêt" : stage === "placement" ? "Place-toi" : stage === "suspension" ? "Tiens !" : outcome?.success ? "Tenu !" : "Lâché"}
    </span>
    <span class="time">{stage === "fini" ? formatClock(outcome?.heldMs ?? 0) : formatClock(left)}</span>
  </div>
  <div class="controls">
    {#if stage === "pret"}
      <button class="primary" onclick={start}>{startLabel}</button>
    {:else if stage === "placement"}
      <button onclick={cancel}>Annuler</button>
    {:else if stage === "suspension"}
      <button class="fall" onclick={() => finish(false)}>Lâché</button>
    {/if}
  </div>
</div>

<style>
  .hang {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .what {
    margin: 0;
  }
  .clock {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px;
    border-radius: 12px;
    color: #fff;
    background: #455a64;
  }
  .clock.placement {
    background: #1565c0;
  }
  .clock.suspension {
    background: #2e7d32;
  }
  .clock.fini {
    background: #6d6d6d;
  }
  .phase {
    font-size: 1rem;
    opacity: 0.9;
  }
  .time {
    font-size: clamp(3rem, 12vw, 4.5rem);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  .controls {
    display: flex;
    gap: 8px;
  }
  .controls button {
    flex: 1;
    min-height: 56px;
    font-size: 1.1rem;
  }
</style>
