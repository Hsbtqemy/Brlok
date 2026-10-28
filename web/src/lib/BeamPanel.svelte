<script lang="ts">
  import { onDestroy } from "svelte";
  import { clampSeconds, HANG_DEFAULT_S, hangBlock, hangText, pickHang } from "../core/beam";
  import type { Block } from "../core/generator";
  import { formatClock } from "../core/intervals";
  import { seededRng } from "../core/random";
  import type { Beam } from "../core/wall";
  import { app } from "./appState.svelte";
  import HangTimer from "./HangTimer.svelte";

  /**
   * Onglet Poutre de Grimper (POUTRE.md §3) : une suspension (choisie par l'app ou à la main), ou une série
   * de suspensions avec un repos entre deux. La poutre s'affiche en grand à côté (écran Grimper), avec les
   * prises des deux mains : `left` / `right` suivent la suspension montrée, et le choix à la main.
   */
  interface Props {
    beam: Beam;
    left?: string | null;
    right?: string | null;
    /** Choix des prises à la main : l'écran rend la poutre touchable. */
    picking?: boolean;
  }

  let { beam, left = $bindable(null), right = $bindable(null), picking = $bindable(false) }: Props = $props();

  let mode = $state<"une" | "serie">("une");
  let seconds = $state(HANG_DEFAULT_S);
  let target = $state(Math.round(app.activePlayer?.ratings.grimpe.rating ?? 1300));
  const usage = new Map<string, number>();

  // Une suspension
  let chosen = $state<Block | null>(null);
  let attempt = $state(0);
  let last = $state<{ success: boolean; heldMs: number; delta: number | null } | null>(null);

  // Série
  let count = $state(6);
  let restS = $state(120);
  let series = $state<Block[]>([]);
  let results = $state<(boolean | null)[]>([]);
  let index = $state(0);
  let restUntil = $state<number | null>(null);
  let now = $state(Date.now());
  let autoNext = $state(false);

  // Choix à la main : les deux prises touchées deviennent la suspension choisie, et le choix se termine
  // (la poutre n'est plus touchable pendant la suspension).
  $effect(() => {
    if (!picking || !left || !right) return;
    chosen = hangBlock(beam, { left, right, seconds });
    picking = false;
    last = null;
    attempt++;
  });
  const single = $derived(mode === "une" ? chosen : null);
  const current = $derived(mode === "serie" ? (series[index] ?? null) : single);

  // La poutre en grand montre la suspension en cours (sauf pendant le choix à la main).
  $effect(() => {
    if (picking) return;
    left = current?.hang?.left ?? null;
    right = current?.hang?.right ?? null;
  });

  // La durée change : la suspension montrée la suit.
  $effect(() => {
    const s = clampSeconds(seconds);
    if (chosen?.hang && chosen.hang.seconds !== s) chosen = hangBlock(beam, { ...chosen.hang, seconds: s });
  });

  function choose() {
    picking = false;
    chosen = pickHang(beam, { targetRating: target, seconds, usage, rng: seededRng(Date.now()) });
    last = null;
    attempt++;
  }

  function startPicking() {
    picking = !picking;
    left = null;
    right = null;
    last = null;
  }

  function record(block: Block, success: boolean): number | null {
    const player = app.activePlayer;
    return player ? app.recordAttempt(player.id, block, success, "libre") : null;
  }

  function onSingle(success: boolean, heldMs: number) {
    if (!single) return;
    last = { success, heldMs, delta: record(single, success) };
  }

  function prepareSeries() {
    picking = false;
    const blocks: Block[] = [];
    const rng = seededRng(Date.now());
    for (let i = 0; i < Math.max(1, Math.min(20, Math.round(count))); i++) {
      const b = pickHang(beam, { targetRating: target, seconds, usage, rng });
      if (b) blocks.push(b);
    }
    series = blocks;
    results = blocks.map(() => null);
    index = 0;
    restUntil = null;
    autoNext = false;
  }

  function onSeries(success: boolean) {
    const block = series[index];
    if (!block) return;
    record(block, success);
    results[index] = success;
    if (index < series.length - 1) {
      now = Date.now();
      restUntil = now + Math.max(0, Math.round(restS)) * 1000;
    }
  }

  function nextHang() {
    restUntil = null;
    autoNext = true;
    index++;
  }

  let tick: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    if (restUntil === null) return;
    tick = setInterval(() => {
      now = Date.now();
      if (restUntil !== null && now >= restUntil) nextHang();
    }, 200);
    return () => {
      if (tick !== null) clearInterval(tick);
      tick = null;
    };
  });
  onDestroy(() => {
    if (tick !== null) clearInterval(tick);
  });

  const done = $derived(results.filter((r) => r !== null).length);
  const held = $derived(results.filter((r) => r === true).length);
</script>

<h2>Poutre</h2>
<div class="tabs" role="group" aria-label="Type de séance à la poutre">
  <button aria-pressed={mode === "une"} onclick={() => ((mode = "une"), (picking = false))}>Suspension</button>
  <button aria-pressed={mode === "serie"} onclick={() => ((mode = "serie"), (picking = false))}>Série</button>
