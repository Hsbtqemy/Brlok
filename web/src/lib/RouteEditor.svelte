<script lang="ts">
  import { untrack } from "svelte";
  import { countByColor, detectBlobs, findSimilar, inZone, nearestColorName, sampleColor, seedTolerance, type Blob, type Rgb } from "../core/colorDetect";
  import { GRADES, ROUTE_COLORS, routeLabel, STYLES } from "../core/gym";
  import { autoOrder, clearOrder, toggleOrder, type Route, type RouteMark, type Wall } from "../core/wall";
  import { app } from "./appState.svelte";
  import { photoPixels } from "./photo";
  import RouteMarks from "./RouteMarks.svelte";

  /** Éditeur d'une voie : ses prises sur la photo de son secteur, puis sa fiche (couleur, cotation, styles). */
  interface Props {
    /** Voie à modifier ; null : nouvelle voie. */
    routeId: string | null;
    /** Secteur de départ (nouvelle voie). */
    sectorId: string | null;
    onDone: (message?: string) => void;
  }

  let { routeId, sectorId: initialSector, onDone }: Props = $props();

  const wall = $derived(app.wall);
  const original = $derived(routeId ? (wall?.routes.find((r) => r.id === routeId) ?? null) : null);
  const sectors = $derived(wall?.sectors ?? []);

  // Fiche de la voie (copie de travail : rien n'est enregistré avant « Enregistrer »). L'éditeur est
  // recréé pour chaque voie : seules les valeurs d'ouverture comptent.
  const init = untrack(() => ({ routeId, sectorId: initialSector }));
  const start = init.routeId ? app.wall?.routes.find((r) => r.id === init.routeId) : undefined;
  let color = $state(start?.color ?? "vert");
  let colorHex = $state<string | undefined>(start?.colorHex);
  let grade = $state(start?.grade ?? "6a");
  let styles = $state<string[]>([...(start?.styles ?? [])]);
  let name = $state(start?.name ?? "");
  let marks = $state<RouteMark[]>([...(start?.marks ?? [])]);
  let sectorId = $state<string | null>(start?.sectorId ?? init.sectorId ?? app.wall?.sectors?.[0]?.id ?? null);
  const sector = $derived(sectors.find((x) => x.id === sectorId) ?? sectors[0]);
  const photo = $derived(sector?.photo);
  const shownHex = $derived(colorHex ?? ROUTE_COLORS.find((c) => c.name === color)?.hex ?? "#fff");

  // Outils sur la photo
  type Tool = "pipette" | "ajuster" | "depart" | "ordre" | "zone";
  const TOOLS: { id: Tool; label: string; hint: string }[] = [
    { id: "pipette", label: "Pipette", hint: "Touche une prise : toutes les prises de sa couleur sont marquées (blanc, noir et gris compris)." },
    { id: "ajuster", label: "Ajouter / retirer", hint: "Touche la photo pour ajouter une prise, ou une prise marquée pour la retirer." },
    { id: "depart", label: "Départ / top", hint: "Touche une prise marquée : départ, puis top, puis prise ordinaire." },
    { id: "ordre", label: "Ordre", hint: "Touche les prises dans l'ordre de l'enchaînement : 1, 2, 3… Touche un numéro pour le retirer. Les prises sans numéro restent libres." },
    { id: "zone", label: "Zone", hint: "Fais glisser pour encadrer la voie : seules les prises dans le cadre sont gardées, et la pipette s'y limite." },
  ];
  let tool = $state<Tool>(start?.marks?.length ? "ajuster" : "pipette");
  let tolerance = $state(18);
  let zoom = $state(false);
  let zone = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  let dragging = $state(false);
  let message = $state("");
  let blobs = $state<Blob[]>([]);
  /** Dernière teinte prélevée (pour rejouer la pipette quand la tolérance change). */
  let sampled = $state<Rgb | null>(null);
  /** Pixels de la photo à la résolution d'analyse (chargés à la demande). */
  let pixels: { data: Uint8ClampedArray; width: number; height: number } | null = null;
  const colors = $derived(countByColor(blobs));

  // Taches de couleur vive repérées à l'ouverture (et à chaque changement de secteur).
  $effect(() => {
    const p = photo;
    pixels = null;
    blobs = [];
    if (!p) return;
    void photoPixels(p).then((px) => {
      if (photo !== p) return;
      pixels = px;
      blobs = detectBlobs(px.data, px.width, px.height, Math.max(12, Math.round((px.width * px.height) / 6000)));
    });
  });

  function changeSector(id: string) {
    if (id === sectorId) return;
    sectorId = id;
    zone = null;
    sampled = null;
    if (marks.length) {
      marks = [];
      message = "Autre secteur : les prises marquées sur l'ancienne photo ont été retirées.";
    }
  }

  const inCurrentZone = <T extends { x: number; y: number }>(points: T[]) => (zone ? inZone(points, zone) : points);

  function pickColor(c: { color: string; hex: string }) {
    color = c.color;
    colorHex = c.hex;
    marks = inCurrentZone(blobs.filter((b) => b.color === c.color)).map((b) => ({ x: b.x, y: b.y }));
  }

  /** Pipette : la teinte prélevée devient la couleur de la voie, et toutes ses prises sont marquées. */
  function applySample(rgb: Rgb) {
    if (!pixels) return;
    const { data, width, height } = pixels;
    const found = inCurrentZone(findSimilar(data, width, height, rgb, tolerance, Math.max(6, Math.round((width * height) / 9000))));
    sampled = rgb;
    color = nearestColorName(rgb);
    colorHex = `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
    // Départ, top et rang déjà donnés sont gardés s'ils tombent sur une prise retrouvée.
    const kept = (b: Blob) => marks.find((m) => (m.role || m.n !== undefined) && Math.abs(m.x - b.x) <= b.w / 2 + 0.01 && Math.abs(m.y - b.y) <= b.h / 2 + 0.01);
    marks = found.map((b) => {
      const k = kept(b);
      return { x: b.x, y: b.y, ...(k?.role ? { role: k.role } : {}), ...(k?.n !== undefined ? { n: k.n } : {}) };
    });
    message = found.length
      ? `${found.length} prise(s) ${color} marquée(s). Ajuste la tolérance, ou retire les intruses avec « Ajouter / retirer ».`
      : "Aucune prise retrouvée de cette teinte : augmente la tolérance, ou place les prises à la main.";
  }

  function retune() {
    if (sampled) applySample(sampled);
  }

  function pointAt(event: PointerEvent | MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height, rect };
  }

  function nearestMark(x: number, y: number, rect: DOMRect): number {
    let best = -1, bestD = 22;
    marks.forEach((m, i) => {
      const d = Math.hypot((m.x - x) * rect.width, (m.y - y) * rect.height);
      if (d < bestD) (best = i), (bestD = d);
    });
    return best;
  }

  function withRole(m: RouteMark, role: RouteMark["role"]): RouteMark {
    const { role: _old, ...rest } = m;
    return role ? { ...rest, role } : rest;
  }

  async function onPhotoClick(event: MouseEvent) {
    if (tool === "zone") return;
    const { x, y, rect } = pointAt(event);
    if (tool === "pipette") {
      if (!pixels && photo) pixels = await photoPixels(photo);
      if (!pixels) return;
      const rgb = sampleColor(pixels.data, pixels.width, pixels.height, x, y);
      // Tolérance réglée sur la prise touchée : assez serrée pour la détacher du mur.
      tolerance = Math.min(24, seedTolerance(pixels.data, pixels.width, pixels.height, x, y, rgb, 24) ?? 8);
      applySample(rgb);
      return;
    }
    const near = nearestMark(x, y, rect);
    if (tool === "ordre") {
      if (near >= 0) marks = toggleOrder(marks, near);
      return;
    }
    if (tool === "depart") {
      if (near < 0) return;
      const next = !marks[near].role ? "depart" : marks[near].role === "depart" ? "top" : undefined;
      // Un seul top par voie.
      marks = marks.map((m, i) => (i === near ? withRole(m, next) : next === "top" && m.role === "top" ? withRole(m, undefined) : m));
      return;
    }
    if (near >= 0) {
      // Retirer une prise numérotée fait remonter les suivantes.
      const renumbered = marks[near].n !== undefined ? toggleOrder(marks, near) : marks;
      marks = renumbered.filter((_, i) => i !== near);
      return;
    }
    const blob = blobs.find((b) => Math.abs(b.x - x) <= b.w / 2 + 0.01 && Math.abs(b.y - y) <= b.h / 2 + 0.01);
    marks = [...marks, blob ? { x: blob.x, y: blob.y } : { x, y }];
  }

  function onPointerDown(event: PointerEvent) {
    if (tool !== "zone") return;
    const { x, y } = pointAt(event);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    zone = { x0: x, y0: y, x1: x, y1: y };
    dragging = true;
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging || !zone) return;
    const { x, y } = pointAt(event);
    zone = { ...zone, x1: Math.min(1, Math.max(0, x)), y1: Math.min(1, Math.max(0, y)) };
  }

  function onPointerUp() {
    if (!dragging || !zone) return;
    dragging = false;
    if (Math.abs(zone.x1 - zone.x0) < 0.02 || Math.abs(zone.y1 - zone.y0) < 0.02) {
      zone = null;
      return;
    }
    marks = inZone(marks, zone);
    message = `Zone posée : ${marks.length} prise(s) gardée(s). La pipette ne cherche plus que dans le cadre.`;
  }

  function save() {
    if (!wall) return;
    const route: Route = {
      id: original?.id ?? `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      name: name.trim(),
      color,
      colorHex,
      grade,
      styles: [...styles],
      marks: [...marks],
      ...(sector ? { sectorId: sector.id } : {}),
      createdAt: original?.createdAt ?? new Date().toISOString(),
      ...(original?.archived ? { archived: true } : {}),
    };
    const next: Wall = {
      ...wall,
      routes: original ? wall.routes.map((r) => (r.id === route.id ? route : r)) : [...wall.routes, route],
    };
    app.setWalls(app.walls.map((w) => (w.id === next.id ? next : w)));
    onDone(`Voie « ${routeLabel(route)} » ${original ? "modifiée" : "créée"}.`);
  }
