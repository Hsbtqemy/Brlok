# Story 1.4: Consultation du catalogue

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a grimpeur,
I want consulter le catalogue des prises de mon pan,
so that je vois ce qui est disponible avant de modifier ou générer une séance.

## Acceptance Criteria

1. **Given** un catalogue chargé
   **When** j'ouvre l'interface de consultation (GUI ou CLI)
   **Then** je vois la liste des prises avec id, niveau, tags, position, statut actif (FR1)
   **And** la structure du pan (grille) est visible ou identifiable (FR5)

## Tasks / Subtasks

- [ ] Task 1 (AC: #1 - CLI)
  - [ ] Sous-commande `brlok catalog list` ou `brlok catalog --list`
  - [ ] Afficher chaque Hold : id, level, tags, position, active
  - [ ] Format lisible (table ou lignes)
- [ ] Task 2 (AC: #1, #2 - GUI)
  - [ ] Vue ou widget de consultation du catalogue
  - [ ] Liste/table des prises : id, niveau, tags, position, actif
- [ ] Task 3 (AC: #2)
  - [ ] Représentation de la grille du pan (structure visible)
  - [ ] Option : grille 2D avec positions ou liste ordonnée par position
- [ ] Task 4
  - [ ] Charger catalogue via storage.load_catalog() au démarrage vue
  - [ ] Tests si pertinent (CLI plus simple à tester)

## Dev Notes

### Previous Story Intelligence (1.1, 1.2, 1.3)

- Models Hold, Catalog
- Persistance : load_catalog(), save_catalog()
- GUI : PySide6, gui/ ; CLI : Typer

### Architecture Compliance

- **GUI** : pas de logique métier dans widgets, délégation aux modèles [Source: architecture.md#Process Patterns]
- **Composants** : gui/ pour vues, cli/ pour commandes [Source: architecture.md#Component Boundaries]
- **FR1** : consulter catalogue ; **FR5** : structure du pan

### Technical Requirements

- GUI : QTableWidget ou QListView pour liste prises
- Grille : représentation simple (placeholder acceptable)
- CLI : typer.echo ou rich pour affichage

### File Structure Requirements

```
brlok/cli/commands.py   # ajouter catalog list
brlok/gui/
├── catalog_widget.py   # ou intégré main_window
└── ...
```

### Testing Requirements

- Test CLI : brlok catalog list avec catalogue mocké
- Test GUI : affichage manuel ou tests d'intégration simples

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#Requirements to Structure Mapping]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
