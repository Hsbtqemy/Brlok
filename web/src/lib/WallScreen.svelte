<script lang="ts">
  import { DISTRIBUTION_PATTERNS, type DistributionPattern } from "../core/distribution";
  import { generateClassicSession, type Block } from "../core/generator";
  import { FOOT_RULES, type FootRule } from "../core/feet";
  import { PIECES, type Piece } from "../core/pieces";
  import { seededRng } from "../core/random";
  import { app } from "./appState.svelte";
  import PanView from "./PanView.svelte";
  import IntervalTimer from "./IntervalTimer.svelte";
  import RouteView from "./RouteView.svelte";
  import { activeRoutes, gradeToRating, ROUTE_VARIANTS, routeBlock, routeHex, routeLabel, routeLogs, variantText, type RouteVariant } from "../core/gym";
  import type { Route } from "../core/wall";
  import { loadRouteVariants, saveRouteVariants } from "./storage";

  interface Props {
    /** Ouvrir le mur actif dans l'onglet Murs. */
    onEdit: () => void;
  }

  let { onEdit }: Props = $props();

  /** Variantes de voie permises : le même réglage que pour les parties. */
  let routeVariants = $state<RouteVariant[]>(loadRouteVariants());
  let withVariants = $state(true);

  function toggleVariant(id: RouteVariant) {
    routeVariants = routeVariants.includes(id) ? routeVariants.filter((v) => v !== id) : [...routeVariants, id];
    saveRouteVariants(routeVariants);
  }

  const isGym = $derived(app.wall?.kind === "voies");
  const currentRoute = $derived.by(() => {
    const id = currentBlock?.route?.id;
    return id ? (app.wall?.routes.find((r) => r.id === id) ?? null) : null;
  });


  const LEVEL_PROFILES = [
    { label: "Très facile", level: 1 },
    { label: "Facile", level: 2 },
    { label: "Modéré", level: 3 },
    { label: "Difficile", level: 4 },
    { label: "Très difficile", level: 5 },
    { label: "Extrême", level: 6 },
  ];


  let mode = $state<"chesscalade" | "classique" | "carnet">("chesscalade");

  // Chesscalade
  /** Pièce facultative : sans pièce, simplement un bloc (ou une voie) à la cote visée. */
  let piece = $state<Piece | null>("cavalier");
  let targetRating = $state(Math.round(app.activePlayer?.ratings.grimpe.rating ?? 1500));
  let length = $state(6);
  let cruxLast = $state(false);
  let feet = $state<FootRule>("libres");
  let chessBlock = $state<Block | null>(null);
  let generationFailed = $state(false);
  const usage = new Map<string, number>();

  // Brlok classique
  let classicLevel = $state(3);
  let classicHolds = $state(8);
  let classicBlocks = $state(5);
  let classicPattern = $state<DistributionPattern>("uniforme");
  let classicVariety = $state(true);
  let classicSession = $state<Block[]>([]);
  let classicSelected = $state(0);

  /** Bloc affiché, et s'il a déjà été noté (une seule tentative enregistrée par bloc affiché). */
  // Séance de voies et carnet (mur à voies)
  let gymTarget = $state(Math.round(app.activePlayer?.ratings.grimpe.rating ?? 1500));
  let gymCount = $state(6);
  let gymPattern = $state<DistributionPattern>("pyramide");
  let carnetBlock = $state<Block | null>(null);
  let carnetFilter = $state<"toutes" | "a-faire">("toutes");
  const logs = $derived(app.activePlayer && app.wall ? routeLogs(app.ratings.attempts, app.activePlayer.id, app.wall.id) : new Map());
  const carnetRoutes = $derived(
    app.wall && isGym
      ? activeRoutes(app.wall, (r) => app.routeRating(r))
          .filter((c) => carnetFilter === "toutes" || !logs.get(c.route.id)?.successes)
          // Ordre stable (cotation, puis nom) : la liste ne bouge pas quand une cote apprise change.
          .sort((a, b) => gradeToRating(a.route.grade) - gradeToRating(b.route.grade) || routeLabel(a.route).localeCompare(routeLabel(b.route)))
      : [],
  );

  function generateGymSession() {
    classicSession = app.routeSession({
      targetRating: gymTarget,
      count: gymCount,
      pattern: gymPattern,
      step: 100,
      variants: withVariants ? routeVariants : [],
      rng: seededRng(Date.now()),
    });
    classicSelected = 0;
    lastDelta = null;
  }

  function carnetRecord(route: Route, rating: number, success: boolean) {
    const player = app.activePlayer;
    if (!player) return;
    const block = routeBlock(route, rating, null);
    carnetBlock = block;
    lastDelta = app.recordAttempt(player.id, block, success, "libre");
  }

  const currentBlock = $derived(
    mode === "chesscalade" ? chessBlock : mode === "carnet" ? carnetBlock : (classicSession[classicSelected] ?? null),
  );
  let recorded = $state<string | null>(null);
  let lastDelta = $state<number | null>(null);
  const currentKey = $derived(
    currentBlock ? `${mode}:${classicSelected}:${currentBlock.route?.id ?? currentBlock.holds.map((h) => h.id).join("-")}` : null,
  );

  function generateChess() {
    if (!app.wall) return;
    chessBlock = app.challenge({
      piece,
      targetRating,
      length,
      cruxLast,
      feet,
      usage,
      routeVariants: isGym && withVariants ? routeVariants : [],
      rng: seededRng(Date.now()),
    });
    generationFailed = chessBlock === null;
    lastDelta = null;
  }

  function generateClassic() {
    if (!app.wall) return;
    classicSession = generateClassicSession(app.wall, {
      targetLevel: classicLevel,
      blocksCount: classicBlocks,
      holdsPerBlock: classicHolds,
      pattern: classicPattern,
      variety: classicVariety,
      rng: seededRng(Date.now()),
    });
    classicSelected = 0;
    lastDelta = null;
  }

  function record(success: boolean) {
    const player = app.activePlayer;
    if (!player || !currentBlock || !currentKey) return;
    lastDelta = app.recordAttempt(player.id, currentBlock, success, "libre");
    recorded = currentKey;
  }
