# Chesscalade — Règles du jeu (v0.1, brouillon)

> Document de game design. Statut : **à tester mentalement puis au mur**, avant toute implémentation.
> Chesscalade est un mode de Brlok : une vraie partie d'échecs dont le pan d'escalade est le moteur.

---

## 1. Principe

On joue une **partie d'échecs complète** (règles FIDE standard) sur un plateau affiché par l'application.
Le **pan** (grille 6 colonnes × 7 lignes, prises A1…F7) intervient de deux façons :

1. **La pendule verticale** : le temps de réflexion se **gagne en grimpant**.
2. **Les coups en suspens** : certains coups doivent être **confirmés sur le mur**. Le coup est joué et
   enregistré, puis son sort dépend du résultat du bloc : validé, limité, annulé ou interdit.

On joue **seul** (contre un moteur) ou **à deux** (sur le même mur, avec une seule tablette).

---

## 2. Vocabulaire

| Terme | Définition |
|---|---|
| **Bloc-défi** | Bloc généré par l'app à partir de la situation de jeu (pièce, prise, niveau…) |
| **Coup en suspens** | Coup joué sur le plateau mais pas encore confirmé, en attente du résultat d'un bloc-défi |
| **Verdict** | Conséquence du bloc sur le coup en suspens (voir §5) |
| **Déclencheur** | Événement de la partie qui exige un bloc-défi (prise, échec…) |
| **Recharge** | Bloc grimpé volontairement pour gagner du temps |
| **Coup dévié** | La pièce prévue doit bouger, mais vers une autre case que celle visée |
| **Pièce épuisée** | Pièce qui ne peut pas bouger pendant N tours de son camp |
| **Compteur de chutes** | Nombre de chutes consécutives d'un joueur ; il aggrave les verdicts |

---

## 3. Formats de partie

Deux rythmes, plus une variante.

| | **Blitz Chesscalade** | **Classique Chesscalade** |
|---|---|---|
| Durée visée | ~10–15 min | ~25–40 min |
| Temps de départ (par joueur) | 3 min | 10 min |
| Incrément échecs | aucun | aucun |
| Blocs-défis | 4–6 prises | 6–10 prises |
| Limite de temps d'un bloc | 45 s | 90 s |
| Déclencheurs actifs | prise d'une pièce (pion exclu), promotion | toute prise, échec, promotion, roque, mat |
| Recharge | 1 tous les 5 coups, +30 s | 1 tous les 5 coups, +60 s (bloc dur : +90 s) |

**Variante « Rounds » (chessboxing augmenté)** : alternance de rounds de 3 min d'échecs et de rounds de
grimpe. Le bloc du round de grimpe est généré à partir de la position (la pièce la plus active de chaque
joueur donne le caractère du bloc). Le meilleur résultat au mur offre un bonus pour le round d'échecs suivant :
+30 s ou un **joker** (un indice du moteur).

---

## 4. La pendule verticale

- Chaque joueur part avec le temps de départ du format. **Il n'y a pas d'incrément automatique.**
- Le seul moyen de **gagner du temps**, c'est la **recharge** : avant de jouer son coup, un joueur peut
  demander un bloc de recharge (au maximum 1 tous les 5 coups).
  - Pendant une recharge, **sa pendule tourne**. C'est un pari : grimper vite, sinon on perd plus qu'on ne gagne.
  - Recharge réussie : bonus de temps selon la difficulté du bloc choisi (normal ou dur).
  - Chute pendant une recharge : rien n'est gagné, et le temps passé est perdu.
- Pendant un **bloc-défi** (déclencheur), la pendule du grimpeur est **en pause**, sauf au niveau Diabolique.
  Le bloc a sa propre limite de temps : la dépasser compte comme une chute.
- Tomber à zéro = partie perdue au temps (règle standard, y compris le cas du matériel insuffisant).

> Dilemme recherché : grimper pour gagner du temps, au risque d'être fatigué et de mal calculer,
> ou jouer vite et garder ses bras.

---

## 5. Coups en suspens et verdicts

### 5.1 Déroulé

1. Le joueur **joue son coup** sur le plateau. Il est enregistré mais **en suspens**.
2. Si le coup contient un **déclencheur** actif, l'app génère un bloc-défi (§7) et l'affiche sur le pan.
3. Le joueur grimpe. Le résultat est validé sur l'honneur (solo) ou par l'adversaire (duo) : **Réussi / Chute**.
4. L'app applique le **verdict** correspondant.
5. Si plusieurs déclencheurs se cumulent (par exemple prise + échec), **un seul bloc** est généré, avec le
   déclencheur le plus exigeant et +1 de difficulté.

