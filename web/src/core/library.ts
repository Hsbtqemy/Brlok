/**
 * Bibliothèque de séances (parité avec Brlok desktop) : favoris, modèles de séance, historique, et la
 * séance en cours (gardée d'un onglet à l'autre et après un rechargement).
 * Logique pure : chaque fonction renvoie une nouvelle valeur.
 */
import { hangBlock, hangText } from "./beam";
import { estimateBlockRating } from "./blockRating";
import { DISTRIBUTION_PATTERNS, type DistributionPattern } from "./distribution";
import { footBonus } from "./feet";
import type { Block } from "./generator";
import { ROUTE_VARIANTS, routeHex, routeLabel, variantText, type RouteVariant } from "./gym";
import type { TimerConfig, TimerMode } from "./intervals";
import { clampLevel, type Hold, type Wall } from "./wall";

export const LEVEL_PROFILES = [
  { label: "Très facile", level: 1 },
  { label: "Facile", level: 2 },
  { label: "Modéré", level: 3 },
  { label: "Difficile", level: 4 },
  { label: "Très difficile", level: 5 },
  { label: "Extrême", level: 6 },
] as const;

export const levelLabel = (level: number) => LEVEL_PROFILES.find((p) => p.level === level)?.label ?? `Niveau ${level}`;

export type BlockResult = "reussi" | "chute";

/** Bloc d'une séance : le bloc, plus le commentaire et le résultat noté pendant la séance. */
export interface SessionBlock extends Block {
  comment?: string;
  result?: BlockResult;
  /** La tentative a déjà compté pour les cotes : changer le résultat ne la recompte pas. */
  rated?: boolean;
}

/** Réglages qui ont produit une séance (et que garde un modèle). */
export type SessionSettings =
  | {
      kind: "pan";
      level: number;
      pattern: DistributionPattern;
      blocks: number;
      holds: number;
      variety: boolean;
      requiredTags: string[];
      excludedTags: string[];
      /** Niveau bloc par bloc (modèles importés de Brlok desktop). */
      blockLevels?: number[];
      /** Poutre intégrée : ses prises font partie des blocs (défaut : oui). */
      useBeam?: boolean;
      /** Poutre à part : chaque bloc finit suspendu à la poutre pendant n secondes. */
      finishS?: number;
    }
  | {
      kind: "voies";
      target: number;
      pattern: DistributionPattern;
      count: number;
      /** Variantes permises ; null : sans variantes. */
      variants: RouteVariant[] | null;
    };

/** Réglages du minuteur gardés avec un modèle. */
export interface TimerSettings {
  preset: string;
  config: TimerConfig;
  chained: boolean;
  /** Pause entre deux blocs enchaînés (s) ; 0 : aucune. */
  pauseS: number;
}

export interface SessionTemplate {
  id: string;
  name: string;
  settings: SessionSettings;
  timer?: TimerSettings;
  createdAt: string;
}

export interface Favorite {
  id: string;
  wallId: string;
  block: Block;
  title: string;
  comment?: string;
  createdAt: string;
}

/** Séance en cours. */
export interface SessionRun {
  id: string;
  wallId: string;
  startedAt: string;
  settings?: SessionSettings;
  templateName?: string;
  blocks: SessionBlock[];
  selected: number;
}

/** Séance terminée, dans l'historique. */
export interface SessionRecord {
  id: string;
  wallId: string;
  wallName: string;
  startedAt: string;
  endedAt: string;
  settings?: SessionSettings;
  templateName?: string;
  playerName?: string;
  blocks: SessionBlock[];
}

export interface Library {
  favorites: Favorite[];
  templates: SessionTemplate[];
  history: SessionRecord[];
  current: SessionRun | null;
}

/** Le stockage du navigateur est partagé avec les photos : l'historique garde les 100 dernières séances. */
export const HISTORY_LIMIT = 100;

export function emptyLibrary(): Library {
  return { favorites: [], templates: [], history: [], current: null };
}

