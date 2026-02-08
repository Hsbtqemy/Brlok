# Story 1.6: Modification des tags d'une prise

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a grimpeur,
I want modifier les tags d'une prise (liste ouverte),
so that je catégorise les prises selon mes critères.

## Acceptance Criteria

1. **Given** une prise sélectionnée
   **When** je modifie les tags (ajout, suppression, modification)
   **Then** les tags sont enregistrés (liste ouverte, pas de vocabulaire prédéfini)
   **And** la modification est persistée (FR3)

## Tasks / Subtasks

- [ ] Task 1 (AC: #1 - Modèle)
  - [ ] Hold.tags : list[str] — liste ouverte, pas de vocabulaire imposé
  - [ ] Validation : tags non vides si liste non vide (optionnel)
- [ ] Task 2 (AC: #1 - GUI)
  - [ ] Éditeur de tags pour prise sélectionnée
  - [ ] Ajout tag : saisie + validation (pas de doublon possible)
  - [ ] Suppression tag : bouton ou action
  - [ ] Modification : éditer texte d'un tag
  - [ ] Sauvegarde immédiate après chaque modification
- [ ] Task 3 (AC: #1 - CLI)
  - [ ] `brlok catalog edit <hold_id> --tags "tag1,tag2,tag3"`
  - [ ] Ou --add-tag, --remove-tag
- [ ] Task 4 (AC: #2)
  - [ ] Persistance via catalog_store.save_catalog()
- [ ] Task 5
  - [ ] Tests : ajout, suppression, modification tags ; persistance

## Dev Notes

### Previous Story Intelligence (1.1–1.5)

- Hold, Catalog, persistance, consultation, modification niveau
- Même pattern : sélection → édition → save immédiat

### Architecture Compliance

- **FR3** : modifier tags d'une prise
- **Liste ouverte** : pas de vocabulaire prédéfini (tags libres)
- **JSON** : tags = array de strings, snake_case [Source: architecture.md#Format Patterns]

### Technical Requirements

- Hold.tags : list[str] — accepte toute chaîne non vide
- Pas de liste prédéfinie (crimp, sloper, etc.) — l'utilisateur définit
- GUI : widget type "tag editor" (chips, list editable)

### File Structure Requirements

- Réutiliser catalog_widget et CLI commands
- Pas de nouveau module

### Testing Requirements

- Test : ajout tag, suppression, modification
- Test : tags vides, doublons (comportement à définir)
- Test : persistance round-trip

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.6]
- [Source: _bmad-output/brainstorming/brainstorming-session-2026-02-07.md] — tags liste ouverte

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
