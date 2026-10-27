<script lang="ts">
  import { holdAt, type Wall } from "../core/wall";
  import { LEVEL_COLORS, LEVEL_TEXT } from "./colors";

  interface Props {
    wall: Wall;
    /** Prises du bloc affiché, dans l'ordre. */
    sequence?: string[];
  }

  let { wall, sequence = [] }: Props = $props();

  // Le bas du mur est affiché en bas de l'écran.
  const rows = $derived(
    wall.bottom === "last"
      ? Array.from({ length: wall.rows }, (_, i) => i)
      : Array.from({ length: wall.rows }, (_, i) => wall.rows - 1 - i),
  );
  const cols = $derived(Array.from({ length: wall.cols }, (_, i) => i));
  const order = $derived(new Map(sequence.map((id, i) => [id, i + 1])));
</script>

<div class="pan" style:grid-template-columns={`repeat(${wall.cols}, 1fr)`} role="grid" aria-label={`Pan ${wall.name}`}>
  {#each rows as row (row)}
    {#each cols as col (col)}
      {@const hold = holdAt(wall, { row, col })}
      {@const rank = hold ? order.get(hold.id) : undefined}
      <div
        class="cell"
        class:empty={!hold}
        class:inactive={hold && !hold.active}
        class:in-block={rank !== undefined}
        style:background={rank !== undefined && hold ? LEVEL_COLORS[hold.level] : undefined}
        style:color={rank !== undefined && hold ? LEVEL_TEXT[hold.level] : undefined}
        style:border-color={hold && hold.active && rank === undefined ? LEVEL_COLORS[hold.level] : undefined}
        title={hold ? `${hold.id} · niveau ${hold.level}${hold.tags.length ? " · " + hold.tags.join(", ") : ""}` : ""}
        role="gridcell"
      >
        {#if hold}
          <span class="id">{hold.id}</span>
          <span class="level">{hold.level}</span>
          {#if rank !== undefined}<span class="rank">{rank}</span>{/if}
        {/if}
      </div>
    {/each}
  {/each}
</div>

<style>
  .pan {
    display: grid;
    gap: 6px;
    width: 100%;
    max-width: 520px;
    margin: 0 auto;
  }
  .cell {
    position: relative;
    aspect-ratio: 52 / 44;
    border: 2px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-variant-numeric: tabular-nums;
    transition: background 0.15s;
  }
  .cell.empty {
    border-style: dashed;
    opacity: 0.4;
  }
  .cell.inactive {
    background: var(--inactive);
    border-color: var(--border);
    opacity: 0.6;
  }
  .cell.in-block {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent);
  }
  .id {
    font-weight: 600;
    font-size: 0.95rem;
  }
  .level {
    font-size: 0.75rem;
    opacity: 0.8;
  }
  .rank {
    position: absolute;
    top: -9px;
    right: -9px;
    min-width: 22px;
    height: 22px;
    border-radius: 11px;
    background: var(--accent);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
