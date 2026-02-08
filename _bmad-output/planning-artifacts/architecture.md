---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-02-08'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/product-brief-Brlok-2026-02-07.md
  - _bmad-output/planning-artifacts/prd-validation-report.md
  - _bmad-output/brainstorming/brainstorming-session-2026-02-07.md
workflowType: 'architecture'
project_name: 'Brlok'
user_name: 'Hsmy'
date: '2026-02-08'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
Les 23 FRs couvrent le cycle complet : catalogue, génération, visualisation, favoris, export et persistance. Les blocs sont des séquences ordonnées de prises. Le pan est défini dans le programme (grille, positions), avec possibilité de modifier difficulté et tags par prise. Pas de cloud, tout en local.

**Non-Functional Requirements:**
- Génération réactive (< 5 s pour un pan typique)
- UI réactive (< 500 ms pour 95 % des actions)
- Lisibilité à 2 m pour la visualisation en séance
- Persistance automatique et compatibilité inter-versions

**Scale & Complexity:**
- Domaine principal : application desktop (PySide) + CLI
- Complexité : faible
- Composants principaux : modèles (Hold, Block, Session, Catalog), générateur, exports, CLI, GUI

### Technical Constraints & Dependencies

- **Stack** : Python 3, PySide6
- **Données** : JSON local (catalogue, favoris, sessions)
- **Architecture** : modulaire (models, generator, exports, cli, gui) — recommandation PRD, non prescriptive
- **Pan** : catalogue intégré, structure fixe (grille) définie dans le programme

### Cross-Cutting Concerns Identified

- **Persistance** : catalogue, favoris, sessions — format JSON unifié, migrations possibles
- **Génération** : exclusions (prises inactives), contraintes (niveau, tags, variété) — moteur isolé et testable
- **Exports** : TXT, MD, JSON — formats pour usages hors programme (téléphone, papier)
- **GUI / CLI** : partage des mêmes modèles et du moteur de génération

### Data Model vs View Separation (Party Mode Enhancement)

Séparation explicite entre modèle de données et représentation visuelle :

| Couche | Responsabilité |
|--------|----------------|
| `models/` | Hold, Block, Session, Catalog — structures pures, sans dépendance UI |
| `generator/` | Consomme `models/` uniquement — testable sans PySide |
| `exports/` | Consomme `models/` uniquement — même source de vérité |
| `gui/` | Transforme `models/` en vues PySide — affichage et interaction |

Le moteur de génération et les exports ne dépendent pas de PySide. Un seul modèle, plusieurs représentations (écran, export texte, etc.).

---

## Starter Template Evaluation

### Primary Technology Domain

**Desktop + CLI** — Application Python avec interface PySide6 (QtWidgets) et ligne de commande pour scripts et exports.

### Starter Options Considered

| Option | Avantages | Limites |
|--------|------------|---------|
| **pyside6-project new-widget** | Officiel Qt, pyproject.toml, base GUI | Pas de CLI, structure non modulaire |
| **Typer / cookiecutter-python-cli** | Bonne base CLI | Pas de GUI |
| **Greenfield manuel** | Aligné avec notre architecture | Nécessite mise en place manuelle |

### Selected Starter: Greenfield — structure manuelle

**Rationale for Selection:**
Aucun starter ne couvre l'association GUI + CLI avec notre séparation models / generator / exports / cli / gui. Une structure manuelle garantit l'alignement avec l'architecture définie dès le départ.

**Initialization Commands:**