### 5.2 Échelle des verdicts

| Code | Verdict | Effet |
|---|---|---|
| **V0** | Validé | Le coup est joué normalement |
| **V1** | Validé + pénalité | Le coup est joué, le joueur perd du temps (−10 / −20 / −30 s selon le niveau) |
| **V2** | Limité | Le coup est joué, mais la pièce jouée devient **épuisée** (1 tour en Facile et Modéré, 2 tours au-delà) |
| **V3** | Annulé | Le coup est retiré. Le joueur doit jouer **un autre coup**, et le coup tenté est interdit pour ce tour |
| **V4** | Interdit | Le coup est retiré, et la **pièce** qui l'a tenté est épuisée (même durée que V2). Le joueur joue une autre pièce |
| **V5** | Dévié | Le coup est retiré. Le joueur doit jouer **la même pièce**, mais **pas sur la case prévue** (§5.2 bis) |
| **V6** | Dévié par l'adversaire | Comme V5, mais c'est **l'adversaire** (ou le moteur) qui choisit la case, plus une pénalité lourde (−45 s) |

Un **succès** donne toujours **V0**, et remet le compteur de chutes à zéro.

**Pourquoi Dévié est en haut de l'échelle** : après une annulation ou une interdiction, on garde le choix
de son coup et on peut adapter son plan. Après une déviation, on est **forcé** de bouger la pièce qu'on
voulait jouer, sur une case qu'on n'a pas choisie : elle peut se retrouver mal placée ou en prise, et tout le
plan d'attaque ou de défense peut tomber. C'est la sanction la plus « échecs » de l'échelle.

### 5.2 bis Le verdict Dévié en détail

Image d'escalade : tu as raté la prise visée, tu atterris à côté.

- **Toujours un coup légal** : la case déviée est choisie uniquement parmi les **coups légaux** de la pièce
  dans la position réelle de l'échiquier (pas de roi laissé en échec, pas de saut interdit…). L'app calcule
  ces cases et ne propose jamais autre chose.
