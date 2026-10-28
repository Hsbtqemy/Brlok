/**
 * Disposition à deux sur un même écran : côte à côte (un seul sens), tour à tour (l'échiquier se tourne
 * vers le joueur qui a la main), face à face (tablette à plat entre les joueurs : pièces et panneaux
 * tournés vers chacun). Elle se change aussi en cours de partie.
 */
export type Layout = "cote" | "tour" | "face";

export const LAYOUTS: { id: Layout; label: string; hint: string }[] = [
  { id: "cote", label: "Côte à côte", hint: "Un seul sens d'échiquier, « Retourner » à la main." },
  { id: "tour", label: "Tour à tour", hint: "L'échiquier se tourne vers celui qui joue : pour se passer la tablette." },
  { id: "face", label: "Face à face", hint: "Tablette à plat entre vous : les pièces et la bande de chacun sont tournées vers lui." },
];
