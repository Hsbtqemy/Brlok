/**
 * Export d'une séance (parité avec Brlok desktop) : texte, Markdown, JSON. Le PDF passe par l'impression
 * du navigateur (« Enregistrer en PDF »), à partir des mêmes lignes.
 */
import { FOOT_RULES } from "./feet";
import { blockLabel, desktopSession, runSummary, settingsText, type SessionBlock, type SessionSettings } from "./library";
import { variantText } from "./gym";

export interface SessionDoc {
  wallName: string;
  startedAt: string;
  endedAt?: string;
  settings?: SessionSettings;
  templateName?: string;
  playerName?: string;
  blocks: SessionBlock[];
}

const RESULT_TEXT = { reussi: "réussi", chute: "chute" } as const;

const dateText = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** En-tête : mur, date, réglages, bilan. */
export function headerLines(doc: SessionDoc): string[] {
  const s = runSummary(doc.blocks);
  return [
    `Mur : ${doc.wallName}`,
    `Date : ${dateText(doc.endedAt ?? doc.startedAt)}`,
    ...(doc.playerName ? [`Grimpeur : ${doc.playerName}`] : []),
    ...(doc.templateName ? [`Modèle : ${doc.templateName}`] : []),
    ...(doc.settings ? [`Réglages : ${settingsText(doc.settings)}`] : []),
    ...(s.done ? [`Bilan : ${s.success} réussi(s) sur ${s.done} bloc(s) tenté(s), ${s.total} au programme`] : []),
  ];
}

/** Détail d'un bloc : prises dans l'ordre, ou voie, variante, pieds. */
export function blockLines(block: SessionBlock): string[] {
  const lines: string[] = [];
  if (block.route) {
    lines.push(`${block.route.label} (${block.route.grade})`);
    if (block.route.variant) {
      const v = variantText(block.route.variant, block.route.variantHold);
      if (v) lines.push(`Variante : ${v.label} — ${v.description}`);
    }
  } else {
    lines.push(block.holds.map((h, i) => `${i + 1}. ${h.id}`).join("  "));
  }
  if (block.feet) lines.push(`Pieds : ${FOOT_RULES.find((r) => r.id === block.feet)?.label ?? block.feet}`);
  lines.push(`Cote estimée : ${block.estimatedRating}`);
  if (block.result) lines.push(`Résultat : ${RESULT_TEXT[block.result]}`);
  return lines;
}

export function sessionText(doc: SessionDoc): string {
  const lines = ["Séance d'entraînement Brlok", "=".repeat(40), ...headerLines(doc), ""];
  doc.blocks.forEach((b, i) => {
    lines.push(`${b.route ? "Voie" : "Bloc"} ${i + 1} :`);
    for (const l of blockLines(b)) lines.push(`  ${l}`);
    if (b.comment) lines.push(`  # ${b.comment}`);
    lines.push("");
  });
  return lines.join("\n");
}

const md = (text: string) => text.replace(/([\\`*_[\]#|])/g, "\\$1");

export function sessionMarkdown(doc: SessionDoc): string {
  const lines = ["# Séance d'entraînement Brlok", "", ...headerLines(doc).map((l) => `- ${md(l)}`), ""];
  doc.blocks.forEach((b, i) => {
    lines.push(`## ${b.route ? "Voie" : "Bloc"} ${i + 1} · ${md(blockLabel(b))}`, "");
    for (const l of blockLines(b)) lines.push(`- ${md(l)}`);
    if (b.comment) lines.push("", `*${md(b.comment)}*`);
    lines.push("");
  });
  return lines.join("\n");
}

/** JSON : au format de Brlok desktop pour un pan (rechargeable par sa ligne de commande), complet sinon. */
export function sessionJson(doc: SessionDoc): string {
  const isPan = doc.blocks.length > 0 && doc.blocks.every((b) => !b.route);
  const data = isPan ? { ...desktopSession(doc.blocks, doc.settings), brlok_web: doc } : { app: "brlok-web", seance: doc };
  return JSON.stringify(data, null, 2);
}

/** Nom de fichier : « seance-2026-10-28-pan-maison ». */
export function sessionFileName(doc: SessionDoc, extension: string): string {
  const day = (doc.endedAt ?? doc.startedAt).slice(0, 10);
  const wall = doc.wallName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `seance-${day}${wall ? `-${wall}` : ""}.${extension}`;
}
