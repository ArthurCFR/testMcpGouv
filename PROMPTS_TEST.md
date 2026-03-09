# Prompts de test — Commune Agent

> 10 prompts complexes pour tester les outils MCP dans des scénarios réalistes et exigeants.
> Chaque prompt est conçu pour déclencher au moins 3 outils en chaîne et révéler des comportements limites.

---

## 1. Avis de valeur vendeur complet

**Ce que ça teste :** chaîne complète avis de valeur (resolve → historique → par rue → comparables → DPE → narratif structuré)

```
J'ai un appartement de 68 m² rue Jean Jaurès à Montpellier que je veux vendre 285 000 €.
Fais-moi un avis de valeur complet : est-ce que je suis dans le marché ou surestimé ?
J'ai besoin de savoir combien de ventes similaires ont eu lieu ces 3 dernières années,
l'évolution des prix depuis 2018, et si l'état énergétique du parc dans mon quartier
peut être un argument de vente ou un frein.
```

**Outils attendus :** `resolve_commune`, `get_dvf_historique_commune`, `get_dvf_par_rue`, `get_dvf_comparables` (date_min 2022), `get_dpe_commune`
**Points de stress :** IQR outlier removal sur les comparables, fusion données 2014-2022 + national 2023-2025, narratif chiffré avec fraîcheur

---

## 2. Comparaison inter-quartiers avec cache SQL

**Ce que ça teste :** cache + SQL agrégé, sections cadastrales, logique multi-appels sans boucle query_resource_data

```
Je cherche à acheter un appartement de 3 pièces (~65 m²) à Lyon.
Quels sont les arrondissements les plus abordables par rapport aux plus chers ?
Donne-moi le classement du prix médian au m² par arrondissement et explique
l'écart entre le 6e et le 8e, qui me semblent proches géographiquement.
```

**Outils attendus :** `resolve_commune` (Lyon → 69123), `get_dvf_sections_commune`, puis cache SQL sur les statistiques DVF pour agréger par arrondissement parisien — ou via `download_dataset_to_cache` + `query_cache` si la granularité sections ne suffit pas
**Points de stress :** volume de sections pour Lyon (ville dense), SQL GROUP BY code_parent, interprétation cartographique sans carte

---

## 3. Petite commune rurale — données lacunaires et graceful degradation

**Ce que ça teste :** comportement sur communes peu peuplées (données manquantes ou "ndiff"), fallback SQLite, message d'erreur informatif

```
J'envisage d'acheter une maison de 120 m² à Conques-en-Rouergue, dans l'Aveyron.
C'est un village classé, est-ce que le marché immobilier est actif ?
Y a-t-il des données de prix disponibles ? Et comment se porte la démographie locale ?
```

**Outils attendus :** `resolve_commune` (nom avec homonyme possible), `get_dvf_historique_commune`, `get_dvf_comparables`, `get_pyramide_ages_commune`, `get_stock_logements_commune`
**Points de stress :** faibles volumes DVF → message "pas assez de transactions", données délinquance marquées "ndiff", pyramide des âges avec code normalisé (zéro-stripping), commune touristique avec beaucoup de résidences secondaires

---

## 4. Résolution d'homonyme — commune ambiguë sans département

**Ce que ça teste :** gestion des homonymes dans resolve_commune, blocage de l'agent avant tout appel de données, suggestion au format json-suggest

```
Donne-moi les statistiques immobilières de Saint-Martin.
Je veux savoir le prix moyen au m² pour une maison de 100 m²
et le taux de logements sociaux.
```

**Outils attendus :** `resolve_commune("Saint-Martin")` → retourne 30+ résultats → l'agent DOIT s'arrêter et demander précision (STOP conforme à la Règle 0)
**Points de stress :** le LLM ne doit PAS deviner un code INSEE, ne PAS continuer avec le premier résultat, présenter la liste et attendre confirmation

---

## 5. Profil investisseur — rentabilité locative + risque

