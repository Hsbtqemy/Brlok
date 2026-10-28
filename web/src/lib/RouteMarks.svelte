<script lang="ts">
  import { markLabel, orderedMarks, type RouteMark } from "../core/wall";

  /** Prises d'une voie posées sur sa photo (le parent est en position relative) : rang, départ, top, et le tracé de l'ordre. */
  interface Props {
    marks: readonly RouteMark[];
    color: string;
  }

  let { marks, color }: Props = $props();
  const path = $derived(orderedMarks(marks));
</script>

{#if path.length > 1}
  <svg class="path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <polyline points={path.map((m) => `${m.x * 100},${m.y * 100}`).join(" ")} />
    <polyline class="inner" points={path.map((m) => `${m.x * 100},${m.y * 100}`).join(" ")} style:stroke={color} />
  </svg>
{/if}
{#each marks as m, i (i)}
  {@const label = markLabel(m)}
  <span class="mark" class:labelled={label !== ""} class:numbered={m.n !== undefined} style:left={`${m.x * 100}%`} style:top={`${m.y * 100}%`} style:border-color={color}
    >{label}</span
  >
{/each}

<style>
  .path {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .path polyline {
    fill: none;
    stroke: #fff;
    stroke-width: 5;
    stroke-linejoin: round;
    stroke-linecap: round;
    stroke-dasharray: 2 10;
    vector-effect: non-scaling-stroke;
    opacity: 0.9;
  }
  .path polyline.inner {
    stroke-width: 3;
  }
  .mark {
    position: absolute;
    width: 26px;
    height: 26px;
    margin: -13px 0 0 -13px;
    border-radius: 50%;
    border: 4px solid;
    box-shadow:
      0 0 0 2px #fff,
      0 0 6px rgba(0, 0, 0, 0.6);
    pointer-events: none;
    display: grid;
    place-items: center;
    font-size: 0.85rem;
    font-weight: 800;
    color: #fff;
    text-shadow: 0 0 3px #000;
    box-sizing: border-box;
  }
  .mark.labelled {
    width: 32px;
    height: 32px;
    margin: -16px 0 0 -16px;
    background: rgba(0, 0, 0, 0.5);
  }
  .mark.numbered {
    background: rgba(0, 0, 0, 0.7);
  }
</style>
