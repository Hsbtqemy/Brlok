# Spécifications projet Brlok — Document pour ChatGPT

> Ce document permet à un assistant IA (ChatGPT, etc.) de comprendre la structure et le contenu du projet Brlok pour aider au développement ou à la maintenance.

---

## 1. Vue d’ensemble

**Brlok** est une application d’entraînement bloc et pan d’escalade. Elle permet de :
- Gérer un catalogue de prises (positions, niveau, tags)
- Générer des séances d’entraînement (blocs = séquences ordonnées de prises)
- Visualiser le pan et les blocs en séance
- Exporter en TXT, Markdown, JSON, PDF
- Utiliser des templates (40/20, pyramides, EMOM), un timer et enregistrer les meilleurs temps

**Stack :** Python 3.8+, PySide6, Typer, Pydantic, odfpy, reportlab.

**Point d’entrée :**
- `python -m brlok` ou `brlok` sans args → **GUI**
- `brlok generate`, `brlok catalog list`, etc. → **CLI**

---

## 2. Structure du projet

```
brlok/
├── pyproject.toml           # Dépendances, script brlok
├── README.md
├── brlok/                   # Package principal
│   ├── __init__.py
│   ├── __main__.py          # python -m brlok
│   ├── main.py              # Détection GUI vs CLI
│   │
│   ├── models/              # Modèles Pydantic (sans dépendance UI)
│   │   ├── hold.py          # Hold, Position
│   │   ├── block.py         # Block
│   │   ├── catalog.py       # Catalog, GridDimensions
│   │   ├── session.py       # Session, SessionConstraints
│   │   ├── catalog_collection.py  # CatalogCollection, CatalogEntry (multi-pan)
│   │   ├── session_template.py    # SessionTemplate, BlockConfig
│   │   └── session_history.py     # CompletedSession
│   │
│   ├── generator/           # Logique de génération (sans PySide)
│   │   └── session_generator.py   # generate_session()
│   │
│   ├── exports/             # Export TXT, MD, JSON, PDF
│   │   └── exporters.py
│   │
│   ├── cli/                 # Commandes Typer
│   │   └── commands.py
│   │
│   ├── gui/                 # Interface PySide6
│   │   ├── main_window.py
│   │   ├── catalog_widget.py
│   │   ├── session_widget.py
│   │   ├── pan_widget.py
│   │   ├── favorites_widget.py
│   │   ├── history_widget.py
│   │   ├── generate_dialog.py
│   │   ├── timer_widget.py
│   │   └── colors.py
│   │
│   ├── storage/             # Persistance JSON
│   │   ├── catalog_store.py
│   │   ├── catalog_collection_store.py
│   │   ├── catalog_ops.py
│   │   ├── favorites_store.py
│   │   ├── history_store.py
│   │   ├── templates_store.py
│   │   ├── best_times_store.py
│   │   └── import_ods.py
│   │
│   └── config/
│       └── paths.py         # Chemins XDG
│
├── tests/
│   ├── test_models/
│   ├── test_generator/
│   ├── test_exports/
│   ├── test_storage/
│   ├── test_cli/
│   └── test_gui/
│
└── _bmad-output/            # Artefacts planning (epics, stories)
```

---

## 3. Modèles de données (Pydantic)

### Hold (prise)
- `id` : str (ex. A1, C7)
- `level` : int 1–5 (difficulté)
- `tags` : list[str] (liste ouverte)
- `position` : Position(row, col)
- `active` : bool (utilisable ou non)

### Block (bloc)
- `holds` : list[Hold] (séquence ordonnée)
- `comment` : str | None

### Catalog (catalogue)
- `holds` : list[Hold]
- `grid` : GridDimensions(rows, cols)
- Validateur : positions dans la grille, ids uniques

### Session (séance)
- `blocks` : list[Block]
- `constraints` : SessionConstraints

### SessionConstraints
- `target_level` : int | None (1–5)
- `required_tags` : list[str]
- `excluded_tags` : list[str]
- `variety` : bool
- `enchainements` : int | None (prises par bloc)

### SessionTemplate
- `id`, `name`
- `blocks_config` : list[BlockConfig] (level, work_s, rest_s, rounds)
- `blocks_count`, `holds_per_block`

### CatalogCollection (multi-pan)
- `catalogs` : list[CatalogEntry]
- `active_id` : str

---

## 4. Génération de séances

**Fonction principale :** `brlok.generator.generate_session()`

**Paramètres :**
- `catalog`, `target_level`
- `blocks_count`, `holds_per_block` (ou `enchainements`)
- `required_tags`, `excluded_tags` (forcer / filtrer)
- `variety` : évite les répétitions (FR8)
- `favorite_blocks` : injectés en tête
- `seed` : reproductibilité

