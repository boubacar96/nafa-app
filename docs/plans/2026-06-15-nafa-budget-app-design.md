# Nafa — App de budget personnel (FCFA) — Design

> Date : 2026-06-15
> Contexte : salarié au Sénégal, charges fixes, besoin de voir clair sur ses
> dépenses, son budget par catégorie et son épargne possible.

---

## 1. Objectif

Aider l'utilisateur à **voir clair** sur son argent :
- noter ses dépenses et revenus en quelques secondes,
- voir où part l'argent (par catégorie, par jour / semaine / mois),
- tenir un **budget par catégorie** avec alertes,
- suivre l'**épargne possible** et l'épargne réalisée.

Le problème n'est pas le calcul, c'est la **visibilité** et la **régularité** de saisie.

## 2. Principes

- **PWA installable**, téléphone d'abord, consultable aussi sur ordinateur.
- **Hors-ligne**, **tout en FCFA**, **en français**.
- **Saisie en 5 secondes** : montant → catégorie → enregistré.
- **Données privées sur l'appareil** (IndexedDB). Rien n'est envoyé sur internet.
- **Sauvegarde par fichier** (Export / Import) — pas de compte, pas de serveur,
  pas d'abonnement. Synchro cloud = éventuellement plus tard.
- **Mois calendaire** classique (1 → 30/31).

## 3. Stack technique

- HTML / CSS / JavaScript pur (pas de framework, pas de build).
- Stockage local **IndexedDB**.
- **PWA** : `manifest.webmanifest` + service worker (offline + install).
- Petite librairie de graphiques légère pour camembert / barres (étape 5).
- Hébergement gratuit possible (Vercel) ou usage local.

## 4. Modèle de données

**Category** `{ id, name, icon, color, type: 'expense' | 'income', archived }`
- Modifiable par l'utilisateur (ajout / renommage / suppression).

**Operation** `{ id, amount (entier FCFA), categoryId, date (YYYY-MM-DD), type, note, createdAt }`
- La brique saisie au quotidien.

**Recurrent** `{ id, label, amount, day (1-31), categoryId, type, active }`  *(étape 4)*
- Charges fixes + salaires. Chaque mois l'app prépare l'opération à confirmer
  (montant ajustable pour SENELEC/eau qui varient).

**Budget** `{ id, categoryId, monthlyLimit }`  *(étape 3)*
- Plafond mensuel par catégorie ; alertes à 80 % et 100 %.

**Settings** `{ currency: 'FCFA', ... }`

## 5. Écrans

1. **Accueil / Tableau de bord** — Revenus, Dépenses, Solde du mois ;
   « Épargne possible » ; barres de budgets ; 3 dernières opérations ; bouton « + ».
2. **Ajouter** — montant, Dépense/Revenu, catégories en pastilles, date, note.
3. **Historique** — liste par jour, filtres Jour/Semaine/Mois + catégorie, totaux.
4. **Budgets & Rapports** — plafonds par catégorie + camembert + tendance 6 mois.
5. **Réglages** — catégories, récurrences, export/import, à propos.

## 6. Rapports & alertes

- Répartition du mois (camembert), tendance 6 mois (barres), focus catégorie.
- Vues jour / semaine / mois avec total + moyenne.
- Bilan du mois (revenus, dépenses, solde, épargne).
- Alertes budget : 80 % (orange), 100 %+ (rouge), notification optionnelle.
- Épargne : « possible ce mois » (revenus − dépenses) + cumul si catégorie Épargne/Tontine.

## 7. Plan de construction (par étapes)

1. **Socle** : opérations (ajout/voir/modifier/supprimer), catégories de base
   modifiables, tableau de bord du mois. → déjà utile.
2. **Historique & filtres** jour/semaine/mois/catégorie + totaux.
3. **Budgets** par catégorie + alertes 80 %/100 %.
4. **Récurrences** (charges fixes + salaires automatiques à confirmer).
5. **Rapports** (camembert, tendance 6 mois) + bilan du mois.
6. **Export/Import** + PWA propre (install + offline) + finitions.

Chaque étape produit quelque chose de testable avant de passer à la suivante.
