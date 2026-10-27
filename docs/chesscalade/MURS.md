# Chesscalade — Les pans et les murs (feuille de route)

> Complète la section 13 de [REGLES.md](REGLES.md). Point de départ : **le pan maison**, d'abord décrit comme
> une grille conceptuelle (Brlok desktop), qu'on fait évoluer vers sa forme réelle.

---

## 1. Trois types de murs

| | **Pan à grille** | **Pan libre (photo)** | **Mur à voies (salle)** |
|---|---|---|---|
| Exemples | le pan maison, MoonBoard | pan sans grille régulière, pan d'un ami | murs de salle |
| Ce qu'on décrit | les prises, case par case | les prises, touchées sur la photo | les voies : couleur, cotation, style |
| D'où viennent les blocs | générés | générés | **choisis** parmi les voies |
| Portée entre prises | en cases | en **centimètres** | sans objet |

Le pan maison passe du premier type au deuxième **sans changer d'identité** : mêmes prises, mêmes
identifiants (A1…F7), même historique et mêmes cotes de blocs. La photo et les positions réelles s'ajoutent
par-dessus la grille.

---

## 2. Étapes

### Étape 1 — Éditeur de pan (fait)

Dans l'onglet **Pan → Modifier le pan** :

- toucher une case : poser une prise, changer son niveau (1 à 6), son type (bac, réglette, pince, plat,
  bi-doigt, mono, inversée, volume, ou une étiquette libre), la rendre inutilisable, la retirer ;
- marquer des **enchaînements impossibles** entre deux prises (le générateur ne les propose plus) ;
- changer le nom et la **taille de la grille** (les rangées et colonnes s'ajoutent du côté des numéros
  les plus grands ; les prises qui sortent de la grille sont listées avant d'être retirées) ;
- créer un pan vide, dupliquer un pan (pour essayer une variante sans toucher l'original), supprimer un pan.

Le format reste compatible avec Brlok desktop (import et export), dans la limite du niveau 5 côté desktop.

### Étape 2 — Le pan maison en photo

1. **Photo** du pan (tablette) ou image importée ; elle est enregistrée avec la page.
2. **Redressement** : toucher les 4 coins du pan ; la perspective est corrigée (vue de face).
3. **Échelle** : largeur réelle du pan (ex. 3,20 m) ; on en déduit la position de chaque prise en cm.
4. **Recalage** : chaque prise existante (A1…) est d'abord placée au centre de sa case ; on la fait glisser
   sur sa vraie position. On peut aussi en ajouter là où il n'y a pas de case.
5. **Portée réelle** : la distance max entre deux prises se règle en cm (selon la taille du grimpeur) ; le
   caractère des pièces (monter, traverser, diagonale) se calcule sur les vraies directions.
6. Pendant les blocs, le pan s'affiche **sur la photo**, prises numérotées dans l'ordre.

Modèle : chaque prise garde sa case (`position`) et gagne une position réelle facultative (`x`, `y` en cm) ;
le pan gagne des dimensions réelles et une photo redressée. Sans photo, tout fonctionne comme aujourd'hui.

**Pieds** : la photo permettrait enfin de placer les prises de pied à leur vraie position (au lieu de la
grille pieds de Brlok, aujourd'hui fusionnée dans la grille des mains). À décider.

### Étape 3 — Mur à voies (salle)

- Créer les voies : couleur (prélevée sur la photo), cotation (5c, 6a+…), style (dalle, dévers, dynamique,
  traversée…) ; placer les prises est facultatif.
- Cote de départ déduite de la cotation (REGLES.md §13.3), puis corrigée par Glicko-2.
- La pièce correspond à un style : tour ↔ traversée ou ligne droite, cavalier ↔ dynamique ou décalé,
  pion ↔ dalle courte, roi ↔ bloc compact, fou ↔ diagonale, dame ↔ long et varié.
- Modes : blocs-défis, « Même bloc » et « Bloc imposé » choisissent une voie au lieu d'en générer une ;
  « Ajoute une prise » n'est possible que si les prises sont placées.
- Les salles changent leurs voies : archiver une voie démontée, avec son historique.

### Étape 4 — Détection assistée (plus tard)

- Repérer les prises d'une couleur sur la photo (analyse de couleur).
- Proposer à Claude de repérer les prises sur la photo (expérimental).

---

## 3. Questions ouvertes

1. En salle : photographier chaque voie, ou seulement saisir une liste (« vert 5c dalle… ») ?
2. Pieds à leur vraie position sur la photo : utile, ou les mains suffisent ?
3. Portée réelle : une seule valeur par pan, ou une par joueur (selon sa taille) ?
