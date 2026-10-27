<script lang="ts">
  import type { Block } from "../core/generator";
  import { formatClock, planIntervals, timerState, TIMER_PRESETS, totalSeconds, type TimerConfig, type TimerMode } from "../core/intervals";
  import { app } from "./appState.svelte";

  interface Props {
    /** Bloc (ou voie) en cours : affiché, et support des meilleurs temps au chrono. */
    block: Block | null;
    /** Bloc suivant de la séance (absent : dernier bloc). */
    onNext?: () => void;
  }

  let { block, onNext }: Props = $props();

  const MODES: { id: TimerMode; label: string }[] = [
    { id: "fixe", label: "Travail / repos" },
    { id: "pyramide", label: "Pyramide" },
    { id: "emom", label: "EMOM" },
    { id: "chrono", label: "Chrono" },
  ];

  let config = $state<TimerConfig>({ ...TIMER_PRESETS[0].config });
  let preset = $state(TIMER_PRESETS[0].id);
  let running = $state(false);
  let startedAt = $state(0);
  /** Temps déjà écoulé avant la dernière reprise (pause). */
  let banked = $state(0);
  let now = $state(Date.now());
  let big = $state(false);
  let flash = $state(false);
  let chained = $state(false);
  let result = $state<string | null>(null);

  const plan = $derived(planIntervals(config));
  const elapsed = $derived(banked + (running ? now - startedAt : 0));
  const timer = $derived(timerState(plan, elapsed));
  const started = $derived(running || banked > 0);
  const label = $derived(block ? (block.route ? block.route.label : block.holds.map((h) => h.id).join(" → ")) : "");

  function applyPreset(id: string) {
    preset = id;
    const p = TIMER_PRESETS.find((x) => x.id === id);
    if (p) config = { ...p.config };
    reset();
  }

  // Tic d'affichage.
  $effect(() => {
    if (!running) return;
    const id = setInterval(() => (now = Date.now()), 100);
    return () => clearInterval(id);
  });

  // Écran allumé tant que le minuteur tourne.
  $effect(() => {
    if (!running) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release().catch(() => {});
  });

  // Signal à chaque changement d'intervalle, et à la fin.
  let lastIndex = -1;
  $effect(() => {
    const index = timer.index;
    if (!running) {
      lastIndex = index;
      return;
    }
    if (index !== lastIndex && lastIndex !== -1) signal(timer.finished ? 3 : 1);
    lastIndex = index;
    if (timer.finished) finish();
  });

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
      // Son indisponible : le flash suffit.
    }
  }

  function signal(times: number) {
    beep(times);
    try {
      navigator.vibrate?.(times > 1 ? [200, 100, 200, 100, 200] : 200);
    } catch {
      // vibration indisponible
    }
    flash = true;
    setTimeout(() => (flash = false), 250);
  }

  function start() {
    result = null;
    // Le son ne peut démarrer qu'après un geste : on prépare l'audio ici.
    try {
      audio ??= new AudioContext();
      void audio.resume();
    } catch {
      // sans son
    }
    startedAt = Date.now();
    now = startedAt;
    running = true;
  }

  function pause() {
    banked += Date.now() - startedAt;
    running = false;
  }

  function reset() {
    running = false;
    banked = 0;
    result = null;
  }

  function finish() {
    running = false;
    banked = totalSeconds(plan) * 1000;
    result = "Terminé !";
    if (chained && onNext) {
      setTimeout(() => {
        onNext?.();
        reset();
        start();
      }, 1500);
    }
  }

  /** Chrono : arrivé en haut. */
  function arrived() {
    const ms = elapsed;
    running = false;
    banked = ms;
    signal(1);
    const player = app.activePlayer;
    if (!player || !block) {
      result = `Temps : ${formatClock(ms)}`;
      return;
    }
    const { previous, isBest } = app.recordTime(player.id, block, ms);
    result = isBest
      ? previous
        ? `Nouveau record : ${formatClock(ms)} (ancien ${formatClock(previous.ms)})`
        : `Premier temps enregistré : ${formatClock(ms)}`
      : `${formatClock(ms)} · record : ${formatClock(previous!.ms)}`;
  }

  const record = $derived(app.activePlayer && block ? app.bestTime(app.activePlayer.id, block) : null);
  const phaseClass = $derived(config.mode === "chrono" ? "chrono" : timer.interval?.phase === "repos" ? "repos" : timer.finished ? "fini" : "travail");
  const display = $derived(config.mode === "chrono" ? formatClock(elapsed) : timer.finished ? "00:00" : formatClock(timer.remainingMs));
  const phaseText = $derived(
    config.mode === "chrono"
      ? "Chrono"
      : timer.finished
        ? "Terminé"
        : `${timer.interval?.phase === "repos" ? "Repos" : "Travail"} · round ${timer.interval?.round ?? 1}/${config.rounds}`,
  );
</script>

