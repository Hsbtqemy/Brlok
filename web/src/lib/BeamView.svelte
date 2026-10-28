<script lang="ts">
  import { beamHoldName } from "../core/beam";
  import type { Beam, Position } from "../core/wall";
  import { LEVEL_COLORS, LEVEL_TEXT } from "./colors";

  /** La poutre vue de face (rangée 1 en haut), avec les prises de la main gauche (G) et de la main droite (D). */
  interface Props {
    beam: Beam;
    left?: string | null;
    right?: string | null;
    /** Rend les prises touchables (choix des prises à la main). */
    onHold?: (id: string) => void;
    /** Rend toutes les cases touchables, vides comprises (édition de la poutre). */
    onCell?: (position: Position) => void;
    selected?: Position | null;
    /** Hauteur maximale (grand écran). */
    maxHeight?: string;
  }

  let { beam, left = null, right = null, onHold, onCell, selected = null, maxHeight }: Props = $props();

  const rows = $derived(Array.from({ length: beam.rows }, (_, i) => i));
  const cols = $derived(Array.from({ length: beam.cols }, (_, i) => i));
  const at = (row: number, col: number) => beam.holds.find((h) => h.position.row === row && h.position.col === col);
  const sizeStyle = $derived(maxHeight ? `max-width: calc(${maxHeight} * ${(beam.cols * 60) / (beam.rows * 44)})` : undefined);
</script>

<div class="beam" class:large={!!maxHeight} style={sizeStyle} style:grid-template-columns={`repeat(${beam.cols}, 1fr)`} role="grid" aria-label="Poutre">
  {#each rows as row (row)}
    {#each cols as col (col)}
      {@const hold = at(row, col)}
      {@const isLeft = !!hold && hold.id === left}
      {@const isRight = !!hold && hold.id === right}
      <svelte:element
        this={(onHold && hold) || onCell ? "button" : "div"}
        class="cell"
        class:empty={!hold}
        class:inactive={hold && !hold.active}
        class:on={isLeft || isRight}
        class:selected={selected?.row === row && selected?.col === col}
        style:background={(isLeft || isRight) && hold ? LEVEL_COLORS[hold.level] : undefined}
        style:color={(isLeft || isRight) && hold ? LEVEL_TEXT[hold.level] : undefined}
        style:border-color={hold && hold.active && !(isLeft || isRight) ? LEVEL_COLORS[hold.level] : undefined}
        onclick={() => (onCell ? onCell({ row, col }) : hold && onHold?.(hold.id))}
        title={hold ? `${hold.id} · ${beamHoldName(hold)} · niveau ${hold.level}` : ""}
        aria-label={hold ? `${beamHoldName(hold)}, ${hold.id}, niveau ${hold.level}${isLeft ? ", main gauche" : ""}${isRight ? ", main droite" : ""}` : onCell ? `Case vide ${row + 1}-${col + 1}` : undefined}
        role={(onHold && hold) || onCell ? undefined : "gridcell"}
      >
        {#if hold}
          <span class="name">{beamHoldName(hold)}</span>
          <span class="level">{hold.level}</span>
          {#if isLeft || isRight}<span class="hand">{isLeft && isRight ? "G D" : isLeft ? "G" : "D"}</span>{/if}
        {/if}
      </svelte:element>
    {/each}
  {/each}
</div>

<style>
  .beam {
    display: grid;
    gap: 6px;
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
    padding: 10px;
    border-radius: 12px;
    background: color-mix(in srgb, #a1887f 30%, var(--surface));
    box-sizing: border-box;
  }
  .cell {
    position: relative;
    aspect-ratio: 60 / 44;
    border: 2px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    min-width: 0;
  }
  button.cell {
    min-height: 0;
    padding: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  .cell.empty {
    border-style: dashed;
    opacity: 0.4;
  }
  .cell.inactive {
    background: var(--inactive);
    opacity: 0.6;
  }
  .cell.on {
    box-shadow: 0 0 0 3px var(--accent);
    border-color: var(--accent);
  }
  .cell.selected {
    box-shadow: 0 0 0 3px var(--accent);
    border-color: var(--accent);
  }
  .name {
    font-weight: 600;
    font-size: 0.8rem;
    line-height: 1.05;
    overflow-wrap: anywhere;
  }
  .level {
    font-size: 0.7rem;
    opacity: 0.8;
  }
  .hand {
    position: absolute;
    top: -10px;
    right: -8px;
    min-width: 24px;
    height: 22px;
    padding: 0 4px;
    border-radius: 11px;
    background: var(--accent);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
  }
  .large .name {
    font-size: clamp(0.9rem, 2.4vh, 1.6rem);
  }
  .large .level {
    font-size: clamp(0.75rem, 1.8vh, 1.1rem);
  }
</style>
