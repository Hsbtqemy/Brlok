---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief-Brlok-2026-02-07.md
  - _bmad-output/brainstorming/brainstorming-session-2026-02-07.md
workflowType: 'prd'
documentCounts:
  briefCount: 1
  researchCount: 0
  brainstormingCount: 1
  projectDocsCount: 0
classification:
  projectType: cli_tool
  domain: general
  complexity: low
  projectContext: greenfield
---

# Product Requirements Document - Brlok

**Author:** Hsmy
**Date:** 2026-02-07

---

## Executive Summary

Brlok est un outil personnel Python (PySide + CLI) pour structurer les entraînements d'escalade bloc sur pan domestique. Le pan, défini dans le programme, est au cœur du système ; l'utilisateur génère des séances avec contraintes, les visualise, les exécute et peut exporter pour usage hors du programme. Conçu pour un grimpeur solo souhaitant variété, rapidité et autonomie. Autonomie (données locales, pas de cloud), réutilisabilité (exports, favoris) et évolutivité (architecture modulaire) structurent le design.

---

## Success Criteria

### User Success

- **Création rapide** : générer une séance en quelques minutes
- **Accès visuel en séance** : visualisation claire des parcours pendant la grimpe
- **Satisfaction** : sortir content d'une séance
- **Favoris** : enregistrer facilement les blocs qu'on a aimés

### Business Success

N/A — outil personnel, pas d'objectifs business.

### Technical Success

- Données stockées localement (format JSON ou équivalent)
- Exécution en CLI pour scripts et automatisation
- Architecture modulaire pour évolutions futures

### Measurable Outcomes

- Temps de préparation réduit par rapport au tableur seul
- Variété des blocs et des séances
- Utilisation régulière de l'outil pour les séances
- Nombre de blocs ajoutés aux favoris

---

## Product Scope

### MVP - Minimum Viable Product

- **Pan au cœur** : catalogue intégré, pan défini dans le programme (config/data)
- **Génération** : blocs/séquences à partir des contraintes (niveau, tags, variété)
- **Exports** : TXT, MD, JSON (et éventuellement PDF)
- **Favoris** : enregistrer et réutiliser les blocs aimés
- **Interface graphique** : visualisation des parcours, pilotage des séances
- **Modification** : difficulté par prise dans le programme

**Critère de succès MVP** : pouvoir visualiser ce qu'on doit faire (où aller, dans quel ordre).

### Growth Features (Post-MVP)

- Timer et intervalles (40/20, pyramides, EMOM)
- Import ODS pour migration depuis le tableur
- Améliorations de l'interface

### Vision (Future)

- Bouton magique (recommandations selon envies, fatigue, historique)
- Visualisation enrichie du pan

---

## User Journeys

### Journey 1 : Préparer et faire une séance (parcours principal)

**Contexte** : Le grimpeur veut une séance variée pour aujourd'hui.

**Déroulement** : Ouvre l'application → configure les contraintes (niveau, tags, variété) → génère une séance → visualise le pan et les séquences → grimpe → suit les blocs un par un → termine un bloc qu'il a aimé → l'ajoute aux favoris → termine la séance.

**Climax** : Visualisation claire de ce qu'il doit faire pendant la grimpe.

**Résultat** : Séance structurée, variée, sans perte de temps en préparation.

---

### Journey 2 : Modifier le catalogue (ajustement du pan)

**Contexte** : Une prise a changé ou la difficulté perçue a évolué.

**Déroulement** : Ouvre l'app → accède au catalogue des prises → sélectionne une prise → modifie la difficulté (ou les tags) → enregistre → les prochaines séances tiennent compte de la modification.

**Résultat** : Catalogue à jour sans repasser par le tableur.

---

### Journey 3 : Utiliser une séance sans le programme (export)

**Contexte** : Le grimpeur veut la séance sur téléphone ou en papier, sans lancer le programme.

**Déroulement** : Génère une séance dans l'app → exporte en TXT, MD ou JSON → ouvre le fichier sur son téléphone ou imprime → suit la séance hors du PC.

**Résultat** : Séances utilisables même sans le programme.

---

### Journey Requirements Summary

| Parcours | Capacités révélées |
|----------|-------------------|
| 1 — Préparer et faire | Génération, visualisation pan, affichage blocs, favoris |
| 2 — Modifier le catalogue | Édition des prises, difficulté, tags |
| 3 — Export | Exports TXT, MD, JSON |

---

## CLI Tool Specific Requirements

### Project-Type Overview

Interface PySide + CLI pour scripts et exports. Le pan et le catalogue sont au cœur du programme.

### Technical Architecture Considerations

- **Interface** : PySide — visualisation du pan, génération, pilotage des séances, favoris
- **CLI** : exports (TXT, MD, JSON), génération programmatique, scripts
- **Données** : stockage local (JSON) — catalogue, pan, favoris, sessions