/** Relit une bibliothèque stockée (ou absente) sans faire confiance à sa forme. */
export function normalizeLibrary(raw: unknown): Library {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Library>;
  const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const current = r.current && typeof r.current === "object" && Array.isArray(r.current.blocks) ? r.current : null;
  return {
    favorites: list<Favorite>(r.favorites).filter((f) => f && f.block && f.wallId),
    templates: list<SessionTemplate>(r.templates).filter((t) => t && t.name && t.settings),
    history: list<SessionRecord>(r.history).filter((s) => s && Array.isArray(s.blocks)),
    current,
  };
}

/** Identifiant unique sans crypto.randomUUID (absent hors HTTPS). */
export function newLibraryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Libellé court d'un bloc : la voie (et sa variante), ou ses prises. */
export function blockLabel(block: Block): string {
  if (block.hang) return `Poutre · ${hangText(block)}`;
  if (block.route) {
    const v = block.route.variant ? variantText(block.route.variant, block.route.variantHold)?.label : undefined;
    return v ? `${block.route.label} · ${v}` : block.route.label;
  }
  return block.holds.map((h) => h.id).join(" → ");
}

/** Identité d'un bloc sur un mur : deux favoris identiques ne sont gardés qu'une fois. */
export function blockSignature(wallId: string, block: Block): string {
  if (block.hang) return `${wallId}|poutre:${block.hang.left}|${block.hang.right}:${block.hang.seconds}`;
  if (block.route) return `${wallId}|voie:${block.route.id}~${block.route.variant ?? ""}~${block.route.variantHold ?? ""}`;
  return `${wallId}|${block.holds.map((h) => h.id).join("-")}~${block.feet ?? ""}~${block.noFootMove ?? ""}`;
}

// --- Séance en cours ---------------------------------------------------------------------------

export function startRun(wallId: string, blocks: readonly Block[], settings?: SessionSettings, templateName?: string, at = new Date().toISOString()): SessionRun {
  return {
    id: newLibraryId("seance"),
    wallId,
    startedAt: at,
    ...(settings ? { settings } : {}),
    ...(templateName ? { templateName } : {}),
    // Une séance neuve ne reprend ni résultat ni tentative comptée (séance refaite depuis l'historique).
    blocks: blocks.map((b) => {
      const { result: _r, rated: _x, ...rest } = b as SessionBlock;
      return rest;
    }),
    selected: 0,
  };
}

/** Une séance où l'on a noté quelque chose mérite d'aller à l'historique avant d'être remplacée. */
export function runHasProgress(run: SessionRun | null): boolean {
  return !!run?.blocks.some((b) => b.result || b.comment);
}

function patchBlock(run: SessionRun, index: number, patch: (b: SessionBlock) => SessionBlock): SessionRun {
  if (index < 0 || index >= run.blocks.length) return run;
  return { ...run, blocks: run.blocks.map((b, i) => (i === index ? patch(b) : b)) };
}

export function setBlockResult(run: SessionRun, index: number, result: BlockResult | null): SessionRun {
  return patchBlock(run, index, ({ result: _r, ...b }) => (result ? { ...b, result } : b));
}

export function setBlockComment(run: SessionRun, index: number, comment: string): SessionRun {
  const text = comment.trim();
  return patchBlock(run, index, ({ comment: _c, ...b }) => (text ? { ...b, comment: text } : b));
}

/** La tentative du bloc a compté pour les cotes. */
export function markRated(run: SessionRun, index: number): SessionRun {
  return patchBlock(run, index, (b) => ({ ...b, rated: true }));
}

export function selectBlock(run: SessionRun, index: number): SessionRun {
  return index >= 0 && index < run.blocks.length ? { ...run, selected: index } : run;
}

/** Recommencer la même séance : mêmes blocs, résultats effacés (les commentaires restent). */
export function restartRun(run: SessionRun, at = new Date().toISOString()): SessionRun {
  return { ...run, id: newLibraryId("seance"), startedAt: at, selected: 0, blocks: run.blocks.map(({ result: _r, rated: _x, ...b }) => b) };
}

/** Cote estimée d'un bloc de pan d'après ses prises (et sa règle de pieds). */
function rateHolds(holds: readonly Hold[], block: Block): number {
  return estimateBlockRating(holds.map((h) => h.level)) + (block.feet ? footBonus(block.feet) : 0);
}

