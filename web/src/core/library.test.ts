import { describe, expect, it } from "vitest";
import desktopFavorites from "../../../data/favorites.json";
import desktopTemplates from "../../../data/templates.json";
import { estimateBlockRating } from "./blockRating";
import { generateClassicSession, type Block } from "./generator";
import { routeBlock } from "./gym";
import {
  addFavorite,
  addToHistory,
  desktopFileKind,
  emptyLibrary,
  endRun,
  exportDesktopFavorites,
  filterHistory,
  HISTORY_LIMIT,
  importDesktopFavorites,
  importDesktopTemplates,
  isFavorite,
  markRated,
  mergeTemplates,
  normalizeLibrary,
  refreshBlock,
  renameTemplate,
  restartRun,
  runHasProgress,
  runSummary,
  saveTemplate,
  setBlockComment,
  setBlockResult,
  settingsText,
  startRun,
  toggleBlockHold,
  updateFavorite,
  type SessionSettings,
} from "./library";
import { seededRng } from "./random";
import { sessionFileName, sessionJson, sessionMarkdown, sessionText } from "./sessionExport";
import { createEmptyWall, holdId, type Wall } from "./wall";

function pan(levelOf: (row: number, col: number) => number = () => 3, tagsOf: (row: number, col: number) => string[] = () => []): Wall {
  const wall = createEmptyWall("pan", "Pan maison", 7, 6);
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 6; col++) {
      const position = { row, col };
      wall.holds.push({ id: holdId(position), level: levelOf(row, col), tags: tagsOf(row, col), position, active: true });
    }
  }
  return wall;
}

const blockOf = (wall: Wall, ids: string[]): Block => {
  const holds = ids.map((id) => wall.holds.find((h) => h.id === id)!);
  return { holds, estimatedRating: estimateBlockRating(holds.map((h) => h.level)), relaxations: [] };
};

const panSettings: SessionSettings = { kind: "pan", level: 3, pattern: "uniforme", blocks: 3, holds: 4, variety: true, requiredTags: [], excludedTags: [] };

describe("séance : types de prises", () => {
  const wall = pan(
    () => 3,
    (row, col) => (col === 0 ? ["mono"] : col === 1 ? ["réglette"] : col === 2 ? ["réglette", "plat"] : []),
  );

  it("n'utilise que les prises du type exigé", () => {
    const blocks = generateClassicSession(wall, { targetLevel: 3, blocksCount: 3, holdsPerBlock: 5, requiredTags: ["réglette"], rng: seededRng(2) });
    expect(blocks).toHaveLength(3);
    for (const b of blocks) expect(b.holds.every((h) => h.tags.includes("réglette"))).toBe(true);
  });

  it("écarte les types exclus", () => {
    const blocks = generateClassicSession(wall, { targetLevel: 3, blocksCount: 4, holdsPerBlock: 8, excludedTags: ["mono", "plat"], rng: seededRng(3) });
    for (const b of blocks) expect(b.holds.some((h) => h.tags.includes("mono") || h.tags.includes("plat"))).toBe(false);
  });

  it("un type à la fois exigé et exclu : pas de séance", () => {
    expect(generateClassicSession(wall, { targetLevel: 3, requiredTags: ["mono"], excludedTags: ["mono"], rng: seededRng(1) })).toEqual([]);
  });

  it("aucune prise du type : pas de séance", () => {
    expect(generateClassicSession(wall, { targetLevel: 3, requiredTags: ["volume"], rng: seededRng(1) })).toEqual([]);
  });
});

describe("séance : niveau par bloc", () => {
  const wall = pan((row) => (row % 6) + 1);

  it("chaque bloc vise son niveau", () => {
    const blocks = generateClassicSession(wall, { targetLevel: 2, blocksCount: 2, holdsPerBlock: 5, blockLevels: [2, 5], rng: seededRng(4) });
    expect(blocks[0].holds.every((h) => h.level >= 1 && h.level <= 3)).toBe(true);
    expect(blocks[1].holds.every((h) => h.level >= 4 && h.level <= 6)).toBe(true);
  });

  it("sans niveaux par bloc, rien ne change", () => {
    const a = generateClassicSession(wall, { targetLevel: 3, blocksCount: 3, holdsPerBlock: 6, rng: seededRng(9) });
    const b = generateClassicSession(wall, { targetLevel: 3, blocksCount: 3, holdsPerBlock: 6, blockLevels: [3, 3, 3], rng: seededRng(9) });
    expect(b).toEqual(a);
  });
});

