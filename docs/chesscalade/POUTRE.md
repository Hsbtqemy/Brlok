# La poutre

> Complète [REGLES.md](REGLES.md) et [MURS.md](MURS.md). La « grille pieds » de Brlok desktop est en fait la
> poutre posée au-dessus du pan (REGLES.md §7.3) : elle devient un **agrès** à part entière, pour Brlok
> comme pour Chesscalade. Valeurs **provisoires**, à régler au mur.

---

## 1. Description

Une poutre est une petite grille de prises (4 × 6 pour celle du pan maison), rattachée à un mur :

| | col. 1 | col. 2 | col. 3 | col. 4 | col. 5 | col. 6 |
|---|---|---|---|---|---|---|
| rangée 1 | bac | plat 35° | plat 20° | plat 20° | plat 35° | bac |
| rangée 2 | réglette 25 mm | — | bi-doigt 30 | bi-doigt 30 | — | réglette 25 mm |
| rangée 3 | réglette 45 mm | bi-doigt 50 | plat 30° | plat 30° | bi-doigt 50 | réglette 45 mm |
| rangée 4 | réglette 20 mm | — | réglette 18 mm | réglette 18 mm | — | réglette 20 mm |

- Chaque prise a un **niveau** de 1 à 6 (repris de Brlok desktop), un **type** (bac, réglette, plat,
  bi-doigt, mono…) et une **étiquette** libre (« 25 mm », « 35° »).
- Les prises s'appellent **P** + colonne + rangée : PA1 (bac de gauche) … PF4.
- La poutre est **rattachée à un mur** (pan ou mur à voies). Un mur peut n'être qu'une poutre (« Poutre
  seule », pour une poutre sans pan).
- Import de Brlok desktop : la grille pieds devient la poutre du pan (plus fusionnée aux prises).
  L'export la remet dans la grille pieds.

Chaque mur choisit la **place de sa poutre** :

| Place | Brlok (séances, blocs) | Suspensions |
|---|---|---|
| **Intégrée au pan** | ses prises sont des prises du pan, juste au-dessus de la rangée du haut : un bloc peut passer par elles ou y finir | oui |
| **Agrès à part** | elle ne fait pas partie du trajet ; un bloc peut **finir suspendu** à la poutre (option « sortie ») | oui |

## 2. La suspension

Une **suspension** = une prise pour la main gauche, une pour la main droite (la même pour les deux, ou
deux prises différentes), et une **durée**.

- Déroulé à l'écran : « Démarrer », 3 s pour se placer, puis le décompte de la durée. Arrivé à zéro :
  réussi (signal sonore). « Lâché » avant la fin : chute.
- Choix des prises par l'app : la paire la plus proche de la **cote visée**, une main de chaque côté de
  la poutre, de préférence en symétrie (les deux prises jumelles), avec un peu de hasard et sans revenir
  sans cesse aux mêmes prises. On peut aussi les choisir soi-même en touchant la poutre.

### Cote d'une suspension

Comme un bloc (REGLES.md §7.3), une suspension a sa cote, apprise ensuite par Glicko-2 :

```
cote = 1500
     + 200 × (niveau moyen des deux prises − 3,5)
     + 100 × (niveau max − niveau moyen)      # une main sur une prise plus dure
     +  25 × (durée − 10 s)
```

Repères : 10 s sur les bacs (niveau 1) ≈ 1000 ; 10 s sur les réglettes de 18 mm (niveau 4) ≈ 1600 ;
15 s sur les plats à 35° (niveau 5) ≈ 1925.

- Chaque combinaison prises + durée est **une suspension à part**, avec sa cote (comme un bloc).
- Une suspension compte pour la **cote de grimpe** et au journal, comme un bloc (« Poutre PA1 + PF1 ·
  10 s »).

## 3. Brlok

- **Poutre intégrée** : les séances et les blocs-défis du pan utilisent aussi ses prises (même portée,
  enchaînements comme sur le pan). Le pan s'affiche avec la poutre au-dessus.
- **Sortie à la poutre** (poutre à part) : option de la séance ; chaque bloc finit suspendu à une paire de
  prises de la poutre pendant n secondes (choisie selon le niveau de la séance). Elle ne change pas la
  cote du bloc.
- **Onglet Poutre** de Grimper (mur avec une poutre) :
  - **Suspension** : durée, cote visée (ou « ma cote »), « Choisir » ; ou prises touchées sur la poutre ;
  - **Série** : n suspensions de la même durée, avec un repos entre deux (ex. 6 × 10 s, repos 2 min),
    les prises suivant la cote visée.

## 4. Chesscalade

La poutre se règle au lancement de la partie (familles C et D, mur avec une poutre) :

| Réglage | Effet |
|---|---|
| **Durée** | durée des suspensions de la partie (5 à 30 s ; 10 s par défaut) |
| **Poutre seule** | tous les défis de la partie sont des suspensions (sans pan) : prises, échecs, défense, cloche… |
| **Mêlée aux blocs** | les défis de la **tour** (puissance, statique : MURS.md) deviennent des suspensions ; les autres pièces grimpent |
| **Recharge à la poutre** | la recharge est une suspension (pendule qui tourne, comme une recharge) |
| **Pénalité à la poutre** | une pénalité de temps peut se **racheter** : au lieu de perdre le temps tout de suite, le joueur tient une suspension (cote visée − 100) dès que la partie le permet ; tenue, la pénalité est effacée ; lâchée, elle s'applique |

- La cote visée d'une suspension de défi est celle du bloc qu'elle remplace (pièce prise, niveau,
  fatigue) : la durée est fixe, ce sont les prises qui suivent la cote.
- Les verdicts (§5) sont les mêmes : une suspension lâchée est une chute.
- Pénalité rachetée : si plusieurs pénalités s'accumulent avant que la partie ne laisse le temps de les
  racheter (une série, une déviation…), une seule suspension rachète le total. Les pénalités de règle
  (V6, contre-attaque, dernier recours) ne se rachètent pas : ce ne sont pas des chutes.
- Les rounds (familles A et B) restent au pan pour l'instant.

## 5. Questions ouvertes

1. Coefficients de la cote (surtout le poids de la durée) : à régler sur quelques suspensions chronométrées.
2. Une main ou deux mains différentes : la cote ne voit pas l'écart entre les mains, Glicko-2 le corrige.
3. Suspension à un bras, poids ajouté ou délesté : pas pour l'instant.
