---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories']
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
---

# Brlok - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Brlok, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: L'utilisateur peut consulter le catalogue des prises du pan.
FR2: L'utilisateur peut modifier la difficulté d'une prise.
FR3: L'utilisateur peut modifier les tags d'une prise (liste ouverte).
FR4: L'utilisateur peut activer ou désactiver une prise (actif/inactif).
FR5: Le système conserve la structure du pan (grille, positions).
FR6: L'utilisateur peut générer une séance avec des contraintes de niveau cible.
FR7: L'utilisateur peut générer une séance avec des contraintes de tags (filtrer ou forcer des tags).
FR8: L'utilisateur peut générer une séance avec contrainte de variété (éviter les répétitions).
FR9: Le système exclut les prises inactives lors de la génération.
FR10: Le système génère des blocs (séquences ordonnées de prises).
FR11: L'utilisateur peut visualiser le pan avec les prises positionnées.
FR12: L'utilisateur peut visualiser la séquence de prises d'un bloc.
FR13: L'utilisateur peut afficher le bloc en cours pendant la séance.
FR14: L'utilisateur peut passer au bloc suivant.
FR15: L'utilisateur peut ajouter un bloc aux favoris.
FR16: L'utilisateur peut consulter la liste des favoris.
FR17: L'utilisateur peut réutiliser un bloc favori dans une séance.
FR18: L'utilisateur peut exporter une séance en format TXT.
FR19: L'utilisateur peut exporter une séance en format Markdown.
FR20: L'utilisateur peut exporter une séance en format JSON (session autonome).
FR21: Le système sauvegarde le catalogue de manière persistante.
FR22: Le système sauvegarde les favoris.
FR23: Le système charge le catalogue au démarrage.

### NonFunctional Requirements

NFR1: La génération d'une séance se termine en moins de 5 secondes pour un pan typique.
NFR2: L'interface utilisateur reste réactive lors des actions utilisateur : réponse en moins de 500 ms pour 95 % des actions (pas de blocage visible).
NFR3: Un utilisateur peut créer sa première séance en moins de 5 minutes sans documentation externe.
NFR4: La visualisation du pan et des blocs reste lisible à 2 mètres de distance pendant la séance (taille et contraste suffisants pour identification des prises).
NFR5: Les données (catalogue, favoris) sont sauvegardées automatiquement avant fermeture.
NFR6: Les fichiers de données restent lisibles entre les versions du programme (migrations documentées si besoin).

### Additional Requirements

- **Starter template** : Greenfield manuel — première story d’implémentation = initialisation du projet (venv, pyproject.toml, structure brlok/ avec models, generator, exports, cli, gui, storage, config, tests).
- **Stack** : Python 3.8+, PySide6, Typer, Pydantic.
- **Stockage** : ~/.config/brlok/ ou ~/brlok-data/ (XDG) — catalogue, favoris, sessions.
- **Validation** : Pydantic pour toutes les structures de données ; validation à la lecture/écriture des JSON.
- **Versioning JSON** : champ `version` dans chaque fichier pour migrations futures.
- **Point d’entrée** : `brlok` sans argument → GUI ; `brlok generate`, `brlok export`, etc. → CLI.
- **Conventions** : snake_case (code, JSON), PascalCase (classes Pydantic), encodage UTF-8, dates ISO 8601.
- **Tests** : pytest, structure tests/ avec test_models/, test_generator/, test_exports/, test_storage/.
- **Logique métier** : hors de gui/ ; generator et exports sans dépendance PySide.
- **Lisibilité à 2 m (NFR4)** : tailles et contraste à définir en implémentation.

### FR Coverage Map