- **Déviation courte** (réglage par défaut) : parmi ces coups légaux, la pièce va sur la case **la plus proche**
  de la case visée (distance 1 d'abord, puis 2, etc.). S'il n'y en a aucune proche, on prend la plus proche
  qui existe. Le joueur choisit parmi les cases à égale distance.
- **Déviation libre** (réglage) : n'importe quel autre coup légal de la même pièce.
- En **V6**, c'est **l'adversaire** (ou le moteur en solo) qui choisit la case parmi les cases autorisées.
- La case déviée peut être une prise si c'est légal, mais cette nouvelle prise **ne déclenche pas** de nouveau bloc.
- Cas limites :
  - la pièce n'a aucune autre case légale → le verdict devient **V3 : Annulé** ;
  - le joueur est en échec : la case déviée doit parer l'échec. Si cette pièce n'a pas d'autre parade → **V3** ;
  - **roque** dévié → **V3** (on ne dévie pas un roque) ;
  - **promotion** : le pion dévié joue un autre coup de pion légal. S'il n'en a pas → **V3**.
    Si le coup dévié est aussi une promotion, la pièce choisie reste la même.

### 5.3 Verdict en cas de chute, selon le niveau de difficulté

Le verdict de base dépend du niveau. Chaque chute **consécutive** aggrave le verdict d'un cran
(compteur de chutes), jusqu'au plafond du niveau.

| Niveau | Verdict de base (1re chute) | Aggravation | Plafond | Essais par bloc | Pendule pendant un bloc-défi |
|---|---|---|---|---|---|
| **Facile** | V1 | +1 tous les 2 échecs consécutifs | V2 | 2 essais | en pause |
| **Modéré** | V2 | +1 par chute consécutive | V4 | 1 essai | en pause |
| **Difficile** | V3 | +1 par chute consécutive | V5 | 1 essai | en pause, limite de bloc −20 % |
| **Diabolique** | V3 | +1 par chute consécutive | V6 | 1 essai | **tourne**, limite de bloc −35 % |

Le niveau agit aussi sur la **difficulté des blocs** (§7.2) et sur les **pénalités de temps** (§5.2).

### 5.4 Déclencheurs défensifs

Certains déclencheurs concernent le joueur **qui subit** :

- **Être mis en échec** (Classique uniquement ; jamais en Blitz, pour garder le rythme) : le défenseur grimpe un **bloc de parade**
  court (3–4 prises, limite 20 s). En cas de chute :
  - Facile / Modéré : pénalité de temps.
  - Difficile / Diabolique : le défenseur doit parer **avec le roi** si c'est légal (sinon, simple pénalité de temps).

Le coup qui met en échec, lui, ne peut pas être annulé par le bloc de parade.

---

## 6. Règles de sécurité du jeu (ne jamais bloquer la partie)

Les verdicts modifient les règles des échecs. Ces garde-fous gardent la partie toujours jouable :

1. **Toujours un coup légal** : si les contraintes (pièces épuisées, coups interdits) ne laissent aucun coup
   légal, elles sont levées une par une, de la plus récente à la plus ancienne, jusqu'à ce qu'il en reste un.
2. **Échec au roi** : si la seule parade passe par une pièce épuisée, celle-ci est libérée.
3. **Dernier recours** : si un joueur a vu **tous** ses coups légaux annulés au cours d'un même tour, le
   dernier coup tenté est joué avec un verdict **V1**.
4. **Pas de pat artificiel** : une position où le joueur n'a aucun coup *uniquement* à cause des contraintes
   n'est pas un pat. On applique la règle 1.
5. **Mat** (Classique, déclencheur « mat ») : le coup qui mate passe par un **bloc du mat**, de difficulté +1.
   En cas de chute, le coup est annulé (V3 minimum). Le mat n'est acquis qu'une fois le bloc réussi.
6. **Promotion** : la pièce choisie est connue avant le bloc. En cas de chute avec un verdict V3 ou V4, le pion
   reste sur sa case de départ. En V5 ou V6, voir §5.2 bis.

---

## 7. Génération des blocs-défis

### 7.1 Le style de la pièce (et pas sa géométrie exacte)

Imposer à chaque mouvement la géométrie exacte de la pièce (un L entre chaque prise pour un cavalier)
donnerait des blocs artificiels, plus proches du **Twister** que de l'escalade : ce qui fait la difficulté
d'un bloc, ce sont les **enchaînements**, pas une figure tracée sur la grille.

La pièce donne donc le **caractère du bloc dans son ensemble**. Les mouvements entre prises restent, eux,
des mouvements d'escalade naturels (prises à portée de main).

| Pièce | Caractère du bloc |
|---|---|
| Pion | court, montée directe, prises plutôt faciles |
| Cavalier | trajectoire **décalée** : changements de direction, un ou deux mouvements latéraux marqués |
| Fou | trajectoire **diagonale** sur l'ensemble du pan (par exemple de A1 vers F7) |
| Tour | trajectoire **rectiligne** : montée verticale ou traversée horizontale |
| Dame | long et varié, crux marqué |
| Roi | court et **compact**, prises proches les unes des autres, sans relâche |

**Variante « Géométrie stricte »** (option, pour rire) : chaque mouvement respecte exactement le
déplacement de la pièce. Assumée comme un défi Twister, non cotée.

### 7.2 Difficulté visée

Chaque bloc a une **cote** (Glicko-2, §8). La cote visée vaut :

```
cote_visée = cote_grimpe_du_joueur + bonus_déclencheur + bonus_niveau
```

| Déclencheur | bonus |
|---|---|
| Prise d'un pion | −300 |
| Prise d'un cavalier ou d'un fou | −100 |
| Prise d'une tour | +100 |
| Prise de la dame | +300 |
| Échec (attaquant) | 0 |
| Bloc de parade (défenseur) | −200 |
| Promotion | +200 (traversée longue) |
| Roque | −400 (bloc « sécurité ») |
| Mat | +200 |

| Niveau | bonus |
|---|---|
| Facile | −200 |
| Modéré | 0 |
| Difficile | +150 |
| Diabolique | +300 |

Le générateur cherche ensuite un bloc dont la **cote estimée** (§7.3) est la plus proche de la cote visée,
en respectant le caractère de la pièce (§7.4).

### 7.3 De la difficulté des prises à la cote du bloc

La difficulté repose **au maximum sur les niveaux déjà saisis** dans les catalogues Brlok : chaque prise de main
a un niveau de **1 à 6** (Brlok desktop limite les mains à 5 ; la version web passe à 6, et les catalogues existants restent valides). **Grille pieds de Brlok** : ce n'est pas une zone à part. Elle reprend des prises qui existent déjà dans la
grille des mains (probablement les rangées supérieures du pan), avec leur type (« [Bac] », « bi30 »,
« 45 »…). Chesscalade la **fusionne par-dessus** la grille des mains : chaque position reçoit le type de
prise comme étiquette, et on garde **le plus haut des deux niveaux** annoncés. L'import montre la
correspondance des rangées (par défaut les 4 rangées du haut) pour qu'on puisse la corriger à l'écran.

**Cote initiale estimée d'un bloc** :

```
cote = 1500
     + 200 × (niveau moyen des prises − 3,5)  # niveau général du bloc
     + 100 × (niveau max − niveau moyen)       # crux = la prise la plus dure
     +  25 × (nombre de prises − 6)            # longueur
```

Repères : chaque niveau vaut 200 points. Un bloc de prises de niveau 1 vaut environ **1000**, un bloc de
niveau 3 environ **1400**, un bloc de niveau 6 environ **2000**, et plus s'il est long.

Ce que la formule ne voit pas, c'est la difficulté des **enchaînements** (deux prises faciles peuvent faire
un mouvement très dur). On ne tente pas de la deviner : **Glicko-2 l'apprend**. La cote réelle de chaque bloc
se corrige à partir des réussites et des chutes. Plus tard, on pourra en déduire une difficulté par
**enchaînement** (paire de prises) et l'utiliser dans le générateur.

