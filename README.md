# Nafa — Mon budget

Application web (PWA) de **suivi de dépenses, budget et épargne** en **FCFA**, pensée pour
un usage mobile au quotidien. Données **privées et hors-ligne** : tout reste sur ton appareil.

## Fonctionnalités (étape 1 — socle)

- ➕ **Saisie rapide** d'une dépense ou d'un revenu (montant, catégorie, date, note)
- 🏠 **Tableau de bord** du mois : revenus, dépenses, solde, épargne possible
- 📜 **Historique** filtrable par jour / semaine / mois / catégorie
- 🏷️ **Catégories modifiables** (ajout, modification, suppression) — dépenses et revenus
- 💾 **Stockage local** (IndexedDB) — aucune donnée envoyée en ligne
- 📱 **Installable** comme une app (PWA) et utilisable **sans internet**

## Feuille de route

| Étape | Contenu | État |
|------|---------|------|
| 1 | Socle : opérations, catégories, tableau de bord | ✅ |
| 2 | Historique avancé (totaux dépenses/revenus, moyennes) | ⏳ |
| 3 | Budgets par catégorie + alertes 80 % / 100 % | ⏳ |
| 4 | Charges fixes & salaires récurrents (auto, à confirmer) | ⏳ |
| 5 | Rapports (camembert, tendance 6 mois) + bilan du mois | ⏳ |
| 6 | Export / Import (sauvegarde) + finitions PWA | ⏳ |

## Stack

HTML / CSS / JavaScript pur — pas de framework, pas de build. Stockage **IndexedDB**.
PWA via `manifest.webmanifest` + `sw.js` (service worker, *network-first*).

## Lancer en local

```powershell
cd Nafa
python -m http.server 8770
# puis ouvrir http://localhost:8770/
```

> `fetch` / IndexedDB ne fonctionnent pas en `file://` — il faut servir via HTTP.

## Structure

```
Nafa/
├── index.html              Écrans (Accueil, Ajouter, Historique, Budgets, Réglages)
├── style.css               Styles (thème teal, mobile-first)
├── app.js                  Logique + accès IndexedDB
├── manifest.webmanifest    Manifest PWA
├── sw.js                   Service worker (offline)
├── icon.svg                Icône de l'app
└── docs/plans/             Document de design
```
