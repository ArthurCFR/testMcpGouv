# Roadmap — Commune Agent Immobilier

> Analyse de faisabilité basée sur les données DVF disponibles (data.gouv.fr).
> Sources actives : DVF par département (2014–2022), DVF annuel par commune (2022–2024), Statistiques DVF cumulées par section cadastrale (2014–2024).

---

## Ce qui est déjà en place (outils MCP existants)

| Outil | Couverture | Ce qu'il retourne |
|---|---|---|
| `get_dvf_par_rue` | 2014–2022 | Prix m² **moyen** par rue + nb_transactions (⚠️ voir note) |
| `get_dvf_sections_commune` | 2014–2024 cumulé | Médiane m² par section cadastrale + nb_ventes |
| `get_dvf_historique_commune` | 2014–2024 | Série annuelle prix_m² + nb_mutations |
| `resolve_commune` | — | Code INSEE depuis nom + département |

> ⚠️ `get_dvf_par_rue` calcule une **moyenne** (pas une médiane). Acceptable en première approximation, mais une vente atypique peut biaiser le résultat. À documenter clairement dans le narratif ("prix moyen observé, basé sur N ventes").

---

## Ce qui reste à construire — un seul outil P0

### `get_dvf_comparables`

**Fondation de tout le reste.** Accède aux transactions individuelles, permet de filtrer, et expose les indicateurs de contexte (fraîcheur, volume, période).

**Interface :**

```python
get_dvf_comparables(
    code_commune: str,
    type_local: "Maison" | "Appartement",
    surface_cible: float,                    # m²
    surface_tolerance_pct: float = 20,       # ±20% par défaut
    max_results: int = 10,                   # N ventes les plus récentes
) -> str
```

**Données retournées par transaction :**
- `date_mutation` — date réelle de la vente signée
- `valeur_fonciere` — prix total
- `surface_reelle_bati` — surface
- `prix_m2` — calculé
- `adresse_nom_voie` — rue

**Indicateurs de contexte à inclure dans chaque réponse :**

| Indicateur | Source | Pourquoi |
|---|---|---|
| `nb_transactions_matching` | Filtre appliqué | Contexte : le client sait si c'est basé sur 3 ou 300 ventes |
| `date_derniere_vente` | max(date_mutation) | "Fraîcheur" réelle : la vente la plus récente sur ce filtre |
| `date_premiere_vente` | min(date_mutation) | Fenêtre temporelle réelle couverte |
| `periode_couverte` | "{date_min} → {date_max}" | Affiché dans le narratif et le PDF |

---

## Ce qu'on supprime de la roadmap initiale

| Supprimé | Raison |
|---|---|
| `get_argumentaire_immo` (outil MCP) | Orchestration = travail du LLM. Remplacé par une instruction dans le system prompt. |
| `get_tension_marche` | Redondant : `nb_mutations` par année dans `get_dvf_historique_commune` suffit. |
| `get_dvf_comparables_geo` | Effort élevé, valeur marginale dans 90% des cas. Reste en backlog P3. |
| Probabilité de vente en 3 mois | Aucune donnée de délai dans DVF. Interdit. |
| Vitesse d'écoulement | Idem — pas de date de mise en vente. |
| Toute quantification de délai | Idem. |

---

## Remplacement de `get_argumentaire_immo` — System prompt structuré

Au lieu d'un outil MCP dédié, ajouter dans le system prompt une section **"Avis de valeur immobilier"** :

```
Pour générer un avis de valeur (mode vendeur ou acheteur) :
1. resolve_commune → code INSEE confirmé
2. get_dvf_historique_commune → tendance 3/5/10 ans + nb_mutations/an
3. get_dvf_par_rue (rue concernée) → prix m² de la rue, nb transactions
4. get_dvf_comparables → 10 ventes les plus récentes, type + surface ±20%
5. Calcule : (prix_demandé / médian_marché - 1) × 100 = % écart
6. Formule le narratif selon le mode :
   - vendeur → ton "alignement avec le marché", correction si surestimé
   - acheteur → ton "opportunité", marge de négociation si justifiée
7. Inclure systématiquement : nb transactions utilisées + période couverte + date dernière vente
```

**Avantages :**
- Debug naturel via AgentTrace (chaque appel visible)
- Flexible : le LLM adapte si certaines données manquent (commune rurale sans rue identifiée)
- Zéro code MCP supplémentaire à maintenir

---

## Ce qu'il ne faut PAS promettre (données absentes)

- ❌ Délai moyen de vente (pas de date de mise en vente dans DVF)
- ❌ Probabilité de vente exacte en N mois
- ❌ Ratio offre/demande réel (pas de données sur l'offre)
- ❌ Prix Alsace-Moselle (57, 67, 68 — régime juridique différent)
- ❌ Médiane stricte par rue (actuellement c'est une moyenne — le dire)

---

## Prochaines étapes

### Étape 1 — `get_dvf_comparables` (P0, effort moyen)

Même base de code que `get_dvf_par_rue` (mêmes fichiers DVF par département).
Filtres : `type_local` exact + `surface_reelle_bati` dans ±N%, résidentiels uniquement.
Sort : `date_mutation` décroissant, top N.
Contexte systématique : nb_matching, date_premiere_vente, date_derniere_vente.

### Étape 2 — System prompt "Avis de valeur" (P0, effort faible)

Ajouter l'instruction structurée dans `commune-agent/app/api/analyze/route.ts`.
Deux formulations : mode vendeur / mode acheteur.

### Étape 3 — UI "Argumentaire" (P1, effort moyen)

Module frontend avec deux boutons (Vendeur / Acheteur) → déclenche le flow → export PDF.
Composants déjà en place : `ReportPDF.tsx` + `PDFButton.tsx`.

---

## Backlog — hors scope immédiat

| Outil | Priorité | Notes |
|---|---|---|
| `get_dvf_comparables_geo` | P3 | Comparables à –500m via lat/lon. Effort élevé, valeur marginale sauf en urbain dense. |
| Médiane stricte dans `get_dvf_par_rue` | P2 | Remplacement moyenne → médiane. Mineur, mais plus robuste pour l'argumentaire. |