Une prise mal notée dans le catalogue se repère aussi : Chesscalade pourra proposer de corriger son niveau.

**Placement** : un nouveau joueur grimpe 5 blocs de difficulté croissante (de 1000 à 2000 environ) pour
fixer sa cote de grimpe de départ, au lieu de partir à 1500 « à l'aveugle ».

### 7.4 Algorithme de génération

1. Le pan devient un **graphe** : chaque prise active est un nœud, et deux prises sont reliées si elles sont
   **à portée** l'une de l'autre. La portée se règle **dans le catalogue** (distance max en cases), et on peut
   y marquer à la main des enchaînements **impossibles** (ou au contraire autorisés au-delà de la portée).
2. On convertit la cote visée en **plage de niveaux** (comme le profil de difficulté actuel de Brlok :
   niveau cible ± tolérance) et on garde seulement les prises dans cette plage.
3. On cherche des **chemins** de la longueur voulue dont la **forme globale** respecte le caractère de la pièce
   (§7.1). On réutilise les **répartitions** existantes de Brlok (progressive, pyramide, crux…). Pour une
   prise, le **crux est placé en dernier** : la dernière prise, c'est la pièce capturée.
4. On calcule la cote estimée de chaque chemin candidat et on garde le plus proche de la cote visée, avec un
   peu de hasard et la règle de variété de Brlok pour ne pas toujours grimper les mêmes blocs.
5. **Si aucun chemin ne convient**, on assouplit dans cet ordre :
   1. élargir la tolérance de niveau de ±1 ;
   2. raccourcir le bloc (minimum 3 prises) ;
   3. relâcher la forme imposée par la pièce, et l'app l'indique.

### 7.5 Fatigue (option)

Au fil d'une partie, les bras se vident. L'option fatigue baisse la cote visée de **−15 par bloc déjà grimpé**
dans la partie, pour que la fin de partie reste grimpable.

- Elle se **choisit au lancement** de la partie.
- Elle peut être **activée en cours de partie**, au début de son propre tour (par exemple quand on sent
  les bras partir). Le compteur de blocs part alors du nombre de blocs déjà grimpés.
- **En duo**, chaque joueur a sa propre option : c'est un réglage individuel, comme un handicap.
- Une partie où l'option a été activée reste cotée, mais l'historique le mentionne.

---

## 8. Cotes (Glicko-2, système de Lichess)

Chaque joueur a **trois cotes** indépendantes :

| Cote | Ce qui la fait évoluer |
|---|---|
| **Échecs** | parties contre le moteur (cote connue) ou contre un humain, problèmes d'échecs |
| **Grimpe** | chaque bloc tenté (Brlok classique comme Chesscalade) : un « match » joueur contre bloc |
| **Chesscalade** | résultat des parties hybrides |

