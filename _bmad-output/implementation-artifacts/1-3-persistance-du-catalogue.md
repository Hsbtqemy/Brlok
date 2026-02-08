# Story 1.3: Persistance du catalogue

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a grimpeur,
I want que le catalogue soit sauvegardé et rechargé automatiquement,
so that je retrouve mes données entre les sessions.

## Acceptance Criteria

1. **Given** un Catalogue valide
   **When** l'application sauvegarde
   **Then** le fichier est écrit dans ~/.config/brlok/ ou ~/brlok-data/ (XDG)
   **And** le JSON contient un champ version et snake_case pour les champs
   **And** les dates utilisent le format ISO 8601
2. **When** l'application démarre
   **Then** le catalogue est chargé depuis le fichier (FR23)
   **And** une validation Pydantic est appliquée à la lecture (FR21)

## Tasks / Subtasks

- [ ] Task 1 (AC: #1)
  - [ ] Créer brlok/config/paths.py pour chemins XDG (~/.config/brlok ou ~/brlok-data)
  - [ ] Définir chemin catalog.json
- [ ] Task 2 (AC: #1)
  - [ ] Créer brlok/storage/catalog_store.py
  - [ ] save_catalog(catalog) → écrit JSON avec version, snake_case, dates ISO 8601
  - [ ] Créer répertoire si inexistant
- [ ] Task 3 (AC: #2)
  - [ ] load_catalog() → lit JSON, validation Pydantic Catalog
  - [ ] Gérer fichier absent (catalogue vide ou défaut)
- [ ] Task 4 (AC: #1, #2)
  - [ ] Intégrer save au démarrage GUI/CLI et à la fermeture
  - [ ] Intégrer load au démarrage de l'application
- [ ] Task 5
  - [ ] Tests tests/test_storage/test_catalog_store.py

## Dev Notes

### Previous Story Intelligence (1.1, 1.2)

- Structure brlok/ opérationnelle
- Models Hold, Catalog définis en Pydantic
- Stockage XDG défini dans architecture

### Architecture Compliance

- **XDG** : ~/.config/brlok/ ou ~/brlok-data/ [Source: architecture.md#Data Architecture]
- **Versioning** : champ version dans chaque JSON [Source: architecture.md#Format Patterns]
- **JSON** : snake_case, dates ISO 8601 [Source: architecture.md#Format Patterns]
- **Validation** : Pydantic à lecture/écriture [Source: architecture.md#Process Patterns]

### Technical Requirements

- platformdirs ou xdg-base-dirs pour XDG (ou implémentation manuelle)
- json.dumps avec ensure_ascii=False pour UTF-8
- datetime.isoformat() pour dates

### File Structure Requirements

```
brlok/storage/
├── __init__.py
└── catalog_store.py
brlok/config/
├── __init__.py
└── paths.py
```

### Testing Requirements

- Tests : save puis load, round-trip Catalog
- Test : fichier absent → catalogue vide ou erreur gérée
- Test : JSON invalide → ValidationError Pydantic

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#Format Patterns]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