</script>

{#snippet variantsControl()}
        <label class="check"><input type="checkbox" bind:checked={withVariants} /> Avec variantes (pour varier une même voie)</label>
        {#if withVariants}
          <details class="variants">
            <summary>Variantes permises ({routeVariants.length}/{ROUTE_VARIANTS.length})</summary>
            <div class="row">
              {#each ROUTE_VARIANTS as v (v.id)}
                <button class="mini-chip" aria-pressed={routeVariants.includes(v.id)} onclick={() => toggleVariant(v.id)} title={v.description}>
                  {v.label} ({v.bonus > 0 ? "+" : "−"}{Math.abs(v.bonus)}){v.for === "ordre" ? " · numérotées" : ""}
                </button>
              {/each}
            </div>
            <p class="hint">Le même réglage que pour les parties. Une variante n'est choisie que si elle rapproche nettement de la cote visée.</p>
          </details>
        {/if}
{/snippet}

<div class="screen">
  <section class="panel wall-panel">
    <h2>Grimper</h2>
    {#if app.walls.length > 0 && app.wall}
      <label class="field">
        Pan ou mur
        <select
          value={app.wall.id}
          onchange={(e) => {
            app.selectWall((e.currentTarget as HTMLSelectElement).value);
            chessBlock = null;
            classicSession = [];
          }}
        >
          {#each app.walls as w (w.id)}<option value={w.id}>{w.name}{w.kind === "voies" ? " (salle)" : ""}</option>{/each}
        </select>
      </label>
      <p class="hint">
        {isGym ? `Mur à voies : ${app.wall.routes.filter((r) => !r.archived).length} voie(s) en place.` : `Pan ${app.wall.cols} × ${app.wall.rows} : ${app.wall.holds.length} prises.`}
      </p>
      <button onclick={onEdit}>{isGym ? "Gérer les voies" : "Modifier le pan"} (onglet Murs)</button>
    {:else}
      <p class="hint">Aucun mur : crée-en un dans l'onglet Murs (pan express, mur à voies) ou importe ton catalogue Brlok.</p>
      <button class="primary" onclick={onEdit}>Aller à Murs</button>
    {/if}
  </section>

  <section class="panel pan-panel">
    {#if app.wall && isGym}
      {#if currentRoute}
        <RouteView wall={app.wall} route={currentRoute} variant={currentBlock?.route?.variant} variantHold={currentBlock?.route?.variantHold} />
      {:else if app.wall.sectors?.[0]?.photo}
        {#each app.wall.sectors.filter((x) => x.photo) as sec (sec.id)}
          <figure class="sector-fig">
            <img class="sector" src={sec.photo} alt={`Photo du secteur ${sec.name}`} />
            {#if app.wall.sectors.length > 1}<figcaption>{sec.name}</figcaption>{/if}
          </figure>
        {/each}
        <p class="hint">Choisis une voie à droite.</p>
      {:else}
        <p class="empty">{app.wall.routes.length ? "Choisis une voie à droite." : "Aucune voie : ajoute-les avec « Gérer les voies »."}</p>
      {/if}
    {:else if app.wall}
      <PanView wall={app.wall} sequence={currentBlock?.holds.map((h) => h.id) ?? []} />
    {:else}
      <p class="empty">Aucun mur : <button class="link" onclick={onEdit}>crée-en un dans l'onglet Murs</button>.</p>
    {/if}
  </section>

  <section class="panel gen-panel">
    <div class="tabs">
      <button aria-pressed={mode === "chesscalade"} onclick={() => (mode = "chesscalade")}>Chesscalade</button>
      <button aria-pressed={mode === "classique"} onclick={() => (mode = "classique")}>{isGym ? "Séance" : "Brlok classique"}</button>
      {#if isGym}<button aria-pressed={mode === "carnet"} onclick={() => (mode = "carnet")}>Carnet</button>{/if}
    </div>

    {#if mode === "carnet" && isGym}
      <h2>Carnet de voies</h2>
      <div class="row">
        <button aria-pressed={carnetFilter === "toutes"} onclick={() => (carnetFilter = "toutes")}>Toutes</button>
        <button aria-pressed={carnetFilter === "a-faire"} onclick={() => (carnetFilter = "a-faire")}>Pas encore réussies</button>
      </div>
      {#if !app.activePlayer}
        <p class="hint">Crée un joueur (onglet Joueurs) pour tenir ton carnet.</p>
      {/if}
      <ul class="carnet">
        {#each carnetRoutes as c (c.route.id)}
          {@const log = logs.get(c.route.id)}
          <li class:selected={carnetBlock?.route?.id === c.route.id}>
            <button class="carnet-route" onclick={() => (carnetBlock = routeBlock(c.route, c.rating, null))}>
              <span class="dot" style:background={routeHex(c.route)}></span>
              <span class="carnet-info">
                <strong>{routeLabel(c.route)}</strong>
                <span class="hint">
                  cote {Math.round(c.rating)} ·
                  {#if log?.successes}réussie ({log.successes}/{log.attempts}){:else if log}{log.attempts} essai(s){:else}pas encore tentée{/if}
                </span>
              </span>
              {#if log?.successes}<span class="done" aria-label="Réussie">✓</span>{/if}
            </button>
            {#if app.activePlayer}
              <div class="carnet-actions">
                <button class="mini ok" onclick={() => carnetRecord(c.route, c.rating, true)}>Réussi</button>
                <button class="mini ko" onclick={() => carnetRecord(c.route, c.rating, false)}>Raté</button>
              </div>
            {/if}
          </li>
        {:else}
          <li class="hint">{carnetFilter === "a-faire" ? "Toutes les voies en place sont réussies." : "Aucune voie en place."}</li>
        {/each}
      </ul>
      {#if lastDelta !== null && carnetBlock && app.activePlayer}
        <p class="hint">Cote de grimpe : {lastDelta >= 0 ? "+" : ""}{Math.round(lastDelta)} → {Math.round(app.activePlayer.ratings.grimpe.rating)}</p>
      {/if}
    {:else if mode === "chesscalade"}
      <h2>{isGym ? "Choisir une voie" : "Bloc-défi"}</h2>
      {#if isGym}<p class="hint">La voie en place la plus proche de la cote visée, de préférence au style de la pièce.</p>{/if}
      <div class="pieces">
        {#each PIECES as p (p.id)}
          <button aria-pressed={piece === p.id} onclick={() => (piece = p.id)} title={p.character}>
            <span class="symbol">{p.symbol}</span>{p.label}
          </button>
        {/each}
        <button aria-pressed={piece === null} onclick={() => (piece = null)} title="Sans pièce : juste la cote visée">
          <span class="symbol">—</span>Aucune
        </button>
      </div>
      <p class="hint">{piece ? PIECES.find((p) => p.id === piece)?.character : "Sans pièce : simplement à la cote visée."}</p>
      <label class="field">
        <span>
          Cote visée : <strong>{targetRating}</strong>
          {#if app.activePlayer}
            <button class="link" onclick={() => (targetRating = Math.round(app.activePlayer!.ratings.grimpe.rating))}>ma cote</button>
          {/if}
        </span>
        <input type="range" min="800" max="2300" step="50" bind:value={targetRating} />
      </label>
      {#if !isGym}
      <label class="field">
        Nombre de prises
        <input type="number" min="3" max="12" bind:value={length} />
      </label>
      <label class="check"><input type="checkbox" bind:checked={cruxLast} /> Crux en dernier (prise d'une pièce)</label>
      <label class="field">
        Pieds
        <select bind:value={feet}>
          {#each FOOT_RULES as r (r.id)}<option value={r.id}>{r.label}{r.bonus ? ` (+${r.bonus})` : ""}</option>{/each}
        </select>
      </label>
      {/if}
      {#if isGym}{@render variantsControl()}{/if}
      <button class="primary" disabled={!app.wall} onclick={generateChess}>{isGym ? "Choisir" : "Générer"}</button>

      {#if chessBlock}
        <div class="result">
          <p class="sequence">{chessBlock.route ? chessBlock.route.label : chessBlock.holds.map((h) => h.id).join(" → ")}</p>
          <p>Cote estimée : <strong>{chessBlock.estimatedRating}</strong></p>
          {#if chessBlock.route?.variant}
            {@const v = variantText(chessBlock.route.variant, chessBlock.route.variantHold)}
            <p class="variant"><strong>Variante : {v?.label}</strong> — {v?.description}</p>
          {/if}
          {#if chessBlock.feet}
            <p class="hint">
              {FOOT_RULES.find((r) => r.id === chessBlock!.feet)?.label}
              {#if chessBlock.noFootMove}: sans pied de {chessBlock.holds[chessBlock.noFootMove - 1]?.id} à {chessBlock.holds[chessBlock.noFootMove]?.id}{/if}
            </p>
          {/if}
          {#if chessBlock.relaxations.length > 0}
            <p class="warn">Assoupli : {chessBlock.relaxations.join(", ")}.</p>
          {/if}
        </div>
      {:else if generationFailed}
        <p class="warn">Aucun bloc possible sur ce pan.</p>
      {/if}
    {:else if isGym}
      <h2>Séance de voies</h2>
      <label class="field">
        <span>
          Autour de la cote : <strong>{gymTarget}</strong>
          {#if app.activePlayer}
            <button class="link" onclick={() => (gymTarget = Math.round(app.activePlayer!.ratings.grimpe.rating))}>ma cote</button>
          {/if}
        </span>
        <input type="range" min="800" max="2300" step="50" bind:value={gymTarget} />
      </label>
      <label class="field">
        Répartition
        <select bind:value={gymPattern}>
          {#each DISTRIBUTION_PATTERNS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
        </select>
      </label>
      <label class="field">Voies <input type="number" min="1" max="20" bind:value={gymCount} /></label>
      {@render variantsControl()}
      <button class="primary" disabled={!app.wall} onclick={generateGymSession}>Préparer la séance</button>
      {#if classicSession.length > 0}
        <ol class="session">
          {#each classicSession as b, i (i)}
            <li>
              <button aria-pressed={classicSelected === i} onclick={() => { classicSelected = i; lastDelta = null; }}>
                <span class="dot" style:background={b.route?.colorHex}></span>
                {i + 1}. {b.route?.label}{b.route?.variant ? ` · ${variantText(b.route.variant, b.route.variantHold)?.label}` : ""} · {b.estimatedRating}
              </button>
            </li>
          {/each}
        </ol>
        {@const sel = classicSession[classicSelected]}
        {#if sel?.route?.variant}
          {@const v = variantText(sel.route.variant, sel.route.variantHold)}
          <p class="variant"><strong>Voie {classicSelected + 1} · {v?.label}</strong> — {v?.description}</p>
        {/if}
      {/if}
    {:else}
      <h2>Séance</h2>
      <label class="field">
        Difficulté
        <select bind:value={classicLevel}>
          {#each LEVEL_PROFILES as p (p.level)}<option value={p.level}>{p.label}</option>{/each}
        </select>
      </label>
      <label class="field">
        Répartition
        <select bind:value={classicPattern}>
          {#each DISTRIBUTION_PATTERNS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
        </select>
      </label>
      <label class="field">Blocs <input type="number" min="1" max="20" bind:value={classicBlocks} /></label>
      <label class="field">Prises par bloc <input type="number" min="1" max="20" bind:value={classicHolds} /></label>
      <label class="check"><input type="checkbox" bind:checked={classicVariety} /> Variété</label>
      <button class="primary" disabled={!app.wall} onclick={generateClassic}>Générer la séance</button>

      {#if classicSession.length > 0}
        <ol class="blocks">
          {#each classicSession as b, i (i)}
            <li>
              <button aria-pressed={classicSelected === i} onclick={() => { classicSelected = i; lastDelta = null; }}>
                Bloc {i + 1} · {b.estimatedRating}
              </button>
            </li>
          {/each}
        </ol>
        <p class="sequence">{classicSession[classicSelected]?.holds.map((h) => h.id).join(" → ")}</p>
      {/if}
    {/if}

    {#if currentBlock && mode !== "carnet"}
      <div class="attempt">
        {#if app.activePlayer}
          {#if recorded === currentKey}
            <p>
              Tentative enregistrée pour {app.activePlayer.name}
              {#if lastDelta !== null}({lastDelta >= 0 ? "+" : ""}{Math.round(lastDelta)} → {Math.round(app.activePlayer.ratings.grimpe.rating)}){/if}.
            </p>
          {:else}
            <p class="hint">Tentative de <strong>{app.activePlayer.name}</strong> (cote de grimpe {Math.round(app.activePlayer.ratings.grimpe.rating)})</p>
            {#if !app.activePlayer.placedAt}
              <p class="hint">Pas encore de placement : la cote bougera beaucoup sur les premiers blocs. Le placement se lance depuis l'onglet Joueurs.</p>
            {/if}
            <div class="row two">
              <button class="success" onclick={() => record(true)}>Réussi</button>
              <button class="fall" onclick={() => record(false)}>Chute</button>
            </div>
          {/if}
        {:else}
          <p class="hint">Crée un joueur (onglet Joueurs) pour enregistrer tes tentatives et faire évoluer ta cote.</p>
        {/if}
      </div>
    {/if}
    {#if currentBlock}
      <IntervalTimer
        block={currentBlock}
        onNext={mode === "classique" && classicSelected < classicSession.length - 1
          ? () => {
              classicSelected++;
              lastDelta = null;
            }
          : undefined}
      />
    {/if}
  </section>
</div>

<style>
  .screen {
    display: grid;
    grid-template-columns: minmax(240px, 300px) minmax(280px, 1fr) minmax(260px, 340px);
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 960px) {
    .screen {
      grid-template-columns: 1fr;
    }
    .pan-panel {
      order: -1;
    }
  }
  .tabs {
    display: flex;
    gap: 8px;
  }
  .tabs button {
    flex: 1;
  }
  .pieces {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .pieces button {
    padding: 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 0.8rem;
    min-height: 56px;
  }
  .symbol {
    font-size: 1.5rem;
    line-height: 1;
  }
  .result,
  .attempt {
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }
  .result p,
  .attempt p {
    margin: 4px 0;
  }
  .sequence {
    font-weight: 600;
    word-break: break-word;
  }
  .blocks {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 6px;
  }
  .blocks button {
    width: 100%;
  }
  .carnet,
  .session {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .carnet li {
    display: flex;
    align-items: center;
    gap: 6px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 6px;
    flex-wrap: wrap;
  }
  .carnet li.selected .carnet-route {
    border-color: var(--accent);
  }
  .carnet-route {
    flex: 1;
    min-width: 180px;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    padding: 6px 10px;
  }
  .carnet-info {
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .done {
    color: #2e7d32;
    font-weight: 700;
    font-size: 1.2rem;
  }
  .carnet-actions {
    display: flex;
    gap: 6px;
  }
  .mini {
    min-height: 40px;
    padding: 0 12px;
    color: #fff;
    border: none;
    font-weight: 600;
  }
  .mini.ok {
    background: #2e7d32;
  }
  .mini.ko {
    background: #c62828;
  }
  .session button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: flex-start;
  }
  .dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid var(--border);
    flex: none;
  }
  .variants summary {
    cursor: pointer;
    font-size: 0.9rem;
  }
  .variants .row {
    margin-top: 6px;
  }
  .mini-chip {
    min-height: 34px;
    padding: 0 10px;
    font-size: 0.8rem;
    border-radius: 999px;
  }
  .variant {
    margin: 0;
    padding: 8px 10px;
    border-left: 4px solid #6a1b9a;
    background: var(--bg);
    border-radius: 6px;
  }
  .sector-fig {
    margin: 0 0 10px;
  }
  .sector-fig figcaption {
    font-size: 0.85rem;
    color: var(--muted);
    margin-top: 4px;
  }
  .sector {
    display: block;
    width: 100%;
    border-radius: 10px;
  }
  .empty {
    text-align: center;
    color: var(--muted);
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .link {
    min-height: 0;
    padding: 0 6px;
    border: none;
    background: none;
    color: var(--accent);
    text-decoration: underline;
  }
  input[type="range"] {
    width: 100%;
  }
</style>
