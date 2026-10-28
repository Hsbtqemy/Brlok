<script lang="ts">
  import { routeHex, routeLabel } from "../core/gym";
  import { orderedMarks, routePhoto, sectorOf, type Route, type Wall } from "../core/wall";
  import RouteMarks from "./RouteMarks.svelte";

  interface Props {
    wall: Wall;
    route: Route | null;
    /** Hauteur maximale de la photo (grand écran). */
    maxHeight?: string;
  }

  let { wall, route, maxHeight }: Props = $props();
  let ratio = $state(1.33);
  const photo = $derived(route ? routePhoto(wall, route) : undefined);
  const sectorName = $derived(route && (wall.sectors?.length ?? 0) > 1 ? sectorOf(wall, route)?.name : undefined);
</script>

{#if route}
  <div class="route">
    <div class="card">
      <span class="swatch" style:background={routeHex(route)}></span>
      <div>
        <strong>{routeLabel(route)}</strong>
        {#if route.styles.length || sectorName}<span class="styles">{[sectorName, ...route.styles].filter(Boolean).join(" · ")}</span>{/if}
      </div>
    </div>
    {#if photo}
      <div class="photo" style={maxHeight ? `max-width: calc(${maxHeight} * ${ratio}); margin: 0 auto` : undefined}>
        <img
          src={photo}
          alt={`Photo du secteur ${sectorName ?? wall.name}`}
          onload={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            if (img.naturalHeight) ratio = img.naturalWidth / img.naturalHeight;
          }}
        />
        <RouteMarks marks={route.marks ?? []} color={routeHex(route)} />
      </div>
      {#if !route.marks?.length}<p class="hint">Les prises de cette voie ne sont pas placées sur la photo.</p>
      {:else if orderedMarks(route.marks).length}<p class="hint">Enchaînement imposé : suis les numéros ({orderedMarks(route.marks).length} prises){route.marks.length > orderedMarks(route.marks).length ? ", les autres prises sont libres" : ""}.</p>{/if}
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
</style>
