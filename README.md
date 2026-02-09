# Brlok

Application d'entraînement bloc sur pan domestique — génération de séances, pilotage en temps réel, exports.

**Stack :** Python 3.8+, PySide6, Typer. Compatible macOS, Windows, Linux.

---

## Installation

```bash
python -m venv .venv
source .venv/bin/activate   # Windows : .venv\Scripts\activate
pip install -e ".[dev]"
```

Tests : `pytest`

---

## Lancement

- **GUI** : `python -m brlok` ou `python launch_brlok.py`
- **CLI** : `brlok --help`

### Lancement rapide (double-clic)

- **macOS** : `brlok.command` — installe les dépendances si besoin, puis lance l'app
- **Windows** : `brlok.bat` — idem

---

## Fonctionnalités

| Épic | Statut | Description |
|------|--------|-------------|
| 1. Catalogue | ✅ | Modèles, persistance, import ODS |
| 2. Génération | ✅ | Contraintes niveau, tags, variété |
| 3. Vue séance | ✅ | Pan, séquence, navigation, ratio grille, couleurs |
| 4. Favoris | ✅ | Ajout, liste, réutilisation |
| 5. Export | ✅ | TXT, MD, JSON, PDF |
| 6. UX | ✅ | Ratio grille, code couleur, panneau séquence |
| 7. Données | ✅ | Multi-pan, commentaires, historique, modification séquence |
| 8. Avancé | ✅ | Templates, timer 40/20 pyramides EMOM, meilleur temps |

---

## Données (stockage XDG)

`~/.local/share/brlok/` (Linux), `~/Library/Application Support/brlok/` (macOS), `%APPDATA%\brlok\` (Windows) :

| Fichier | Description |
|---------|-------------|
| `catalog_collection.json` | Catalogues multi-pan |
| `favorites.json` | Blocs favoris |
| `sessions_history.json` | Historique des séances |
| `templates.json` | Templates de séance |
| `best_times.json` | Meilleurs temps par séquence |

### Dossier drop (import automatique)

Déposez des fichiers dans **`import/`** (à la racine du projet) : au démarrage, Brlok les importe et les fusionne avec vos données, puis les déplace dans `import/imported/`.

| Fichier à déposer | Fusion |
|-------------------|--------|
| `favorites.json` | Blocs ajoutés aux favoris (sans doublon) |
| `templates.json` | Templates ajoutés (sans doublon de nom) |
| `catalog_collection.json` | Chaque catalogue ajouté avec préfixe « Importé - » |

---

## CLI

```bash
# Génération
brlok generate --level 2 --blocks 5 --enchainements 10
brlok generate --template "40/20 classique" --output session.json

# Catalogues
brlok catalog catalogs          # Liste des catalogues
brlok catalog use "Pan maison"  # Sélectionner un catalogue
brlok catalog list              # Prises du catalogue actif
brlok catalog import pan.ods    # Import ODS

# Favoris
brlok favorites list

# Historique
brlok history list
brlok history show <id>

# Meilleurs temps
brlok best-times list

# Templates
brlok template list
brlok template remove "40/20"
brlok template rename "40/20" "40/20 classique"

# Export
brlok export txt session.json -o session.txt
brlok export md session.json -o session.md
brlok export json session.json -o session.json
brlok export pdf session.json -o session.pdf
```

---

## Licence

MIT