</script>

<div class="route-editor">
  <div class="topbar">
    <button onclick={() => onDone()}>← Voies</button>
    <h2>{original ? `Modifier ${routeLabel(original)}` : "Nouvelle voie"}</h2>
  </div>

  <section class="panel">
    <h3>1. Les prises sur la photo</h3>
    {#if sectors.length > 1}
      <label class="field">
        Secteur
        <select value={sector?.id} onchange={(e) => changeSector((e.currentTarget as HTMLSelectElement).value)}>
          {#each sectors as sec (sec.id)}<option value={sec.id}>{sec.name}</option>{/each}
        </select>
      </label>
    {/if}
    {#if photo}
      <div class="tools">
        {#each TOOLS as t (t.id)}
          <button aria-pressed={tool === t.id} onclick={() => (tool = t.id)}>{t.label}</button>
        {/each}
        <button class="zoom" aria-pressed={zoom} onclick={() => (zoom = !zoom)}>{zoom ? "Réduire" : "Agrandir"}</button>
      </div>
      <p class="hint">{TOOLS.find((t) => t.id === tool)?.hint}</p>
      {#if tool === "ordre" && marks.length}
        <div class="row">
          <button class="small" onclick={() => (marks = autoOrder(marks))}>Numéroter de bas en haut</button>
          {#if marks.some((m) => m.n !== undefined)}<button class="small" onclick={() => (marks = clearOrder(marks))}>Effacer l'ordre</button>{/if}
        </div>
      {/if}
      {#if tool === "pipette"}
        <label class="field tolerance">
          <span class="tol-head">
            {#if sampled}<span class="dot" style:background={`rgb(${sampled.join(",")})`} title="Teinte prélevée"></span>{/if}
            Tolérance de teinte : {tolerance}
            <small>{sampled ? "moins = plus strict, plus = plus de prises" : "touche une prise d'abord"}</small>
          </span>
          <input type="range" min="4" max="40" step="1" bind:value={tolerance} oninput={retune} disabled={!sampled} />
        </label>
      {/if}
      {#if zone && !dragging}
        <p class="hint">Zone active. <button class="link" onclick={() => (zone = null)}>Toute la photo</button></p>
      {/if}
      <div class="photo-scroll" class:zoomed={zoom}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="photo"
          class:zoning={tool === "zone"}
          onclick={onPhotoClick}
          onpointerdown={onPointerDown}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
          onpointercancel={onPointerUp}
        >
          <img src={photo} alt={`Photo du secteur ${sector?.name}`} draggable="false" />
          {#if !marks.length && !sampled}
            {#each blobs as b, i (i)}
              <span
                class="blob"
                style:left={`${(b.x - b.w / 2) * 100}%`}
                style:top={`${(b.y - b.h / 2) * 100}%`}
                style:width={`${b.w * 100}%`}
                style:height={`${b.h * 100}%`}
                style:border-color={b.hex}
              ></span>
            {/each}
          {/if}
          {#if zone}
            <span
              class="zone"
              style:left={`${Math.min(zone.x0, zone.x1) * 100}%`}
              style:top={`${Math.min(zone.y0, zone.y1) * 100}%`}
              style:width={`${Math.abs(zone.x1 - zone.x0) * 100}%`}
              style:height={`${Math.abs(zone.y1 - zone.y0) * 100}%`}
            ></span>
          {/if}
          <RouteMarks {marks} color={shownHex} />
        </div>
      </div>
      {#if colors.length}
        <div class="chips">
          <span class="hint">Couleurs vives repérées :</span>
          {#each colors as c (c.color)}
            <button class="chip" aria-pressed={color === c.color && marks.length > 0} onclick={() => pickColor(c)}>
              <span class="dot" style:background={c.hex}></span>{c.color} · {c.count}
            </button>
          {/each}
        </div>
      {/if}
      <p class="hint">
        {marks.length} prise(s) marquée(s){marks.some((m) => m.role === "depart") ? `, ${marks.filter((m) => m.role === "depart").length} départ(s)` : ""}{marks.some((m) => m.role === "top") ? ", top placé" : ""}{marks.some((m) => m.n !== undefined) ? `, ${marks.filter((m) => m.n !== undefined).length} dans l'ordre` : ""}.
      </p>
    {:else}
      <p class="hint">Ce mur n'a pas de photo : la voie se décrit par sa fiche. Ajoute une photo de secteur depuis la page du mur pour placer ses prises.</p>
    {/if}
    {#if message}<p class="message">{message}</p>{/if}
  </section>

  <section class="panel">
    <h3>2. La fiche</h3>
    <div class="field">
      Couleur des prises
      <div class="chips">
        {#each ROUTE_COLORS as c (c.name)}
          <button class="chip" aria-pressed={color === c.name} onclick={() => ((color = c.name), (colorHex = undefined))}>
            <span class="dot" style:background={c.hex}></span>{c.name}
          </button>
        {/each}
      </div>
    </div>
    <div class="row">
      <label class="field">
        Cotation
        <select id="route-grade" bind:value={grade}>
          <option value="?">inconnue</option>
          {#each GRADES as g (g.grade)}<option value={g.grade}>{g.grade}</option>{/each}
        </select>
      </label>
      <label class="field grow">
        Nom ou numéro (facultatif)
        <input type="text" id="route-name" bind:value={name} placeholder="Ex. 12, Le toit…" />
      </label>
    </div>
    <div class="field">
      Style
      <div class="chips">
        {#each STYLES as s (s)}
          <button class="chip" aria-pressed={styles.includes(s)} onclick={() => (styles = styles.includes(s) ? styles.filter((x) => x !== s) : [...styles, s])}>{s}</button>
        {/each}
      </div>
    </div>
  </section>

  <div class="save-bar">
    <span class="dot" style:background={shownHex}></span>
    <span class="summary">{color} {grade === "?" ? "cotation ?" : grade}{name.trim() ? ` · ${name.trim()}` : ""} · {marks.length} prise(s)</span>
    <button onclick={() => onDone()}>Annuler</button>
    <button class="primary" onclick={save}>{original ? "Enregistrer" : "Créer"}</button>
  </div>
</div>

<style>
  .route-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 900px;
    margin: 0 auto;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .topbar h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  h3 {
    margin: 0;
    font-size: 1rem;
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tools button {
    min-height: 38px;
    padding: 0 12px;
    font-size: 0.9rem;
  }
  .tools .zoom {
    margin-left: auto;
  }
  .tolerance input {
    width: 100%;
  }
  .tol-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .tol-head small {
    color: var(--muted);
  }
  .small {
    min-height: 38px;
    font-size: 0.85rem;
  }
  .link {
    min-height: 0;
    padding: 0 4px;
    border: none;
    background: none;
    color: var(--accent);
    text-decoration: underline;
  }
  .photo-scroll {
    overflow: auto;
    max-width: 100%;
    border-radius: 10px;
  }
  .photo-scroll.zoomed {
    max-height: 75vh;
  }
  .photo-scroll.zoomed .photo {
    width: 220%;
  }
  .photo {
    position: relative;
    cursor: crosshair;
    width: 100%;
  }
  .photo.zoning {
    touch-action: none;
  }
  .photo img {
    display: block;
    width: 100%;
    border-radius: 10px;
    user-select: none;
  }
  .zone {
    position: absolute;
    border: 2px dashed #fff;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }
  .blob {
    position: absolute;
    border: 2px solid;
    border-radius: 4px;
    opacity: 0.7;
    pointer-events: none;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .chip {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 0.85rem;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid var(--border);
    flex: none;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .message {
    margin: 0;
    font-size: 0.9rem;
  }
  .save-bar {
    position: sticky;
    bottom: calc(var(--nav-h) + 6px);
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px calc(8px + var(--bar-safe-bottom));
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
  }
  .save-bar .summary {
    flex: 1;
    min-width: 0;
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .save-bar button {
    flex: none;
    min-height: 44px;
    padding: 0 12px;
  }
</style>