describe("séance en cours", () => {
  const wall = pan((row, col) => ((row + col) % 6) + 1);
  const blocks = [blockOf(wall, ["A1", "B2", "C3"]), blockOf(wall, ["D4", "E5"])];

  it("note résultat et commentaire, et les efface", () => {
    let run = startRun(wall.id, blocks, panSettings);
    expect(runHasProgress(run)).toBe(false);
    run = setBlockResult(run, 1, "reussi");
    run = setBlockComment(run, 0, "  crux dur  ");
    expect(run.blocks[1].result).toBe("reussi");
    expect(run.blocks[0].comment).toBe("crux dur");
    expect(runHasProgress(run)).toBe(true);
    run = setBlockResult(run, 1, null);
    run = setBlockComment(run, 0, " ");
    expect("result" in run.blocks[1]).toBe(false);
    expect("comment" in run.blocks[0]).toBe(false);
    expect(setBlockResult(run, 5, "chute")).toBe(run);
  });

  it("une séance refaite repart sans résultats, avec ses commentaires", () => {
    const done = setBlockComment(markRated(setBlockResult(startRun(wall.id, blocks), 0, "reussi"), 0), 0, "pied gauche");
    const again = startRun(wall.id, done.blocks);
    expect(again.blocks[0]).not.toHaveProperty("result");
    expect(again.blocks[0]).not.toHaveProperty("rated");
    expect(again.blocks[0].comment).toBe("pied gauche");
  });

  it("ne touche pas aux blocs d'origine", () => {
    const run = setBlockResult(startRun(wall.id, blocks), 0, "chute");
    expect((blocks[0] as { result?: string }).result).toBeUndefined();
    expect(run.blocks[0].holds).toBe(blocks[0].holds);
  });

  it("recommencer efface les résultats, garde les commentaires", () => {
    let run = startRun(wall.id, blocks);
    run = markRated(setBlockComment(setBlockResult({ ...run, selected: 1 }, 0, "chute"), 0, "pied gauche"), 0);
    expect(run.blocks[0].rated).toBe(true);
    expect(setBlockResult(run, 0, null).blocks[0].rated).toBe(true);
    const again = restartRun(run);
    expect(again.id).not.toBe(run.id);
    expect(again.selected).toBe(0);
    expect(again.blocks[0].result).toBeUndefined();
    expect(again.blocks[0].rated).toBeUndefined();
    expect(again.blocks[0].comment).toBe("pied gauche");
  });

  it("modifier la séquence : ajout à la fin, retrait, cote recalculée", () => {
    const b = startRun(wall.id, blocks).blocks[0];
    const added = toggleBlockHold(wall, b, "F6");
    expect(added.holds.map((h) => h.id)).toEqual(["A1", "B2", "C3", "F6"]);
    expect(added.estimatedRating).toBe(estimateBlockRating(added.holds.map((h) => h.level)));
    const removed = toggleBlockHold(wall, added, "B2");
    expect(removed.holds.map((h) => h.id)).toEqual(["A1", "C3", "F6"]);
    // Prise inconnue ou inutilisable : rien ne change ; un bloc garde au moins une prise.
    expect(toggleBlockHold(wall, b, "Z9")).toBe(b);
    const one = { ...b, holds: [b.holds[0]] };
    expect(toggleBlockHold(wall, one, "A1")).toBe(one);
    const off = { ...wall, holds: wall.holds.map((h) => (h.id === "F6" ? { ...h, active: false } : h)) };
    expect(toggleBlockHold(off, b, "F6")).toBe(b);
  });

  it("une voie ne se modifie pas prise par prise", () => {
    const route = routeBlock({ id: "r1", name: "", color: "vert", grade: "5c", styles: [] }, 1300, null);
    expect(toggleBlockHold(wall, route, "A1")).toBe(route);
  });

  it("fin de séance → historique, le plus récent d'abord, limité", () => {
    const run = setBlockResult(startRun(wall.id, blocks, panSettings, "Force"), 0, "reussi");
    const record = endRun(run, wall.name, "Hugo", "2026-10-28T10:00:00.000Z");
    expect(record).toMatchObject({ wallName: "Pan maison", playerName: "Hugo", templateName: "Force", endedAt: "2026-10-28T10:00:00.000Z" });
    let lib = addToHistory(emptyLibrary(), record);
    lib = addToHistory(lib, { ...record, id: "autre" });
    expect(lib.history.map((s) => s.id)).toEqual(["autre", record.id]);
    lib = addToHistory(lib, record);
    expect(lib.history.map((s) => s.id)).toEqual([record.id, "autre"]);
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) lib = addToHistory(lib, { ...record, id: `s${i}` });
    expect(lib.history).toHaveLength(HISTORY_LIMIT);
    expect(runSummary(record.blocks)).toEqual({ done: 1, success: 1, total: 2 });
  });
});