FR1: Epic 1 - Consulter le catalogue des prises
FR2: Epic 1 - Modifier la difficulté d'une prise
FR3: Epic 1 - Modifier les tags d'une prise
FR4: Epic 1 - Activer/désactiver une prise
FR5: Epic 1 - Structure du pan (grille, positions)
FR6: Epic 2 - Génération avec contrainte de niveau
FR7: Epic 2 - Génération avec contrainte de tags
FR8: Epic 2 - Génération avec contrainte de variété
FR9: Epic 2 - Exclusion des prises inactives
FR10: Epic 2 - Génération des blocs (séquences)
FR11: Epic 3 - Visualiser le pan avec les prises
FR12: Epic 3 - Visualiser la séquence d'un bloc
FR13: Epic 3 - Afficher le bloc en cours
FR14: Epic 3 - Passer au bloc suivant
FR15: Epic 4 - Ajouter un bloc aux favoris
FR16: Epic 4 - Consulter la liste des favoris
FR17: Epic 4 - Réutiliser un bloc favori
FR18: Epic 5 - Export TXT
FR19: Epic 5 - Export Markdown
FR20: Epic 5 - Export JSON
FR21: Epic 1 - Sauvegarde persistante du catalogue
FR22: Epic 4 - Sauvegarde des favoris
FR23: Epic 1 - Chargement du catalogue au démarrage

## Epic List

### Epic 1: Le pan et son catalogue
Le grimpeur peut voir son pan et consulter/modifier le catalogue des prises (difficulté, tags, actif/inactif).
**FRs couverts :** FR1, FR2, FR3, FR4, FR5, FR21, FR23

### Epic 2: Génération de séances
Le grimpeur peut générer des séances variées selon ses contraintes (niveau, tags, variété).
**FRs couverts :** FR6, FR7, FR8, FR9, FR10

### Epic 3: Visualisation et exécution des séances
Le grimpeur peut visualiser le pan et les blocs, et suivre sa séance pendant la grimpe.
**FRs couverts :** FR11, FR12, FR13, FR14

### Epic 4: Favoris
Le grimpeur peut enregistrer et réutiliser les blocs qu'il a aimés.
**FRs couverts :** FR15, FR16, FR17, FR22

### Epic 5: Export
Le grimpeur peut exporter ses séances pour usage hors du programme (téléphone, papier).
**FRs couverts :** FR18, FR19, FR20

---

## Epic 1: Le pan et son catalogue

Le grimpeur peut voir son pan et consulter/modifier le catalogue des prises (difficulté, tags, actif/inactif).

### Story 1.1: Initialisation du projet

En tant que développeur,
je veux une structure de projet opérationnelle avec environnement virtuel et dépendances,
afin de pouvoir développer Brlok avec Python, PySide6, Typer et Pydantic.

**Acceptance Criteria:**

