# Story 1.5: Modification de la difficulté d'une prise

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a grimpeur,
I want modifier la difficulté d'une prise,
so that le catalogue reflète ma perception actuelle du pan.

## Acceptance Criteria

1. **Given** une prise sélectionnée dans le catalogue
   **When** je modifie la difficulté (niveau)
   **Then** la modification est sauvegardée immédiatement (FR21)
   **And** les prochaines générations de séances tiennent compte du nouveau niveau (FR2)

## Tasks / Subtasks

- [ ] Task 1 (AC: #1 - Modèle)
  - [ ] Hold.level mutable ; validation 1-5
  - [ ] Méthode ou fonction update_hold_level(catalog, hold_id, new_level) si besoin
- [ ] Task 2 (AC: #1 - GUI)
  - [ ] Sélection d'une prise dans la vue catalogue
  - [ ] Éditeur de niveau (spinbox 1-5, dropdown, ou saisie)
  - [ ] Après modification → save_catalog() immédiat
- [ ] Task 3 (AC: #1 - CLI)
  - [ ] `brlok catalog edit <hold_id> --level <niveau>`
  - [ ] Charger, modifier, sauvegarder
- [ ] Task 4 (AC: #2)
  - [ ] S'assurer que generator (à venir) consomme Catalog avec holds à jour
  - [ ] Pas de cache de niveau ; catalogue = source de vérité
- [ ] Task 5
  - [ ] Tests : modification level, persistance, validation 1-5

## Dev Notes

### Previous Story Intelligence (1.1–1.4)

- Hold, Catalog définis
- Persistance catalog_store ; sauvegarde immédiate
- Vue consultation catalogue (GUI + CLI)

### Architecture Compliance

- **FR21** : sauvegarde persistante ; **FR2** : modification difficulté
- **GUI** : délégation au modèle puis storage.save [Source: architecture.md#Process Patterns]
- **Generator** (story 2.x) consommera Catalog — pas de modification ici, juste garantir cohérence

### Technical Requirements

- Hold.level : Field(ge=1, le=5) ou validator
- Sauvegarde immédiate après chaque modification (pas de "save" bouton global)
- GUI : slot pour éditer niveau dans la vue catalogue

### File Structure Requirements

- Réutiliser catalog_widget / commands existants
- Pas de nouveau module majeur

### Testing Requirements

- Test : modifier level d'un Hold, save, load → niveau à jour
- Test : level hors 1-5 → ValidationError

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5]
- [Source: _bmad-output/planning-artifacts/architecture.md#Requirements to Structure Mapping]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