describe("historique : filtres", () => {
  const wall = pan();
  const now = Date.parse("2026-10-28T12:00:00Z");
  const make = (id: string, daysAgo: number, wallName: string, comment?: string) => ({
    ...endRun(setBlockComment(startRun(wall.id, [blockOf(wall, ["A1", "B2"])]), 0, comment ?? ""), wallName, undefined, new Date(now - daysAgo * 86_400_000).toISOString()),
    id,
  });
  const history = [make("a", 1, "Pan maison", "Réglettes à l'épaule"), make("b", 10, "Salle Arkose"), make("c", 60, "Pan maison")];

  it("par période", () => {
    expect(filterHistory(history, { days: 7, search: "", now }).map((s) => s.id)).toEqual(["a"]);
    expect(filterHistory(history, { days: 30, search: "", now }).map((s) => s.id)).toEqual(["a", "b"]);
    expect(filterHistory(history, { days: null, search: "", now })).toHaveLength(3);
  });

  it("par recherche, sans accents ni casse, tous les mots", () => {
    expect(filterHistory(history, { days: null, search: "reglettes", now }).map((s) => s.id)).toEqual(["a"]);
    expect(filterHistory(history, { days: null, search: "pan B2", now }).map((s) => s.id)).toEqual(["a", "c"]);
    expect(filterHistory(history, { days: null, search: "arkose maison", now })).toHaveLength(0);
  });
});

describe("favoris", () => {
  const wall = pan((row) => (row % 6) + 1);

  it("pas de doublon, et un résultat de séance n'y entre pas", () => {
    const b = { ...blockOf(wall, ["A1", "B2"]), result: "reussi", comment: "x", rated: true } as Block;
    let { lib, added } = addFavorite(emptyLibrary(), wall.id, b, "Bloc 1");
    expect(added).toBe(true);
    expect(lib.favorites[0].block).not.toHaveProperty("result");
    expect(lib.favorites[0].block).not.toHaveProperty("comment");
    expect(lib.favorites[0].block).not.toHaveProperty("rated");
    ({ lib, added } = addFavorite(lib, wall.id, blockOf(wall, ["A1", "B2"]), "encore"));
    expect(added).toBe(false);
    expect(isFavorite(lib, wall.id, blockOf(wall, ["A1", "B2"]))).toBe(true);
    expect(isFavorite(lib, wall.id, blockOf(wall, ["B2", "A1"]))).toBe(false);
    expect(isFavorite(lib, "autre-mur", blockOf(wall, ["A1", "B2"]))).toBe(false);
  });

  it("titre et commentaire", () => {
    const { lib } = addFavorite(emptyLibrary(), wall.id, blockOf(wall, ["A1"]), "Bloc", "à refaire");
    const id = lib.favorites[0].id;
    expect(updateFavorite(lib, id, { title: "  ", comment: "" }).favorites[0]).toMatchObject({ title: "Bloc" });
    expect(updateFavorite(lib, id, { comment: "" }).favorites[0]).not.toHaveProperty("comment");
    expect(updateFavorite(lib, id, { title: "Mon bloc" }).favorites[0]).toMatchObject({ title: "Mon bloc", comment: "à refaire" });
  });

  it("remis à jour du pan : niveaux actuels, null si une prise a disparu", () => {
    const b = blockOf(wall, ["A1", "B2"]);
    const harder = { ...wall, holds: wall.holds.map((h) => (h.id === "A1" ? { ...h, level: 6 } : h)) };
    const fresh = refreshBlock(harder, b)!;
    expect(fresh.holds[0].level).toBe(6);
    expect(fresh.estimatedRating).toBe(estimateBlockRating([6, 2]));
    expect(refreshBlock({ ...wall, holds: wall.holds.filter((h) => h.id !== "B2") }, b)).toBeNull();
    expect(refreshBlock({ ...wall, holds: wall.holds.map((h) => (h.id === "B2" ? { ...h, active: false } : h)) }, b)).toBeNull();
  });

  it("une voie démontée n'est plus proposée", () => {
    const route = { id: "r1", name: "", color: "vert", grade: "5c", styles: [] };
    const gym: Wall = { ...createEmptyWall("salle", "Salle", 1, 1), kind: "voies", routes: [route] };
    const b = routeBlock(route, 1300, null);
    expect(refreshBlock(gym, b)?.route?.grade).toBe("5c");
    expect(refreshBlock({ ...gym, routes: [{ ...route, grade: "6a" }] }, b)?.route?.grade).toBe("6a");
    expect(refreshBlock({ ...gym, routes: [{ ...route, archived: true }] }, b)).toBeNull();
  });
});

