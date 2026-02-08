---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'Générateur d''entraînements d''escalade bloc sur pan - coach local reproductible'
session_goals: 'Explorer idées autour de: gestion prises (catalogue ODS), génération blocs/séquences avec contraintes, pilotage temps réel (timer, intervalles), exports (texte, JSON, visuel PDF), architecture modulaire CLI-first'
selected_approach: 'progressive-flow'
techniques_used: ['What If Scenarios', 'Morphological Analysis', 'SCAMPER Method', 'Resource Constraints']
ideas_generated: 10
context_file: '_bmad/bmm/data/project-context-template.md'
---

# Brainstorming Session Results

**Facilitator:** Hsmy
**Date:** 2026-02-07

## Session Overview

**Topic:** Générateur d'entraînements d'escalade "bloc" sur pan — un coach local et reproductible. Piloté par un catalogue de prises (tableur ODS pour l'instant) et un moteur de progression du plus simple au plus difficile.

**Goals:** 
- Gérer les prises (ID, difficulté 1–5, actif/inactif, tags) avec modification facile
- Générer blocs/séquences avec contraintes (niveau, variété, tags, exclusion prises inactives)
- Piloter la séance en temps réel : timer, intervalles (40/20×8, pyramides, EMOM, tempo par mouvement)
- Exporter : TXT/MD, JSON, visuel (timeline + cartes pan avec prises numérotées)
- MVP CLI avec architecture modulaire (modèles, import ODS, générateur, scheduler, timer, exports)

### Context Guidance

Focus sur développement logiciel et produit : problèmes utilisateurs, idées de fonctionnalités, approches techniques, UX, risques techniques, métriques de succès.

### Session Setup

Session initialisée pour brainstorming centré sur le produit "générateur d'entraînements bloc" — exploration créative des possibilités, contraintes, et pistes d'innovation.

## Technique Selection

**Approach:** Progressive Technique Flow
**Journey Design:** Systematic development from exploration to action

**Progressive Techniques:**

- **Phase 1 - Exploration:** What If Scenarios pour maximiser la génération d'idées
- **Phase 2 - Pattern Recognition:** Morphological Analysis pour organiser les insights
- **Phase 3 - Development:** SCAMPER Method pour raffiner les concepts
- **Phase 4 - Action Planning:** Resource Constraints pour le plan d'implémentation

**Journey Rationale:** Progression naturelle de l'exploration large vers un plan d'action concret pour le générateur d'entraînements bloc.

---

## Technique Execution Results — Phase 1

**Technique:** What If Scenarios (exploration axée sur le modèle de données et les fonctionnalités)

### Idées générées

| # | Catégorie | Titre | Concept | Novelté |
|---|-----------|------|---------|---------|
| 1 | UX | Portabilité par exports | Exports (TXT, MD, JSON, PDF) pour utiliser ailleurs sans le PC ; le programme reste Python | Partage sans dépendance mobile |
| 2 | UX | CLI + interface Python | CLI en premier ; GUI optionnelle (tkinter, PyQt, ou web local Flask) | Toujours Python |
| 3 | UX | Mode live (si GUI) | Vue pan 2D + progression + timer, au choix ; pilotage en séance | Modulable selon le besoin |
| 4 | Données | Liberté et contrôle | Pas d'IA imposée ; évaluation difficulté par l'utilisateur | Garde la main sur la difficulté |
| 5 | Données | Difficulté multi-dimensionnelle | Par prise (taille, type, angle) + par enchaînement | Modèle riche et évolutif |
| 6 | Données | Modèle Hold | id, level 1-5 ou 99, tags[], position {row,col}, extensions optionnelles | Compatible ODS, extensible |
| 7 | Données | Modèle Block | name, holds[], timing par bloc, target_level, tags_filter | Chaque bloc a son propre timing |
| 8 | Données | Modèle Session | program + blocks avec timing individuel ; templates prédéfinis + personnalisation | Modulable, pas de durée fixe |
| 9 | Export | JSON hybride | Export autonome (tout en un) pour partage ; catalogue interne pour réutilisation | Meilleur des deux approches |
| 10 | UX | Favoris | Blocs aimés → catalogue → liste favoris (références) ; réutilisation rapide | Court-circuit "j'ai aimé" → "je réutilise" |

### Modèle de données consolidé

```yaml
Hold:
  id: string           # "A1", "C7"
  level: 1|2|3|4|5|99  # 99 = inactif
  tags: string[]       # liste ouverte
  position: { row, col }
  # Extensions: size?, type?

Block:
  id?: string
  name?: string
  holds: string[]
  timing: { ... }      # par bloc, modulable
  target_level?: 1-5
  tags_filter?: string[]

Session:
  blocks: Block[]
  program?: Program
  created: datetime

Catalog:
  blocks: { id: Block }
  favorites: string[]   # IDs de blocs favoris

Export JSON: session autonome (blocs inclus) pour partage
Import: extraction vers catalogue pour réutilisation
```

### Analyse du tableur existant

- **Plan** : grille réelle du pan ; 1-5 = difficulté, 99 = inactif
- **Générateurs** : Liste prises + Niveau + Random pour tri
- **Blocs** : séquences sauvegardées avec timestamp
- **Patch 1 GD** : paires Gauche/Droite pour exercices symétriques

---

## Vision révisée — Python-first

**Contrainte centrale :** Rester sur Python et une interface liée à Python.

### Stack technique

| Composant | Technologie |
|-----------|-------------|
| **Langage** | Python |
| **Interface principale** | CLI (argparse, click, Typer) |
| **Interface possible** | GUI Python (tkinter, PyQt, Dear PyGui) ou web local (Flask/FastAPI + navigateur) |
| **Import ODS** | openpyxl ou pandas + odfpy |
| **Exports** | stdlib (json, fichiers texte) + bibliothèques PDF/images |

### Ce qui change

- **Pas d'app mobile native** — Les exports (TXT, MD, JSON, PDF) restent pour partage/lecture ailleurs ; le programme tourne sur machine Python.
- **CLI en premier** — Toutes les actions accessibles en ligne de commande ; réutilisable par scripts, automation, ou encapsulation dans une GUI.
- **Interface graphique optionnelle** — Si GUI : Python natif (tkinter, PyQt) ou web local (Flask/FastAPI, ouvert dans le navigateur).
- **Portabilité** — Un script Python + un venv suffisent ; pas de dépendance à un écosystème JS/React.

### Architecture modulaire (Python)

```
brlok/
├── models/          # Hold, Block, Session, Catalog
├── import_ods/      # Import catalogue depuis tableur
├── generator/       # Génération blocs avec contraintes
├── scheduler/       # Timer, intervalles, programmes
├── exports/         # TXT, MD, JSON, PDF, images
├── cli/             # Commandes CLI
└── (gui/)           # Optionnel : tkinter / web
```

### Modèle de données (inchangé)

Le modèle Hold, Block, Session, Catalog, favoris et exports reste identique ; seule la stack d'exécution est Python + interface Python.

---

## Technique Execution Results — Phase 2

**Technique:** Morphological Analysis (organisation des axes et variantes)

### Matrice morphologique

| Axe | Variantes | Choix retenu |
|-----|-----------|--------------|
| **Interface** | CLI seul / CLI + GUI native / CLI + web local | CLI + GUI PySide6 |
| **Import catalogue** | ODS / CSV / JSON manuel | ODS (tableur existant) |
| **Stockage** | Fichiers JSON / SQLite / en mémoire | JSON local (XDG) |
| **Timer** | Intégré / externe / optionnel | Intégré (mode séance) |
| **Exports** | TXT / MD / JSON / PDF | TXT, MD, JSON (PDF post-MVP) |

### Insights structurés

- **Priorité données** : catalogue ODS → modèles Hold/Block → génération → exports
- **Séparation** : models/ sans dépendance UI ; generator/ testable isolément
- **Extensions** : taille/type de prise reportées en tags pour flexibilité

---

## Technique Execution Results — Phase 3

**Technique:** SCAMPER Method (raffinement des concepts)

| Lettre | Application | Idée retenue |
|--------|-------------|--------------|
| **S**ubstituer | Interface | Typer + PySide6 au lieu de tkinter (support Qt mature) |
| **C**ombiner | Exports + favoris | Export JSON autonome + import vers catalogue favoris |
| **A**dapter | Patch 1 GD | Tags "gauche"/"droite" pour exercices symétriques |
| **M**odifier | Difficulté | Échelle 1-5 + 99 (inactif) alignée sur tableur |
| **P**ut to other use | JSON | Même format pour catalogue, session, favoris |
| **E**liminer | Cloud/IA | Pas de cloud ; difficulté gérée par l'utilisateur |
| **R**everse | Workflow | Catalogue d'abord, puis génération (pas de génération sans données) |

---

## Technique Execution Results — Phase 4

**Technique:** Resource Constraints (plan d'implémentation)

### Contraintes identifiées

- **Technique** : Python 3.8+, pip/venv, pas de build complexe
- **Données** : Catalogue ODS existant comme source de vérité
- **Temps** : MVP CLI viable avant ajout GUI

### Plan d'implémentation (ordre)

1. **Initialisation** : venv, pyproject.toml, structure brlok/
2. **Modèles** : Hold, Catalog (Pydantic)
3. **Persistance** : storage JSON (XDG)
4. **Catalogue** : import ODS, consultation
5. **Génération** : blocs avec contraintes (niveau, tags, exclusion inactifs)
6. **Exports** : TXT, MD, JSON
7. **GUI** : fenêtre pan, mode séance, timer
8. **Favoris** : stockage, réutilisation

### Risques et mitigations

| Risque | Mitigation |
|--------|------------|
| ODS peu documenté | openpyxl ou odfpy ; tests sur fichier réel |
| Génération trop lente | Contraintes simples d'abord ; optimiser si besoin |
| GUI complexe | CLI complet d'abord ; GUI minimaliste |

---

## Synthèse finale

Le brainstorming converge vers une application **Python CLI-first** avec GUI PySide6 optionnelle. Le modèle de données (Hold, Block, Session, Catalog) sert de base. La priorité est le catalogue et la génération, puis les exports et la GUI. Pas de cloud ni d'IA ; l'utilisateur garde le contrôle sur la difficulté et les prises.
