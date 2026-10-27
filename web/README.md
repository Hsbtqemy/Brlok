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
```

## Organisation

| Dossier | Contenu |
|---|---|
| `src/core/` | Logique sans interface : modèle de mur générique, import/export Brlok, générateurs, Glicko-2 |
| `src/lib/` | Composants et utilitaires d'interface |
| `src/App.svelte` | Écran principal |

## État (v0.1)

- [x] Modèle de mur générique (grille de taille quelconque, niveaux 1–6, portée, enchaînements interdits)
- [x] Import de `catalog_collection.json` avec fusion de la grille pieds (niveau max gardé)
- [x] Export vers Brlok desktop (niveau 6 ramené à 5)
- [x] Générateur Brlok classique (port du générateur Python, répartitions comprises)
- [x] Générateur de blocs-défis Chesscalade (caractère des pièces, cote visée, crux en dernier, assouplissements)
- [x] Glicko-2 (vérifié sur l'exemple de Glickman)
- [ ] Timer, journal, favoris, templates (parité avec Brlok desktop)
- [ ] Profils de joueurs et cotes enregistrées
- [ ] Plateau d'échecs et partie Chesscalade
