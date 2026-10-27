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
joueur donne le motif). Le meilleur résultat au mur offre un bonus pour le round d'échecs suivant :
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
| **V2** | Limité | Le coup est joué, mais la pièce jouée devient **épuisée** pendant 2 tours de son camp |
| **V3** | Annulé | Le coup est retiré. Le joueur doit jouer **un autre coup**, et le coup tenté est interdit pour ce tour |
| **V4** | Dévié | Le coup est retiré. Le joueur doit jouer **la même pièce**, mais **pas sur la case prévue** (§5.2 bis) |
| **V5** | Interdit | Le coup est retiré, et la **pièce** qui l'a tenté est épuisée pendant 2 tours |
| **V6** | Interdit + sanction | V5, plus une pénalité de temps lourde (−45 s) |

Un **succès** donne toujours **V0**, et remet le compteur de chutes à zéro.

**Pourquoi Dévié est plus dur qu'Annulé** : après une annulation, on choisit librement un autre coup.
Après une déviation, on est **forcé** de bouger la pièce qu'on voulait jouer, ce qui peut l'envoyer sur une
mauvaise case ou la mettre en prise.

### 5.2 bis Le verdict Dévié en détail

Image d'escalade : tu as raté la prise visée, tu atterris à côté.

- **Déviation courte** (réglage par défaut) : la pièce doit aller sur une case légale **la plus proche possible**
  de la case visée (distance 1 d'abord, puis 2, etc.). Le joueur choisit parmi les cases à égale distance.
- **Déviation libre** (réglage) : n'importe quelle autre case légale de la même pièce.
- En **Diabolique**, c'est **l'adversaire** (ou le moteur en solo) qui choisit la case parmi les cases autorisées.
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
| **Diabolique** | V3 | +1 par chute consécutive | V6 | 1 essai | **tourne**, limite de bloc −35 % (déviation choisie par l'adversaire) |

Le niveau agit aussi sur la **difficulté des blocs** (§7.2) et sur les **pénalités de temps** (§5.2).

### 5.4 Déclencheurs défensifs

Certains déclencheurs concernent le joueur **qui subit** :

- **Être mis en échec** (Classique, et Blitz à partir de Difficile) : le défenseur grimpe un **bloc de parade**
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
6. **Promotion** : la pièce choisie est connue avant le bloc. En cas de chute avec un verdict V3, V5 ou V6, le pion
   reste sur sa case de départ. En V4, voir §5.2 bis.

---

## 7. Génération des blocs-défis

### 7.1 Motif : la pièce qui bouge

Le bloc respecte le **motif de déplacement de la pièce jouée** entre deux prises successives, sur la grille 6×7 :

| Pièce | Motif entre deux prises | Portée max |
|---|---|---|
| Pion | vers le haut (1 case), ou diagonale haute | 1 |
| Cavalier | en L | — |
| Fou | diagonale | 2 cases |
| Tour | ligne ou colonne | 2 cases |
| Dame | ligne, colonne ou diagonale | 2 cases |
| Roi | n'importe quelle case adjacente | 1 |

La portée est limitée pour que les mouvements restent grimpables. Elle sera réglable selon la taille du pan.
Les **pieds** suivent la grille pieds existante de Brlok (4 × 6).

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

Le générateur choisit ensuite les prises (niveaux 1–6, nombre de prises) dont la cote estimée est la plus
proche de la cote visée, en respectant le motif.

---

## 8. Cotes (Glicko-2, système de Lichess)

Chaque joueur a **trois cotes** indépendantes :

| Cote | Ce qui la fait évoluer |
|---|---|
| **Échecs** | parties contre le moteur (cote connue) ou contre un humain, problèmes d'échecs |
| **Grimpe** | chaque bloc tenté (Brlok classique comme Chesscalade) : un « match » joueur contre bloc |
| **Chesscalade** | résultat des parties hybrides |

- Les **blocs** ont eux aussi une cote, qui évolue avec les réussites et les échecs de tous les joueurs.
  Cote initiale estimée à partir des niveaux des prises, du nombre de prises et du motif.
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
- La cote du moteur s'adapte : une victoire du joueur fait monter la force de la partie suivante.

### 9.2 Duo sur un même mur

- Une tablette au pied du mur, plateau visible par les deux joueurs.
- **L'adversaire arbitre** le bloc (Réussi / Chute).
- Pendant qu'A grimpe, B voit le plateau et prépare son coup. **C'est voulu** et fait partie de la stratégie
  (grimper vite a aussi pour but de ne pas laisser l'adversaire réfléchir).

### 9.3 Entraînement (hors partie)

- **Problèmes grimpés** : un problème Lichess s'affiche. Le joueur trouve le coup, puis grimpe le bloc du
  motif de la pièce jouée. Deux cotes évoluent : échecs et grimpe.
- **Échauffement** : 2 ou 3 blocs faciles, non cotés, recommandés avant toute partie.

---

## 10. Exemple de partie (Classique, Modéré, duo)

1. Alice (Blancs) et Bruno (Noirs) ont 10 min chacun.
2. Coup 7 : Alice joue **Cxe5**. Prise d'un pion → déclencheur actif en Classique.
   Bloc-défi : motif **cavalier**, cote visée = 1450 (sa cote de grimpe) − 300 = **1150**.
   Pendule d'Alice en pause, limite 90 s.
3. Alice **tombe**. Modéré, 1re chute → **V2 : Limité**. Le cavalier reste en e5 mais devient épuisé
   pendant 2 tours. Compteur de chutes d'Alice : 1.
4. Coup 9 : Alice tente **Fxf7+** (prise + échec). Un seul bloc : déclencheur le plus exigeant + 1.
   Elle tombe encore → compteur 2 → **V3 : Annulé**. Elle doit jouer un autre coup.
   Elle tente alors **Dxd8** et tombe une troisième fois → compteur 3 → **V4 : Dévié**. Sa dame doit bouger,
   sur la case légale la plus proche de d8 : elle choisit **Dd7**.
5. Coup 10 : Alice demande une **recharge**. Sa pendule tourne, elle réussit en 50 s → +60 s, soit +10 s net.
6. Coup 15 : Bruno se fait mettre en échec et grimpe un bloc de parade de 20 s. Il réussit : rien ne change.

---

## 11. Sécurité physique

- Tapis de réception obligatoire, échauffement recommandé (§9.3).
- En **Diabolique**, la pendule qui tourne pendant les blocs ne doit jamais pousser à grimper dangereusement :
  une chute « contrôlée » (le joueur descend volontairement) compte comme une chute ordinaire,
  sans pénalité supplémentaire.

---

## 12. Questions ouvertes (à trancher au mur)

1. Les valeurs de temps (départ, recharge, limites) sont des **hypothèses** : à mesurer sur ton pan réel.
2. Pièce épuisée pendant 2 tours : trop punitif en Modéré ? Et dans l'échelle, faut-il placer Dévié (V4) avant ou après Interdit ?
7. Déviation courte par défaut, ou libre ?
3. Le bloc de parade sur échec : amusant ou trop interruptif en Blitz ?
4. En solo, le joueur doit-il aussi pouvoir faire « annuler » un coup du moteur en réussissant un bloc très dur ?
   (Mécanique de **contre-attaque**, à envisager seulement en Difficile et au-dessus.)
5. Portée des motifs (2 cases) : à valider selon l'espacement réel des prises sur le pan.
6. Faut-il une **cote de bloc** séparée pour les blocs « motif » (cavalier, fou…) et pour les blocs Brlok classiques ?