describe("modèles", () => {
  it("même nom : remplacé ; autre type de mur : à part", () => {
    let lib = saveTemplate(emptyLibrary(), "Force", panSettings);
    lib = saveTemplate(lib, " Force ", { ...panSettings, level: 5 });
    expect(lib.templates).toHaveLength(1);
    expect(lib.templates[0].settings).toMatchObject({ level: 5 });
    lib = saveTemplate(lib, "Force", { kind: "voies", target: 1500, pattern: "pyramide", count: 6, variants: null });
    expect(lib.templates).toHaveLength(2);
    expect(saveTemplate(lib, "  ", panSettings)).toBe(lib);
  });

  it("renommer : refusé si le nom est pris par un modèle du même type", () => {
    let lib = saveTemplate(saveTemplate(emptyLibrary(), "A", panSettings), "B", panSettings);
    lib = saveTemplate(lib, "C", { kind: "voies", target: 1500, pattern: "pyramide", count: 6, variants: null });
    const [a] = lib.templates;
    expect(renameTemplate(lib, a.id, "B")).toBe(lib);
    expect(renameTemplate(lib, a.id, " ")).toBe(lib);
    expect(renameTemplate(lib, a.id, "C").templates[0].name).toBe("C");
  });

  it("décrit ses réglages", () => {
    expect(settingsText({ ...panSettings, requiredTags: ["réglette"], excludedTags: ["mono"] })).toBe(
      "Modéré · Uniforme · 3 bloc(s) de 4 prises · variété · types : réglette · sans : mono",
    );
    expect(settingsText({ kind: "voies", target: 1500, pattern: "pyramide", count: 6, variants: null })).toBe("6 voie(s) autour de 1500 · Pyramide · sans variantes");
  });
});

