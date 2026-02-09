# Checklist test manuel — Grille Pieds

## Prérequis
- Lancer l'app : `python -m brlok`

## A) Modèle et persistance

- [x] **Catalogue sans foot_grid** : Ancien fichier JSON sans `foot_grid` charge correctement avec grille par défaut
- [x] **Sauvegarde** : Modifier la grille pieds → sauvegarder → fermer l'app → rouvrir → la grille pieds est conservée
- [x] **Réinitialiser** : Bouton "Réinitialiser Pieds" remet la grille à la valeur par défaut

## B) UI Catalogue

- [x] **Onglet Catalogue** : La section "Pieds : 4×6" apparaît sous la grille mains
- [x] **Table 4×6** : Le tableau affiche 4 lignes × 6 colonnes avec les valeurs par défaut
- [x] **Ligne 0 non éditable** : La première ligne (en-têtes) n'est pas modifiable
- [x] **Lignes 1–3 éditables** : Double-clic ou sélection + F2 permet d'éditer les cellules
- [x] **Thème** : Bordures et couleurs cohérentes avec le thème (clair/sombre)
- [x] **Texte centré** : Les cellules sont alignées au centre

## C) Export

- [x] **Export TXT** : Exporter une séance en .txt → le fichier contient une section "Pieds (4×6)" avec la matrice
- [x] **Export Markdown** : Exporter en .md → section "## Pieds" avec tableau markdown
- [x] **Export sans catalogue** : Export depuis Bibliothèque utilise le catalogue actif pour la grille pieds

## D) Rétrocompatibilité

- [x] **Nouveau catalogue** : "Nouveau catalogue" crée un catalogue avec grille pieds par défaut
- [x] **Import ODS** : L'import ODS ne casse pas le catalogue (foot_grid conservé ou défaut)