/**
 * Modifier la séquence d'un bloc de pan en touchant une prise : ajoutée à la fin si elle n'y est pas,
 * retirée sinon (un bloc garde au moins une prise). La cote estimée suit.
 */
export function toggleBlockHold(wall: Wall, block: SessionBlock, holdId: string): SessionBlock {
  if (block.route || block.hang) return block;
  const inBlock = block.holds.some((h) => h.id === holdId);
  if (inBlock) {
    if (block.holds.length <= 1) return block;
    const holds = block.holds.filter((h) => h.id !== holdId);
    // Le passage « sans pied » désigne une prise par son rang : il ne survit pas à une retouche.
    const { noFootMove: _n, ...rest } = block;
    return { ...rest, holds, estimatedRating: rateHolds(holds, block) };
  }
  const hold = wall.holds.find((h) => h.id === holdId && h.active);
  if (!hold) return block;
  const holds = [...block.holds, { ...hold, tags: [...hold.tags], position: { ...hold.position } }];
  const { noFootMove: _n, ...rest } = block;
  return { ...rest, holds, estimatedRating: rateHolds(holds, block) };
}

/** La séance terminée, pour l'historique. */
export function endRun(run: SessionRun, wallName: string, playerName?: string, at = new Date().toISOString()): SessionRecord {
  return {
    id: run.id,
    wallId: run.wallId,
    wallName,
    startedAt: run.startedAt,
    endedAt: at,
    ...(run.settings ? { settings: run.settings } : {}),
    ...(run.templateName ? { templateName: run.templateName } : {}),
    ...(playerName ? { playerName } : {}),
    blocks: run.blocks.map((b) => ({ ...b })),
  };
}

export function addToHistory(lib: Library, record: SessionRecord): Library {
  return { ...lib, history: [record, ...lib.history.filter((s) => s.id !== record.id)].slice(0, HISTORY_LIMIT) };
}

export function removeFromHistory(lib: Library, id: string): Library {
  return { ...lib, history: lib.history.filter((s) => s.id !== id) };
}

