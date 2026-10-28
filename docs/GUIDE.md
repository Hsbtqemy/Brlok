# Guide de Brlok · Chesscalade

> Le mode d'emploi de l'app : ce qu'on trouve dans chaque onglet, comment se jouent les parties, comment
> décrire ses murs. Les règles complètes (valeurs, cas limites) sont dans
> [chesscalade/REGLES.md](chesscalade/REGLES.md), et les murs plus en détail dans
> [chesscalade/MURS.md](chesscalade/MURS.md).

**Adresse de l'app** : https://hsbtqemy.github.io/Brlok/

---

## Sommaire

1. [Premiers pas](#1-premiers-pas)
2. [Les quatre onglets](#2-les-quatre-onglets)
3. [Les murs : pans et salles](#3-les-murs--pans-et-salles)
4. [Grimper sans partie d'échecs](#4-grimper-sans-partie-déchecs)
5. [Lancer une partie de Chesscalade](#5-lancer-une-partie-de-chesscalade)
6. [Les types de partie](#6-les-types-de-partie)
7. [Pendant une partie](#7-pendant-une-partie)
8. [Joueurs, cotes et placement](#8-joueurs-cotes-et-placement)
9. [L'app sur téléphone et tablette](#9-lapp-sur-téléphone-et-tablette)
10. [Petit lexique](#10-petit-lexique)

---

## 1. Premiers pas

1. **Installer l'app** :
   - iPad / iPhone (Safari) : *Partager → Sur l'écran d'accueil* ;
   - Android (Chrome) : bouton « Installer l'app » en haut, ou menu ⋮ → *Installer l'application* ;
   - ordinateur : icône d'installation dans la barre d'adresse.

   Elle marche ensuite **sans réseau**.
2. **Créer un mur** (onglet **Murs**). Plusieurs façons, voir §3 :
   - le plus rapide est un *pan express*, ou *Pan rapide* depuis l'accueil de Grimper ;
   - le plus précis est un *mur à voies* avec photos, ou ton catalogue Brlok importé.
3. **Créer son joueur** (onglet **Joueurs**). Ce n'est pas obligatoire : sans joueur, tu grimpes en
   « Invité ». Un joueur permet en revanche de garder ses cotes, son carnet et son historique. Fais ensuite
   le **placement** (5 blocs) pour fixer ta cote de grimpe de départ.
4. **Grimper** (onglet **Grimper**) ou **jouer** (onglet **Partie**).

---

## 2. Les quatre onglets

| Onglet | À quoi il sert |
|---|---|
| **Grimper** | Utiliser un mur : bloc-défi ou voie à la cote voulue, séance, carnet de voies, minuteur |
| **Partie** | Chesscalade : lancer une partie (en étapes), la jouer, la reprendre |
| **Murs** | Décrire ses murs : créer, photographier, éditer les prises et les voies, importer / exporter |
| **Joueurs** | Profils, trois cotes, placement, journal des blocs et des parties, sauvegarde, version de l'app |

Sur téléphone et tablette, les onglets sont dans une **barre en bas** de l'écran. Elle disparaît pendant
qu'on grimpe un bloc, pour laisser la place au mur. Le bouton rond en haut à droite change le **thème** :
automatique, jour ou nuit.

---

## 3. Les murs : pans et salles

### 3.1 Deux types de murs

| | **Pan à grille** | **Mur à voies (salle)** |
|---|---|---|
| Exemples | le pan maison, une MoonBoard | les murs d'une salle d'escalade |
| Ce qu'on décrit | les prises, case par case, avec un niveau de 1 à 6 | les voies : couleur, cotation, styles, prises sur une photo |
| D'où viennent les blocs | **générés** par l'app | **choisis** parmi les voies en place |

### 3.2 Les façons d'ajouter un mur (onglet Murs)

| Bouton | Ce que ça crée | Quand l'utiliser |
|---|---|---|
| **Mur à voies (salle)** | un mur vide, auquel on ajoute des secteurs (photos) puis des voies | en salle |
| **Pan à grille (vide)** | une grille 6 × 7 sans prises, à remplir dans l'éditeur | pour décrire un pan prise par prise |
| **Pan express** | une grille de la taille voulue, **une prise par case**, toutes de niveau 3 | pour jouer tout de suite sur un pan qu'on n'a pas décrit |
| **Catalogue Brlok…** | les pans d'un fichier `catalog_collection.json` de Brlok desktop | pour reprendre ses pans existants |
| **Charger l'exemple** | le catalogue d'exemple du dépôt | pour essayer |

Deux raccourcis existent aussi en dehors de l'onglet Murs :

- quand il n'y a encore aucun mur, l'onglet **Grimper** propose un *Pan rapide* en un geste ;
- au lancement d'une partie, l'étape « Où ? » propose aussi un **Pan rapide** (colonnes × rangées). Il est
  créé une fois puis réutilisé.

Toucher un mur de la liste l'ouvre dans son éditeur. **Exporter pour Brlok desktop** produit le fichier au
format desktop (les prises de niveau 6 y sont ramenées à 5).

### 3.3 Éditer un pan à grille

Dans l'éditeur du pan :

- **toucher une case** : poser une prise, changer son niveau (1 à 6) et son type (bac, réglette, pince,
  plat, bi-doigt, mono, inversée, volume, ou étiquette libre), la rendre inutilisable, la retirer ;
- **peinture rapide** : chaque toucher fait monter le niveau de la case (1 → 6, puis 1). C'est idéal pour
  affiner un pan express en quelques secondes ;
- **enchaînements impossibles** : relier deux prises que le générateur ne doit pas enchaîner ;
- **nom, grille, orientation** : taille de la grille, côté du bas (rangée 1 ou dernière rangée), portée
  entre deux prises (en cases) ;
- **dupliquer** un pan pour essayer une variante sans toucher l'original, ou le **supprimer**.

### 3.4 Décrire un mur à voies (salle)

La page du mur montre ses **secteurs** (un par photo), la carte du secteur ouvert avec ses voies, et la
liste des voies rangée par secteur.

**Ajouter une photo de secteur** :

- **📷 Photo** ouvre l'appareil photo dans l'app (caméra arrière). La photo n'est pas perdue si le
  téléphone recharge la page. Si la caméra est refusée, un bouton propose l'appareil photo du téléphone ;
- **Image…** prend une image de la galerie ;
- **+ Secteur** ajoute un autre secteur (une autre photo) au même mur.

**Créer une voie** ouvre l'**éditeur de voie**, à part, en deux temps. Rien n'est enregistré avant
« Créer » ou « Enregistrer » ; la barre *Annuler / Créer* reste visible en bas.

1. **Les prises sur la photo**, avec des outils :

   | Outil | Ce qu'il fait |
   |---|---|
   | **Pipette** | toucher une prise marque toutes les prises de sa teinte (blanc, noir et gris compris) et nomme la couleur de la voie. La tolérance se règle seule, puis se corrige au curseur |
   | **Zone** | encadrer la voie d'un glisser : seules les prises dans le cadre comptent (utile quand une couleur sert à plusieurs voies, ou pour écarter lampes et plafond) |
   | **Ajouter / retirer** | retouches prise par prise |
   | **Départ / top** | toucher une prise la marque départ (D), puis top (T) |
   | **Ordre** | toucher les prises dans l'ordre de l'enchaînement (1, 2, 3…). « Numéroter de bas en haut » fait tout d'un coup, à corriger ensuite |
   | **Agrandir** | photo deux fois plus grande, à faire défiler, pour viser juste sur téléphone |

2. **La fiche** :
   - **cotation** : échelle Font, ou « inconnue » ;
   - **nom ou numéro** : facultatif ;
   - **styles** : dalle, vertical, dévers, toit, dynamique, traversée, diagonale, compact, long, réglettes,
     plats, compression, technique.

   Les styles servent à associer une voie à une pièce d'échecs (§7.2).

**Démonter** une voie la retire du jeu mais garde son historique ; on peut la remettre plus tard.

### 3.5 Les variantes d'une voie

Avec peu de voies, on retomberait sans cesse sur les mêmes. Une **variante** rend une voie plus facile ou
plus dure, pour coller à la cote visée. Chaque paire voie + variante a sa propre cote.

| Variante | Effet | Condition |
|---|---|---|
| Pieds libres | −100 | — |
| Jusqu'à la prise n° k (aux 3/5 environ) | −150 | voie numérotée (4 prises ou plus) |
| Un mouvement sans pied | +150 | — |
| Aller-retour (monter puis redescendre) | +150 | — |
| Sans doubler (une main par prise) | +150 | voie numérotée |
| Saute une prise (au choix) | +200 | voie non numérotée |
| Sans la prise n° k | +200 | voie numérotée |
| Deux fois (sans poser les pieds entre les deux) | +250 | — |

Les variantes permises se cochent dans « Choisir une voie », dans la séance et au lancement de partie. Le
réglage est commun et retenu. Une variante n'est choisie que si elle rapproche nettement de la cote visée :
la voie telle quelle reste préférée. La prise visée est montrée sur la photo (fin cerclée de vert, ou prise
barrée de rouge).

---

## 4. Grimper sans partie d'échecs

L'onglet **Grimper** utilise le mur actif. Sa partie haute montre le pan ou la photo, avec le bloc en
cours numéroté.

### Sur un pan à grille

- **Chesscalade (bloc-défi)** : un bloc généré à la **cote visée**, au caractère d'une **pièce** (ou
  « Aucune », juste la cote). On choisit aussi la longueur, la règle de pieds et « Crux en dernier ».
  L'app affiche la cote estimée et les assouplissements éventuels (si le mur est trop pauvre au niveau
  demandé).
- **Brlok classique** : une séance de N blocs, comme dans Brlok desktop :
  - un profil de niveau et une **répartition** (uniforme, progressive, pyramide, régressive, crux central,
    alternance) ;
  - un nombre de prises par bloc ;
  - une option de variété.

### Sur un mur à voies

- **Choisir une voie** : la voie en place la plus proche de la cote visée, de préférence au style de la
  pièce choisie, avec variante si besoin.
- **Séance** : N voies autour d'une cote, avec une répartition (un cran = 100 points de cote). Avec les
  variantes, une voie déjà prise revient sous une autre variante plutôt qu'à l'identique.
- **Carnet** : toutes les voies en place, triées par cotation, avec ton état (réussie, n essais, pas encore
  tentée) et des boutons **Réussi / Raté** sur chaque ligne. Le filtre « Pas encore réussies » montre ce
  qui reste à faire.

### Le minuteur

Il est disponible sur chaque bloc ou voie, et sur une voie touchée dans le carnet :

| Mode | Principe |
|---|---|
| **Travail / repos** | 40/20, 50/28… en boucle |
| **Pyramide** | des durées qui montent puis redescendent |
| **EMOM** | un départ chaque minute |
| **Chrono** | temps de la voie, avec tes **meilleurs temps** |

Le **grand écran** montre le mur en grand à côté du minuteur, avec des signaux sonore et visuel, et
enchaîne les blocs de la séance.

Chaque **Réussi / Chute** met à jour ta cote de grimpe et celle du bloc ou de la voie.

---

## 5. Lancer une partie de Chesscalade

L'onglet **Partie** déroule le lancement en **étapes**. Chaque choix est expliqué en phrases, et
« Suivant » passe à l'étape d'après.

1. **Qui joue ?**
   - **Solo contre Stockfish** : ta couleur (Blancs, Noirs, au hasard) et la force du moteur (400 à 2800 ;
     par défaut ta cote Chesscalade) ;
   - **À deux** : un joueur pour les Blancs, un pour les Noirs.
2. **Quelle partie ?** Le type de partie (§6) et la cadence :
   - **Blitz** : environ 10 à 15 min ;
   - **Classique** : environ 25 à 40 min.

   Pour les rounds, on choisit aussi le format du duel au mur.
3. **Où ?** Un **mur enregistré** ou un **Pan rapide**. Pour une salle, choisis les **voies retenues**
   (toutes par défaut ; un bouton par secteur) et les **variantes permises**.
4. **Quelle intensité ?** (intrications seulement)
   - **Niveau** : Facile, Modéré, Difficile, Diabolique ;
   - **Densité** de blocs : légère, normale, intense ;
   - **Passage au mur** : à chaque bloc, ou par séries de 3 ;
   - **Règle de pieds** (pan) : selon le niveau, ou au choix ;
   - **Déviation** : courte ou libre ;
   - **Fatigue** : par joueur.

   Chaque carte dit en trois lignes ce que le réglage change.
5. **Récapitulatif** : toute la partie en phrases (qui joue, durée, ce qui fait grimper, ce que coûte une
   chute…), puis **Commencer la partie**.

**Rejouer comme la dernière fois** relance directement avec les mêmes réglages. Une partie en cours est
sauvegardée à chaque action : **Reprendre la partie** la retrouve, même après fermeture de l'app.

---

## 6. Les types de partie

Ce qui distingue les quatre types, c'est **ce qui fait grimper** et la force du lien entre les échecs et le
mur.

| Type | Ce qui fait grimper | En une phrase |
|---|---|---|
| **Intrication** | les coups de la partie (prises, échecs…) | La partie déclenche la grimpe : une prise, un échec, et c'est au mur |
| **Intrication rythmée** | les coups, plus une cloche régulière | L'intrication, plus une cloche : chacun grimpe sur sa pièce la plus active |
| **Rounds** | la cloche, à rounds fixes | Comme le chessboxing : rounds d'échecs et duels au mur en alternance |
| **Rounds couplés** | la cloche | Des rounds dont le duel vient de la position ; le gagnant prend un bonus |

### 6.1 Intrication (le cœur du jeu)

On joue une vraie partie d'échecs. Certains coups (prises, échecs, mat…, selon la densité) sont
**en suspens** : il faut grimper un **bloc-défi** pour les confirmer.

- **La pièce donne le caractère du bloc** :

  | Pièce | Caractère du bloc |
  |---|---|
  | Pion | court, montée directe |
  | Cavalier | décalé, changements de direction |
  | Fou | diagonale |
  | Tour | montée verticale ou traversée |
  | Dame | long et varié |
  | Roi | court et compact |

- **La pièce prise donne la difficulté.** Prendre un pion est facile, prendre la dame est dur (−300 à
  +300 sur ta cote de grimpe), à quoi s'ajoute le bonus du niveau.
- **Le résultat décide du coup** :
  - une **réussite** valide le coup et rapporte du temps ;
  - une **chute** donne un **verdict**, et les chutes à la suite aggravent le verdict :

  | Verdict | Effet |
  |---|---|
  | Validé | le coup est joué |
  | Validé + pénalité | le coup est joué, tu perds du temps |
  | Limité | le coup est joué, mais la pièce est **épuisée** (elle ne bouge plus pendant 1 ou 2 tours) |
  | Annulé | le coup est retiré : joue un autre coup |
  | Interdit | le coup est retiré et la pièce épuisée : joue une autre pièce |
  | Dévié | la même pièce doit bouger, mais **pas sur la case visée** (case légale la plus proche) |
  | Dévié par l'adversaire | pareil, mais c'est l'adversaire (ou le moteur) qui choisit la case |

- **Les niveaux** :

  | Niveau | 1re chute | Pire verdict possible | Essais | Pendule pendant le bloc |
  |---|---|---|---|---|
  | Facile | Validé + pénalité | Limité | 2 | en pause |
  | Modéré | Limité | Interdit | 1 | en pause |
  | Difficile | Annulé | Dévié | 1 | en pause, limite de bloc plus courte |
  | Diabolique | Annulé | Dévié par l'adversaire | 1 | **tourne** |

- **La densité** règle combien de coups font grimper :
  - **Légère** : seules les prises de pièces et le mat ;
  - **Normale** : un échange = un seul bloc, et le coup qui suit un bloc est libre ;
  - **Intense** : chaque prise, échec et roque.

  Le **mat** demande toujours un bloc réussi.
- **Le passage au mur** :
  - **À chaque bloc** (défaut à deux) : le bloc se grimpe aussitôt et décide du coup ;
  - **Par séries de 3** (défaut en solo) : le coup est joué tout de suite et son bloc **attend** (1/3,
    2/3…). Au troisième, ou quand tu le décides (« Aller au mur maintenant »), tu grimpes les blocs
    d'affilée. Pas de verdict dans ce cas : une réussite rapporte du temps, une chute en coûte.
- **La pendule verticale** : on ne gagne du temps qu'en grimpant.
  - **Recharge** : avant ton coup, au plus 1 tous les 5 coups. Ta pendule tourne pendant le bloc : grimpe
    vite.
  - **Recharge (bloc dur)** : un bloc plus dur, qui rapporte plus en Classique (+90 s au lieu de +60 s).
- **Les blocs du défenseur** :
  - à deux, en Classique, celui qui est mis en échec grimpe un court **bloc de parade** ;
  - en solo, les prises du moteur te font grimper un **bloc de défense** (seulement du temps en jeu).
- **La contre-attaque** (solo, Difficile et Diabolique, une fois par partie) : annule le dernier coup du
  moteur en réussissant un bloc très dur. Le moteur rejoue alors un autre coup.
- **La fatigue** (option, par joueur) : la cote visée baisse de 15 à chaque bloc grimpé. On peut l'activer
  en cours de partie, au début de son tour.

### 6.2 Intrication rythmée

Tout comme l'intrication, plus une **cloche** toutes les **4 min** (Blitz) ou **8 min** (Classique) de
jeu. Chaque joueur grimpe alors un bloc sur sa pièce la plus active. Ça empêche de fuir les prises pour ne
jamais grimper. En Blitz, la cloche sonne rarement : c'est surtout en Classique qu'elle rythme la partie.

### 6.3 Rounds (façon chessboxing)

On alterne des **rounds d'échecs** (2 min en Blitz, 4 et 3 min en Classique) et des **duels au mur**.
Pendant le duel, l'échiquier est figé mais visible. On ne grimpe qu'un à la fois, d'où trois formats de
duel :

| Duel | Principe | Qui gagne |
|---|---|---|
| **Ajoute une prise** | A grimpe 3 prises, B répète et en ajoute une, et ainsi de suite (prises touchées sur le pan) | le premier qui tombe perd |
| **Même bloc** | le même bloc (ou la même voie) pour les deux | moins d'essais ; à égalité, le plus haut |
| **Bloc imposé** | chacun compose le bloc de l'autre sous un budget de cote | celui qui réussit le bloc adverse |

« Ajoute une prise » n'existe pas sur un mur à voies, puisque les prises n'y sont pas décrites une à une.

**On gagne** :

- par mat ;
- au temps ;
- par **KO** : l'adversaire perd 3 duels de suite ;
- **aux points**, au plus de duels gagnés.

**En solo**, le duel devient un objectif face à Stockfish :

| Duel choisi | Objectif en solo |
|---|---|
| Ajoute une prise | bloc progressif |
| Même bloc | bloc cible en 2 ou 3 essais |
| Bloc imposé | bloc imposé en un essai |

### 6.4 Rounds couplés

Ce sont des rounds, avec deux différences :

- le bloc du duel vient de la **pièce la plus active** du camp au trait ;
- le gagnant du duel choisit un **bonus** pour le round suivant : **+30 s** de pendule, ou un **joker**
  (le meilleur coup du moteur, une fois).

---

## 7. Pendant une partie

### 7.1 L'écran

En haut, la **ligne d'état** dit qui joue et ce qui est attendu. Viennent ensuite l'échiquier, les deux
pendules, les boutons du tour (Recharge, Contre-attaque, Aller au mur…) et le **Journal** de la partie.

Pendant un bloc :

- le mur s'affiche avec les prises numérotées (ou la voie sur sa photo, avec sa variante) ;
- **Réussi / Chute** donne le résultat ;
- à deux, c'est l'adversaire qui arbitre ;
- sur téléphone, l'échiquier se masque pendant le bloc pour laisser la place au mur.

### 7.2 Sur un mur à voies

Les blocs sont des **voies choisies** : la plus proche de la cote visée, de préférence au style de la
pièce. L'app signale quand elle doit s'écarter du style.

| Pièce | Styles de voie préférés |
|---|---|
| Pion | dalle, vertical |
| Cavalier | dynamique |
| Fou | diagonale, technique |
| Tour | traversée, vertical |
| Dame | long, dévers, toit |
| Roi | compact, compression |

### 7.3 À deux sur le même écran

Trois **dispositions**, à changer à tout moment pendant la partie (intrications et rounds) :

| Disposition | Pour quoi |
|---|---|
| **Côte à côte** | un seul sens d'échiquier ; « Retourner » à la main |
| **Tour à tour** | l'échiquier se tourne vers celui qui joue : on se passe la tablette |
| **Face à face** | tablette à plat entre vous : les pièces, la pendule et la bande de chacun sont tournées vers lui |

### 7.4 Fin de partie

L'écran de fin donne le vainqueur, la raison (mat, temps, KO, points…) et l'évolution des cotes. **Nouvelle
partie** revient au lancement.

---

## 8. Joueurs, cotes et placement

Chaque joueur a **trois cotes** (Glicko-2, comme sur Lichess) :

| Cote | Ce qui la fait bouger |
|---|---|
| **Grimpe** | chaque bloc ou voie tenté, en partie comme hors partie |
| **Échecs** | les parties, contre le moteur ou contre un humain |
| **Chesscalade** | le résultat des parties hybrides |

Les **blocs et les voies ont aussi une cote**, apprise au fil des réussites et des chutes. Une voie démarre
à la cote de sa cotation (5c ≈ 1300, 6b ≈ 1500, 7a ≈ 1900…), puis s'ajuste.

- **Placement** : 5 blocs adaptatifs (+200 après une réussite, −200 après une chute) pour fixer ta cote de
  grimpe de départ. Il se lance depuis la liste des joueurs et peut se refaire.
- **Journal des blocs** et **Parties** : l'historique du joueur actif.
- **Données de l'app** :
  - **Enregistrer une sauvegarde** : un fichier qui contient tout (murs, photos, joueurs, parties) ;
  - **Remettre une sauvegarde** : la recharger, par exemple sur un autre appareil ;
  - **Version** : la version de l'app, avec vérification des mises à jour.

---

## 9. L'app sur téléphone et tablette

- **Hors ligne** : une fois ouverte une première fois, l'app marche sans réseau, moteur d'échecs compris.
- **Mises à jour** : sur iPad et iPhone, une app de l'écran d'accueil ne se recharge pas d'elle-même. Un
  bandeau « Nouvelle version disponible · Mettre à jour » apparaît donc quand une version sort. La partie
  en cours est gardée.
- **Données** : elles restent dans chaque appareil. Pour passer de l'un à l'autre, utilise la sauvegarde
  (§8). Une synchronisation par un serveur personnel est prévue
  ([SYNCHRO.md](SYNCHRO.md)).
- **Sécurité** : tapis de réception, échauffement. En Diabolique, la pendule tourne pendant les blocs :
  ne prends pas de risque pour autant, car une chute contrôlée compte comme une chute ordinaire.

---

## 10. Petit lexique

| Terme | Sens |
|---|---|
| **Bloc-défi** | bloc demandé par la partie pour confirmer un coup |
| **Coup en suspens** | coup joué mais pas encore confirmé par le mur |
| **Verdict** | ce que devient le coup après une chute |
| **Pièce épuisée** | pièce qui ne peut plus bouger pendant 1 ou 2 tours |
| **Recharge** | bloc grimpé volontairement pour gagner du temps |
| **Parade / défense** | bloc du joueur qui subit un échec ou une prise |
| **Cloche** | bloc imposé à intervalle régulier (intrication rythmée) |
| **Cote visée** | difficulté recherchée pour un bloc : ta cote de grimpe ± bonus |
| **Variante** | façon de grimper une voie plus facile ou plus dure (pieds libres, deux fois…) |
| **Assouplissement** | ce que l'app relâche quand le mur n'offre pas de bloc idéal (tolérance, longueur, forme) |
| **Pan express / Pan rapide** | pan où chaque case porte une prise de niveau 3, pour jouer tout de suite |
| **Secteur** | une photo d'un mur à voies, et les voies qui y sont |
