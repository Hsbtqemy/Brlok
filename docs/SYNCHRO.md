# Synchroniser ses appareils avec un serveur personnel

> But : les mêmes murs, photos, joueurs et cotes sur la tablette, le téléphone et l'ordinateur, sans
> dépendre d'un service extérieur. Tout reste sur un VPS (ou un Raspberry Pi) à soi.

## Aujourd'hui

Chaque appareil garde ses données (stockage du navigateur) ; une **sauvegarde** (Joueurs → Données de
l'app) les transporte d'un appareil à l'autre, à la main.

Toutes les écritures passent par `web/src/lib/appState.svelte.ts` (murs, cotes et journal, partie en
cours, bibliothèque) : c'est là que se branchera la synchro. L'ancienne page claude.ai avait un module de
partage (`sharedStore.ts`, retiré ; il reste dans l'historique git, avant le commit « Retrait de l'ancienne
page claude.ai »), organisé en collections de documents (`players/<id>`, `blocks/<clé>`, `walls/<id>`,
`photos/<mur>~<secteur>`, `journal/attempts-AAAA-MM`, `live/current`, `library/…`) avec un abonnement
aux changements : la même organisation convient à PocketBase.

## Proposition : PocketBase sur le VPS

[PocketBase](https://pocketbase.io) : un seul exécutable (Go + SQLite), quelques dizaines de Mo de mémoire.

| Besoin | PocketBase |
|---|---|
| Collections de documents | oui (tables SQLite, API REST) |
| Mises à jour en direct entre appareils | oui (abonnements temps réel) |
| Photos | stockage de fichiers intégré (ou documents comme aujourd'hui) |
| Accès réservé | compte utilisateur (un seul : toi) |
| Sauvegarde du serveur | un dossier `pb_data` à copier |
| HTTPS | derrière Caddy (certificat automatique) |

Installation type : un sous-domaine (`brlok.mondomaine.fr`), Caddy en proxy, PocketBase en service
systemd. Côté app : un réglage « Serveur de synchro » (adresse + connexion), et un module de
synchro (sur le modèle de l'ancien `sharedStore.ts`) branché sur PocketBase.

### Hors ligne

En salle, sans réseau : l'app continue avec ses données locales et note ce qui a changé ; au retour du
réseau, elle envoie ses changements. Les conflits sont rares (un seul utilisateur) et se règlent comme
aujourd'hui : le document le plus récent l'emporte ; les journaux (tentatives, parties) s'additionnent.

## Autres options

- **CouchDB + PouchDB** : réplication hors ligne native, plus lourde à héberger.
- **Petit serveur maison** (Node ou Deno, un fichier JSON ou SQLite) : le plus simple à comprendre,
  mais il faut écrire soi-même l'authentification et le temps réel.
- **Sans serveur** : sauvegardes exportées vers un dossier partagé (Syncthing, Nextcloud…), remises à la
  main.

## À décider

1. Le VPS existe-t-il déjà (système, Docker ou non) ?
2. Un sous-domaine disponible pour le HTTPS ?