{#snippet controls()}
  <div class="controls">
    {#if !running}
      <button class="primary" onclick={start} disabled={timer.finished && config.mode !== "chrono"}>{started ? "Reprendre" : "Démarrer"}</button>
    {:else if config.mode === "chrono"}
      <button class="primary" onclick={arrived}>Arrivé !</button>
    {:else}
      <button onclick={pause}>Pause</button>
    {/if}
    {#if started}<button onclick={reset}>Remettre à zéro</button>{/if}
    {#if onNext}<button onclick={() => (reset(), onNext?.())}>Bloc suivant</button>{/if}
  </div>
{/snippet}

<div class="timer">
  <h3>Minuteur</h3>
  <label class="field">
    Format
    <select id="timer-preset" value={preset} onchange={(e) => applyPreset((e.currentTarget as HTMLSelectElement).value)} disabled={started}>
      {#each TIMER_PRESETS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
      <option value="perso">Personnalisé</option>
    </select>
  </label>
  {#if preset === "perso"}
    <div class="params">
      <label class="field">
        Mode
        <select id="timer-mode" bind:value={config.mode} disabled={started}>
          {#each MODES as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
        </select>
      </label>
      {#if config.mode === "pyramide"}
        <label class="field">Travail min (s) <input type="number" id="timer-wmin" min="5" max="300" bind:value={config.workMinS} disabled={started} /></label>
        <label class="field">Travail max (s) <input type="number" id="timer-wmax" min="5" max="300" bind:value={config.workMaxS} disabled={started} /></label>
      {:else if config.mode !== "chrono"}
        <label class="field">Travail (s) <input type="number" id="timer-work" min="5" max="300" bind:value={config.workS} disabled={started} /></label>
        {#if config.mode === "fixe"}
          <label class="field">Repos (s) <input type="number" id="timer-rest" min="5" max="300" bind:value={config.restS} disabled={started} /></label>
        {/if}
      {/if}
      {#if config.mode !== "chrono"}
        <label class="field">Rounds <input type="number" id="timer-rounds" min="1" max="20" bind:value={config.rounds} disabled={started} /></label>
      {/if}
    </div>
  {/if}

  <div class="display {phaseClass}" class:flash>
    <span class="phase">{phaseText}</span>
    <span class="time">{display}</span>
    {#if config.mode !== "chrono"}<span class="total">séance de {formatClock(totalSeconds(plan) * 1000)}</span>{/if}
    {#if config.mode === "chrono" && record}<span class="total">record : {formatClock(record.ms)}</span>{/if}
  </div>
  {@render controls()}
  <div class="row">
    <button onclick={() => (big = true)}>Grand écran</button>
    {#if onNext && config.mode !== "chrono"}
      <label class="check"><input type="checkbox" bind:checked={chained} /> Enchaîner les blocs</label>
    {/if}
  </div>
  {#if result}<p class="result">{result}</p>{/if}
  {#if config.mode === "chrono" && !app.activePlayer}<p class="hint">Crée un joueur pour garder tes meilleurs temps.</p>{/if}
</div>

{#if big}
  <div class="overlay {phaseClass}" class:flash role="dialog" aria-label="Minuteur en grand">
    {#if label}<p class="big-block">{label}</p>{/if}
    <p class="big-phase">{phaseText}</p>
    <p class="big-time">{display}</p>
    {#if result}<p class="big-result">{result}</p>{/if}
    {@render controls()}
    <button class="close" onclick={() => (big = false)}>Fermer</button>
  </div>
{/if}

<style>
  .timer {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }
  h3 {
    margin: 0;
    font-size: 1rem;
  }
  .params {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 8px;
  }
  .params input,
  .params select {
    width: 100%;
  }
  .display {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px;
    border-radius: 12px;
    color: #fff;
    transition: filter 0.1s;
  }
  .travail {
    background: #2e7d32;
  }
  .repos {
    background: #1565c0;
  }
  .fini {
    background: #6d6d6d;
  }
  .chrono {
    background: #263238;
  }
  .flash {
    filter: brightness(1.8);
  }
  .phase {
    font-size: 0.95rem;
    opacity: 0.9;
  }
  .time {
    font-size: clamp(3rem, 12vw, 4.5rem);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  .total {
    font-size: 0.8rem;
    opacity: 0.85;
  }
  .controls {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .controls button {
    flex: 1;
    min-height: 52px;
    font-size: 1.05rem;
  }
  .result {
    margin: 0;
    font-weight: 700;
  }
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px))
      max(16px, env(safe-area-inset-left, 0px));
    color: #fff;
    text-align: center;
  }
  .overlay p {
    margin: 0;
  }
  .big-block {
    font-size: clamp(1.2rem, 4vw, 2rem);
    font-weight: 600;
  }
  .big-phase {
    font-size: clamp(1.4rem, 5vw, 2.4rem);
  }
  .big-time {
    font-size: clamp(5rem, 28vw, 16rem);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .big-result {
    font-size: 1.4rem;
    font-weight: 700;
  }
  .overlay .controls {
    width: min(600px, 100%);
  }
  .overlay .controls button {
    min-height: 64px;
    font-size: 1.3rem;
    background: rgba(255, 255, 255, 0.15);
    border: 2px solid rgba(255, 255, 255, 0.85);
    color: #fff;
  }
  .overlay .controls button.primary {
    background: #fff;
    color: #1b1b1b;
    border-color: #fff;
  }
  .close {
    background: transparent;
    color: #fff;
    border-color: rgba(255, 255, 255, 0.6);
  }
</style>
