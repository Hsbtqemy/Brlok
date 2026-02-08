---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments:
  - _bmad-output/brainstorming/brainstorming-session-2026-02-07.md
  - Entraînement pan.ods
date: 2026-02-07
author: Hsmy
---

# Product Brief: Brlok

<!-- Content will be appended sequentially through collaborative workflow steps -->

---

## Executive Summary

Brlok est un outil personnel pour structurer des entraînements d'escalade bloc sur pan. Il permet de générer des séances variées à partir d'un catalogue de prises, de les piloter (avec ou sans timer/intervalles), et de les exporter dans plusieurs formats. L'objectif : faciliter la création et la modification de séances, tout en supportant l'évolution du pan (changement de prises).

---

## Core Vision

### Problem Statement

Structurer l'entraînement bloc avec de l'originalité, sans passer trop de temps à la préparation. Le tableur actuel permet de faire sans programme ni interface, mais reste limité : pas de timer intégré, pas d'exports structurés, pas de moteur de progression ni de filtres élaborés.

### Problem Impact

Sans outil adapté : séances répétitives, temps perdu à préparer, difficulté à suivre des programmes (40/20, pyramides, EMOM…), et manque de traçabilité quand le pan évolue.

### Why Existing Solutions Fall Short

Le tableur seul : pas de programme, pas d'interface pour lancer/timer, pas de génération guidée. Les apps du marché : pas adaptées à un pan domestique personnalisé, catalogue fermé, pas de contrôle sur les données.

### Proposed Solution

Un outil Python en CLI (puis éventuellement web local) qui :
- Importe le catalogue depuis le tableur ODS existant
- Génère des blocs/séquences avec contraintes (niveau, tags, variété)
- Pilote la séance en temps réel : timer et intervalles optionnels — séance possible sans programme temporel
- Exporte en TXT, MD, JSON, PDF pour réutilisation et partage
- S'adapte aux changements de prises (catalogue modifiable)

### Key Differentiators

- **Autonomie** : outil local, pas de cloud, données sous contrôle
- **Réutilisabilité** : exports, favoris, catalogue partagé entre séances
- **Évolutivité** : modèle de données extensible, import ODS, ajout de prises sans tout refaire
- **Outil personnel** : conçu pour un usage solo, pas une logique produit commerciale

---

## Target Users

### Primary Users

**Utilisateur principal — grimpeur propriétaire de pan domestique**

- **Contexte** : Propre pan à domicile, entraînement quasi quotidien, niveau plutôt bon. Cherche de nouveaux parcours et de nouvelles combinaisons pour éviter la routine.
- **Fréquence** : Idéalement chaque jour, sinon au moins 2 sessions par semaine, aussi longues que possible.
- **Parcours type** : Gros échauffement → séance focalisée → vérification des parcours et évaluation des niveaux/fatigue.
- **Friction principale** : Visualisation des parcours.
- **Succès** : Un bouton pour lancer une séance qui s'adapte aux envies, à la fatigue et aux runs précédentes.

### Secondary Users

N/A — outil personnel à usage solo.

### User Journey

| Phase | Comportement |
|-------|--------------|
| **Préparation** | Configurer ou générer une séance (niveau, tags, variété) ; éventuellement envies/fatigue |
| **Séance** | Avec ou sans timer : suivre les blocs, passer au suivant ; optionnellement lancer le timer pour intervalles |
| **Suivi** | Marquer les favoris ; ajuster les niveaux ; noter la fatigue pour les prochaines séances |
| **Évolution** | Mettre à jour le catalogue quand les prises changent ; réimporter ou modifier le tableur |

---

## Success Metrics

### User Success Criteria

- **Création rapide** : générer une séance en quelques minutes
- **Accès visuel en séance** : visualisation des parcours pendant la grimpe
- **Satisfaction** : sortir content d'une séance
- **Gestion des favoris** : enregistrer facilement les blocs qu'on a aimés

### Outcome Indicators

- **Temps de préparation** : moins de temps passé à préparer qu'avec le tableur seul
- **Variation** : possibilité de varier les blocs et les séances

### Business Objectives

N/A — outil personnel, pas d'objectifs business.

### Key Performance Indicators

- Utilisation régulière de l'outil pour les séances
- Nombre de blocs ajoutés aux favoris
- Temps de préparation d'une séance (qualitatif : "rapide" vs "trop long")

---

## MVP Scope

### Core Features

- **Catalogue intégré** : pan prédéfini dans le programme ; modification de la difficulté par prise (pas d'import ODS en MVP).
- **Génération** : création de séances/blocs à partir des contraintes (niveau, tags, variété).
- **Exports** : TXT, MD, JSON (et éventuellement PDF) pour utiliser les séances sans lancer le programme (téléphone, impression, partage).
- **Favoris** : enregistrer les blocs qu'on a aimés pour les réutiliser.
- **Visualisation** : affichage clair de ce qu'il faut faire (séquences de prises, ordre, etc.).

### Out of Scope for MVP

- **Bouton magique** : adaptation automatique aux envies, à la fatigue et aux runs précédentes (prévu pour plus tard).
- **Import ODS** : optionnel pour un MVP ; le catalogue est géré directement dans le programme.

### MVP Success Criteria

- **Critère principal** : pouvoir visualiser ce qu'on doit faire (où aller, dans quel ordre).
- Utilisation effective pour préparer et faire des séances.

### Future Vision

- Bouton magique (recommandations personnalisées).
- Import ODS pour réutiliser le tableur existant.
- Timer et intervalles.
- Interface web locale pour visualisation avancée.