```bash
# 1. Environnement virtuel
python -m venv .venv
source .venv/bin/activate  # ou .venv\Scripts\activate sur Windows

# 2. Dépendances
pip install pyside6 typer

# 3. Structure (à créer manuellement)
# brlok/
#   models/       # Hold, Block, Session, Catalog
#   generator/    # Logique de génération
#   exports/      # TXT, MD, JSON
#   cli/          # Commandes Typer
#   gui/          # Interfaces PySide6
#   data/         # Fichiers JSON (catalogue, favoris)
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
- Python 3.8+
- pyproject.toml pour métadonnées et dépendances

**Styling Solution:**
- QtWidgets (PySide6) — styles système ou QSS si besoin

**Build Tooling:**
- pip / venv — pas de build complexe pour une app desktop

**Testing Framework:**
- pytest à ajouter explicitement

**Code Organization:**
- `models/` — structures pures, sans UI
- `generator/` — consomme models uniquement
- `exports/` — consomme models uniquement
- `cli/` — Typer pour point d'entrée CLI
- `gui/` — fenêtres et widgets PySide6

**Development Experience:**
- Exécution directe : `python -m brlok` ou `python main.py`
- Point d'entrée unique GUI/CLI à définir

**Note:** L'initialisation du projet (venv, dépendances, structure) doit être la première story d'implémentation.

---

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Data validation (Pydantic)
- Data storage location (XDG)
- Entry point behavior (GUI par défaut, CLI via sous-commandes)
- Model structures (Hold, Block, Session, Catalog)

**Important Decisions (Shape Architecture):**
- Persistance strategy (sauvegarde immédiate + automatique à fermeture)
- Versioning JSON pour migrations futures

**Deferred Decisions (Post-MVP):**
- CI/CD détaillé
- Packaging (PyInstaller / exécutable standalone)

### Data Architecture

| Décision | Choix | Rationale |
|----------|------|-----------|
| **Validation** | Pydantic | Typage fort, validation automatique, bon support IDE |
| **Stockage** | `~/.config/brlok/` ou `~/brlok-data/` (XDG) | Données séparées du code, portable |
| **Versioning** | Champ `version` dans chaque fichier JSON | Migrations futures sans casser la compatibilité |

### Modèle de données

Structures du brainstorming (Hold, Block, Session, Catalog) conservées. Grille du pan et identifiants (ex. "A1", "C7") à définir lors de l'implémentation selon le tableur existant.

### Entry Point (GUI vs CLI)

- **Sans argument** : `brlok` → ouverture GUI
- **Avec sous-commande** : `brlok generate`, `brlok export`, etc. → mode CLI

### Authentication & Security

N/A — outil personnel, données locales, pas de cloud.

### API & Communication Patterns

N/A — pas d'API externe.

### Frontend Architecture (GUI)

- PySide6 QtWidgets
- Couche `gui/` transforme les modèles en vues
- Lisibilité à 2 m : tailles et contraste à définir en implémentation

### Infrastructure & Deployment

- App desktop locale
- Tests : pytest (à configurer)
- Packaging : post-MVP

### Decision Impact Analysis

**Implementation Sequence:**
1. venv + pyproject.toml + structure
2. models/ (Pydantic)
3. generator/ (logique pure)
4. exports/ (TXT, MD, JSON)
5. cli/ (Typer)
6. gui/ (PySide6)
7. persistance (JSON + XDG)

**Cross-Component Dependencies:**
- models → consommés par generator, exports, cli, gui
- generator → consomme models uniquement
- gui et cli partagent le même catalogue et moteur

---

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**
Points où les agents IA pourraient diverger — conventions Python/Pydantic, structure des fichiers, formats JSON.

### Naming Patterns

**Code (Python):**
- snake_case pour fonctions, variables, modules : `get_user_data`, `catalog.json`
- PascalCase pour classes et modèles Pydantic : `Hold`, `Block`, `Session`
- Fichiers : snake_case : `session_generator.py`, `export_txt.py`

**JSON (fichiers de données):**
- snake_case pour les champs : `target_level`, `holds`, `created_at`
- Cohérence avec les modèles Pydantic

### Structure Patterns

**Project Organization:**
```
brlok/
├── models/          # Hold, Block, Session, Catalog (Pydantic)
├── generator/       # logique de génération
├── exports/         # export_txt, export_md, export_json
├── cli/             # commandes Typer
├── gui/             # fenêtres, widgets
├── data/ ou config/ # emplacement local des JSON (XDG)
└── tests/           # tests unitaires (pytest)
```

**Tests:** `tests/` à la racine ; nommage `test_*.py` ou `*_test.py`.

### Format Patterns

**JSON:**
- snake_case pour tous les champs
- Dates : ISO 8601 (`"2026-02-08T12:00:00"`)
- Champ `version` dans chaque fichier pour migrations

**Exports TXT/MD:**
- Format lisible et cohérent entre les exports
- Encodage UTF-8

### Process Patterns

**Error Handling:**
- Exceptions Python standard ; messages utilisateur distincts des logs
- Validation : Pydantic à la lecture/écriture des JSON

**GUI:**
- Pas de logique métier dans les widgets ; délégation aux modèles/couches

### Enforcement Guidelines

**All AI Agents MUST:**
- Respecter snake_case en Python
- Utiliser les modèles Pydantic pour toute structure de données
- Placer la logique métier hors de `gui/`
- Écrire les tests dans `tests/`

**Anti-Patterns:**
- camelCase dans le code Python
- Logique de génération dans les widgets PySide
- Fichiers JSON sans champ `version`

---

## Project Structure & Boundaries

### Complete Project Directory Structure

```
brlok/
├── pyproject.toml
├── README.md
├── .gitignore
├── .env.example          # (optionnel, variables si besoin)
│
├── brlok/                # package principal
│   ├── __init__.py
│   ├── main.py           # point d'entrée (GUI par défaut, CLI via typer)
│   │
│   ├── models/           # structures Pydantic
│   │   ├── __init__.py
│   │   ├── hold.py
│   │   ├── block.py
│   │   ├── session.py
│   │   └── catalog.py
│   │
│   ├── generator/        # logique de génération (sans dépendance UI)
│   │   ├── __init__.py
│   │   └── session_generator.py
│   │
│   ├── exports/          # TXT, MD, JSON
│   │   ├── __init__.py
│   │   ├── export_txt.py
│   │   ├── export_md.py
│   │   └── export_json.py
│   │
│   ├── cli/              # commandes Typer
│   │   ├── __init__.py
│   │   └── commands.py   # generate, export, etc.
│   │
│   ├── gui/              # PySide6
│   │   ├── __init__.py
│   │   ├── main_window.py
│   │   ├── pan_widget.py
│   │   ├── session_widget.py
│   │   └── widgets/      # composants réutilisables
│   │
│   ├── storage/          # persistance JSON (XDG)
│   │   ├── __init__.py
│   │   └── catalog_store.py
│   │
│   └── config/           # chemins, préférences
│       ├── __init__.py
│       └── paths.py
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py       # fixtures pytest
│   ├── test_models/
│   ├── test_generator/
│   ├── test_exports/
│   └── test_storage/
│
├── _bmad/                # (existant)
├── _bmad-output/         # (existant)
└── data/                 # données par défaut / seed (optionnel)
    └── default_catalog.json
