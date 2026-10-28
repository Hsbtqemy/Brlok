<script lang="ts">
  import type { PieceSymbol, Square } from "chess.js";
  import {
    ChesscaladeGame,
    SERIES_SIZE,
    VERDICT_LABELS,
    type BeamSetup,
    type BlockRequest,
    type Color,
    type Density,
    type Deviation,
    type Difficulty,
    type Format,
    type Rhythm,
  } from "../core/game";
  import { engineSettings, pickEngineMove } from "../core/engine";
  import { clampSeconds, HANG_DEFAULT_S, pickHang } from "../core/beam";
  import { FOOT_RULES, type FootRule } from "../core/feet";
  import { ROUTE_VARIANTS, routeHex, routeLabel, type RouteVariant } from "../core/gym";
  import { sectorOf } from "../core/wall";
  import { expressWall } from "../core/wallEdit";
  import { LAYOUTS, type Layout } from "./layout";
  import { FAMILIES, cadenceText, intensityLines, recapLines } from "../core/setupText";
  import { loadRouteVariants, saveRouteVariants } from "./storage";
  import { PIECES } from "../core/pieces";
  import { seededRng } from "../core/random";
  import { app } from "./appState.svelte";
  import BlockChallenge from "./BlockChallenge.svelte";
  import RoundsPlay from "./RoundsPlay.svelte";
  import { RoundsGame, type DuelBlockRequest, type DuelFormat, type Family } from "../core/rounds";
  import Board from "./Board.svelte";
  import { Stockfish } from "./stockfish";

  const DIFFICULTIES: { id: Difficulty; label: string }[] = [
    { id: "facile", label: "Facile" },
    { id: "modere", label: "Modéré" },
    { id: "difficile", label: "Difficile" },
    { id: "diabolique", label: "Diabolique" },
  ];
  const KIND_LABEL = {
    defi: "Bloc-défi",
    parade: "Bloc de parade",
    recharge: "Recharge",
    defense: "Bloc de défense",
    "contre-attaque": "Contre-attaque",
    cloche: "Cloche",
    penalite: "Rachat à la poutre",
  } as const;
  const TRIGGER_LABEL = { capture: "prise", echec: "échec", promotion: "promotion", roque: "roque", mat: "mat" } as const;
  const REASON_LABEL = { mat: "échec et mat", pat: "pat", nulle: "nulle", temps: "au temps", abandon: "abandon" } as const;
  const COLOR_LABEL: Record<Color, string> = { w: "Blancs", b: "Noirs" };


  // --- Réglages (retenus d'une partie à l'autre, sur cet appareil) ---
  const SETUP_KEY = "brlok-web:game-setup";
  type SetupPrefs = Partial<{
    format: Format;
    difficulty: Difficulty;
    deviation: Deviation;
    feetRule: "auto" | FootRule;
    density: Density;
    rhythmChoice: Rhythm | null;
    mode: "duo" | "solo";
    family: "C" | "D" | Family;
    duelFormat: DuelFormat;
    soloColor: Color | "hasard";
    soloId: string;
    whiteId: string;
    blackId: string;
    engineElo: number;
    /** Une partie a déjà été lancée avec ces réglages (« Rejouer comme la dernière fois »). */
    lastStarted: boolean;
    wallSource: "saved" | "express";
    layout: Layout;
    expressCols: number;
    expressRows: number;
    beamMode: BeamSetup["mode"];
    beamSeconds: number;
    beamRecharge: boolean;
    beamPenalty: boolean;
  }>;
  const prefs: SetupPrefs = (() => {
    try {
      return JSON.parse(localStorage.getItem(SETUP_KEY) ?? "{}") ?? {};
    } catch {
      return {};
    }
  })();
  let format = $state<Format>(prefs.format ?? "classique");
  let difficulty = $state<Difficulty>(prefs.difficulty ?? "modere");
  let deviation = $state<Deviation>(prefs.deviation ?? "courte");
  let feetRule = $state<"auto" | FootRule>(prefs.feetRule ?? "auto");
  let density = $state<Density>(prefs.density ?? "normale");
  /** Rythme : par défaut, par séries en solo et à chaque bloc à deux. */
  let rhythmChoice = $state<Rhythm | null>(prefs.rhythmChoice ?? null);
  const knownPlayer = (id: string | undefined) => (id !== undefined && (id === "" || app.ratings.players.some((p) => p.id === id)) ? id : undefined);
  let whiteId = $state(knownPlayer(prefs.whiteId) ?? app.ratings.players[0]?.id ?? "");
  let blackId = $state(knownPlayer(prefs.blackId) ?? app.ratings.players[1]?.id ?? app.ratings.players[0]?.id ?? "");
  let fatigue = $state<Record<Color, boolean>>({ w: false, b: false });
  let mode = $state<"duo" | "solo">(prefs.mode ?? "solo");
  const rhythm = $derived<Rhythm>(rhythmChoice ?? (mode === "solo" ? "series" : "immediat"));
  /** Mur à voies : voies retenues pour la partie (vide : toutes). */
  let gameRoutes = $state<string[]>([]);
  /** Mur à voies : variantes permises (§13.4), retenues d'une partie à l'autre. */
  let routeVariants = $state<RouteVariant[]>(loadRouteVariants());

  function toggleVariant(id: RouteVariant) {
    routeVariants = routeVariants.includes(id) ? routeVariants.filter((v) => v !== id) : [...routeVariants, id];
    saveRouteVariants(routeVariants);
  }

  function toggleGameRoute(id: string, all: string[]) {
    const current = gameRoutes.length ? gameRoutes : all;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    // Tout coché revient à « toutes » ; rien de coché n'est pas permis (on garde au moins une voie).
    gameRoutes = next.length === all.length ? [] : next.length === 0 ? current : next;
  }
  /** D = intrication ; A et B = rounds (REGLES.md §3). */
  let family = $state<"C" | "D" | Family>(prefs.family ?? "D");
  /** Familles A et B : rounds ; C et D : intrication (C avec cloche). */
  const rounded = $derived(family === "A" || family === "B");
  let duelFormat = $state<DuelFormat>(prefs.duelFormat ?? "ajoute");
  let rounds = $state.raw<RoundsGame | null>(null);
  let soloId = $state(knownPlayer(prefs.soloId) ?? app.activePlayer?.id ?? "");
  let soloColor = $state<Color | "hasard">(prefs.soloColor ?? "w");
  /** Force du moteur : par défaut la cote Chesscalade du joueur (elle monte quand il gagne, §9.1). */
  let engineElo = $state(prefs.engineElo ?? Math.round(app.activePlayer?.ratings.chesscalade.rating ?? 1500));
  let lastStarted = $state(prefs.lastStarted ?? false);
  /** Où : un mur enregistré, ou un pan rapide (une prise par case, niveau moyen) créé pour la partie. */
  let wallSource = $state<"saved" | "express">(prefs.wallSource ?? (app.walls.length ? "saved" : "express"));
  let layout = $state<Layout>(prefs.layout ?? "cote");
  let expressCols = $state(prefs.expressCols ?? 6);
  let expressRows = $state(prefs.expressRows ?? 7);
  const expressName = $derived(`Pan rapide ${expressCols}×${expressRows}`);

  // Poutre (POUTRE.md §4) : intrications seulement, sur un mur qui a une poutre.
  let beamMode = $state<BeamSetup["mode"]>(prefs.beamMode ?? "aucun");
  let beamSeconds = $state(prefs.beamSeconds ?? HANG_DEFAULT_S);
  let beamRecharge = $state(prefs.beamRecharge ?? false);
  let beamPenalty = $state(prefs.beamPenalty ?? false);
  const gameBeam = $derived(wallSource !== "express" && !rounded && app.wall?.beam?.holds.length ? app.wall.beam : undefined);
  const beamSetup = $derived<BeamSetup | undefined>(
    gameBeam && (beamMode !== "aucun" || beamRecharge || beamPenalty)
      ? { mode: beamMode, seconds: clampSeconds(beamSeconds), recharge: beamRecharge, penalty: beamPenalty }
      : undefined,
  );

  /**
   * Pan rapide de la partie : celui de cette taille s'il existe déjà (on ne remplit pas Murs d'un pan par
   * partie), sinon un nouveau. Il devient le mur actif ; on peut l'affiner ensuite dans Murs.
   */
  function ensureExpressWall() {
    const cols = Math.max(2, Math.min(26, Math.round(expressCols)));
    const rows = Math.max(2, Math.min(30, Math.round(expressRows)));
    const name = `Pan rapide ${cols}×${rows}`;
    const existing = app.walls.find((w) => w.kind !== "voies" && w.name === name && w.cols === cols && w.rows === rows);
    if (existing) {
      app.selectWall(existing.id);
      return;
    }
    const wall = expressWall(name, rows, cols);
    app.setWalls([...app.walls, wall], wall.id);
  }

  function nextStep() {
    if (step === "mur" && wallSource === "express") ensureExpressWall();
    stepIndex = Math.min(steps.length - 1, stepIndex + 1);
  }
  let humanColor = $state<Color>("w");

  // --- Partie ---
  let game = $state.raw<ChesscaladeGame | null>(null);
  let ids = $state<Record<Color, string>>({ w: "", b: "" });
  /** Incrémenté après chaque action : la partie n'est pas un objet réactif. */
  let version = $state(0);
  let now = $state(Date.now());
  let selected = $state<Square | null>(null);
  let promotionChoice = $state<{ from: Square; to: Square } | null>(null);
  let flipped = $state(false);
  let gameRecorded = $state(false);
  let lastDelta = $state<{ name: string; delta: number } | null>(null);
  const usage = new Map<string, number>();

  const nameOf = (id: string) => app.ratings.players.find((p) => p.id === id)?.name ?? "Invité";

  function makeDuelBlock(request: DuelBlockRequest) {
    if (!app.wall) return null;
    return app.challenge({ ...request, usage, allowedRoutes: gameRoutes, routeVariants, rng: seededRng(Date.now()) });
  }

  // Réglages retenus d'une partie à l'autre (sur cet appareil).
  $effect(() => {
    const setup = {
      format,
      difficulty,
      deviation,
      feetRule,
      density,
      rhythmChoice,
      mode,
      family,
      duelFormat,
      soloColor,
      soloId,
      whiteId,
      blackId,
      engineElo,
      lastStarted,
      wallSource,
      layout,
      expressCols,
      expressRows,
      beamMode,
      beamSeconds,
      beamRecharge,
      beamPenalty,
    };
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
    } catch {
      // sans persistance
    }
  });

  /** Réglage rapide : un niveau d'ensemble, les détails restent modifiables dans « Plus de réglages ». */
  const PRESETS = [
    { id: "tranquille", label: "Tranquille", hint: "Facile, peu de blocs", difficulty: "facile", density: "legere" },
    { id: "standard", label: "Standard", hint: "Modéré, un échange = un bloc", difficulty: "modere", density: "normale" },
    { id: "costaud", label: "Costaud", hint: "Difficile, pieds = mains", difficulty: "difficile", density: "normale" },
    { id: "intense", label: "Intense", hint: "Diabolique, tous les blocs", difficulty: "diabolique", density: "intense" },
  ] as const;
  const preset = $derived(
    family === "D" || family === "C"
      ? PRESETS.find((p) => p.difficulty === difficulty && p.density === density && feetRule === "auto" && deviation === "courte")?.id ?? null
      : null,
  );
  function applyPreset(p: (typeof PRESETS)[number]) {
    if (family !== "C") family = "D";
    difficulty = p.difficulty;
    density = p.density;
    feetRule = "auto";
    deviation = "courte";
  }
  const FAMILY_LABEL = { D: "Intrication", C: "Intrication rythmée", A: "Rounds", B: "Rounds couplés" } as const;
  const DENSITY_LABEL = { legere: "densité légère", normale: "densité normale", intense: "densité intense" } as const;
  const setupSummary = $derived(
    [
      mode === "solo" ? `Solo contre Stockfish ${engineElo}` : "À deux",
      FAMILY_LABEL[family],
      format === "blitz" ? "Blitz 3 min" : "Classique 10 min",
      ...(rounded
        ? []
        : [DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? "", DENSITY_LABEL[density], rhythm === "series" ? `blocs par ${SERIES_SIZE}` : "bloc à chaque fois"]),
    ].join(" · "),
  );

  // --- Lancement en étapes : une question par panneau, et ce que chaque choix change ---
  type StepId = "joueurs" | "partie" | "mur" | "intensite" | "recap";
  const STEP_TITLES: Record<StepId, string> = {
    joueurs: "Qui joue ?",
    partie: "Quel type de partie ?",
    mur: "Où ?",
    intensite: "Quelle intensité ?",
    recap: "Récapitulatif",
  };
  // Pas d'intensité en rounds : la difficulté vient des duels.
  const steps = $derived<StepId[]>(rounded ? ["joueurs", "partie", "mur", "recap"] : ["joueurs", "partie", "mur", "intensite", "recap"]);
  let stepIndex = $state(0);
  const step = $derived(steps[Math.min(stepIndex, steps.length - 1)]);
  const activeRoutes = $derived(app.wall?.kind === "voies" ? app.wall.routes.filter((r) => !r.archived) : []);
  const stepBlocked = $derived(
    step !== "mur" || wallSource === "express"
      ? ""
      : !app.wall
        ? "Aucun mur enregistré : choisis « Pan rapide », ou crée un mur dans l'onglet Murs."
        : app.wall.kind === "voies" && activeRoutes.length === 0
          ? "Aucune voie en place sur ce mur."
          : app.wall.kind === "pan" && app.wall.holds.length === 0 && beamSetup?.mode !== "seule"
            ? gameBeam
              ? "Ce mur n'a que sa poutre : choisis « Poutre seule » ci-dessous."
              : "Ce pan n'a pas de prises : décris-le dans l'onglet Murs, ou choisis « Pan rapide »."
            : "",
  );
  const recap = $derived(
    recapLines({
      solo: mode === "solo",
      color: soloColor,
      engineElo,
      playerNames: { solo: nameOf(soloId), w: nameOf(whiteId), b: nameOf(blackId) },
      family,
      format,
      duel: duelFormat,
      wallName: wallSource === "express" ? expressName : (app.wall?.name ?? null),
      onRoutes: wallSource !== "express" && app.wall?.kind === "voies",
      routesCount: gameRoutes.length || activeRoutes.length,
      variantsCount: routeVariants.length,
      difficulty,
      density,
      rhythm,
      feet: feetRule,
      fatigue,
      beam: beamSetup,
    }),
  );
  const presetLines = (p: (typeof PRESETS)[number]) =>
    intensityLines({ difficulty: p.difficulty, density: p.density, rhythm, feet: "auto", solo: mode === "solo", onRoutes: wallSource !== "express" && app.wall?.kind === "voies" });
  const soloPlayer = $derived(app.ratings.players.find((p) => p.id === soloId));

  // Sur un mur à voies, « Ajoute une prise » n'a pas de sens : on bascule sur « Même bloc ».
  $effect(() => {
    if (app.wall?.kind === "voies" && duelFormat === "ajoute") duelFormat = "meme";
  });

  function start() {
    if (wallSource === "express") ensureExpressWall();
    if (!app.wall) return;
    lastStarted = true;
    stepIndex = 0;
    if (family === "A" || family === "B") {
      if (mode === "solo") {
        humanColor = soloColor === "hasard" ? (Math.random() < 0.5 ? "w" : "b") : soloColor;
        const engineColor: Color = humanColor === "w" ? "b" : "w";
        const human = { name: nameOf(soloId), climbRating: climbRating(soloId) };
        const engine = { name: `Stockfish ${engineElo}`, climbRating: 0 };
        ids = humanColor === "w" ? { w: soloId, b: "" } : { w: "", b: soloId };
        rounds = new RoundsGame(
          {
            family,
            format,
            duel: duelFormat,
            players: humanColor === "w" ? { w: human, b: engine } : { w: engine, b: human },
            engine: { color: engineColor, elo: engineElo },
          },
          makeDuelBlock,
          Date.now(),
        );
        return;
      }
      const players = {
        w: { name: nameOf(whiteId), climbRating: climbRating(whiteId) },
        b: { name: nameOf(blackId), climbRating: climbRating(blackId) },
      };
      ids = { w: whiteId, b: blackId };
      rounds = new RoundsGame({ family, format, duel: duelFormat, players }, makeDuelBlock, Date.now());
      return;
    }
    if (mode === "solo") {
      humanColor = soloColor === "hasard" ? (Math.random() < 0.5 ? "w" : "b") : soloColor;
      const engineColor: Color = humanColor === "w" ? "b" : "w";
      const human = { name: nameOf(soloId), climbRating: climbRating(soloId), fatigue: fatigue.w };
      const engine = { name: `Stockfish ${engineElo}`, climbRating: 0, fatigue: false };
      const players = humanColor === "w" ? { w: human, b: engine } : { w: engine, b: human };
      ids = humanColor === "w" ? { w: soloId, b: "" } : { w: "", b: soloId };
      game = new ChesscaladeGame(
        { format, difficulty, deviation, players, engine: { color: engineColor, elo: engineElo }, bell: family === "C", feet: feetRule, density, rhythm, beam: beamSetup },
        makeBlock,
        Date.now(),
      );
      flipped = humanColor === "b";
    } else {
      const players = {
        w: { name: nameOf(whiteId), climbRating: climbRating(whiteId), fatigue: fatigue.w },
        b: { name: nameOf(blackId), climbRating: climbRating(blackId), fatigue: fatigue.b },
      };
      ids = { w: whiteId, b: blackId };
      game = new ChesscaladeGame({ format, difficulty, deviation, players, bell: family === "C", feet: feetRule, density, rhythm, beam: beamSetup }, makeBlock, Date.now());
    }
    engineError = "";
    selected = null;
    gameRecorded = false;
    lastDelta = null;
    refresh();
  }

  /** Reprend la partie sauvegardée (après un rechargement, ou depuis un autre appareil). */
  function resume() {
    const live = app.liveGame;
    if (!live) return;
    if (live.kind === "rounds") {
      ids = { ...live.ids };
      rounds = RoundsGame.restore(live.rounds, makeDuelBlock, Date.now());
      return;
    }
    game = ChesscaladeGame.restore(live.game, makeBlock, Date.now());
    ids = { ...live.ids };
    humanColor = live.humanColor;
    flipped = !!game.config.engine && humanColor === "b";
    engineError = "";
    selected = null;
    gameRecorded = false;
    lastDelta = null;
    refresh();
  }

  function discardSaved() {
    app.saveGame(null);
  }

  function climbRating(id: string): number {
    return Math.round(app.ratings.players.find((p) => p.id === id)?.ratings.grimpe.rating ?? 1500);
  }

  function makeBlock(request: BlockRequest) {
    if (!app.wall) return null;
    // À la poutre : une suspension de la durée de la partie, prises choisies selon la cote visée.
    if (request.beam) {
      const beam = app.wall.beam;
      return beam?.holds.length ? pickHang(beam, { targetRating: request.targetRating, seconds: request.hangS ?? HANG_DEFAULT_S, usage, rng: seededRng(Date.now()) }) : null;
    }
    return app.challenge({ ...request, usage, allowedRoutes: gameRoutes, routeVariants, rng: seededRng(Date.now()) });
  }

  function refresh() {
    version++;
  }

  $effect(() => {
    if (!game) return;
    const id = setInterval(() => {
      now = Date.now();
      if (game && game.phase !== "over") {
        const before = game.phase;
        game.tick(now);
        if (game.phase !== before) refresh();
      }
    }, 200);
    return () => clearInterval(id);
  });

  // Écran allumé pendant la partie (la tablette reste au pied du mur). Refus toléré.
  $effect(() => {
    if (!game) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  });

  // Fin de partie : cote Chesscalade (une seule fois).
  $effect(() => {
    void version;
    if (game?.result && !gameRecorded) {
      gameRecorded = true;
      const score = game.result.winner === "w" ? 1 : game.result.winner === "b" ? 0 : 0.5;
      const engine = game.config.engine;
      if (engine) {
        const humanId = ids[humanColor];
        const humanScore = humanColor === "w" ? score : 1 - score;
        app.recordGameVsEngine(humanId, humanColor, engine.elo, humanScore, REASON_LABEL[game.result.reason]);
        // La partie suivante se joue contre un moteur à la nouvelle cote du joueur.
        const updated = app.ratings.players.find((p) => p.id === humanId);
        if (updated) engineElo = Math.round(updated.ratings.chesscalade.rating);
      } else {
        app.recordGame(ids.w, ids.b, score, REASON_LABEL[game.result.reason]);
      }
    }
  });

  // Sauvegarde après chaque action ; effacée quand la partie est terminée.
  $effect(() => {
    void version;
    const g = game;
    if (!g) return;
    if (g.result) {
      if (app.liveGame) app.saveGame(null);
      return;
    }
    app.saveGame({ game: g.save(Date.now()), ids: { ...ids }, humanColor });
  });

  // --- Moteur (solo) ---
  const stockfish = new Stockfish();
  let engineThinking = $state(false);
  let engineError = $state("");
  let engineBusy = false;
  $effect(() => () => stockfish.stop());
  $effect(() => {
    void version;
    const g = game;
    const engine = g?.config.engine;
    if (!g || !engine || engineBusy || !g.isEngineTurn()) return;
    engineBusy = true;
    engineThinking = true;
    const fen = g.chess.fen();
    const candidates = g.engineCandidates();
    const settings = engineSettings(engine.elo);
    const playMove = (lan: string) => {
      if (game !== g || g.chess.fen() !== fen || !g.isEngineTurn()) return;
      g.play(lan.slice(0, 2) as Square, lan.slice(2, 4) as Square, (lan[4] as PieceSymbol | undefined) || undefined, Date.now());
      refresh();
    };
    stockfish
      .bestMove(fen, settings, g.engineExcluded.length > 0 ? candidates : undefined)
      .then((best) => playMove(pickEngineMove(best, candidates, settings, Math.random)))
      .catch((e: unknown) => {
        // Moteur indisponible : un coup au hasard, pour ne pas bloquer la partie.
        engineError = `${e instanceof Error ? e.message : String(e)} Coup joué au hasard.`;
        playMove(candidates[Math.floor(Math.random() * candidates.length)]);
      })
      .finally(() => {
        engineBusy = false;
        engineThinking = false;
        refresh();
      });
  });

  // Sur téléphone, le bloc s'affiche sous l'échiquier : on l'amène à l'écran quand il apparaît.
  let sidePanel = $state<HTMLElement | null>(null);
  let boardPanel = $state<HTMLElement | null>(null);
  /** Téléphone : pendant un bloc, l'échiquier est masqué (le bloc passe en premier) ; on peut le rouvrir. */
  let showBoard = $state(false);
  // Pendant un bloc, la barre de navigation du bas s'efface (voir app.css).
  $effect(() => {
    document.body.classList.toggle("climbing", view?.phase === "block");
    return () => document.body.classList.remove("climbing");
  });
  let lastPhase: string | null = null;
  $effect(() => {
    const phase = view?.phase ?? null;
    if (phase !== lastPhase && phase === "block") showBoard = false;
    if (phase !== lastPhase && (phase === "block" || phase === "deviation") && sidePanel && window.innerWidth < 700) {
      sidePanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // Retour du mur : on ramène l'échiquier à l'écran.
    if (lastPhase === "block" && phase === "move" && boardPanel && window.innerWidth < 700) {
      boardPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    lastPhase = phase;
  });

  // --- Vue dérivée de la partie ---
  const view = $derived.by(() => {
    void version;
    if (!game) return null;
    const allowed = game.phase === "move" ? game.allowedMoves() : [];
    const history = game.chess.history({ verbose: true });
    const last = history.at(-1);
    const turn = game.turn;
    let checkSquare: Square | null = null;
    if (game.chess.inCheck()) {
      for (const row of game.chess.board()) for (const p of row) if (p && p.type === "k" && p.color === turn) checkSquare = p.square;
    }
    return {
      board: game.chess.board(),
      phase: game.phase,
      turn,
      allowed,
      pending: game.pending,
      deviation: game.deviation,
      result: game.result,
      lastMove: last ? ([last.from, last.to] as [Square, Square]) : null,
      checkSquare,
      exhausted: new Set(game.exhausted.map((e) => e.square)),
      log: [...game.log].reverse().slice(0, 12),
      sans: history.map((m) => m.san),
      canRecharge: game.canRecharge(),
      queued: game.queue[turn].length,
      canGoToWall: game.canGoToWall(),
      canCounter: game.canCounterAttack(),
      bell: game.config.bell ? { left: Math.max(0, game.nextBellAt() - game.bellPlayTimeMs), rung: game.bellsRung } : null,
      engineTurn: game.isEngineTurn(),
      falls: { ...game.consecutiveFalls },
      kingOnly: game.kingOnly,
      running: game.clock.running,
      lastVerdict: game.lastVerdict,
      lastEvent: game.log.at(-1) ?? null,
      fatigue: { w: game.config.players.w.fatigue, b: game.config.players.b.fatigue },
    };
  });

  // À deux : qui a la main en ce moment (coup, bloc, choix de déviation), et la disposition de l'écran.
  const duo = $derived(!!game && !game.config.engine);
  const actor = $derived<Color | null>(
    !view || view.phase === "over"
      ? null
      : view.phase === "block" && view.pending
        ? view.pending.request.climber
        : view.phase === "deviation" && view.deviation
          ? view.deviation.chooser
          : view.turn,
  );
  const face = $derived(duo && layout === "face");
  const topColor = $derived<Color>(flipped ? "w" : "b");
  /** Face à face : ce qui concerne le joueur d'en haut est retourné vers lui. */
  const actorUpside = $derived(face && actor === topColor);
  $effect(() => {
    if (duo && layout === "tour" && actor) flipped = actor === "b";
  });

  const targets = $derived.by(() => {
    if (!view) return new Set<Square>();
    if (view.phase === "deviation" && view.deviation) return new Set(view.deviation.options.map((m) => m.to));
    if (view.phase === "move" && selected) return new Set(view.allowed.filter((m) => m.from === selected).map((m) => m.to));
    return new Set<Square>();
  });

  function onSquare(square: Square) {
    if (!game || !view || view.engineTurn) return;
    if (view.phase === "deviation") {
      if (targets.has(square)) {
        game.chooseDeviation(square, Date.now());
        refresh();
      }
      return;
    }
    if (view.phase !== "move") return;
    if (selected && targets.has(square)) {
      const promo = view.allowed.some((m) => m.from === selected && m.to === square && m.promotion);
      if (promo) {
        promotionChoice = { from: selected, to: square };
        return;
      }
      play(selected, square);
      return;
    }
    selected = view.allowed.some((m) => m.from === square) ? square : null;
  }

  function play(from: Square, to: Square, promotion?: PieceSymbol) {
    if (!game) return;
    game.play(from, to, promotion, Date.now());
    selected = null;
    promotionChoice = null;
    lastDelta = null;
    refresh();
  }

  function blockResult(success: boolean) {
    if (!game?.pending) return;
    const pending = game.pending;
    const climberId = ids[pending.request.climber];
    const outcome = game.blockResult(success, Date.now());
    // Un essai raté qui laisse un second essai (Facile) n'est pas encore une tentative terminée.
    const finished = game.pending !== pending;
    if (finished && outcome.block && app.ratings.players.some((p) => p.id === climberId)) {
      const delta = app.recordAttempt(climberId, outcome.block, success, "partie");
      lastDelta = { name: nameOf(climberId), delta };
    }
    refresh();
  }

  function counterAttack() {
    game?.requestCounterAttack(Date.now());
    selected = null;
    refresh();
  }

  function goToWall() {
    if (!game?.canGoToWall()) return;
    game.goToWall(Date.now());
    refresh();
  }

  function recharge(hard: boolean) {
    game?.requestRecharge(hard, Date.now());
    selected = null;
    refresh();
  }

  function toggleFatigue(color: Color) {
    if (!game) return;
    game.setFatigue(color, !game.config.players[color].fatigue);
    refresh();
  }

  function clockText(color: Color): string {
    if (!game) return "";
    void version;
    const ms = Math.max(0, game.clock.remainingAt(color, now));
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  const pieceLabel = (p: string | null) => PIECES.find((x) => x.id === p)?.label ?? "libre";
</script>

{#if rounds}
  <RoundsPlay game={rounds} {ids} bind:layout onExit={() => (rounds = null)} />
{:else if !game || !view}
  <section class="panel setup">
    {#if app.liveGame}
      {@const lg = app.liveGame}
      {@const saved = lg.kind === "rounds" ? lg.rounds : lg.game}
      <div class="resume">
        <div>
          <strong>Partie en cours</strong>{lg.kind === "rounds" ? " (rounds)" : ""} : {saved.config.players.w.name} – {saved.config.players.b.name},
          {saved.moves.length} demi-coup(s), {saved.config.format === "blitz" ? "Blitz" : "Classique"}
          · sauvegardée le {new Date(saved.savedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
        </div>
        <div class="row">
          <button class="primary" onclick={resume}>Reprendre la partie</button>
          <button onclick={discardSaved}>Supprimer</button>
        </div>
        <p class="hint">Les pendules repartent de leur temps sauvegardé. Commencer une nouvelle partie remplace celle-ci.</p>
      </div>
    {/if}
    <div class="wizard-head">
      <h2>Nouvelle partie · {STEP_TITLES[step]}</h2>
      <ol class="steps" aria-label="Étapes">
        {#each steps as st, i (st)}
          <li>
            <button
              class:done={i < stepIndex}
              aria-current={st === step ? "step" : undefined}
              disabled={i > stepIndex}
              onclick={() => (stepIndex = i)}
              title={STEP_TITLES[st]}>{i + 1}</button
            >
          </li>
        {/each}
      </ol>
    </div>

    {#if step === "joueurs"}
      {#if lastStarted}
        <button class="replay" onclick={start} disabled={wallSource !== "express" && !app.wall}>
          <strong>Rejouer comme la dernière fois</strong>
          <small>{setupSummary}</small>
        </button>
        <p class="or">ou choisis étape par étape :</p>
      {/if}
      {#if app.ratings.players.length === 0}
        <p class="hint">Partie en invité : crée un joueur (onglet Joueurs) pour suivre tes cotes.</p>
      {/if}
      <div class="cards two">
        <button class="card" aria-pressed={mode === "solo"} onclick={() => (mode = "solo")}>
          <span class="card-icon">♞</span>
          <strong>Solo contre Stockfish</strong>
          <small>Le moteur joue l'autre camp et ne grimpe pas : ses prises te font grimper des blocs de défense.</small>
        </button>
        <button class="card" aria-pressed={mode === "duo"} onclick={() => (mode = "duo")}>
          <span class="card-icon">♞♘</span>
          <strong>À deux</strong>
          <small>Chacun son camp et ses blocs ; le premier à court de temps ou mat perd.</small>
        </button>
      </div>
      {#if mode === "solo"}
      <div class="grid">
        <div class="player">
          <label class="field">
            Joueur
            <select
              bind:value={soloId}
              onchange={() => {
                const p = app.ratings.players.find((x) => x.id === soloId);
                if (p) engineElo = Math.round(p.ratings.chesscalade.rating);
              }}
            >
              <option value="">Invité</option>
              {#each app.ratings.players as p (p.id)}<option value={p.id}>{p.name} (Chesscalade {Math.round(p.ratings.chesscalade.rating)})</option>{/each}
            </select>
          </label>
          {#if soloPlayer}<p class="hint">Cotes : échecs {Math.round(soloPlayer.ratings.echecs.rating)} · Chesscalade {Math.round(soloPlayer.ratings.chesscalade.rating)} · grimpe {Math.round(soloPlayer.ratings.grimpe.rating)}</p>{/if}
        </div>
        <div class="field">
          Ta couleur
          <div class="row seg">
            <button aria-pressed={soloColor === "w"} onclick={() => (soloColor = "w")}>Blancs</button>
            <button aria-pressed={soloColor === "b"} onclick={() => (soloColor = "b")}>Noirs</button>
            <button aria-pressed={soloColor === "hasard"} onclick={() => (soloColor = "hasard")}>Au hasard</button>
          </div>
        </div>
      </div>
      <label class="field">
        Force de Stockfish : <strong>{engineElo}</strong>
        <input type="range" min="400" max="2800" step="50" bind:value={engineElo} />
      </label>
      <p class="hint">
        {engineElo < 1000 ? "Débutant : il laisse souvent des pièces en prise." : engineElo < 1500 ? "Joueur de club débutant." : engineElo < 2000 ? "Bon joueur de club." : "Très fort : expert et au-delà."}
        Par défaut, ta cote Chesscalade (elle monte quand tu gagnes). Sous 1320, la force est approximative.
      </p>
      {:else}
    <div class="grid">
      {#each [["w", "Blancs"], ["b", "Noirs"]] as [color, label] (color)}
        <div class="player">
          <label class="field">
            {label}
            {#if color === "w"}
              <select bind:value={whiteId}>
                <option value="">Invité</option>
                {#each app.ratings.players as p (p.id)}<option value={p.id}>{p.name} (grimpe {Math.round(p.ratings.grimpe.rating)})</option>{/each}
              </select>
            {:else}
              <select bind:value={blackId}>
                <option value="">Invité</option>
                {#each app.ratings.players as p (p.id)}<option value={p.id}>{p.name} (grimpe {Math.round(p.ratings.grimpe.rating)})</option>{/each}
              </select>
            {/if}
          </label>
        </div>
      {/each}
    </div>
    <div class="field">
      Disposition sur l'écran
      <div class="cards three">
        {#each LAYOUTS as l (l.id)}
          <button class="card compact" aria-pressed={layout === l.id} onclick={() => (layout = l.id)}>
            <strong>{l.label}</strong>
            <small>{l.hint}</small>
          </button>
        {/each}
      </div>
      <p class="hint">Elle se change aussi pendant la partie, sous l'échiquier.</p>
    </div>
      {/if}
      {#if !rounded}
      <div class="field">
        Option fatigue (la cote visée baisse de 15 par bloc grimpé)
        <div class="row">
          {#if mode === "solo"}
            <label class="check"><input type="checkbox" bind:checked={fatigue.w} /> {nameOf(soloId)}</label>
          {:else}
            <label class="check"><input type="checkbox" bind:checked={fatigue.w} /> {nameOf(whiteId)} (Blancs)</label>
            <label class="check"><input type="checkbox" bind:checked={fatigue.b} /> {nameOf(blackId)} (Noirs)</label>
          {/if}
        </div>
      </div>
      {/if}

    {:else if step === "partie"}
      <div class="cards">
        {#each FAMILIES as f (f.id)}
          <button class="card" aria-pressed={family === f.id} onclick={() => (family = f.id)}>
            <strong>{f.label}</strong>
            <span class="flow">
              {#each f.flow as part, i (i)}{#if i > 0}<span class="arrow">→</span>{/if}<span class="token">{part}</span>{/each}
            </span>
            <small>{f.tagline}</small>
          </button>
        {/each}
      </div>
      <div class="field">
        Cadence
        <div class="cards two">
          {#each [["blitz", "Blitz"], ["classique", "Classique"]] as [id, label] (id)}
            <button class="card compact" aria-pressed={format === id} onclick={() => (format = id as Format)}>
              <strong>{label}</strong>
              <small>{cadenceText(family, id as Format)}</small>
            </button>
          {/each}
        </div>
      </div>
      {#if rounded}
      <div class="field">
        Duel au mur
        <div class="row">
          <button aria-pressed={duelFormat === "ajoute"} onclick={() => (duelFormat = "ajoute")} disabled={app.wall?.kind === "voies"} title={app.wall?.kind === "voies" ? "Impossible sur un mur à voies : les prises ne sont pas décrites une à une" : undefined}>Ajoute une prise</button>
          <button aria-pressed={duelFormat === "meme"} onclick={() => (duelFormat = "meme")}>Même bloc</button>
          <button aria-pressed={duelFormat === "impose"} onclick={() => (duelFormat = "impose")}>Bloc imposé</button>
        </div>
        <p class="hint">
          {#if duelFormat === "ajoute"}Chacun répète le bloc et ajoute une prise ; le premier qui tombe ou se trompe perd.
          {:else if duelFormat === "meme"}Le même bloc pour les deux : la réussite en moins d'essais gagne, sinon la prise la plus haute.
          {:else}Chacun compose le bloc de l'autre sous un budget de cote ; celui qui réussit le bloc adverse gagne.{/if}
        </p>
      </div>
      {/if}

    {:else if step === "mur"}
      <div class="cards">
        <button class="card" aria-pressed={wallSource === "saved"} disabled={app.walls.length === 0} onclick={() => (wallSource = "saved")}>
          <span class="card-icon">▦</span>
          <strong>Un mur enregistré</strong>
          <small>{app.walls.length ? "Ton pan ou une salle décrite dans Murs : vraies prises, vraies voies." : "Aucun pour l'instant : crée-en un dans l'onglet Murs."}</small>
        </button>
        <button class="card" aria-pressed={wallSource === "express"} onclick={() => (wallSource = "express")}>
          <span class="card-icon">⚡</span>
          <strong>Pan rapide</strong>
          <small>Une prise par case, toutes de niveau moyen : pour jouer tout de suite sur un pan qu'on n'a pas décrit.</small>
        </button>
      </div>
      {#if wallSource === "express"}
        <div class="row express">
          <label class="field">Colonnes <input type="number" min="2" max="26" bind:value={expressCols} /></label>
          <label class="field">Rangées <input type="number" min="2" max="30" bind:value={expressRows} /></label>
        </div>
        <p class="hint">
          Compte les cases de ton pan (ou une prise par case qu'on imagine). La difficulté vient des enchaînements, et les cotes des
          blocs s'ajustent en jouant. « {expressName} » est gardé dans Murs, réutilisé à la prochaine partie de même taille, et peut s'affiner
          (peinture rapide des niveaux).
        </p>
      {:else}
      <label class="field">
        Pan ou mur de la partie
        <select id="game-wall" value={app.wall?.id} onchange={(e) => { app.selectWall((e.currentTarget as HTMLSelectElement).value); gameRoutes = []; }}>
          {#each app.walls as w (w.id)}<option value={w.id}>{w.name}{w.kind === "voies" ? " (salle)" : ""}</option>{/each}
        </select>
      </label>
      {#if app.wall?.kind === "voies"}
        {@const routes = activeRoutes}
      <div class="field">
        Voies de la partie
        {#if routes.length === 0}
          <p class="warn">Aucune voie en place : ajoute-les dans Pan → Gérer les voies.</p>
        {:else}
          {#if (app.wall.sectors?.length ?? 0) > 1}
            {@const w = app.wall}
            <div class="row">
              {#each w.sectors ?? [] as sec (sec.id)}
                {@const ids = routes.filter((r) => sectorOf(w, r)?.id === sec.id).map((r) => r.id)}
                <button
                  class="small"
                  disabled={ids.length === 0}
                  aria-pressed={gameRoutes.length > 0 && gameRoutes.length === ids.length && ids.every((id) => gameRoutes.includes(id))}
                  onclick={() => (gameRoutes = ids.length === routes.length ? [] : ids)}>{sec.name} ({ids.length})</button
                >
              {/each}
            </div>
          {/if}
          <div class="route-chips">
            {#each routes as r (r.id)}
              <button class="route-chip" aria-pressed={gameRoutes.length === 0 || gameRoutes.includes(r.id)} onclick={() => toggleGameRoute(r.id, routes.map((x) => x.id))}>
                <span class="dot" style:background={routeHex(r)}></span>{routeLabel(r)}
              </button>
            {/each}
          </div>
          <p class="hint">
            {gameRoutes.length ? `${gameRoutes.length} voie(s) retenue(s).` : "Toutes les voies en place."}
            Les blocs de la partie sont choisis parmi elles, au plus près de la cote visée.
            {#if gameRoutes.length}<button class="link" onclick={() => (gameRoutes = [])}>Toutes</button>{/if}
          </p>
        {/if}
      </div>
      <div class="field">
        Variantes des voies
        <div class="row wrap">
          {#each ROUTE_VARIANTS as v (v.id)}
            <button aria-pressed={routeVariants.includes(v.id)} onclick={() => toggleVariant(v.id)} title={v.description}>
              {v.label} ({v.bonus > 0 ? "+" : "−"}{Math.abs(v.bonus)}){v.for === "ordre" ? " · voies numérotées" : ""}
            </button>
          {/each}
        </div>
        <p class="hint">
          Pour varier une même voie : quand la cote visée s'éloigne de celle de la voie, une variante permise la rend plus
          facile ou plus dure (environ 100 points par cran de cotation). Chaque variante a sa propre cote, apprise en jouant.
          Les variantes « voies numérotées » visent une prise précise d'une voie dont l'ordre est donné (au moins 4 prises).
          {routeVariants.length === 0 ? "Aucune variante : les voies sont toujours grimpées telles quelles." : ""}
        </p>
      </div>
      {:else if app.wall && app.wall.holds.length > 0}
        <p class="hint">Pan {app.wall.cols} × {app.wall.rows}, {app.wall.holds.length} prises : les blocs sont générés pendant la partie, à la cote visée et selon le caractère de la pièce.</p>
      {/if}
      {/if}
      {#if gameBeam}
        <fieldset class="beam-setup">
          <legend>Poutre</legend>
          <div class="row" role="group" aria-label="Défis à la poutre">
            <button aria-pressed={beamMode === "aucun"} onclick={() => (beamMode = "aucun")}>Pas de défi</button>
            <button aria-pressed={beamMode === "melee"} onclick={() => (beamMode = "melee")} disabled={app.wall?.holds.length === 0}>Mêlée aux blocs</button>
            <button aria-pressed={beamMode === "seule"} onclick={() => (beamMode = "seule")}>Poutre seule</button>
          </div>
          <p class="hint">
            {beamMode === "seule"
              ? "Tous les défis sont des suspensions : prises, échecs, défense, cloche. Le pan ne sert pas."
              : beamMode === "melee"
                ? "Les défis de la tour (puissance, statique) se font à la poutre ; les autres pièces grimpent au pan."
                : "Les défis se grimpent au pan ; la poutre peut servir à la recharge ou au rachat des pénalités."}
          </p>
          <label class="check"><input type="checkbox" bind:checked={beamRecharge} /> Recharge à la poutre (une suspension, pendule en marche)</label>
          <label class="check"><input type="checkbox" bind:checked={beamPenalty} /> Pénalités rachetées à la poutre (tenue : la pénalité de temps est effacée)</label>
          {#if beamSetup}
            <div class="field">
              Durée des suspensions : <strong>{clampSeconds(beamSeconds)} s</strong>
              <div class="row">
                {#each [7, 10, 15, 20, 30] as s (s)}
                  <button class="chip" aria-pressed={clampSeconds(beamSeconds) === s} onclick={() => (beamSeconds = s)}>{s} s</button>
                {/each}
                <input type="number" min="3" max="60" bind:value={beamSeconds} aria-label="Durée des suspensions en secondes" />
              </div>
              <span class="hint">Les prises suivent la cote visée de chaque défi (pièce prise, niveau, fatigue).</span>
            </div>
          {/if}
        </fieldset>
      {/if}

    {:else if step === "intensite"}
      <div class="cards">
        {#each PRESETS as p (p.id)}
          <button class="card" aria-pressed={preset === p.id} onclick={() => applyPreset(p)}>
            <strong>{p.label}</strong>
            <ul class="lines">
              {#each presetLines(p) as line, i (i)}<li>{line}</li>{/each}
            </ul>
          </button>
        {/each}
      </div>
      <details class="advanced" open={preset === null}>
        <summary>Personnaliser <span>niveau, déviation, densité, passage au mur{app.wall?.kind === "voies" ? "" : ", pieds"}</span></summary>
        <div class="advanced-body">
          <div class="field">
            Niveau
            <div class="row seg4">
              {#each DIFFICULTIES as d (d.id)}
                <button aria-pressed={difficulty === d.id} onclick={() => (difficulty = d.id)}>{d.label}</button>
              {/each}
            </div>
          </div>
    <div class="field">
      Déviation
      <div class="row">
        <button aria-pressed={deviation === "courte"} onclick={() => (deviation = "courte")}>Courte</button>
        <button aria-pressed={deviation === "libre"} onclick={() => (deviation = "libre")}>Libre</button>
      </div>
    </div>
    <div class="field">
      Densité de blocs
      <div class="row">
        <button aria-pressed={density === "legere"} onclick={() => (density = "legere")}>Légère</button>
        <button aria-pressed={density === "normale"} onclick={() => (density = "normale")}>Normale</button>
        <button aria-pressed={density === "intense"} onclick={() => (density = "intense")}>Intense</button>
      </div>
      <p class="hint">
        {#if density === "legere"}Seules les prises de pièces (et la promotion, le mat) font grimper ; une reprise est gratuite ; 2 coups de récupération après un bloc ; en solo, pas de bloc de défense.
        {:else if density === "normale"}Une reprise sur la même case est gratuite (un échange = un bloc) ; 1 coup de récupération après un bloc ; le roque ne fait plus grimper ; en solo, défense seulement quand le moteur prend une pièce.
        {:else}Toutes les règles de déclenchement, sans récupération : beaucoup de blocs.{/if}
        Le mat demande toujours un bloc.
      </p>
    </div>
    <div class="field">
      Passage au mur
      <div class="row">
        <button aria-pressed={rhythm === "series"} onclick={() => (rhythmChoice = "series")}>Par séries de {SERIES_SIZE}</button>
        <button aria-pressed={rhythm === "immediat"} onclick={() => (rhythmChoice = "immediat")}>À chaque bloc</button>
      </div>
      <p class="hint">
        {#if rhythm === "series"}Les coups sont joués tout de suite et leurs blocs mis de côté ; à {SERIES_SIZE} blocs en attente (ou quand
          tu veux), tu les grimpes d'affilée, pendule en pause. Réussite : du temps gagné ; chute : du temps perdu. Le mat se grimpe aussitôt.
        {:else}Chaque bloc se grimpe dès qu'il est demandé, et son résultat décide du coup (validé, limité, annulé, dévié…).{/if}
      </p>
    </div>
    {#if app.wall?.kind !== "voies"}
    <div class="field">
      Pieds
      <div class="row">
        <button aria-pressed={feetRule === "auto"} onclick={() => (feetRule = "auto")}>Selon le niveau</button>
        {#each FOOT_RULES as r (r.id)}
          <button aria-pressed={feetRule === r.id} onclick={() => (feetRule = r.id)}>{r.label}</button>
        {/each}
      </div>
      <p class="hint">
        Selon le niveau : pieds libres en Facile et Modéré, pieds = mains en Difficile, un mouvement sans pied en Diabolique.
        La difficulté totale ne change pas : avec une règle de pieds, les prises sont choisies plus faciles. La parade reste pieds libres.
      </p>
    </div>
    {/if}
        </div>
      </details>

    {:else}
      <ul class="recap">
        {#each recap as line, i (i)}<li>{line}</li>{/each}
      </ul>
    {/if}

    <div class="start-bar">
      {#if stepBlocked}<p class="warn">{stepBlocked}</p>{:else if step !== "recap"}<p>{setupSummary}</p>{/if}
      <div class="nav">
        <button disabled={stepIndex === 0} onclick={() => (stepIndex = Math.max(0, stepIndex - 1))}>Retour</button>
        {#if step === "recap"}
          <button class="primary" onclick={start} disabled={wallSource !== "express" && !app.wall}>Commencer la partie</button>
        {:else}
          <button class="primary" disabled={!!stepBlocked} onclick={nextStep}>Suivant</button>
        {/if}
      </div>
    </div>
  </section>
{:else}
  <div class="game" class:climbing={view.phase === "block" && !showBoard} class:in-block={view.phase === "block"}>
    <section class="panel board-panel" bind:this={boardPanel}>
      <div class="status {view.phase === 'over' ? '' : (view.lastEvent?.tone ?? '')}" class:upside={actorUpside}>
        <div class="status-line">
          <strong>
            {#if view.phase === "over" && view.result}
              {view.result.winner ? `${game.config.players[view.result.winner].name} gagne` : "Nulle"} — {REASON_LABEL[view.result.reason]}
            {:else if view.phase === "block" && view.pending}
              Au mur : {KIND_LABEL[view.pending.request.kind]}{view.pending.series ? ` ${view.pending.series.index}/${view.pending.series.total}` : ""}
            {:else if view.phase === "deviation"}
              Coup dévié : touche une case en surbrillance
            {:else if view.engineTurn}
              {game.config.players[view.turn].name} réfléchit…
            {:else}
              À {game.config.players[view.turn].name} de jouer ({COLOR_LABEL[view.turn]})
            {/if}
          </strong>
          {#if game.config.rhythm === "series" && view.phase !== "over"}
            <span class="queue-dots" title="Blocs en attente">
              {#each Array.from({ length: SERIES_SIZE }, (_, i) => i) as i (i)}<span class:on={i < view.queued}></span>{/each}
            </span>
          {/if}
          {#if view.phase === "block"}
            <button class="board-toggle" onclick={() => (showBoard = !showBoard)}>{showBoard ? "Masquer l'échiquier" : "Voir l'échiquier"}</button>
          {/if}
        </div>
        {#if view.lastEvent && view.phase !== "block" && view.phase !== "over"}
          <p class="status-event"><span class="who">{game.config.players[view.lastEvent.color].name} :</span> {view.lastEvent.text}</p>
        {/if}
      </div>
      <div class="clock" class:running={view.running === (flipped ? "w" : "b")} class:upside={face}>
        <span>{flipped ? game.config.players.w.name : game.config.players.b.name} · {COLOR_LABEL[flipped ? "w" : "b"]}</span>
        <strong>{clockText(flipped ? "w" : "b")}</strong>
      </div>
      <div class="board-wrap">
      <Board
        board={view.board}
        {flipped}
        {selected}
        {targets}
        exhausted={view.exhausted}
        lastMove={view.lastMove}
        checkSquare={view.checkSquare}
        intended={view.deviation?.intended ?? null}
        upsideDown={face ? topColor : null}
        {onSquare}
      />
      </div>
      <div class="clock" class:running={view.running === (flipped ? "b" : "w")}>
        <span>{flipped ? game.config.players.b.name : game.config.players.w.name} · {COLOR_LABEL[flipped ? "b" : "w"]}</span>
        <strong>{clockText(flipped ? "b" : "w")}</strong>
      </div>
      {#if promotionChoice}
        <div class="row promo" class:upside={actorUpside}>
          Promotion :
          {#each [["q", "Dame"], ["r", "Tour"], ["b", "Fou"], ["n", "Cavalier"]] as [p, label] (p)}
            <button onclick={() => play(promotionChoice!.from, promotionChoice!.to, p as PieceSymbol)}>{label}</button>
          {/each}
        </div>
      {/if}
      <div class="row board-actions">
        {#if duo}
          <div class="layout seg" role="group" aria-label="Disposition">
            {#each LAYOUTS as l (l.id)}
              <button aria-pressed={layout === l.id} title={l.hint} onclick={() => (layout = l.id)}>{l.label}</button>
            {/each}
          </div>
        {/if}
        {#if !duo || layout !== "tour"}<button onclick={() => (flipped = !flipped)}>Retourner</button>{/if}
        {#if view.phase !== "over"}
          {@const resigner = game.config.engine ? humanColor : view.turn}
          <button
            class="quiet"
            onclick={() => {
              if (!confirm(`Abandonner la partie (${game!.config.players[resigner].name}) ?`)) return;
              game!.resign(resigner, Date.now());
              refresh();
            }}>Abandonner</button
          >
        {/if}
      </div>
    </section>

    <section class="panel side" class:upside={actorUpside} bind:this={sidePanel}>
      {#if view.phase === "over" && view.result}
        <h2>Partie terminée</h2>
        <p class="big">
          {view.result.winner ? `${game.config.players[view.result.winner].name} gagne` : "Nulle"} — {REASON_LABEL[view.result.reason]}
        </p>
        <p class="hint">Cote Chesscalade mise à jour (si deux joueurs différents sont enregistrés).</p>
        <button class="primary" onclick={() => (game = null)}>Nouvelle partie</button>
      {:else if view.phase === "block" && view.pending}
        {@const p = view.pending}
        <BlockChallenge
          wall={app.playWall}
          block={p.block}
          title={`${KIND_LABEL[p.request.kind]} — ${game.config.players[p.request.climber].name}`}
          subtitle={[
            p.series ? `Série : bloc ${p.series.index}/${p.series.total}` : "",
            p.move ? `Coup en suspens : ${p.move.san}` : "",
            p.triggers.length ? `déclencheur : ${p.triggers.map((t) => TRIGGER_LABEL[t]).join(" + ")}` : "",
            `caractère : ${pieceLabel(p.request.piece)}`,
            `cote visée ${p.request.targetRating}`,
            p.attemptsLeft > 1 ? `${p.attemptsLeft} essais` : "",
            p.request.kind === "recharge" || game.config.difficulty === "diabolique" ? "pendule en marche !" : "pendule en pause",
          ]
            .filter(Boolean)
            .join(" · ")}
          timeLimitMs={p.timeLimitMs}
          startedAt={p.startedAt}
          onResult={blockResult}
        />
      {:else if view.phase === "deviation" && view.deviation}
        <h2>Coup dévié</h2>
        <p>
          <strong>{game.config.players[view.deviation.chooser].name}</strong> choisit la case de la pièce en {view.deviation.from}
          {view.deviation.chooser !== view.deviation.player ? `de ${game.config.players[view.deviation.player].name}` : ""}
          (case visée : {view.deviation.intended}). Touche une case en surbrillance.
        </p>
      {:else if view.engineTurn}
        <p class="hint">Le moteur joue, puis c'est à toi.</p>
      {:else}
        {#if view.kingOnly === view.turn}<p class="warn">Parade ratée : il faut parer avec le roi si c'est possible.</p>{/if}
        {#if view.falls[view.turn] > 0}<p class="hint">Chutes consécutives : {view.falls[view.turn]}</p>{/if}
        <div class="row">
          <button disabled={!view.canRecharge} onclick={() => recharge(false)}>Recharge</button>
          {#if game.config.format === "classique"}
            <button disabled={!view.canRecharge} onclick={() => recharge(true)}>Recharge (bloc dur)</button>
          {/if}
          {#if view.canCounter}
            <button class="counter" onclick={counterAttack}>Contre-attaque</button>
          {/if}
        </div>
        {#if game.config.rhythm === "series"}
          {#if view.canGoToWall}
            <button class="primary to-wall" onclick={goToWall}>Aller au mur maintenant ({view.queued} bloc{view.queued > 1 ? "s" : ""})</button>
          {:else}
            <p class="hint">Aucun bloc en attente : les prises mettent un bloc de côté, à {SERIES_SIZE} tu vas au mur.</p>
          {/if}
        {/if}
        <p class="hint">
          Recharge : la pendule tourne pendant le bloc. Disponible tous les 5 coups.
          {#if view.canCounter}Contre-attaque (une fois par partie) : un bloc très dur pour annuler le dernier coup du moteur.{/if}
        </p>
      {/if}
      {#if engineError}<p class="warn">{engineError}</p>{/if}
      {#if view.bell && view.phase !== "over"}
        {@const left = (void now, Math.max(0, game.nextBellAt() - game.bellPlayTimeMs))}
        <p class="bell">
          Prochaine cloche dans <strong>{Math.floor(Math.ceil(left / 1000) / 60)}:{String(Math.ceil(left / 1000) % 60).padStart(2, "0")}</strong> de jeu
          {view.bell.rung > 0 ? `· ${view.bell.rung} déjà sonnée(s)` : ""}
        </p>
      {/if}

      {#if lastDelta}
        <p class="hint">Cote de grimpe de {lastDelta.name} : {lastDelta.delta >= 0 ? "+" : ""}{Math.round(lastDelta.delta)}</p>
      {/if}

      {#if view.lastVerdict}
        <p class="hint">
          Dernier verdict ({game.config.players[view.lastVerdict.color].name}, {view.lastVerdict.move}) :
          V{view.lastVerdict.verdict} {VERDICT_LABELS[view.lastVerdict.verdict]}
        </p>
      {/if}

      <details open>
        <summary>Journal</summary>
        <ul class="log">
          {#each view.log as entry, i (view.log.length - i)}
            <li class={entry.tone ?? "neutre"}><span class="dot" class:black={entry.color === "b"}></span>{entry.text}</li>
          {/each}
        </ul>
      </details>
      <details>
        <summary>Coups ({view.sans.length})</summary>
        <p class="moves">
          {view.sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(" ")}
        </p>
      </details>
      <div class="row">
        {#each (["w", "b"] as Color[]).filter((c) => c !== game!.config.engine?.color) as c (c)}
          <label class="check">
            <input type="checkbox" checked={view.fatigue[c as Color]} onchange={() => toggleFatigue(c as Color)} />
            Fatigue {game.config.players[c as Color].name}
          </label>
        {/each}
      </div>
    </section>
  </div>
{/if}

<style>
  .status {
    padding: 8px 12px;
    border-radius: 10px;
    border-left: 6px solid var(--border);
    background: var(--bg);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .status.bon {
    border-left-color: #2e7d32;
  }
  .status.mauvais {
    border-left-color: #c62828;
  }
  .status-line {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .status-line strong {
    flex: 1 1 auto;
  }
  .status-event {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
  .status-event .who {
    font-weight: 400;
    color: var(--muted);
  }
  .queue-dots {
    display: inline-flex;
    gap: 4px;
  }
  .queue-dots span {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid var(--accent);
  }
  .queue-dots span.on {
    background: var(--accent);
  }
  .board-toggle {
    display: none;
    min-height: 36px;
    padding: 0 10px;
    font-size: 0.85rem;
  }
  .to-wall {
    min-height: 52px;
  }
  .quiet {
    color: var(--muted);
  }
  @media (max-width: 699px) {
    .board-toggle {
      display: inline-block;
    }
    .game.climbing .board-wrap,
    .game.climbing .board-actions {
      display: none;
    }
  }
  .setup {
    max-width: 720px;
    margin: 0 auto;
  }
  .seg {
    flex-wrap: nowrap;
  }
  .seg > button {
    flex: 1 1 0;
    min-width: 0;
    padding-inline: 6px;
  }
  .seg4 {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .seg4 > button {
    padding-inline: 4px;
    font-size: 0.9rem;
  }
  @media (max-width: 420px) {
    .seg4 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .advanced {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0 12px;
  }
  .advanced summary {
    padding: 12px 0;
    font-weight: 600;
    cursor: pointer;
  }
  .advanced summary span {
    display: block;
    font-weight: 400;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .advanced-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-bottom: 12px;
  }
  .start-bar {
    position: sticky;
    bottom: var(--nav-h);
    z-index: 2;
    margin: 0 -16px -16px;
    padding: 10px 16px calc(10px + var(--bar-safe-bottom));
    background: var(--surface);
    border-top: 1px solid var(--border);
    border-radius: 0 0 14px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .start-bar p {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .start-bar .nav {
    display: flex;
    gap: 8px;
  }
  .start-bar .nav button {
    flex: 1;
    min-height: 52px;
    font-size: 1.05rem;
  }
  .start-bar .nav .primary {
    flex: 2;
  }
  .express input[type="number"] {
    width: 90px;
  }
  .cards.three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .upside {
    transform: rotate(180deg);
  }
  .layout {
    display: flex;
    flex: 1 1 100%;
  }
  .layout button {
    flex: 1;
    min-height: 40px;
    font-size: 0.85rem;
    padding: 0 6px;
  }
  .wizard-head {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .steps {
    list-style: none;
    display: flex;
    gap: 6px;
    margin: 0;
    padding: 0;
  }
  .steps li {
    flex: 1;
  }
  .steps button {
    width: 100%;
    min-height: 8px;
    height: 8px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: var(--border);
    font-size: 0;
  }
  .steps button.done {
    background: color-mix(in srgb, var(--accent) 55%, transparent);
    cursor: pointer;
  }
  .steps button[aria-current="step"] {
    background: var(--accent);
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 12px 14px;
    text-align: left;
    border-radius: 12px;
    min-height: 0;
  }
  .card strong {
    font-size: 1.02rem;
  }
  .card small {
    color: var(--muted);
    font-size: 0.85rem;
    line-height: 1.35;
  }
  .card[aria-pressed="true"] {
    border-width: 2px;
    background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  }
  .card.compact {
    padding: 10px 12px;
  }
  .card-icon {
    font-size: 1.6rem;
    line-height: 1;
  }
  .flow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    font-size: 0.85rem;
  }
  .flow .token {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--bg);
    border: 1px solid var(--border);
  }
  .flow .arrow {
    color: var(--muted);
  }
  .lines {
    margin: 0;
    padding-left: 18px;
    font-size: 0.85rem;
    color: var(--muted);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .recap {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 1rem;
    line-height: 1.4;
  }
  .recap li {
    padding: 10px 12px;
    border-left: 4px solid var(--accent);
    background: var(--bg);
    border-radius: 8px;
  }
  .replay {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 14px 16px;
    text-align: left;
    border: 2px solid var(--accent);
    border-radius: 12px;
    color: var(--accent);
  }
  .replay small {
    color: var(--muted);
  }
  .or {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  @media (max-width: 420px) {
    .cards,
    .cards.three {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 600px) {
    .start-bar p:not(.warn) {
      display: none;
    }
  }
  .start-bar .primary {
    min-height: 52px;
    font-size: 1.05rem;
  }
  .small {
    min-height: 36px;
    padding: 0 12px;
    font-size: 0.85rem;
  }
  .route-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .route-chip {
    min-height: 40px;
    padding: 0 12px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .route-chip[aria-pressed="false"] {
    opacity: 0.5;
  }
  .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid var(--border);
  }
  .link {
    min-height: 0;
    padding: 0 4px;
    border: none;
    background: none;
    color: var(--accent);
    text-decoration: underline;
  }
  .resume {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 10px;
    border: 2px solid var(--accent);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }
  .player {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .game {
    display: grid;
    grid-template-columns: minmax(300px, 600px) minmax(280px, 1fr);
    gap: 16px;
    align-items: start;
  }
  /* Tablette : échiquier et panneau côte à côte ; pendant un bloc, le bloc prend la plus grande part. */
  @media (min-width: 700px) and (max-width: 1199px) {
    .game.in-block {
      grid-template-columns: minmax(260px, 0.75fr) minmax(320px, 1.25fr);
    }
  }
  @media (max-width: 699px) {
    .game {
      grid-template-columns: 1fr;
    }
  }
  .clock {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
  }
  .clock strong {
    font-size: 1.6rem;
    font-variant-numeric: tabular-nums;
  }
  .clock.running {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .promo {
    align-items: center;
  }
  .big {
    font-size: 1.3rem;
    font-weight: 700;
    margin: 0;
  }
  .counter {
    border-color: #6a1b9a;
    color: #6a1b9a;
    font-weight: 700;
  }
  .bell {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .log li.bon {
    color: #2e7d32;
  }
  .log li.mauvais {
    color: #c62828;
  }
  .verdict {
    margin: 0;
    padding: 8px 10px;
    border-left: 4px solid var(--accent);
    background: var(--bg);
    border-radius: 6px;
  }
  .log {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.9rem;
  }
  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid #000;
    background: #fff;
    margin-right: 6px;
  }
  .dot.black {
    background: #000;
  }
  .moves {
    font-size: 0.9rem;
    line-height: 1.6;
  }
</style>
