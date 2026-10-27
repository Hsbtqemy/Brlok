# Brlok web · Chesscalade

Version web de Brlok, qui accueille le mode **Chesscalade** (règles : [`docs/chesscalade/REGLES.md`](../docs/chesscalade/REGLES.md)).
Elle **coexiste** avec Brlok desktop (Python/PySide6, dossier `brlok/`) : même format de catalogue JSON,
import et export dans les deux sens. Cible à terme : application Tauri.

**Stack :** TypeScript, Svelte 5, Vite, Vitest. Tout tourne dans le navigateur, sans serveur.

## Lancer

```bash
cd web
npm install
npm run dev       # http://localhost:5173
npm test          # tests du cœur (src/core)
npm run check     # vérification TypeScript / Svelte
npm run build     # version statique dans dist/
npm run build:single   # une seule page HTML autonome dans dist-single/ (tablette, page partagée)
node scripts/artifact-page.mjs <sortie.html>   # adapte dist-single pour une page claude.ai
```

Sur une tablette, sans serveur : ouvrir la page autonome, ou lancer `npm run dev -- --host` sur un
ordinateur du même réseau et ouvrir l'adresse affichée.

## Organisation

| Dossier | Contenu |
|---|---|
| `src/core/` | Logique sans interface : modèle de mur générique, import/export Brlok, générateurs, Glicko-2 |
| `src/lib/` | Composants et utilitaires d'interface |
| `src/App.svelte` | Navigation entre les écrans Pan, Partie, Joueurs |
| `public/engine/` | Stockfish.js 19 « lite » (GPLv3, voir son README) |

## État (v0.2)

- [x] Modèle de mur générique (grille de taille quelconque, niveaux 1–6, portée, enchaînements interdits)
- [x] Import de `catalog_collection.json` (la « grille pieds », en fait la poutre, n'est pas fusionnée par défaut)
- [x] Export vers Brlok desktop (niveau 6 ramené à 5)
- [x] Générateur Brlok classique (port du générateur Python, répartitions comprises)
- [x] Générateur de blocs-défis Chesscalade (caractère des pièces, cote visée, crux en dernier, assouplissements)
- [x] Glicko-2 (vérifié sur l'exemple de Glickman)
- [x] Minuteur (travail/repos 40/20, pyramide, EMOM, chrono et meilleurs temps), grand écran, enchaînement des blocs
- [ ] Favoris et templates de séance (parité avec Brlok desktop)
- [x] Profils de joueurs, trois cotes (grimpe, échecs, Chesscalade), cote des blocs, journal
- [x] Partie Chesscalade en duo, famille D « intrication » : pendule verticale, recharges, coups en suspens,
      verdicts V0–V6, déviation courte/libre, parade, bloc du mat, fatigue, garde-fous §6
- [x] Placement (5 blocs adaptatifs pour fixer la cote de grimpe de départ)
- [x] Stockage partagé quand l'app tourne comme page claude.ai (capacité `db`)
- [x] Solo contre Stockfish (force 400–2800), blocs de défense, contre-attaque
- [x] Partie en cours sauvegardée à chaque action, reprise après rechargement ou sur un autre appareil
- [x] Familles A et B : rounds d'échecs et de mur, duels « Ajoute une prise », « Même bloc », « Bloc imposé »,
      KO, points, bonus et joker (à deux)
- [x] Rounds en solo contre Stockfish (objectifs au mur : bloc progressif, bloc cible, bloc imposé)
- [x] Famille C (intrication rythmée) : cloche toutes les 4 / 8 min de jeu
- [x] Règles de pieds (libres, sur prises, pieds = mains, un mouvement sans pied)
- [x] Pan express (une prise par case, niveau moyen) et peinture rapide des niveaux
- [x] Éditeur de pan (niveaux, types, prises inutilisables, enchaînements impossibles, taille, nouveau pan)
- [x] Mode salle : mur à voies, photo du secteur, détection des prises par couleur, voies choisies selon la
      cote et le style de la pièce (voir [`docs/chesscalade/MURS.md`](../docs/chesscalade/MURS.md))
- [x] Brlok en salle : séance de voies (répartitions Brlok), carnet de voies, pièce facultative
- [ ] Pan en photo (attend une photo avec les 4 coins visibles)
