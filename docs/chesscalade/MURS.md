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

**Pan express** (onglet Pan) : pour jouer tout de suite sur un pan qu'on n'a pas décrit. On donne la
taille de la grille ; chaque case reçoit une prise de niveau 3. La difficulté vient alors des
enchaînements, et les cotes des blocs s'ajustent en jouant. Pour affiner en quelques secondes : **peinture
rapide** dans l'éditeur, où chaque toucher fait monter le niveau de la case (1 → 6, puis 1).

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

**Pieds** : décidé, on reste sur le placement des mains ; les pieds sont une règle de difficulté
(REGLES.md §7.6), sans placement sur la photo.

**Constat sur la photo du pan maison** (premier test) :

- la grille A–F × 1–7 est **tracée sur le bois** : la grille de Brlok est la grille physique ; rangée 1 en
  haut, rangée 7 en bas (côté grimpeur) ;
- la photo a été prise **pendant un changement de prises** : en temps normal, **chaque case porte une
  prise**, et le catalogue est juste (pas de « pan réel » à créer) ; les prises posées sur la ligne du bas
  étaient en cours de déplacement ;
- fond en bois clair : la détection par couleur fonctionne bien, noir compris ;
- il faut **les 4 coins** de la grille sur la photo (la perspective rend 3 coins insuffisants) ; comme la
  grille est tracée, ses coins pourraient être retrouvés automatiquement.

Pas de nouvelle photo possible pour l'instant : l'étape 2 (pan en photo) attend une photo prise avec les
4 coins visibles. Le pan reste décrit par sa grille, qui correspond déjà au pan physique.

### La poutre

La « grille pieds » de Brlok desktop est en fait la **poutre posée au-dessus du pan** (4 × 6 : bacs,
plats à 20° et 35°, bi-doigts de 30 et 50 mm, réglettes de 18 à 45 mm). Elle n'est plus fusionnée dans le
pan. Pistes pour en faire un **agrès** du jeu :

- **sortie** de bloc : finir en se suspendant à une prise de poutre donnée ;
- **suspension imposée** (ex. 7 s sur la réglette de 20 mm) comme pénalité ou comme recharge ;
- un type de bloc « poutre » pour la pièce **tour** (puissance, statique).

### Étape 3 — Mur à voies (salle) (fait, v1)

Dans l'onglet **Pan → Nouveau mur à voies (salle)**, puis **Gérer les voies** :

- **photo du secteur** (facultative) : réduite et enregistrée avec le mur ; les prises de **couleur vive**
  sont repérées automatiquement (rouge, orange, jaune, vert, bleu, violet, rose ; les grands aplats peints
  sont écartés). Le blanc, le noir et le gris se placent à la main en touchant la photo ;
- **créer une voie** : toucher une couleur repérée (ses prises sont marquées d'un coup), ajuster en
  touchant la photo (ajouter ou retirer une prise), puis donner la **cotation** (Font, ou « inconnue »),
  un **nom ou numéro** facultatif et les **styles** (dalle, vertical, dévers, toit, dynamique, traversée,
  diagonale, compact, long, réglettes, plats, compression, technique) ;
- **démonter** une voie la garde avec son historique mais ne la propose plus ; on peut la remettre.

Dans le jeu, sur un mur à voies, les blocs sont **choisis** et non générés :

- la voie en place dont la cote est **la plus proche de la cote visée** ; cote de départ = cotation
  (REGLES.md §13.3), puis cote apprise par Glicko-2 dès qu'elle a été grimpée ;
- de préférence au **style de la pièce** : pion ↔ dalle, vertical ; cavalier ↔ dynamique ; fou ↔ diagonale,
  technique ; tour ↔ traversée, vertical ; dame ↔ long, dévers, toit ; roi ↔ compact, compression.
  À défaut, la voie la plus proche en cote (l'app le signale) ;
- blocs-défis, placement, cloche, défense, contre-attaque : une voie ; **Même bloc** : une voie pour les
  deux (au lieu de toucher la prise la plus haute, on indique combien de prises on a tenues) ; **Bloc
  imposé** : chacun choisit pour l'autre une voie sous le budget ; **Ajoute une prise** : indisponible (les
  prises ne sont pas décrites une à une) ;
- chaque voie a sa propre cote (indépendante de la règle de pieds) et apparaît au journal sous son nom.

**Brlok en salle, sans Chesscalade** (onglet Pan, sur un mur à voies) :

- **Séance** : N voies autour d'une cote, avec les répartitions de Brlok (uniforme, progressive, pyramide,
  régressive, crux, alternance ; un cran = 100 points de cote). Une voie n'est reprise que s'il y a moins de
  voies que de blocs demandés.
- **Carnet** : toutes les voies en place, triées par cotation, avec pour le joueur actif « réussie (n/m) »,
  « n essais » ou « pas encore tentée », et des boutons Réussi / Raté sur chaque ligne ; filtre « pas encore
  réussies ».
- **Choisir une voie** sans pièce (« Aucune ») : simplement la voie la plus proche de la cote visée.
- **Minuteur** sur chaque bloc ou voie de la séance : travail/repos (40/20, 50/28…), pyramide, EMOM,
  chrono avec **meilleurs temps** par joueur ; mode grand écran, signal sonore et visuel, enchaînement
  automatique des blocs de la séance.

Limites de la v1 : une seule photo par mur (un secteur), pas de redressement (inutile ici : on ne mesure pas
de distances), et dans les salles où une couleur regroupe plusieurs voies, il faut retirer à la main les
prises qui n'en font pas partie.

### Étape 4 — Détection assistée (plus tard)

- Repérer les prises d'une couleur sur la photo (analyse de couleur).
- Proposer à Claude de repérer les prises sur la photo (expérimental).

---

## 3. Questions ouvertes

1. En salle : photographier chaque voie, ou seulement saisir une liste (« vert 5c dalle… ») ?
2. Portée réelle (écart max entre deux prises qui se suivent, en cm) : une valeur par pan, ou une par joueur
   selon sa taille ou son envergure ?
3. Photo du pan maison : idéalement d'un seul plan, de face ou presque, fond clair (test de détection par
   couleur concluant dans ce cas ; murs peints et multi-faces : seulement des suggestions à valider).