```

### Architectural Boundaries

**Component Boundaries:**
- `models/` → consommés par generator, exports, cli, gui, storage
- `generator/` → consomme models uniquement, pas de PySide
- `exports/` → consomme models uniquement
- `gui/` → importe models, appelle generator et storage
- `cli/` → importe models, generator, exports, storage
- `storage/` → lit/écrit JSON, utilise models pour validation

**Data Boundaries:**
- Fichiers JSON dans `~/.config/brlok/` ou `~/brlok-data/`
- `catalog.json`, `favorites.json`, sessions exportées

### Requirements to Structure Mapping

| FR Category | Composants |
|-------------|------------|
| Catalogue (FR1-FR5) | models/, storage/, gui/ (édition) |
| Génération (FR6-FR10) | generator/, models/ |
| Visualisation (FR11-FR14) | gui/pan_widget, session_widget |
| Favoris (FR15-FR17) | storage/, models/, gui/ |
| Export (FR18-FR20) | exports/, cli/ |
| Persistance (FR21-FR23) | storage/ |

### Integration Points

**Internal Communication:**
- GUI → storage pour charger/sauvegarder
- GUI → generator pour créer une séance
- CLI → generator, exports, storage

**Data Flow:**
- Catalogue chargé au démarrage (storage)
- Génération : Catalogue + contraintes → Session
- Export : Session → fichier TXT/MD/JSON

---

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** Stack Python + PySide6 + Typer + Pydantic + JSON cohérente. Pas de conflit de versions.

**Pattern Consistency:** Conventions snake_case, séparation models/gui, formats JSON alignés avec les décisions.

**Structure Alignment:** Arborescence adaptée aux couches models, generator, exports, cli, gui, storage.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**

| FR Category | Coverage |
|-------------|----------|
| FR1-FR5 (Catalogue) | models/, storage/, gui/ |
| FR6-FR10 (Génération) | generator/, models/ |
| FR11-FR14 (Visualisation) | gui/pan_widget, session_widget |
| FR15-FR17 (Favoris) | storage/, models/, gui/ |
| FR18-FR20 (Export) | exports/, cli/ |
| FR21-FR23 (Persistance) | storage/ |

**Non-Functional Requirements Coverage:**
- NFR1 (génération < 5 s) : generator isolé, optimisable
- NFR2 (UI réactive) : logique hors widgets, pas de blocage
- NFR3-NFR4 (usabilité) : à affiner en implémentation
- NFR5-NFR6 (persistance) : storage, versioning JSON

### Implementation Readiness Validation ✅

**Decision Completeness:** Décisions documentées avec versions et rationales.

**Structure Completeness:** Arborescence détaillée, limites entre composants définies.

**Pattern Completeness:** Conventions de nommage, structure, formats JSON et processus établis.

### Gap Analysis Results

- **Lisibilité à 2 m (NFR4)** : à préciser en implémentation (tailles, contraste)
- **Grille du pan (FR5)** : dimensions fixe vs configurable à trancher lors du dev

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**✅ Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**✅ Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**✅ Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High — architecture cohérente, exigences couvertes.

**Key Strengths:**
- Séparation nette des responsabilités
- Modèles testables sans UI
- Choix techniques stables et adaptés

**Areas for Future Enhancement:**
- Affiner critères de lisibilité à 2 m
- Clarifier structure de la grille du pan

### Implementation Handoff

**AI Agent Guidelines:**
- Suivre les décisions documentées
- Respecter les patterns de nommage et la structure
- S’appuyer sur ce document pour les questions d’architecture

**First Implementation Priority:**
```bash
python -m venv .venv && source .venv/bin/activate
pip install pyside6 typer pydantic
# Créer la structure brlok/ selon le document
```