/** Historique filtré : période (7 ou 30 jours, ou tout), recherche (mur, modèle, prises, voies, commentaires). */
export function filterHistory(history: readonly SessionRecord[], options: { days: number | null; search: string; now?: number; wallId?: string }): SessionRecord[] {
  const now = options.now ?? Date.now();
  const since = options.days ? now - options.days * 86_400_000 : -Infinity;
  const words = normalize(options.search).split(/\s+/).filter(Boolean);
  return history.filter((s) => {
    if (options.wallId && s.wallId !== options.wallId) return false;
    if (Date.parse(s.endedAt) < since) return false;
    if (words.length === 0) return true;
    const haystack = normalize(
      [s.wallName, s.templateName ?? "", s.playerName ?? "", ...s.blocks.flatMap((b) => [blockLabel(b), b.comment ?? ""])].join(" "),
    );
    return words.every((w) => haystack.includes(w));
  });
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Bilan d'une séance : blocs réussis sur blocs notés. */
export function runSummary(blocks: readonly SessionBlock[]): { done: number; success: number; total: number } {
  return {
    done: blocks.filter((b) => b.result).length,
    success: blocks.filter((b) => b.result === "reussi").length,
    total: blocks.length,
  };
}

// --- Favoris -----------------------------------------------------------------------------------

function cleanBlock(block: Block): Block {
  const { comment: _c, result: _r, rated: _x, ...rest } = block as SessionBlock;
  return structuredCloneSafe(rest);
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Ajoute un bloc aux favoris (ignoré s'il y est déjà). */
export function addFavorite(
  lib: Library,
  wallId: string,
  block: Block,
  title: string,
  comment?: string,
  at = new Date().toISOString(),
): { lib: Library; added: boolean } {
  const sig = blockSignature(wallId, block);
  if (lib.favorites.some((f) => blockSignature(f.wallId, f.block) === sig)) return { lib, added: false };
  const favorite: Favorite = {
    id: newLibraryId("favori"),
    wallId,
    block: cleanBlock(block),
    title: title.trim() || blockLabel(block),
    ...(comment?.trim() ? { comment: comment.trim() } : {}),
    createdAt: at,
  };
  return { lib: { ...lib, favorites: [favorite, ...lib.favorites] }, added: true };
}

export function isFavorite(lib: Library, wallId: string, block: Block): boolean {
  const sig = blockSignature(wallId, block);
  return lib.favorites.some((f) => blockSignature(f.wallId, f.block) === sig);
}

export function removeFavorite(lib: Library, id: string): Library {
  return { ...lib, favorites: lib.favorites.filter((f) => f.id !== id) };
}

export function updateFavorite(lib: Library, id: string, patch: { title?: string; comment?: string }): Library {
  return {
    ...lib,
    favorites: lib.favorites.map((f) => {
      if (f.id !== id) return f;
      const title = patch.title !== undefined ? patch.title.trim() || f.title : f.title;
      const { comment: _c, ...rest } = f;
      const comment = patch.comment !== undefined ? patch.comment.trim() : (f.comment ?? "");
      return { ...rest, title, ...(comment ? { comment } : {}) };
    }),
  };
}

/** Titre d'un favori, comme Brlok desktop : date, difficulté, rang du bloc. */
export function favoriteTitle(settings: SessionSettings | undefined, index: number, at = new Date()): string {
  const date = at.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  const level = settings?.kind === "pan" ? levelLabel(settings.blockLevels?.[index] ?? settings.level) : settings?.kind === "voies" ? `cote ${settings.target}` : "";
  return [date, level, `#${index + 1}`].filter(Boolean).join(" · ");
}

/**
 * Remet un bloc gardé (favori, historique) à jour du mur tel qu'il est : prises actuelles (niveaux,
 * types), voie toujours en place. Null si le bloc n'existe plus sur ce mur.
 */
export function refreshBlock(wall: Wall, block: Block): Block | null {
  if (block.hang) return wall.beam ? hangBlock(wall.beam, block.hang) : null;
  if (block.route) {
    const route = wall.routes.find((r) => r.id === block.route!.id && !r.archived);
    if (!route) return null;
    return { ...block, route: { ...block.route, label: routeLabel(route), color: route.color, colorHex: routeHex(route), grade: route.grade, styles: [...route.styles] } };
  }
  const holds = block.holds.map((h) => wall.holds.find((w) => w.id === h.id && w.active));
  if (holds.length === 0 || holds.some((h) => !h)) return null;
  const fresh = holds.map((h) => ({ ...h!, tags: [...h!.tags], position: { ...h!.position } }));
  // La sortie à la poutre suit la poutre ; si elle n'existe plus, le bloc reste, sans sortie.
  const { finish, ...rest } = block;
  const finishFresh = finish?.hang && wall.beam ? hangBlock(wall.beam, finish.hang) : null;
  return { ...rest, holds: fresh, estimatedRating: rateHolds(fresh, block), ...(finishFresh ? { finish: finishFresh } : {}) };
}

// --- Modèles -----------------------------------------------------------------------------------

/** Enregistre un modèle ; un modèle du même nom (et du même type de mur) est remplacé. */
export function saveTemplate(lib: Library, name: string, settings: SessionSettings, timer?: TimerSettings, at = new Date().toISOString()): Library {
  const clean = name.trim();
  if (!clean) return lib;
  const existing = lib.templates.find((t) => t.name === clean && t.settings.kind === settings.kind);
  const template: SessionTemplate = {
    id: existing?.id ?? newLibraryId("modele"),
    name: clean,
    settings: structuredCloneSafe(settings),
    ...(timer ? { timer: structuredCloneSafe(timer) } : {}),
    createdAt: existing?.createdAt ?? at,
  };
  return { ...lib, templates: existing ? lib.templates.map((t) => (t.id === existing.id ? template : t)) : [...lib.templates, template] };
}

export function removeTemplate(lib: Library, id: string): Library {
  return { ...lib, templates: lib.templates.filter((t) => t.id !== id) };
}

/** Renomme un modèle ; refusé (bibliothèque inchangée) si le nom est vide ou déjà pris par un modèle du même type. */
export function renameTemplate(lib: Library, id: string, name: string): Library {
  const clean = name.trim();
  const target = lib.templates.find((t) => t.id === id);
  if (!clean || !target) return lib;
  if (lib.templates.some((t) => t.id !== id && t.name === clean && t.settings.kind === target.settings.kind)) return lib;
  return { ...lib, templates: lib.templates.map((t) => (t.id === id ? { ...t, name: clean } : t)) };
}

const patternLabel = (p: DistributionPattern) => DISTRIBUTION_PATTERNS.find((d) => d.id === p)?.label ?? p;

/** Les réglages, en une ligne. */
export function settingsText(settings: SessionSettings): string {
  if (settings.kind === "voies") {
    const variants =
      settings.variants === null ? "sans variantes" : settings.variants.length === ROUTE_VARIANTS.length ? "avec variantes" : `${settings.variants.length} variante(s) permise(s)`;
    return `${settings.count} voie(s) autour de ${settings.target} · ${patternLabel(settings.pattern)} · ${variants}`;
  }
  const levels = settings.blockLevels?.length && new Set(settings.blockLevels).size > 1 ? settings.blockLevels.map(levelLabel).join(" / ") : levelLabel(settings.level);
  return [
    levels,
    patternLabel(settings.pattern),
    `${settings.blocks} bloc(s) de ${settings.holds} prises`,
    settings.variety ? "variété" : "",
    settings.requiredTags.length ? `types : ${settings.requiredTags.join(", ")}` : "",
    settings.excludedTags.length ? `sans : ${settings.excludedTags.join(", ")}` : "",
    settings.useBeam === false ? "sans la poutre" : "",
    settings.finishS ? `sortie à la poutre ${settings.finishS} s` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

// --- Brlok desktop : favoris et modèles --------------------------------------------------------

const DESKTOP_LEVELS: Record<string, number> = { "très facile": 1, facile: 2, "modéré": 3, difficile: 4, "très difficile": 5 };

interface DesktopHold {
  id: string;
  level?: number;
  tags?: string[];
  position?: { row: number; col: number };
  active?: boolean;
}

interface DesktopBlock {
  holds?: DesktopHold[];
  comment?: string | null;
  title?: string | null;
}

/** Fichier de Brlok desktop reconnu : favoris (`blocks`) ou modèles (`templates`). */
export function desktopFileKind(data: unknown): "favoris" | "modeles" | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.templates)) return "modeles";
  if (Array.isArray(d.blocks) && !("constraints" in d)) return "favoris";
  // Fichier de données de Brlok desktop (version 2) : favoris rangés par catalogue.
  if (d.by_catalog && typeof d.by_catalog === "object") return "favoris";
  return null;
}

/** Blocs d'un fichier de favoris : export (`blocks`) ou fichier de données v2 (`by_catalog`, celui du pan s'il y est). */
function desktopFavoriteBlocks(data: unknown, wallId: string): DesktopBlock[] {
  const d = (data ?? {}) as { blocks?: unknown; by_catalog?: Record<string, unknown> };
  if (Array.isArray(d.blocks)) return d.blocks as DesktopBlock[];
  const byCatalog = d.by_catalog && typeof d.by_catalog === "object" ? d.by_catalog : {};
  // Un pan importé de Brlok desktop garde l'identifiant de son catalogue ; sinon, tous les catalogues
  // (les blocs dont les prises n'existent pas sur ce pan sont écartés ensuite).
  const own = byCatalog[wallId];
  const lists = Array.isArray(own) ? [own] : Object.values(byCatalog).filter(Array.isArray);
  return lists.flat() as DesktopBlock[];
}

/** Favoris de Brlok desktop → blocs de ce pan (les prises inconnues du pan sont écartées). */
export function importDesktopFavorites(data: unknown, wall: Wall): { blocks: { block: Block; title?: string; comment?: string }[]; skipped: number } {
  const items = desktopFavoriteBlocks(data, wall.id).filter((b) => b && Array.isArray(b.holds));
  const blocks: { block: Block; title?: string; comment?: string }[] = [];
  let skipped = 0;
  for (const item of items) {
    const block = refreshBlock(wall, { holds: item.holds!.map((h) => ({ id: String(h.id) }) as Hold), estimatedRating: 0, relaxations: [] });
    if (!block) {
      skipped++;
      continue;
    }
    blocks.push({ block, ...(item.title ? { title: item.title } : {}), ...(item.comment ? { comment: item.comment } : {}) });
  }
  return { blocks, skipped };
}

interface DesktopTemplate {
  name?: string;
  blocks_count?: number;
  holds_per_block?: number;
  distribution_pattern?: string;
  blocks_config?: { level?: string | number; work_s?: number; rest_s?: number; rounds?: number }[];
}

const desktopLevel = (level: string | number | undefined) =>
  typeof level === "number" ? clampLevel(level) : (DESKTOP_LEVELS[String(level ?? "").toLowerCase()] ?? 3);

/** Modèles de Brlok desktop → modèles de pan (niveau, répartition, minuteur travail/repos). */
export function importDesktopTemplates(data: unknown, at = new Date().toISOString()): SessionTemplate[] {
  const items = ((data as { templates?: DesktopTemplate[] })?.templates ?? []).filter((t) => t && t.name);
  return items.map((t) => {
    const configs = t.blocks_config ?? [];
    const blocks = Math.max(1, Math.min(20, Math.round(t.blocks_count ?? (configs.length || 5))));
    const levels = Array.from({ length: blocks }, (_, i) => desktopLevel(configs[i]?.level ?? configs[0]?.level));
    const pattern = (DISTRIBUTION_PATTERNS.some((p) => p.id === t.distribution_pattern) ? t.distribution_pattern : "uniforme") as DistributionPattern;
    const first = configs[0];
    const mode: TimerMode = "fixe";
    const timer: TimerSettings | undefined = first
      ? {
          preset: "perso",
          config: { mode, workS: first.work_s ?? 40, restS: first.rest_s ?? 20, rounds: first.rounds ?? 3 },
          chained: false,
          pauseS: 0,
        }
      : undefined;
    return {
      id: newLibraryId("modele"),
      name: String(t.name),
      settings: {
        kind: "pan",
        level: levels[0],
        pattern,
        blocks,
        holds: Math.max(1, Math.min(20, Math.round(t.holds_per_block ?? 8))),
        variety: true,
        requiredTags: [],
        excludedTags: [],
        ...(new Set(levels).size > 1 ? { blockLevels: levels } : {}),
      },
      ...(timer ? { timer } : {}),
      createdAt: at,
    };
  });
}

/** Ajoute des modèles importés ; un nom déjà pris est écarté (comme Brlok desktop). */
export function mergeTemplates(lib: Library, templates: readonly SessionTemplate[]): { lib: Library; added: number } {
  const names = new Set(lib.templates.map((t) => `${t.settings.kind}|${t.name}`));
  const fresh = templates.filter((t) => !names.has(`${t.settings.kind}|${t.name}`));
  return { lib: { ...lib, templates: [...lib.templates, ...fresh] }, added: fresh.length };
}

/** Hold au format Brlok desktop (niveau limité à 5). */
const desktopHold = (h: Hold): DesktopHold => ({ id: h.id, level: Math.min(5, h.level), tags: [...h.tags], position: { ...h.position }, active: h.active });

/** Favoris d'un pan au format de Brlok desktop (fichier favorites.json). */
export function exportDesktopFavorites(favorites: readonly Favorite[], wallId: string, at = new Date().toISOString()) {
  return {
    version: 1,
    updated_at: at,
    blocks: favorites
      .filter((f) => f.wallId === wallId && !f.block.route && f.block.holds.length > 0)
      .map((f) => ({ holds: f.block.holds.map(desktopHold), foot_positions: [], comment: f.comment ?? null, title: f.title })),
  };
}

/** Séance de pan au format de Brlok desktop (rechargeable par sa ligne de commande). */
export function desktopSession(blocks: readonly SessionBlock[], settings?: SessionSettings) {
  const pan = settings?.kind === "pan" ? settings : undefined;
  return {
    blocks: blocks
      .filter((b) => !b.route && b.holds.length > 0)
      .map((b) => ({ holds: b.holds.map(desktopHold), foot_positions: [], comment: b.comment ?? null, title: null })),
    constraints: {
      target_level: pan ? Math.min(5, pan.level) : null,
      required_tags: pan?.requiredTags ?? [],
      excluded_tags: pan?.excludedTags ?? [],
      variety: pan?.variety ?? false,
      enchainements: pan?.holds ?? null,
    },
  };
}