**Given** un répertoire projet vide
**When** je crée l'environnement avec `python -m venv .venv` et installe les dépendances
**Then** pyproject.toml contient pyside6, typer, pydantic
**And** la structure brlok/ existe avec models/, generator/, exports/, cli/, gui/, storage/, config/
**And** `python -m brlok` ouvre une fenêtre vide (point d'entrée GUI)
**And** `brlok generate --help` affiche l'aide CLI (sous-commandes Typer)

### Story 1.2: Modèles de données Hold et Catalog

En tant que grimpeur,
je veux que le système gère les prises et le catalogue avec validation stricte,
afin d'avoir des données cohérentes et typées.

**Acceptance Criteria:**

**Given** le package models/
**When** je définis les modèles Pydantic
**Then** Hold a : id, level, tags (list), position, active (bool)
**And** Catalog contient la structure du pan (grille, positions) et une liste de Hold
**And** les noms respectent snake_case pour les champs, PascalCase pour les classes
**And** les tests unitaires valident la création et la validation des modèles

### Story 1.3: Persistance du catalogue

En tant que grimpeur,
je veux que le catalogue soit sauvegardé et rechargé automatiquement,
afin de retrouver mes données entre les sessions.

**Acceptance Criteria:**

**Given** un Catalogue valide
**When** l'application sauvegarde
**Then** le fichier est écrit dans ~/.config/brlok/ ou ~/brlok-data/ (XDG)
**And** le JSON contient un champ version et snake_case pour les champs
**And** les dates utilisent le format ISO 8601
**When** l'application démarre
**Then** le catalogue est chargé depuis le fichier (FR23)
**And** une validation Pydantic est appliquée à la lecture (FR21)

### Story 1.4: Consultation du catalogue

En tant que grimpeur,
je veux consulter le catalogue des prises de mon pan,
afin de voir ce qui est disponible avant de modifier ou générer une séance.

**Acceptance Criteria:**

**Given** un catalogue chargé
**When** j'ouvre l'interface de consultation (GUI ou CLI)
**Then** je vois la liste des prises avec id, niveau, tags, position, statut actif (FR1)
**And** la structure du pan (grille) est visible ou identifiable (FR5)

### Story 1.5: Modification de la difficulté d'une prise

En tant que grimpeur,
je veux modifier la difficulté d'une prise,
afin que le catalogue reflète ma perception actuelle du pan.

**Acceptance Criteria:**

**Given** une prise sélectionnée dans le catalogue
**When** je modifie la difficulté (niveau)
**Then** la modification est sauvegardée immédiatement (FR21)
**And** les prochaines générations de séances tiennent compte du nouveau niveau (FR2)

### Story 1.6: Modification des tags d'une prise

En tant que grimpeur,
je veux modifier les tags d'une prise (liste ouverte),
afin de catégoriser les prises selon mes critères.

**Acceptance Criteria:**

**Given** une prise sélectionnée
**When** je modifie les tags (ajout, suppression, modification)
**Then** les tags sont enregistrés (liste ouverte, pas de vocabulaire prédéfini)
**And** la modification est persistée (FR3)

### Story 1.7: Activer ou désactiver une prise

En tant que grimpeur,
je veux activer ou désactiver une prise,
afin d'exclure temporairement certaines prises des séances générées.

**Acceptance Criteria:**

**Given** une prise dans le catalogue
**When** je la désactive (actif → inactif)
**Then** elle n'apparaît plus dans les séances générées (FR9)
**When** je la réactive
**Then** elle redevient disponible pour la génération (FR4)

---

## Epic 2: Génération de séances

Le grimpeur peut générer des séances variées selon ses contraintes (niveau, tags, variété).

### Story 2.1: Modèles Block et Session

En tant que grimpeur,
je veux que le système représente les blocs et les séances de manière structurée,
afin que la génération et l'affichage soient cohérents.

**Acceptance Criteria:**

**Given** les modèles Hold et Catalog
**When** je définis Block et Session en Pydantic
**Then** Block contient une séquence ordonnée de Hold (FR10)
**And** Session contient une liste de Block et les contraintes utilisées
**And** les modèles sont dans models/, sans dépendance PySide

### Story 2.2: Générateur de séances – contraintes de niveau et exclusion

En tant que grimpeur,
je veux générer une séance avec un niveau cible,
afin d'avoir des blocs adaptés à mon niveau.

**Acceptance Criteria:**

**Given** un catalogue avec des prises actives
**When** je génère une séance avec une contrainte de niveau
**Then** les blocs sont des séquences ordonnées de prises (FR10)
**And** les prises inactives sont exclues (FR9)
**And** la génération termine en moins de 5 secondes pour un pan typique (NFR1)
**And** le moteur est testable sans UI (dans generator/)

### Story 2.3: Contraintes de tags

En tant que grimpeur,
je veux générer une séance avec des contraintes de tags (filtrer ou forcer),
afin de travailler des types de prises spécifiques.

**Acceptance Criteria:**

**Given** un catalogue avec des prises taguées
**When** je spécifie des contraintes de tags (filtrer ou forcer)
**Then** la séance générée respecte ces contraintes (FR7)
**And** les blocs ne contiennent que des prises matching les critères

### Story 2.4: Contrainte de variété

En tant que grimpeur,
je veux générer une séance avec une contrainte de variété,
afin d'éviter les répétitions de prises dans les blocs.

**Acceptance Criteria:**

**Given** un catalogue suffisamment diversifié
**When** je demande une séance avec variété
**Then** le générateur évite de répéter les mêmes prises dans les blocs (FR8)
**And** les blocs restent réalisables et cohérents

---

## Epic 3: Visualisation et exécution des séances

Le grimpeur peut visualiser le pan et les blocs, et suivre sa séance pendant la grimpe.

### Story 3.1: Visualisation du pan avec les prises

En tant que grimpeur,
je veux visualiser le pan avec les prises positionnées,
afin de voir où aller pendant ma séance.

**Acceptance Criteria:**

**Given** un catalogue chargé avec structure de pan
**When** j'affiche la vue pan
**Then** la grille du pan est visible avec les prises à leurs positions (FR11)
**And** la visualisation est lisible à 2 mètres (tailles et contraste) (NFR4)
**And** l'interface reste réactive (< 500 ms pour 95 % des actions) (NFR2)

### Story 3.2: Visualisation de la séquence d'un bloc

En tant que grimpeur,
je veux voir la séquence de prises d'un bloc,
afin de connaître l'ordre à suivre.

**Acceptance Criteria:**

**Given** un bloc avec une séquence de prises
**When** je consulte le bloc
**Then** la séquence ordonnée est affichée clairement (FR12)
**And** les prises sont identifiables (numérotation ou highlight)

### Story 3.3: Mode séance – bloc en cours et navigation

En tant que grimpeur,
je veux afficher le bloc en cours et passer au suivant pendant la séance,
afin de suivre ma progression sans me perdre.

**Acceptance Criteria:**

**Given** une séance générée
**When** je lance le mode séance
**Then** le bloc en cours est affiché (FR13)
**When** je valide le passage au bloc suivant
**Then** le bloc suivant devient le bloc en cours (FR14)
**And** la navigation est fluide et claire

---

## Epic 4: Favoris

Le grimpeur peut enregistrer et réutiliser les blocs qu'il a aimés.

### Story 4.1: Stockage des favoris

En tant que grimpeur,
je veux que mes blocs favoris soient sauvegardés,
afin de les retrouver dans une prochaine session.

**Acceptance Criteria:**

**Given** des blocs marqués favoris
**When** l'application se ferme
**Then** les favoris sont sauvegardés automatiquement (NFR5, FR22)
**And** le fichier est dans le répertoire XDG (favorites.json)
**And** le fichier contient un champ version

### Story 4.2: Ajouter un bloc aux favoris

En tant que grimpeur,
je veux ajouter un bloc aux favoris pendant ou après une séance,
afin de le retrouver plus tard.

**Acceptance Criteria:**

**Given** un bloc affiché (pendant ou après une séance)
**When** je l'ajoute aux favoris
**Then** le bloc est enregistré dans la liste des favoris (FR15)
**And** je reçois une confirmation visuelle

### Story 4.3: Consulter la liste des favoris

En tant que grimpeur,
je veux consulter ma liste de blocs favoris,
afin de revoir ce que j'ai aimé.

**Acceptance Criteria:**

**Given** des blocs en favoris
**When** j'ouvre la vue favoris
**Then** je vois la liste complète des blocs favoris (FR16)
**And** chaque bloc affiche sa séquence de prises

### Story 4.4: Réutiliser un bloc favori dans une séance

En tant que grimpeur,
je veux inclure un bloc favori dans une séance,
afin de le refaire quand je veux.

**Acceptance Criteria:**

**Given** des blocs en favoris
**When** je génère une séance et choisis d'inclure un ou plusieurs favoris
**Then** les blocs favoris sont injectés dans la séance (FR17)
**And** la séance reste cohérente (ordre, contraintes)

---

## Epic 5: Export

Le grimpeur peut exporter ses séances pour usage hors du programme (téléphone, papier).

### Story 5.1: Export TXT

En tant que grimpeur,
je veux exporter une séance en format TXT,
afin de la consulter sur téléphone ou de l'imprimer.

**Acceptance Criteria:**

**Given** une séance générée
**When** j'exporte en TXT
**Then** un fichier .txt est créé avec un contenu lisible (FR18)
**And** l'encodage est UTF-8
**And** les blocs et prises sont clairement identifiables

### Story 5.2: Export Markdown

En tant que grimpeur,
je veux exporter une séance en format Markdown,
afin de la partager ou la consulter dans un lecteur MD.

**Acceptance Criteria:**

**Given** une séance générée
**When** j'exporte en Markdown
**Then** un fichier .md est créé avec structure Markdown (FR19)
**And** la mise en forme améliore la lisibilité (titres, listes)

### Story 5.3: Export JSON

En tant que grimpeur,
je veux exporter une séance en format JSON,
afin de la recharger ou l'utiliser dans des scripts.

**Acceptance Criteria:**

**Given** une séance générée
**When** j'exporte en JSON
**Then** un fichier .json est créé avec la session autonome (FR20)
**And** le format permet le rechargement dans le programme
**And** les champs respectent snake_case et les conventions du projet
