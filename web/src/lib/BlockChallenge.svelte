<script lang="ts">
  import { FOOT_RULES } from "../core/feet";
  import type { Block } from "../core/generator";
  import { PIECES } from "../core/pieces";
  import type { Wall } from "../core/wall";
  import PanView from "./PanView.svelte";

  interface Props {
    wall: Wall | undefined;
    block: Block | null;
    title: string;
    subtitle?: string;
    /** Limite de temps du bloc ; à zéro, la chute est enregistrée automatiquement. */
    timeLimitMs?: number;
    startedAt?: number;
    onResult: (success: boolean) => void;
  }

  let { wall, block, title, subtitle = "", timeLimitMs, startedAt = Date.now(), onResult }: Props = $props();

  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 200);
    return () => clearInterval(id);
  });

  const left = $derived(timeLimitMs === undefined ? undefined : Math.max(0, timeLimitMs - (now - startedAt)));
  let timedOut = $state(false);
  $effect(() => {
    if (left === 0 && !timedOut) {
      timedOut = true;
      onResult(false);
    }
  });
  $effect(() => {
    // Nouveau bloc ou nouvel essai : on réarme la limite de temps.
    void startedAt;
    timedOut = false;
  });

  const piece = $derived(PIECES.find((p) => p.id === block?.piece));
</script>

<div class="challenge">
  <div class="head">
    <div>
      <h3>{title}</h3>
      {#if subtitle}<p class="sub">{subtitle}</p>{/if}
    </div>
    {#if left !== undefined}
      <div class="timer" class:urgent={left < 10_000}>{Math.ceil(left / 1000)} s</div>
    {/if}
  </div>
  {#if block && wall}
    <p class="meta">
      {#if piece}<span class="symbol">{piece.symbol}</span> {piece.label} ·{/if}
      cote {block.estimatedRating} · {block.holds.length} prises
    </p>
    <PanView {wall} sequence={block.holds.map((h) => h.id)} />
    <p class="sequence">{block.holds.map((h) => h.id).join(" → ")}</p>
    {#if block.feet}
      {@const rule = FOOT_RULES.find((r) => r.id === block.feet)}
      <p class="feet">
        <strong>{rule?.label}</strong> : {rule?.description}
        {#if block.feet === "sans-pied" && block.noFootMove}
          Mouvement sans pied : <strong>{block.holds[block.noFootMove - 1]?.id} → {block.holds[block.noFootMove]?.id}</strong>.
        {/if}
      </p>
    {/if}
    {#if block.relaxations.length > 0}<p class="warn">Assoupli : {block.relaxations.join(", ")}.</p>{/if}
  {:else}
    <p class="warn">Aucun bloc généré (pas de pan chargé ?) : grimpe un bloc libre de niveau équivalent.</p>
  {/if}
  <div class="actions">
    <button class="success" onclick={() => onResult(true)}>Réussi</button>
    <button class="fall" onclick={() => onResult(false)}>Chute</button>
  </div>
</div>

<style>
  .challenge {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }
  h3 {
    margin: 0;
    font-size: 1.1rem;
  }
  .sub,
  .meta {
    margin: 2px 0 0;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .symbol {
    font-size: 1.2rem;
  }
  .timer {
    white-space: nowrap;
    font-size: 1.8rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .timer.urgent {
    color: #d32f2f;
  }
  .sequence {
    margin: 0;
    font-weight: 600;
    word-break: break-word;
  }
  .warn {
    margin: 0;
    color: var(--warn);
  }
  .feet {
    margin: 0;
    padding: 8px 10px;
    border-left: 4px solid #6a1b9a;
    background: var(--bg);
    border-radius: 6px;
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .actions button {
    min-height: 64px;
    font-size: 1.2rem;
    font-weight: 700;
    color: #fff;
    border: none;
  }
  .success {
    background: #2e7d32;
  }
  .fall {
    background: #c62828;
  }
</style>