- Les **blocs** ont eux aussi une cote, qui évolue avec les réussites et les échecs de tous les joueurs.
  Cote initiale estimée à partir des niveaux des prises et du nombre de prises (§7.3).
- **Pas de plage imposée** : le joueur choisit sa fourchette. Par défaut, sa cote ±200, ou une plage libre
  (par exemple 700–2000 pour les problèmes Lichess, dont la base va d'environ 400 à plus de 3000).

---

## 9. Modes de jeu

### 9.1 Solo contre un moteur

- Force du moteur réglable par cote : **Maia** pour un jeu « humain » (~1100–1900), **Stockfish** limité
  au-delà, et un niveau d'aptitude réduit en dessous.
- Le moteur **ne grimpe pas**. Équilibrage proposé :
  - pendule du moteur fixe (temps de départ du format, sans recharge possible) ;
  - quand le moteur déclenche un événement contre le joueur (il prend une pièce, il met en échec), le joueur
    grimpe un **bloc de défense**. Une chute coûte **seulement du temps** : les coups du moteur ne sont jamais annulés.
- **Contre-attaque** (Difficile et Diabolique, **une fois par partie**) : le joueur peut annuler le dernier coup
  du moteur en réussissant un bloc très dur. Le moteur rejoue alors un autre coup. Difficulté à jauger au mur ;
  point de départ : cote de grimpe du joueur **+300 en Difficile, +400 en Diabolique**, et **+100** de plus si le
  coup annulé est une prise de pièce majeure (tour, dame). En cas de chute, pénalité de temps (−30 s).
- La cote du moteur s'adapte : une victoire du joueur fait monter la force de la partie suivante.

### 9.2 Duo sur un même mur

- Une tablette au pied du mur, plateau visible par les deux joueurs.
- **L'adversaire arbitre** le bloc (Réussi / Chute).
- Pendant qu'A grimpe, B voit le plateau et prépare son coup. **C'est voulu** et fait partie de la stratégie
  (grimper vite a aussi pour but de ne pas laisser l'adversaire réfléchir).

### 9.3 Entraînement (hors partie)

- **Problèmes grimpés** : un problème Lichess s'affiche. Le joueur trouve le coup, puis grimpe le bloc du
  caractère de la pièce jouée. Deux cotes évoluent : échecs et grimpe.
- **Échauffement** : 2 ou 3 blocs faciles, non cotés, recommandés avant toute partie.
- **Devine la pièce** : l'app affiche un bloc sans dire de quelle pièce il vient ; après l'avoir grimpé, le
  joueur devine la pièce. Sert à vérifier que le caractère des pièces (§7.1) se ressent vraiment au mur.

---

## 10. Exemple de partie (Classique, Modéré, duo)

1. Alice (Blancs) et Bruno (Noirs) ont 10 min chacun.
2. Coup 7 : Alice joue **Cxe5**. Prise d'un pion → déclencheur actif en Classique.
   Bloc-défi : caractère **cavalier** (trajectoire décalée), cote visée = 1450 (sa cote de grimpe) − 300 = **1150**.
   Pendule d'Alice en pause, limite 90 s.
3. Alice **tombe**. Modéré, 1re chute → **V2 : Limité**. Le cavalier reste en e5 mais devient épuisé
   pendant 1 tour. Compteur de chutes d'Alice : 1.
4. Coup 9 : Alice tente **Fxf7+** (prise + échec). Un seul bloc : déclencheur le plus exigeant + 1.
   Elle tombe encore → compteur 2 → **V3 : Annulé**. Elle doit jouer un autre coup.
   Elle tente alors **Dxd8** et tombe une troisième fois → compteur 3 → **V4 : Interdit**. La prise est
   retirée et sa dame est épuisée pendant 1 tour : Alice doit jouer une autre pièce.
   (En Difficile, une quatrième chute aurait donné **V5 : Dévié** : la dame aurait dû bouger quand même, sur la
   case légale la plus proche de d8, par exemple **Dd7**.)
5. Coup 10 : Alice demande une **recharge**. Sa pendule tourne, elle réussit en 50 s → +60 s, soit +10 s net.
6. Coup 15 : Bruno se fait mettre en échec et grimpe un bloc de parade de 20 s. Il réussit : rien ne change.

---

## 11. Sécurité physique

- Tapis de réception obligatoire, échauffement recommandé (§9.3).
- En **Diabolique**, la pendule qui tourne pendant les blocs ne doit jamais pousser à grimper dangereusement :
  une chute « contrôlée » (le joueur descend volontairement) compte comme une chute ordinaire,
  sans pénalité supplémentaire.

---

## 12. Décisions et questions ouvertes

### 12.1 Décisions prises

| Sujet | Décision |
|---|---|
| Pièce épuisée | 1 tour en Facile et Modéré, 2 tours en Difficile et Diabolique |
| Ordre des verdicts | Dévié passe **au-dessus** d'Interdit (V5) ; V6 = déviation choisie par l'adversaire |
| Déviation | Courte par défaut, toujours parmi les coups légaux de la position réelle |
| Bloc de parade | Désactivé en Blitz, actif en Classique |
| Contre-attaque (solo) | Une fois par partie, Difficile et au-dessus ; difficulté à jauger (§9.1) |
| Portée entre prises | Réglée dans le catalogue, avec enchaînements impossibles marqués à la main |
| Caractère des pièces | Testé avec le mode « Devine la pièce » (§9.3) |
| Grille pieds | Fusionnée par-dessus la grille des mains, niveau le plus haut gardé (§7.3) |
| Cote des blocs | Une seule cote, commune à Brlok classique et à Chesscalade |
| Niveaux des prises | 1 à 6 |

### 12.2 Encore ouvert (à trancher au mur)

1. Valeurs de temps (départ, recharge, limites de bloc) : **provisoires**. À mesurer en chronométrant
   quelques blocs de 6 prises ; la recharge devrait rapporter environ 1,5 fois le temps moyen d'un bloc.
2. Correspondance exacte entre la grille pieds et la grille des mains (rangées du haut ?).
3. Difficulté de la contre-attaque.
4. Coefficients de la cote initiale des blocs (§7.3).

---

## 13. Vision : jouer sur n'importe quel mur

Idée : rendre Chesscalade jouable ailleurs que sur ce pan, y compris en **salle**, en posant un quadrillage
sur n'importe quel mur et en réutilisant les **voies déjà ouvertes** (couleurs et cotations).

### 13.1 Deux types de murs

| | **Pan libre** (comme le tien) | **Mur à voies** (salle d'escalade) |
|---|---|---|
| Ce qu'on décrit | les prises, avec un niveau | les voies existantes : couleur + cotation (par exemple « vert, 5c ») |
| D'où viennent les blocs | générés par Chesscalade | **choisis** parmi les voies du mur |
| Cote d'un bloc | calculée (§7.3) puis corrigée | déduite de la cotation (table ci-dessous) puis corrigée |
| Caractère des pièces | trajectoire générée | étiquettes de style sur les voies (dalle, dévers, dynamique, traversée…) |

### 13.2 Mise en place d'un mur

1. Prendre une **photo** du mur.
2. Poser un **quadrillage** de taille réglable (par exemple 6 × 7, 8 × 8, 12 × 18).
3. Selon le type de mur :
   - **pan libre** : toucher les prises et leur donner un niveau (1 à 6) ;
   - **mur à voies** : créer les voies (couleur, cotation, style), sans forcément placer chaque prise.

Les **boards** d'entraînement à grille (type MoonBoard) ont déjà un quadrillage et des coordonnées : ils
s'adapteraient naturellement au mode « pan libre ».

### 13.3 Cotation → cote (point de départ)

| Cotation (bloc, échelle Font) | Cote de départ |
|---|---|
| 3 – 4 | 900 |
| 5a – 5c | 1100 – 1300 |
| 6a – 6b+ | 1400 – 1600 |
| 6c – 7a | 1700 – 1900 |
| 7a+ et plus | 2000 et plus |

Comme pour le pan, Glicko-2 corrige ensuite la cote réelle de chaque voie.

### 13.4 Ce que ça implique

- Le **modèle de données** doit être générique dès le départ : un mur = une grille de taille quelconque,
  des prises (niveau optionnel) et/ou des voies fixes. **C'est peu coûteux à prévoir maintenant**, et beaucoup
  plus cher à rattraper ensuite.
- L'**outil photo + quadrillage** et le mode « mur à voies » viennent **plus tard**. La première version ne gère
  que le pan libre, mais sans rien coder en dur pour le 6 × 7.
