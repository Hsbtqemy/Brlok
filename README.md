# Brlok

Application d'entraînement bloc et pan - génération de séances.

## État du projet (fév. 2026)

| Epic | Statut | Notes |
|------|--------|-------|
| 1. Catalogue | ✅ done | Modèles, persistance, import ODS |
| 2. Génération | ✅ done | Contraintes niveau, tags, variété |
| 3. Vue séance | ✅ done | Pan, séquence, navigation |
| 4. Favoris | ✅ done | Ajout, liste, réutilisation |
| 5. Export | ✅ done | TXT, MD, JSON, PDF |
| 6. UX | ✅ done | Ratio grille, couleurs, panneau séquence |
| 7. Données | ✅ done | Multi-pan, commentaires, historique, modification séquence |
| 8. Avancé | ✅ done | Template, timer 40/20, meilleur temps |

**Dernières modifications :** CRUD templates (remove, rename), timer pyramides/EMOM + son, pause entre blocs ; CLI `brlok template remove`, `brlok template rename`.

## Installation

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

Pour exécuter les tests : `pytest`

## Données (XDG)

Stockage dans `~/.local/share/brlok/` (Linux), `~/Library/Application Support/brlok/` (macOS), `%APPDATA%\brlok\` (Windows) :

- **catalog_collection.json** — catalogues multi-pan (Epic 7.1)
- **favorites.json** — blocs favoris
- **sessions_history.json** — historique des séances (Epic 7.4)
- **session_templates.json** — templates de séance (Epic 8.1)
- **best_times.json** — meilleurs temps par séquence (Epic 8.2)

## Usage

- **GUI** : `python -m brlok`
- **CLI** : `brlok generate --help`, `brlok generate --template "40/20 classique"`, `brlok template list`, `brlok template remove`, `brlok template rename`, `brlok catalog catalogs`, `brlok history list`, `brlok best-times list`
