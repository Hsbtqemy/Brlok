<script lang="ts">
  import type { Block } from "../core/generator";
  import { blockRating, recordPlacement } from "../core/players";
  import {
    nextPlacementTarget,
    placementRating,
    PLACEMENT_BLOCKS,
    PLACEMENT_LENGTH,
    type PlacementResult,
  } from "../core/placement";
  import { seededRng } from "../core/random";
  import { app } from "./appState.svelte";
  import BlockChallenge from "./BlockChallenge.svelte";

  interface Props {
    playerId: string;
    onClose: () => void;
  }

  let { playerId, onClose }: Props = $props();

  const player = $derived(app.ratings.players.find((p) => p.id === playerId));
  let attempts = $state<{ block: Block; result: PlacementResult }[]>([]);
  let current = $state<Block | null>(null);
  let startedAt = $state(Date.now());
  let finalRating = $state<number | null>(null);
  const usage = new Map<string, number>();

  function nextBlock() {
    const target = nextPlacementTarget(attempts.map((a) => a.result));
    current = app.wall
      ? app.challenge({ piece: null, targetRating: target, length: PLACEMENT_LENGTH, pattern: "progressive", usage, rng: seededRng(Date.now()) })
      : null;
    startedAt = Date.now();
  }

  function onResult(success: boolean) {
    if (!current) return;
    const target = nextPlacementTarget(attempts.map((a) => a.result));
    // La cote du bloc : celle qu'il a déjà s'il a été grimpé, sinon son estimation.
    const known = app.wall ? blockRating($state.snapshot(app.ratings), app.wall.id, current).rating : current.estimatedRating;
    attempts = [...attempts, { block: current, result: { target, blockRating: Math.round(known), success } }];
    if (attempts.length < PLACEMENT_BLOCKS) {
      nextBlock();
      return;
    }
    current = null;
    if (!app.wall) return;
    app.setRatings(recordPlacement($state.snapshot(app.ratings), playerId, app.wall.id, $state.snapshot(attempts)));
    finalRating = Math.round(placementRating(attempts.map((a) => a.result)).rating);
  }

  if (app.wall) nextBlock();
</script>

<div class="placement">
  <div class="head">
    <h2>Placement — {player?.name}</h2>
    <button onclick={onClose}>{finalRating === null ? "Abandonner" : "Fermer"}</button>
  </div>

  {#if !app.wall}
    <p class="warn">Charge d'abord ton pan (onglet Pan).</p>
  {:else if finalRating !== null}
    <p class="big">Cote de grimpe de départ : <strong>{finalRating}</strong></p>
    <p class="hint">
      {attempts.filter((a) => a.result.success).length} bloc(s) réussi(s) sur {PLACEMENT_BLOCKS}. La cote continuera d'évoluer à chaque
      bloc, mais par petits pas.
    </p>
  {:else}
    {#if player?.placedAt}
      <p class="warn">Ce joueur a déjà fait un placement : celui-ci remplacera sa cote de grimpe actuelle.</p>
    {/if}
    <ol class="steps">
      {#each Array.from({ length: PLACEMENT_BLOCKS }, (_, i) => i) as i (i)}
        <li class:done={i < attempts.length} class:ok={attempts[i]?.result.success} class:now={i === attempts.length}>
          {i < attempts.length ? (attempts[i].result.success ? "✓" : "✗") : i + 1}
        </li>
      {/each}
    </ol>
    <p class="hint">Grimpe chaque bloc sans limite de temps. Après une réussite le suivant est plus dur, après une chute plus facile.</p>
    {#key attempts.length}
      <BlockChallenge
        wall={app.wall}
        block={current}
        title={`Bloc ${attempts.length + 1} sur ${PLACEMENT_BLOCKS}`}
        subtitle={`Cote visée ${nextPlacementTarget(attempts.map((a) => a.result))}`}
        {startedAt}
        {onResult}
      />
    {/key}
  {/if}
</div>

<style>
  .placement {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .head h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .big {
    font-size: 1.3rem;
    margin: 0;
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 8px;
  }
  .steps li {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: var(--muted);
  }
  .steps li.now {
    border-color: var(--accent);
    color: var(--accent);
  }
  .steps li.done {
    background: #c62828;
    border-color: #c62828;
    color: #fff;
  }
  .steps li.done.ok {
    background: #2e7d32;
    border-color: #2e7d32;
  }
</style>
