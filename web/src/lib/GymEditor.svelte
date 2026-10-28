<script lang="ts">
  import { countByColor, detectBlobs, findSimilar, inZone, nearestColorName, sampleColor, seedTolerance, type Blob, type Rgb } from "../core/colorDetect";
  import { GRADES, ROUTE_COLORS, routeHex, routeLabel, STYLES } from "../core/gym";
  import type { Route, RouteMark, Wall } from "../core/wall";
  import { app } from "./appState.svelte";

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

  const PHOTO_MAX = 900;
  const DETECT_MAX = 420;

  const wall = $derived(app.wall);
  let blobs = $state<Blob[]>([]);
  let message = $state("");
  let busy = $state(false);

  // Voie en cours de création / modification
  let editingId = $state<string | null>(null);
  let color = $state("vert");
  let colorHex = $state<string | undefined>(undefined);
  let grade = $state("6a");
  let styles = $state<string[]>([]);
  let name = $state("");
  let marks = $state<RouteMark[]>([]);

  // Outils sur la photo
  type Tool = "pipette" | "ajuster" | "depart" | "zone";
  const TOOLS: { id: Tool; label: string; hint: string }[] = [
    { id: "pipette", label: "Pipette", hint: "Touche une prise : toutes les prises de sa couleur sont marquées (blanc, noir et gris compris)." },
    { id: "ajuster", label: "Ajouter / retirer", hint: "Touche la photo pour ajouter une prise, ou une prise marquée pour la retirer." },
    { id: "depart", label: "Départ / top", hint: "Touche une prise marquée : départ, puis top, puis prise ordinaire." },
    { id: "zone", label: "Zone", hint: "Fais glisser pour encadrer la voie : seules les prises dans le cadre sont gardées, et la pipette s'y limite." },
  ];
  let tool = $state<Tool>("pipette");
  let tolerance = $state(18);
  let zoom = $state(false);
  let zone = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  let dragging = $state(false);
  /** Dernière teinte prélevée (pour rejouer la pipette quand la tolérance change). */
  let sampled = $state<Rgb | null>(null);
  /** Pixels de la photo à la résolution d'analyse (chargés à la demande). */
  let pixels: { data: Uint8ClampedArray; width: number; height: number } | null = null;
  let confirmDelete = $state<string | null>(null);
  let showArchived = $state(false);

  const routes = $derived((wall?.routes ?? []).filter((r) => showArchived || !r.archived));
  const colors = $derived(countByColor(blobs));

  function save(next: Wall) {
    app.setWalls(app.walls.map((w) => (w.id === next.id ? next : w)));
  }

  function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image illisible."));
      img.src = URL.createObjectURL(file);
    });
  }

  function scaled(img: HTMLImageElement, max: number): HTMLCanvasElement {
    const ratio = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * ratio);
    canvas.height = Math.round(img.naturalHeight * ratio);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async function onPhoto(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file || !wall) return;
    busy = true;
    message = "";
    try {
      const img = await loadImage(file);
      // Photo réduite et compressée : elle est enregistrée avec le mur (taille limitée).
      let photo = scaled(img, PHOTO_MAX).toDataURL("image/jpeg", 0.72);
      if (photo.length > 180_000) photo = scaled(img, 700).toDataURL("image/jpeg", 0.6);
      save({ ...wall, photo });
      zone = null;
      sampled = null;
      detect(img);
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  function detect(img: HTMLImageElement) {
    const canvas = scaled(img, DETECT_MAX);
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    pixels = { data: data.data, width: canvas.width, height: canvas.height };
    blobs = detectBlobs(data.data, canvas.width, canvas.height, Math.max(12, Math.round((canvas.width * canvas.height) / 6000)));
    message = blobs.length
      ? `${blobs.length} prises de couleur repérées. Touche une couleur pour créer une voie.`
      : "Aucune prise de couleur vive repérée : place les prises à la main en touchant la photo.";
  }

  async function redetect() {
    if (!wall?.photo) return;
    const img = new Image();
    img.src = wall.photo;
    await img.decode();
    detect(img);
  }

  const inCurrentZone = <T extends { x: number; y: number }>(points: T[]) => (zone ? inZone(points, zone) : points);

  function pickColor(c: { color: string; hex: string }) {
    color = c.color;
    colorHex = c.hex;
    marks = inCurrentZone(blobs.filter((b) => b.color === c.color)).map((b) => ({ x: b.x, y: b.y }));
  }

  async function ensurePixels() {
    if (pixels || !wall?.photo) return;
    const img = new Image();
    img.src = wall.photo;
    await img.decode();
    const canvas = scaled(img, DETECT_MAX);
    pixels = { data: canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
  }

  /** Pipette : la teinte prélevée devient la couleur de la voie, et toutes ses prises sont marquées. */
  function applySample(rgb: Rgb) {
    if (!pixels) return;
    const { data, width, height } = pixels;
    const found = inCurrentZone(findSimilar(data, width, height, rgb, tolerance, Math.max(6, Math.round((width * height) / 9000))));
    sampled = rgb;
    color = nearestColorName(rgb);
    colorHex = `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
    // Les départs et le top déjà placés sont gardés s'ils tombent sur une prise retrouvée.
    const roleAt = (b: Blob) => marks.find((m) => m.role && Math.abs(m.x - b.x) <= b.w / 2 + 0.01 && Math.abs(m.y - b.y) <= b.h / 2 + 0.01)?.role;
    marks = found.map((b) => ({ x: b.x, y: b.y, ...(roleAt(b) ? { role: roleAt(b) } : {}) }));
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

  async function onPhotoClick(event: MouseEvent) {
    if (tool === "zone") return;
    const { x, y, rect } = pointAt(event);
    if (tool === "pipette") {
      await ensurePixels();
      if (!pixels) return;
      const rgb = sampleColor(pixels.data, pixels.width, pixels.height, x, y);
      // Tolérance réglée sur la prise touchée : assez serrée pour la détacher du mur.
      tolerance = Math.min(24, seedTolerance(pixels.data, pixels.width, pixels.height, x, y, rgb, 24) ?? 8);
      applySample(rgb);
      return;
    }
    const near = nearestMark(x, y, rect);
    if (tool === "depart") {
      if (near < 0) return;
      const next = !marks[near].role ? "depart" : marks[near].role === "depart" ? "top" : undefined;
      // Un seul top par voie.
      marks = marks.map((m, i) =>
        i === near ? { x: m.x, y: m.y, ...(next ? { role: next } : {}) } : next === "top" && m.role === "top" ? { x: m.x, y: m.y } : m,
      );
      return;
    }
    if (near >= 0) {
      marks = marks.filter((_, i) => i !== near);
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

  function resetForm() {
    editingId = null;
    name = "";
    styles = [];
    marks = [];
    colorHex = undefined;
    sampled = null;
    zone = null;
  }

  function editRoute(r: Route) {
    editingId = r.id;
    color = r.color;
    colorHex = r.colorHex;
    grade = r.grade;
    styles = [...r.styles];
    name = r.name;
    marks = [...(r.marks ?? [])];
    sampled = null;
  }

  function submitRoute() {
    if (!wall) return;
    const route: Route = {
      id: editingId ?? `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      name: name.trim(),
      color,
      colorHex,
      grade,
      styles: [...styles],
      marks: [...marks],
      createdAt: editingId ? wall.routes.find((r) => r.id === editingId)?.createdAt : new Date().toISOString(),
    };
    const exists = wall.routes.some((r) => r.id === route.id);
    save({ ...wall, routes: exists ? wall.routes.map((r) => (r.id === route.id ? { ...r, ...route } : r)) : [...wall.routes, route] });
    message = `Voie « ${routeLabel(route)} » ${exists ? "modifiée" : "créée"}.`;
    resetForm();
  }

  function toggleArchive(r: Route) {
    if (!wall) return;
    save({ ...wall, routes: wall.routes.map((x) => (x.id === r.id ? { ...x, archived: !x.archived } : x)) });
  }

  function removeRoute(r: Route) {
    if (!wall) return;
    if (confirmDelete !== r.id) {
      confirmDelete = r.id;
      return;
    }
    confirmDelete = null;
    save({ ...wall, routes: wall.routes.filter((x) => x.id !== r.id) });
    if (editingId === r.id) resetForm();
  }
</script>

<div class="gym">
  <section class="panel">
    <div class="head">
      <h2>Mur à voies : {wall?.name}</h2>
      <button class="primary" onclick={onClose}>Terminé</button>
    </div>
    {#if wall}
      <label class="field">
        Nom de la salle ou du secteur
        <input type="text" id="gym-name" value={wall.name} onchange={(e) => save({ ...wall, name: (e.currentTarget as HTMLInputElement).value.trim() || wall.name })} />
      </label>
      <label class="file">
        <input type="file" accept="image/*" onchange={onPhoto} />
        <span>{busy ? "Analyse…" : wall.photo ? "Changer la photo du secteur" : "Ajouter une photo du secteur"}</span>
      </label>
      {#if wall.photo}
        <div class="tools">
          {#each TOOLS as t (t.id)}
            <button aria-pressed={tool === t.id} onclick={() => (tool = t.id)}>{t.label}</button>
          {/each}
          <button class="zoom" aria-pressed={zoom} onclick={() => (zoom = !zoom)}>{zoom ? "Réduire" : "Agrandir"}</button>
        </div>
        <p class="hint">{TOOLS.find((t) => t.id === tool)?.hint}</p>
        {#if tool === "pipette" || sampled}
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
            <img src={wall.photo} alt={`Photo du secteur ${wall.name}`} draggable="false" />
            {#if tool !== "pipette" || !sampled}
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
            {#each marks as m, i (i)}
              <span class="mark" class:role={m.role} style:left={`${m.x * 100}%`} style:top={`${m.y * 100}%`} style:border-color={colorHex ?? "#fff"}
                >{m.role === "depart" ? "D" : m.role === "top" ? "T" : ""}</span
              >
            {/each}
          </div>
        </div>
        {#if marks.length}
          <div class="quick">
            <span class="dot" style:background={colorHex ?? ROUTE_COLORS.find((c) => c.name === color)?.hex}></span>
            <span class="quick-info">{marks.length} prise(s) · {color}{marks.some((m) => m.role === "top") ? " · top" : ""}</span>
            <select aria-label="Cotation" bind:value={grade}>
              <option value="?">cotation ?</option>
              {#each GRADES as g (g.grade)}<option value={g.grade}>{g.grade}</option>{/each}
            </select>
            <button class="primary" onclick={submitRoute}>{editingId ? "Enregistrer" : "Créer la voie"}</button>
          </div>
        {/if}
        {#if colors.length}
          <div class="chips">
            {#each colors as c (c.color)}
              <button class="chip" aria-pressed={color === c.color && marks.length > 0} onclick={() => pickColor(c)}>
                <span class="dot" style:background={c.hex}></span>{c.color} · {c.count}
              </button>
            {/each}
          </div>
        {:else}
          <button onclick={redetect}>Repérer les prises de couleur</button>
        {/if}
      {:else}
        <p class="hint">Sans photo, les voies se décrivent par leur couleur, leur cotation et leur style.</p>
      {/if}
    {/if}
    {#if message}<p class="message">{message}</p>{/if}
  </section>

  <section class="panel">
    <h2>{editingId ? "Modifier la voie" : "Nouvelle voie"}</h2>
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
    {#if wall?.photo}
      <p class="hint">
        {marks.length} prise(s) marquée(s) sur la photo{marks.some((m) => m.role === "depart") ? `, ${marks.filter((m) => m.role === "depart").length} départ(s)` : ""}{marks.some((m) => m.role === "top") ? ", top placé" : ""}.
        {#if marks.length && !marks.some((m) => m.role)}Outil « Départ / top » pour signaler le départ et la sortie.{/if}
      </p>
    {/if}
    <div class="row">
      <button class="primary" onclick={submitRoute}>{editingId ? "Enregistrer la voie" : "Créer la voie"}</button>
      {#if editingId || marks.length}<button onclick={resetForm}>Annuler</button>{/if}
    </div>

    <h2>Voies ({wall?.routes.filter((r) => !r.archived).length ?? 0} en place)</h2>
    <label class="check"><input type="checkbox" bind:checked={showArchived} /> Afficher les voies démontées</label>
    <ul class="routes">
      {#each routes as r (r.id)}
        <li class:archived={r.archived}>
          <span class="dot big" style:background={routeHex(r)}></span>
          <div class="info">
            <strong>{routeLabel(r)}</strong>
            <span class="hint">{r.styles.join(" · ") || "sans style"}{r.marks?.length ? ` · ${r.marks.length} prises` : ""}{r.archived ? " · démontée" : ""}</span>
          </div>
          <div class="actions">
            <button onclick={() => editRoute(r)}>Modifier</button>
            <button onclick={() => toggleArchive(r)}>{r.archived ? "Remettre" : "Démonter"}</button>
            <button class="danger" onclick={() => removeRoute(r)}>{confirmDelete === r.id ? "Supprimer ?" : "✕"}</button>
          </div>
        </li>
      {:else}
        <li class="hint">Aucune voie pour l'instant.</li>
      {/each}
    </ul>
    <p class="hint">Démonter garde la voie et son historique ; elle n'est simplement plus proposée.</p>
  </section>
</div>

<style>
  .gym {
    display: grid;
    grid-template-columns: minmax(280px, 1.3fr) minmax(280px, 1fr);
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 860px) {
    .gym {
      grid-template-columns: 1fr;
    }
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .file {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 10px;
    border: 1px solid var(--accent);
    color: var(--accent);
    cursor: pointer;
    align-self: flex-start;
  }
  .file input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
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
  .link {
    min-height: 0;
    padding: 0 4px;
    border: none;
    background: none;
    color: var(--accent);
    text-decoration: underline;
  }
  .quick {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--border);
  }
  .quick-info {
    flex: 1;
    min-width: 120px;
    font-size: 0.9rem;
  }
  .quick select {
    min-height: 40px;
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
  .zone {
    position: absolute;
    border: 2px dashed #fff;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }
  .photo img {
    display: block;
    width: 100%;
    border-radius: 10px;
    user-select: none;
  }
  .blob {
    position: absolute;
    border: 2px solid;
    border-radius: 4px;
    opacity: 0.7;
    pointer-events: none;
  }
  .mark {
    position: absolute;
    width: 24px;
    height: 24px;
    margin: -12px 0 0 -12px;
    border-radius: 50%;
    border: 4px solid;
    box-shadow:
      0 0 0 2px #fff,
      0 0 6px rgba(0, 0, 0, 0.6);
    pointer-events: none;
    display: grid;
    place-items: center;
    font-size: 0.7rem;
    font-weight: 800;
    color: #fff;
    text-shadow: 0 0 3px #000;
  }
  .mark.role {
    width: 30px;
    height: 30px;
    margin: -15px 0 0 -15px;
    font-size: 0.85rem;
    background: rgba(0, 0, 0, 0.45);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
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
  .dot.big {
    width: 24px;
    height: 24px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .routes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .routes li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .routes li.archived {
    opacity: 0.55;
  }
  .info {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 140px;
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .actions button {
    min-height: 36px;
    padding: 0 10px;
    font-size: 0.85rem;
  }
  .danger {
    border-color: #c62828;
    color: #c62828;
  }
  .message {
    margin: 0;
    font-size: 0.9rem;
  }
</style>