### Command Structure

- Génération de séances (contraintes : niveau, tags, variété)
- Export (formats : TXT, MD, JSON)
- Gestion du catalogue (options CLI en complément de l'UI)

### Output Formats

- **TXT/MD** : lecture humaine, partage
- **JSON** : rechargement, automatisation
- **PDF** : post-MVP

### Config Schema

- Catalogue des prises (id, level, tags, position)
- Structure du pan (grille)
- Préférences utilisateur

### Scripting Support

- CLI utilisable dans des scripts
- Exports par ligne de commande
- Génération de séances sans interface graphique

### Implementation Considerations

- **Python 3** + **PySide6**
- Architecture modulaire recommandée (models, generator, exports, cli, gui) — non prescriptive, guidance pour le développement
- Données persistantes en JSON

---

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**Approche MVP** : Résolution de problème — livrer la valeur principale : visualiser et suivre des séances structurées sans perdre de temps en préparation.

**Ressources** : Développement solo, Python + PySide6.

### MVP Feature Set (Phase 1)

**Parcours utilisateur couverts** : préparer et faire une séance ; modifier le catalogue ; exporter.

**Capacités essentielles** :
- Catalogue intégré (pan défini dans le programme)
- Génération de blocs/séquences (niveau, tags, variété)
- Interface graphique (visualisation du pan, pilotage des séances)
- Modification de la difficulté par prise
- Favoris
- Exports TXT, MD, JSON

### Post-MVP Features

**Phase 2 (Post-MVP)** :
- Timer et intervalles (40/20, pyramides, EMOM)
- Import ODS (si besoin)
- Export PDF
- Améliorations de l'interface

**Phase 3 (Expansion)** :
- Bouton magique (recommandations personnalisées)
- Visualisation enrichie
- Interface web locale (optionnel)

### Risk Mitigation Strategy

**Risques techniques** : Architecture modulaire pour isoler les composants ; moteur de génération testable sans UI.

**Risques marché** : N/A — outil personnel.

**Risques ressources** : MVP limité aux fonctionnalités indispensables ; interface graphique choisie pour une mise en place rapide.

---

## Functional Requirements

### Catalogue Management

- FR1: L'utilisateur peut consulter le catalogue des prises du pan.
- FR2: L'utilisateur peut modifier la difficulté d'une prise.
- FR3: L'utilisateur peut modifier les tags d'une prise (liste ouverte).
- FR4: L'utilisateur peut activer ou désactiver une prise (actif/inactif).
- FR5: Le système conserve la structure du pan (grille, positions).

### Session Generation

- FR6: L'utilisateur peut générer une séance avec des contraintes de niveau cible.
- FR7: L'utilisateur peut générer une séance avec des contraintes de tags (filtrer ou forcer des tags).
- FR8: L'utilisateur peut générer une séance avec contrainte de variété (éviter les répétitions).
- FR9: Le système exclut les prises inactives lors de la génération.
- FR10: Le système génère des blocs (séquences ordonnées de prises).

### Session Visualization

- FR11: L'utilisateur peut visualiser le pan avec les prises positionnées.
- FR12: L'utilisateur peut visualiser la séquence de prises d'un bloc.
- FR13: L'utilisateur peut afficher le bloc en cours pendant la séance.
- FR14: L'utilisateur peut passer au bloc suivant.

### Favorites

- FR15: L'utilisateur peut ajouter un bloc aux favoris.
- FR16: L'utilisateur peut consulter la liste des favoris.
- FR17: L'utilisateur peut réutiliser un bloc favori dans une séance.

### Export

- FR18: L'utilisateur peut exporter une séance en format TXT.
- FR19: L'utilisateur peut exporter une séance en format Markdown.
- FR20: L'utilisateur peut exporter une séance en format JSON (session autonome).

### Data Persistence

- FR21: Le système sauvegarde le catalogue de manière persistante.
- FR22: Le système sauvegarde les favoris.
- FR23: Le système charge le catalogue au démarrage.

---

## Non-Functional Requirements

### Performance

- NFR1: La génération d'une séance se termine en moins de 5 secondes pour un pan typique.
- NFR2: L'interface utilisateur reste réactive lors des actions utilisateur : réponse en moins de 500 ms pour 95 % des actions (pas de blocage visible).

### Usability

- NFR3: Un utilisateur peut créer sa première séance en moins de 5 minutes sans documentation externe.
- NFR4: La visualisation du pan et des blocs reste lisible à 2 mètres de distance pendant la séance (taille et contraste suffisants pour identification des prises).

### Data Persistence

- NFR5: Les données (catalogue, favoris) sont sauvegardées automatiquement avant fermeture.
- NFR6: Les fichiers de données restent lisibles entre les versions du programme (migrations documentées si besoin).
