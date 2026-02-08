# Story 1.2: Modèles de données Hold et Catalog

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a grimpeur,
I want que le système gère les prises et le catalogue avec validation stricte,
so that j'ai des données cohérentes et typées.

## Acceptance Criteria

1. **Given** le package models/
   **When** je définis les modèles Pydantic
   **Then** Hold a : id, level, tags (list), position, active (bool)
   **And** Catalog contient la structure du pan (grille, positions) et une liste de Hold
   **And** les noms respectent snake_case pour les champs, PascalCase pour les classes
   **And** les tests unitaires valident la création et la validation des modèles

## Tasks / Subtasks

- [x] Task 1 (AC: #1)
  - [x] Créer brlok/models/hold.py avec modèle Pydantic Hold
  - [x] Champs : id (str), level (int 1-5), tags (list[str]), position (Position ou dict row/col), active (bool)
  - [x] Validation Pydantic pour level (1-5), tags (liste ouverte)
- [x] Task 2 (AC: #1)
  - [x] Créer brlok/models/catalog.py avec modèle Catalog
  - [x] Champs : structure du pan (grille, dimensions), holds (list[Hold])
  - [x] Position : structure compatible "A1", "C7" ou {row, col} selon tableur
- [x] Task 3 (AC: #2)
  - [x] Exporter Hold et Catalog depuis brlok/models/__init__.py
  - [x] snake_case champs, PascalCase classes
- [x] Task 4 (AC: #3)
  - [x] Créer tests/test_models/test_hold.py
  - [x] Créer tests/test_models/test_catalog.py
  - [x] Tests : création valide, validation niveau, tags, position, active

## Dev Notes

### Previous Story Intelligence (1.1)

- Structure brlok/ existe avec models/, generator/, exports/, cli/, gui/, storage/, config/
- pyproject.toml contient pyside6, typer, pydantic
- Point d'entrée : python -m brlok (GUI), brlok generate (CLI)

### Architecture Compliance

- **Models** : [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- **Naming** : snake_case champs, PascalCase classes, fichiers snake_case [Source: architecture.md#Naming Patterns]
- **Brainstorming** : id "A1"/"C7", level 1-5, tags[], position {row,col} [Source: brainstorming-session-2026-02-07.md]
- **Epics** : active (bool) séparé de level — FR4 actif/inactif

### Technical Requirements

- Pydantic v2 (model_validator, field_validator)
- Position : TypedDict ou classe avec row, col — identifiants "A1", "C7" compatibles tableur Entraînement pan.ods
- Grille : dimensions (rows, cols) ou liste de positions — définir selon structure pan

### File Structure Requirements

```
brlok/models/
├── __init__.py   # export Hold, Catalog, Position
├── hold.py
└── catalog.py
tests/test_models/
├── test_hold.py
└── test_catalog.py
```

### Testing Requirements

- pytest, tests/test_models/
- Valider : Hold(id="A1", level=3, tags=["crimp"], position=..., active=True)
- Valider : Catalog(holds=[...], grid=...)
- Cas limites : level hors 1-5, tags vides, position invalide

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#Modèle de données]
- [Source: _bmad-output/brainstorming/brainstorming-session-2026-02-07.md#Modèle de données consolidé]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Hold : id, level (1-5), tags (list[str]), position (Position row/col), active (bool)
- Position : row, col (int ≥0)
- Catalog : holds (list[Hold]), grid (GridDimensions rows/cols)
- GridDimensions : rows, cols (int ≥1)
- 15 tests modèles, 19 tests totaux

### File List

- brlok/models/hold.py
- brlok/models/catalog.py
- brlok/models/__init__.py
- tests/test_models/__init__.py
- tests/test_models/test_hold.py
- tests/test_models/test_catalog.py
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-02-08 : Story 1.2 implémentée — Hold, Position, Catalog, GridDimensions + tests