describe("Brlok desktop", () => {
  const wall = pan((row) => (row % 5) + 1);

  it("reconnaît ses fichiers", () => {
    expect(desktopFileKind(desktopFavorites)).toBe("favoris");
    expect(desktopFileKind(desktopTemplates)).toBe("modeles");
    expect(desktopFileKind({ blocks: [], constraints: {} })).toBeNull();
    expect(desktopFileKind({ catalogs: [] })).toBeNull();
    expect(desktopFileKind(null)).toBeNull();
  });

  it("importe les favoris du dépôt sur le pan", () => {
    const { blocks, skipped } = importDesktopFavorites(desktopFavorites, wall);
    expect(skipped).toBe(0);
    expect(blocks).toHaveLength(desktopFavorites.blocks.length);
    expect(blocks[0].block.holds.map((h) => h.id)).toEqual(desktopFavorites.blocks[0].holds.map((h) => h.id));
    // Niveaux du pan actuel, pas ceux du fichier.
    expect(blocks[0].block.holds[0].level).toBe(wall.holds.find((h) => h.id === blocks[0].block.holds[0].id)!.level);
    const small = { ...wall, holds: wall.holds.filter((h) => h.id !== desktopFavorites.blocks[0].holds[0].id) };
    expect(importDesktopFavorites(desktopFavorites, small).skipped).toBe(1);
  });

  it("lit aussi le fichier de données de Brlok desktop (favoris par catalogue)", () => {
    const blocks = desktopFavorites.blocks;
    const v2 = { version: 2, by_catalog: { autre: [{ holds: [{ id: "ZZ9" }] }], [wall.id]: blocks } };
    expect(desktopFileKind(v2)).toBe("favoris");
    expect(importDesktopFavorites(v2, wall).blocks).toHaveLength(blocks.length);
    // Pan d'un autre identifiant : tous les catalogues, prises inconnues écartées.
    const other = { ...wall, id: "ailleurs" };
    const r = importDesktopFavorites(v2, other);
    expect(r.blocks).toHaveLength(blocks.length);
    expect(r.skipped).toBe(1);
  });

  it("importe les modèles du dépôt", () => {
    const templates = importDesktopTemplates(desktopTemplates);
    expect(templates.map((t) => t.name)).toEqual(desktopTemplates.templates.map((t) => t.name));
    expect(templates[1].settings).toMatchObject({ kind: "pan", level: 4, pattern: "progressive", blocks: 5, holds: 12 });
    expect(templates[1].timer?.config).toEqual({ mode: "fixe", workS: 50, restS: 28, rounds: 3 });
    let { lib, added } = mergeTemplates(emptyLibrary(), templates);
    expect(added).toBe(2);
    ({ lib, added } = mergeTemplates(lib, importDesktopTemplates(desktopTemplates)));
    expect(added).toBe(0);
    expect(lib.templates).toHaveLength(2);
  });

  it("garde des niveaux différents bloc par bloc", () => {
    const [t] = importDesktopTemplates({
      templates: [{ name: "Mix", blocks_count: 3, holds_per_block: 6, distribution_pattern: "inconnue", blocks_config: [{ level: "facile" }, { level: 5 }, { level: "difficile" }] }],
    });
    expect(t.settings).toMatchObject({ level: 2, pattern: "uniforme", blockLevels: [2, 5, 4] });
  });

  it("exporte les favoris au format desktop (niveau 5 au plus)", () => {
    const six = pan(() => 6);
    let { lib } = addFavorite(emptyLibrary(), six.id, blockOf(six, ["A1", "B2"]), "Dur", "note");
    ({ lib } = addFavorite(lib, "autre", blockOf(six, ["C3"]), "Ailleurs"));
    const out = exportDesktopFavorites(lib.favorites, six.id, "2026-10-28T00:00:00Z");
    expect(out.blocks).toHaveLength(1);
    expect(out.blocks[0]).toMatchObject({ comment: "note", title: "Dur", foot_positions: [] });
    expect(out.blocks[0].holds.every((h) => h.level === 5)).toBe(true);
    // Relu par l'import : même séquence.
    expect(importDesktopFavorites(out, six).blocks[0].block.holds.map((h) => h.id)).toEqual(["A1", "B2"]);
  });
});

describe("stockage", () => {
  it("relit une bibliothèque abîmée sans planter", () => {
    expect(normalizeLibrary(undefined)).toEqual(emptyLibrary());
    expect(normalizeLibrary({ favorites: "x", templates: [{}], history: [null], current: { blocks: "x" } })).toEqual(emptyLibrary());
  });
});

describe("export de séance", () => {
  const wall = pan((row) => (row % 6) + 1);
  let run = startRun(wall.id, [blockOf(wall, ["A1", "B2", "C3"])], { ...panSettings, requiredTags: ["réglette"] });
  run = setBlockComment(setBlockResult(run, 0, "reussi"), 0, "*propre*");
  const doc = endRun(run, "Pan maison", "Hugo", "2026-10-28T10:00:00.000Z");

  it("texte et Markdown", () => {
    const text = sessionText(doc);
    expect(text).toContain("Mur : Pan maison");
    expect(text).toContain("1. A1  2. B2  3. C3");
    expect(text).toContain("Résultat : réussi");
    expect(text).toContain("# *propre*");
    const markdown = sessionMarkdown(doc);
    expect(markdown).toContain("## Bloc 1 · A1 → B2 → C3");
    expect(markdown).toContain("*\\*propre\\**");
  });

  it("JSON au format desktop pour un pan", () => {
    const data = JSON.parse(sessionJson(doc));
    expect(data.blocks[0].holds.map((h: { id: string }) => h.id)).toEqual(["A1", "B2", "C3"]);
    expect(data.constraints).toMatchObject({ target_level: 3, required_tags: ["réglette"], variety: true, enchainements: 4 });
    expect(data.brlok_web.wallName).toBe("Pan maison");
  });

  it("nom de fichier", () => {
    expect(sessionFileName({ ...doc, wallName: "Salle d'Arkose !" }, "md")).toBe("seance-2026-10-28-salle-d-arkose.md");
  });
});
