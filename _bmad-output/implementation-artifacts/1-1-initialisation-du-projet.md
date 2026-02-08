# Story 1.1: Initialisation du projet

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a développeur,
I want une structure de projet opérationnelle avec environnement virtuel et dépendances,
so that je peux développer Brlok avec Python, PySide6, Typer et Pydantic.

## Acceptance Criteria

1. **Given** un répertoire projet vide
   **When** je crée l'environnement avec `python -m venv .venv` et installe les dépendances
   **Then** pyproject.toml contient pyside6, typer, pydantic
   **And** la structure brlok/ existe avec models/, generator/, exports/, cli/, gui/, storage/, config/
   **And** `python -m brlok` ouvre une fenêtre vide (point d'entrée GUI)
   **And** `brlok generate --help` affiche l'aide CLI (sous-commandes Typer)

## Tasks / Subtasks

- [x] Task 1 (AC: #1)
  - [x] Créer `python -m venv .venv` et activer
  - [x] Créer pyproject.toml avec dépendances pyside6, typer, pydantic
  - [x] Installer les dépendances via pip
- [x] Task 2 (AC: #2)
  - [x] Créer la structure brlok/ avec sous-dossiers models/, generator/, exports/, cli/, gui/, storage/, config/
  - [x] Ajouter __init__.py dans chaque package
- [x] Task 3 (AC: #3)
  - [x] Créer main.py point d'entrée GUI (fenêtre vide PySide6)
  - [x] Configurer le point d'entrée dans pyproject.toml pour `python -m brlok`
- [x] Task 4 (AC: #4)
  - [x] Créer structure CLI Typer dans cli/
  - [x] Exposer sous-commande `generate` avec --help
  - [x] Configurer l'entrée CLI `brlok` pour les sous-commandes

### Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] Créer .gitignore à la racine (architecture.md requiert) [architecture.md:290]
- [x] [AI-Review][MEDIUM] Initialiser dépôt Git pour versioning du code
- [x] [AI-Review][MEDIUM] Compléter README : mentionner `pip install -e ".[dev]"` pour exécuter les tests [README.md]
- [x] [AI-Review][LOW] Éviter duplication version : __version__ dans brlok/__init__.py vs pyproject.toml [brlok/__init__.py:4, pyproject.toml:7]
- [x] [AI-Review][LOW] Rendre la condition GUI/CLI plus robuste (len(sys.argv) <= 3 fragile) [brlok/main.py:10]

## Dev Notes

### Architecture Compliance

- **Stack** : Python 3.8+, PySide6 (QtWidgets), Typer, Pydantic
- **Structure** : Suivre exactement l'arborescence définie dans [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- **Entry point** : Sans argument → GUI ; avec sous-commande (ex. `generate`) → CLI
- **Séparation** : models/, generator/, exports/ sans dépendance PySide ; gui/ pour les vues

### Technical Requirements

- **Python** : 3.8 minimum (architecture : 3.8+)
- **Dépendances** : pyside6, typer, pydantic (versions récentes stables)
- **Build** : pip / venv — pas de build complexe
- **Encodage** : UTF-8 pour tous les fichiers

### Library & Framework Requirements

| Package | Version | Usage |
|---------|---------|-------|
| PySide6 | ≥6.6 | GUI QtWidgets |
| Typer | ≥0.9 | CLI avec sous-commandes |
| Pydantic | ≥2.0 | Validation des données (à venir dans story 1.2) |

### File Structure Requirements

```
brlok/
├── pyproject.toml
├── brlok/
│   ├── __init__.py
│   ├── main.py           # point d'entrée (GUI par défaut si pas d'args)
│   ├── models/           # (vide pour l'instant)
│   ├── generator/
│   ├── exports/
│   ├── cli/              # Typer : generate, export, etc.
│   ├── gui/              # PySide6 fenêtre vide
│   ├── storage/
│   └── config/
└── tests/
    ├── __init__.py
    └── conftest.py
```

- **models/** : créer le dossier vide avec __init__.py (modèles Pydantic en story 1.2)
- **main.py** : détecter les args ; si aucun → ouvrir GUI ; si args → délégation CLI
- **cli/commands.py** : Typer app avec `generate` comme sous-commande

### Testing Requirements

- Créer structure tests/ avec conftest.py (pytest)
- Pas de tests unitaires métier pour cette story (juste bootstrap)
- Vérifier manuellement : `python -m brlok` → fenêtre ; `brlok generate --help` → aide

### Project Structure Notes

- Alignement avec [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure]
- Pas de modèles de données dans cette story ; structure minimale pour permettre le démarrage

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Starter Template Evaluation]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Handoff]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- venv .venv créé, pyproject.toml avec pyside6≥6.6, typer≥0.9, pydantic≥2.0
- Structure brlok/ créée : models/, generator/, exports/, cli/, gui/, storage/, config/ + __init__.py
- main.py : détection args (≤3 → GUI PySide6 fenêtre vide, >3 → CLI Typer)
- __main__.py pour `python -m brlok`
- cli/commands.py : Typer app avec sous-commande generate
- tests/bootstrap : 4 tests (import, CLI generate --help)
- Vérification manuelle : `python -m brlok` → fenêtre ; `brlok generate --help` → aide ✓
- Review follow-ups : .gitignore, git init, README pip install -e ".[dev]", __version__ via importlib.metadata, _has_cli_args()

### File List

- .gitignore
- pyproject.toml
- README.md
- brlok/__init__.py
- brlok/__main__.py
- brlok/main.py
- brlok/models/__init__.py
- brlok/generator/__init__.py
- brlok/exports/__init__.py
- brlok/cli/__init__.py
- brlok/cli/commands.py
- brlok/gui/__init__.py
- brlok/storage/__init__.py
- brlok/config/__init__.py
- tests/__init__.py
- tests/conftest.py
- tests/test_bootstrap.py
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-02-08 : Story 1.1 implémentée — initialisation projet complète (venv, structure, GUI, CLI)
- 2026-02-08 : Code review (AI) — 5 action items ajoutés (Review Follow-ups), statut → in-progress
- 2026-02-08 : Review follow-ups traités — .gitignore, git init, README, version metadata, condition GUI/CLI