**Logique :**
1. Exclure prises inactives
2. Filtrer par niveau (target_level ± tolerance)
3. Filtrer par tags (required, excluded)
4. Chevauchement required/excluded → session vide
5. Générer blocs (random.sample ou variety avec poids)

---

## 5. Persistance (XDG)

**Répertoire :** `~/.local/share/brlok/` (Linux), `~/Library/Application Support/brlok/` (macOS), `%APPDATA%\brlok\` (Windows)

**Fichiers :**
- `catalog_collection.json` — catalogues multi-pan
- `favorites.json` — blocs favoris
- `sessions_history.json` — historique des séances
- `templates.json` — templates de séance
- `best_times.json` — meilleurs temps par séquence

**Conventions JSON :** snake_case, champ `version`, dates ISO 8601

---

## 6. CLI (Typer)

**Commande racine :** `brlok` (script installé via pyproject)

| Sous-commande | Description |
|---------------|-------------|
| `generate` | Génère une séance (`--level`, `--blocks`, `--template`, `--tags`, `--exclude-tags`, `--variety`, `-o`) |
| `catalog import <ods>` | Import catalogue depuis ODS |
| `catalog catalogs` | Liste les catalogues |
| `catalog use <name>` | Sélectionne le catalogue actif |
| `catalog list` | Liste les prises |
| `catalog edit <hold_id>` | Modifie niveau, tags, active |
| `favorites list` | Liste les favoris |
| `export txt|md|json|pdf <input> -o <output>` | Exporte une séance |
| `history list` | Liste l’historique |
| `history show <id>` | Détail d’une séance |
| `best-times list` | Meilleurs temps |
| `template list` | Liste les templates |
| `template remove <name>` | Supprime un template |
| `template rename <name> <new>` | Renomme un template |

---

## 7. GUI (PySide6)

**Entrée :** `BrlokMainWindow` (tabs : Séance, Catalogue, Favoris, Historique)

**Widgets principaux :**
- `CatalogWidget` : grille pan, liste prises, édition (double-clic)
- `SessionWidget` : pan + panneau séquence, timer 40/20, navigation blocs, favoris, export
- `PanWidget` : affichage grille avec prises (positions, couleurs par niveau)
- `IntervalTimerWidget` : 40/20, pyramides, EMOM, son + flash
- `GenerateSessionDialog` : niveau, blocs, enchainements, template

**Flux :**
1. Catalogue chargé au démarrage (catalog_collection)
2. Génération via dialogue → Session injectée dans SessionWidget
3. Timer : paramètres du template propagés si utilisé
4. Fin de séance → historique

---

## 8. Conventions de code

- **Python :** snake_case (fonctions, variables), PascalCase (classes)
- **JSON :** snake_case
- **Encodage :** UTF-8
- **Tests :** pytest, `tests/` à la racine

**Règles :**
- Logique métier hors de `gui/`
- `generator` et `exports` sans dépendance PySide
- Validation Pydantic à la lecture/écriture des JSON

---

## 9. Tests

```bash
pytest
```

**Structure :** `tests/test_models/`, `test_generator/`, `test_exports/`, `test_storage/`, `test_cli/`, `test_gui/`

**Convention :** `test_*.py`, fixtures dans `conftest.py`

---

## 10. Exports disponibles

- **TXT** : texte lisible (FR18)
- **Markdown** : structure MD (FR19)
- **JSON** : session autonome, rechargement (FR20)
- **PDF** : reportlab (FR41)

---

## 11. État fonctionnel (fév. 2026)

| Epic | Statut |
|------|--------|
| 1. Catalogue | ✅ done |
| 2. Génération | ✅ done |
| 3. Vue séance | ✅ done |
| 4. Favoris | ✅ done |
| 5. Export | ✅ done |
| 6. UX | ✅ done |
| 7. Données (multi-pan, historique, etc.) | ✅ done |
| 8. Avancé (template, timer, meilleur temps) | ✅ done |

---

## 12. Fichiers clés à connaître

| Fichier | Rôle |
|---------|------|
| `brlok/main.py` | Point d’entrée, détection GUI/CLI |
| `brlok/generator/session_generator.py` | Moteur de génération |
| `brlok/cli/commands.py` | Toutes les commandes CLI |
| `brlok/gui/main_window.py` | Fenêtre principale |
| `brlok/gui/session_widget.py` | Vue séance, timer, export |
| `brlok/config/paths.py` | Chemins XDG |
| `brlok/storage/catalog_collection_store.py` | Multi-pan |