**Ce que ça teste :** croisement de données hétérogènes (prix d'achat, DPE, délinquance, logements sociaux) pour une analyse d'investissement

```
Je veux investir dans un studio de 30 m² à Marseille dans le 13e arrondissement.
Avant de faire une offre à 120 000 €, donne-moi :
- Le prix du marché réel (ventes récentes sur des surfaces similaires)
- Le niveau de cambriolages et vols de véhicules dans ce secteur
- La part de passoires thermiques dans le parc (DPE F et G) — risque de dévaluation post-2025
- Le taux de logements sociaux (indicateur de mixité sociale)
```

**Outils attendus :** `resolve_commune("Marseille 13")` ou `resolve_commune("Marseille", "13")` → 13055, `get_dvf_comparables` (surface 30 ±30%), `get_delinquance_commune`, `get_dpe_commune`, `get_logements_sociaux_commune`
**Points de stress :** code commune de Marseille global (pas par arrondissement dans DVF), IQR sur petite surface, lecture DPE + interprétation loi Climat 2025

---

## 6. Agrégation département entier via cache

**Ce que ça teste :** workflow download_dataset_to_cache + query_cache sur données massives, SQL avancé (GROUP BY, ORDER BY, HAVING), pas de boucle sur les communes

```
Quelles sont les 10 communes du Gard avec le plus de transactions immobilières
en 2023 et 2024 ? Et pour ces communes, quelle est l'évolution du prix m²
entre 2019 et 2024 ? Je veux comprendre si le marché gardois se concentre
sur quelques pôles ou reste diffus.
```

**Outils attendus :** `download_dataset_to_cache` (DVF annuel 2023 + 2024 resource IDs), `query_cache` avec SQL `WHERE DEP='30' GROUP BY INSEE_COM ORDER BY SUM(nb_mutations) DESC LIMIT 10`, puis `get_dvf_historique_commune` sur les communes identifiées
**Points de stress :** resource IDs corrects pour les fichiers annuels DVF, SQL multi-tables ou multi-appels cache, interprétation d'un marché régional

---

## 7. Estimation acheteur + marge de négociation

**Ce que ça tested :** mode acheteur (vs vendeur du prompt 1), calcul d'écart prix demandé / marché, recommandation de contre-offre basée sur des données

```
Je visite une maison de 145 m² à Bordeaux (quartier Caudéran) affichée à 620 000 €.
Le vendeur dit que c'est "dans le marché". Vérifie pour moi :
quelles sont les 10 dernières ventes de maisons de taille équivalente dans ce secteur ?
Y a-t-il des ventes récentes en-dessous de ce prix ? De combien puis-je négocier ?
```

**Outils attendus :** `resolve_commune("Bordeaux", "33")`, `get_dvf_par_rue` (filtre Caudéran), `get_dvf_comparables` (maison, 145 m² ±15%, date_min "2022-01-01"), calcul LLM de l'écart et recommandation de contre-offre
**Points de stress :** quartier non-officiel (Caudéran ≠ commune INSEE), logique de calcul d'écart (prix demandé vs médian comparables), surface ±15% vs défaut ±20%

---

## 8. Analyse de tension démographique — commune en croissance

**Ce que ça teste :** pyramide des âges + stock logements + historique DVF pour caractériser une dynamique de marché

```
Montauban est-elle une ville en croissance démographique ?
Est-ce que cette dynamique se reflète dans le marché immobilier ?
Donne-moi la structure de la population (tranches d'âge), la part de logements vacants,
et la tendance des prix depuis 2015. Conclue sur les perspectives pour un acheteur
qui envisage d'y habiter 10 ans.
```

**Outils attendus :** `resolve_commune("Montauban", "82")`, `get_pyramide_ages_commune`, `get_stock_logements_commune` (taux vacance, propriétaires vs locataires), `get_dvf_historique_commune` (série 2015-2024), interprétation croisée LLM
**Points de stress :** corrélation entre démographie et marché (logique LLM), données RP2019 vs DVF 2014-2024 (décalage temporel à mentionner), lecture du taux de logements vacants comme signal de marché détendu

---

## 9. Alsace-Moselle — détection du régime dérogatoire + alternative

**Ce que ça teste :** gestion propre des départements Alsace-Moselle (57, 67, 68), message d'erreur explicatif, proposition d'alternative pertinente

```
Je veux acheter un appartement de 80 m² à Strasbourg.
Donne-moi les prix du marché, l'historique sur 5 ans,
les données de délinquance et le profil énergétique du parc.
```

**Outils attendus :** `resolve_commune("Strasbourg", "67")`, `get_dvf_comparables` → erreur Alsace-Moselle explicite, `get_dvf_historique_commune` → idem, MAIS `get_dpe_commune` et `get_delinquance_commune` doivent fonctionner (pas de restriction Alsace-Moselle sur ces outils), `get_stock_logements_commune` fonctionne aussi
**Points de stress :** l'agent doit expliquer clairement pourquoi DVF est absent (régime local) sans bloquer l'analyse partielle, proposer des données disponibles en substitut (DPE, délinquance, stock)

---

## 10. Exploration libre d'un dataset inconnu via search + cache

**Ce que ça teste :** capacité de discovery (search_datasets → list_dataset_resources → get_resource_info → download_dataset_to_cache → query_cache) sur un sujet non pré-câblé

```
Y a-t-il des données ouvertes sur la consommation d'énergie des bâtiments publics
en France ? Si oui, trouve-moi les 5 communes de moins de 50 000 habitants
qui ont les bâtiments publics les plus énergivores (kWh/m²/an).
Je veux comprendre si c'est corrélé avec leur parc de logements (DPE).
```

**Outils attendus :** `search_datasets("consommation énergie bâtiments publics")`, `list_dataset_resources`, `get_resource_info` (check Tabular API dispo), `query_resource_data` ou `download_dataset_to_cache` + `query_cache` avec filtre population, puis `get_dpe_commune` sur les 5 communes identifiées
**Points de stress :** résultat de recherche bruité (trouver le bon dataset parmi plusieurs), schéma de colonne inconnu à découvrir, jointure logique entre deux sources différentes (bâtiments publics + parc résidentiel)

---

## Tableau de couverture des outils par prompt

| Outil | P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 | P9 | P10 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `resolve_commune` | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | — |
| `get_dvf_historique_commune` | ✓ | — | ✓ | — | — | ✓ | — | ✓ | ✓ | — |
| `get_dvf_comparables` | ✓ | — | ✓ | — | ✓ | — | ✓ | — | ✓ | — |
| `get_dvf_par_rue` | ✓ | — | — | — | — | — | ✓ | — | — | — |
| `get_dvf_sections_commune` | — | ✓ | — | — | — | — | — | — | — | — |
| `get_dpe_commune` | ✓ | — | — | — | ✓ | — | — | — | ✓ | ✓ |
| `get_delinquance_commune` | — | — | — | — | ✓ | — | — | — | ✓ | — |
| `get_logements_sociaux_commune` | — | — | — | — | ✓ | — | — | — | — | — |
| `get_pyramide_ages_commune` | — | — | ✓ | — | — | — | — | ✓ | — | — |
| `get_stock_logements_commune` | — | — | ✓ | — | — | — | — | ✓ | ✓ | — |
| `download_dataset_to_cache` | — | ✓ | — | — | — | ✓ | — | — | — | ✓ |
| `query_cache` | — | ✓ | — | — | — | ✓ | — | — | — | ✓ |
| `search_datasets` | — | — | — | — | — | — | — | — | — | ✓ |
| Homonyme / STOP Règle 0 | — | — | — | ✓ | — | — | — | — | — | — |
| Alsace-Moselle graceful | — | — | — | — | — | — | — | — | ✓ | — |
| Données lacunaires / rurales | — | — | ✓ | — | — | — | — | — | — | — |