</div>

<div class="field">
  Durée : <strong>{clampSeconds(seconds)} s</strong>
  <div class="row">
    {#each [7, 10, 15, 20, 30] as s (s)}
      <button class="chip" aria-pressed={clampSeconds(seconds) === s} onclick={() => (seconds = s)}>{s} s</button>
    {/each}
    <input type="number" min="3" max="60" bind:value={seconds} aria-label="Durée en secondes" />
  </div>
</div>
<label class="field">
  <span>
    Cote visée : <strong>{target}</strong>
    {#if app.activePlayer}
      <button class="link" onclick={() => (target = Math.round(app.activePlayer!.ratings.grimpe.rating))}>ma cote</button>
    {/if}
  </span>
  <input type="range" min="800" max="2300" step="50" bind:value={target} />
</label>

{#if mode === "une"}
  <div class="row">
    <button class="primary" onclick={choose}>Choisir les prises</button>
    <button aria-pressed={picking} onclick={startPicking}>{picking ? "Fin du choix à la main" : "Choisir à la main"}</button>
  </div>
  {#if picking}
    <p class="hint">
      {!left ? "Touche sur la poutre la prise de la main gauche…" : "…puis celle de la main droite (la même : les deux mains dessus)."}
    </p>
  {/if}
  {#if single}
    {#key `${attempt}|${single.hang?.left}|${single.hang?.right}|${single.hang?.seconds}`}
      <HangTimer {beam} block={single} showBeam={false} onResult={onSingle} />
    {/key}
    {#if last}
      <p class="result" class:ok={last.success}>
        {last.success ? "Tenu" : `Lâché après ${formatClock(last.heldMs)}`}{last.delta !== null && app.activePlayer
          ? ` · cote de grimpe ${last.delta >= 0 ? "+" : ""}${Math.round(last.delta)} → ${Math.round(app.activePlayer.ratings.grimpe.rating)}`
          : ""}
      </p>
      <div class="row">
        <button onclick={() => ((attempt += 1), (last = null))}>Recommencer</button>
        <button onclick={choose}>Autres prises</button>
      </div>
    {/if}
  {:else if !picking}
    <p class="hint">L'app choisit une prise par main, au plus près de la cote visée ; ou choisis-les à la main sur la poutre.</p>
  {/if}
  {#if !app.activePlayer}<p class="hint">Crée un joueur (onglet Joueurs) pour que tes suspensions comptent pour ta cote.</p>{/if}
{:else}
  <div class="row">
    <label class="field">Suspensions <input type="number" min="1" max="20" bind:value={count} /></label>
    <label class="field">Repos (s) <input type="number" min="0" max="600" bind:value={restS} /></label>
  </div>
  <button class="primary" onclick={prepareSeries}>Préparer la série</button>
  {#if series.length > 0}
    <ol class="series">
      {#each series as b, i (i)}
        <li class:current={i === index}>
          <span class="mark" class:ok={results[i] === true} class:ko={results[i] === false}>{results[i] === true ? "✓" : results[i] === false ? "✗" : i + 1}</span>
          {hangText(b)}
        </li>
      {/each}
    </ol>
    {#if restUntil !== null}
      <div class="rest" role="status">
        <span>Repos · suspension {index + 2}/{series.length} dans <strong>{formatClock(restUntil - now)}</strong></span>
        <button onclick={nextHang}>Passer</button>
      </div>
    {:else if results[index] === null && current}
      {#key index}
        <HangTimer {beam} block={current} showBeam={false} autoStart={autoNext} startLabel={`Démarrer (${index + 1}/${series.length})`} onResult={(s) => onSeries(s)} />
      {/key}
    {:else if done === series.length}
      <p class="result" class:ok={held === series.length}>Série terminée : {held}/{series.length} tenue(s).</p>
    {/if}
  {/if}
{/if}

<style>
  .tabs {
    display: flex;
    gap: 8px;
  }
  .tabs button {
    flex: 1;
  }
  .chip {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
  }
  .row input[type="number"] {
    width: 80px;
  }
  input[type="range"] {
    width: 100%;
  }
  .link {
    min-height: 0;
    padding: 0 6px;
    border: none;
    background: none;
    color: var(--accent);
    text-decoration: underline;
  }
  .result {
    margin: 0;
    font-weight: 700;
    color: #c62828;
  }
  .result.ok {
    color: #2e7d32;
  }
  .series {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .series li {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 4px 8px;
    border-radius: 8px;
  }
  .series li.current {
    background: var(--bg);
    font-weight: 600;
  }
  .mark {
    min-width: 1.4em;
    text-align: center;
    color: var(--muted);
    font-weight: 700;
  }
  .mark.ok {
    color: #2e7d32;
  }
  .mark.ko {
    color: #c62828;
  }
  .rest {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    background: #1565c0;
    color: #fff;
  }
  .rest button {
    color: #fff;
    background: transparent;
    border-color: rgba(255, 255, 255, 0.8);
  }
</style>
