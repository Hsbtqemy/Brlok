<script lang="ts">
  import { routeHex, routeLabel } from "../core/gym";
  import type { Route, Wall } from "../core/wall";

  interface Props {
    wall: Wall;
    route: Route | null;
    /** Hauteur maximale de la photo (grand écran). */
    maxHeight?: string;
  }

  let { wall, route, maxHeight }: Props = $props();
  let ratio = $state(1.33);
</script>

{#if route}
  <div class="route">
    <div class="card">
      <span class="swatch" style:background={routeHex(route)}></span>
      <div>
        <strong>{routeLabel(route)}</strong>
        {#if route.styles.length}<span class="styles">{route.styles.join(" · ")}</span>{/if}
      </div>
    </div>
    {#if wall.photo}
      <div class="photo" style={maxHeight ? `max-width: calc(${maxHeight} * ${ratio}); margin: 0 auto` : undefined}>
        <img
          src={wall.photo}
          alt={`Photo du secteur ${wall.name}`}
          onload={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            if (img.naturalHeight) ratio = img.naturalWidth / img.naturalHeight;
          }}
        />
        {#each route.marks ?? [] as m, i (i)}
          <span class="mark" class:role={m.role} style:left={`${m.x * 100}%`} style:top={`${m.y * 100}%`} style:border-color={routeHex(route)}
            >{m.role === "depart" ? "D" : m.role === "top" ? "T" : ""}</span
          >
        {/each}
      </div>
      {#if !route.marks?.length}<p class="hint">Les prises de cette voie ne sont pas placées sur la photo.</p>{/if}
    {/if}
  </div>
{:else}
  <p class="hint">Aucune voie choisie.</p>
{/if}

<style>
  .route {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .card {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
  }
  .card div {
    display: flex;
    flex-direction: column;
  }
  .swatch {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid var(--border);
    flex: none;
  }
  .styles {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .photo {
    position: relative;
    width: 100%;
    max-width: 100%;
  }
  .photo img {
    display: block;
    width: 100%;
    border-radius: 10px;
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
    font-weight: 800;
    color: #fff;
    text-shadow: 0 0 3px #000;
  }
  .mark.role {
    width: 34px;
    height: 34px;
    margin: -17px 0 0 -17px;
    background: rgba(0, 0, 0, 0.45);
  }
</style>
