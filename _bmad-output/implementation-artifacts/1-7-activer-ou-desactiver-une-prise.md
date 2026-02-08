# Story 1.7: Activer ou désactiver une prise

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a grimpeur,
I want activer ou désactiver une prise,
so that j'exclus temporairement certaines prises des séances générées.

## Acceptance Criteria

1. **Given** une prise dans le catalogue
   **When** je la désactive (actif → inactif)
   **Then** elle n'apparaît plus dans les séances générées (FR9)
2. **When** je la réactive
   **Then** elle redevient disponible pour la génération (FR4)

## Tasks / Subtasks

- [ ] Task 1 (AC: #1, #2 - Modèle)
  - [ ] Hold.active : bool — déjà défini en 1.2
  - [ ] Vérifier que le champ existe et est persisté
- [ ] Task 2 (AC: #1, #2 - GUI)
  - [ ] Toggle actif/inactif pour prise sélectionnée
  - [ ] Indicateur visuel (couleur, icône) : actif vs inactif
  - [ ] Sauvegarde immédiate après changement
- [ ] Task 3 (AC: #1, #2 - CLI)
  - [ ] `brlok catalog edit <hold_id> --active` / `--no-active`
  - [ ] Ou `brlok catalog toggle <hold_id>`
- [ ] Task 4 (AC: #1 - Generator)
  - [ ] Le generator (story 2.2) exclura les holds avec active=False
  - [ ] Pour cette story : s'assurer que Hold.active est bien utilisé partout
  - [ ] Documenter ou prévoir le filtre pour le generator
- [ ] Task 5
  - [ ] Tests : toggle active, persistance
  - [ ] Test : catalogue avec actifs/inactifs — préparation pour generator

## Dev Notes

### Previous Story Intelligence (1.1–1.6)

- Hold.active défini en 1.2
- Patterns édition : GUI + CLI, save immédiat
- Generator (2.2) : exclura les prises inactives

### Architecture Compliance

- **FR4** : activer/désactiver ; **FR9** : exclusion des inactives en génération
- **Generator** : consomme Catalog, filtre holds où active=True [Source: architecture.md#Cross-Component Dependencies]
- Pas de logique métier dans GUI — le generator fera le filtre

### Technical Requirements

- Hold.active : bool, default True
- Vue catalogue : afficher statut actif/inactif clairement
- Generator (à venir) : `[h for h in catalog.holds if h.active]`

### File Structure Requirements

- Réutiliser catalog_widget, commands
- Pas de nouveau module

### Testing Requirements

- Test : active True → False → True ; persistance
- Test : catalog avec mix actif/inactif — structure prête pour 2.2

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.7]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Model vs View Separation]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
