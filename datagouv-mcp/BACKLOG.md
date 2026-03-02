# Backlog — datagouv-mcp

## [ARCH] Cache SQLite local + tool SQL générique

**Problème** : l'architecture actuelle fait 1 requête HTTP par commune. Pour des requêtes
agrégatives (département ~285 communes, région ~1000+, croisements cross-datasets), le
modèle agentique atteint sa limite de steps (20) et doit reculer.

**Solution** : remplacer les appels Tabular API row-by-row par un cache SQLite local +
un outil SQL générique.

### Deux nouveaux outils MCP

#### `download_dataset_to_cache(resource_id)`
- Télécharge le fichier CSV/XLSX depuis data.gouv.fr (une seule fois)
- Indexe les données dans SQLite local (`~/.datagouv_cache/{resource_id}.db`)
- Crée les index sur les colonnes clés (ex: `COM`, `DEP`, `REG`)
- Retourne le nombre de lignes indexées et les colonnes disponibles
- Idempotent : skip si déjà en cache (avec option `force_refresh=True`)

#### `query_cache(resource_id, sql)`
- Exécute une requête SQL arbitraire sur le cache local
- Supporte SELECT, GROUP BY, ORDER BY, JOIN entre ressources
- Retourne les résultats formatés (tableau + JSON compact)
- Timeout configurable pour les requêtes lourdes

### Exemples de requêtes débloquées

```sql
-- Pyramide agrégée de l'Aveyron
SELECT tranche, SUM(femmes) AS f, SUM(hommes) AS h
FROM pyramide_ages WHERE COM LIKE '12%'
GROUP BY tranche ORDER BY tranche

-- Top 10 communes Île-de-France les plus vieillissantes
SELECT COM, NCOM, (pop_65plus * 100.0 / total) AS pct_65
FROM pyramide_ages WHERE COM LIKE '75%' OR COM LIKE '77%' ...
ORDER BY pct_65 DESC LIMIT 10

-- Croisement pyramide + logements sociaux
SELECT p.NCOM, p.total_pop, l.nb_logements_sociaux
FROM pyramide_ages p JOIN logements_sociaux l ON p.COM = l.COM
WHERE p.COM LIKE '12%'
ORDER BY l.nb_logements_sociaux ASC
```

### Avantages
- **1 download = N queries** : latence nulle après le premier téléchargement
- **SQL complet** : agrégations, jointures, filtres arbitraires — l'agent choisit la requête
- **Cross-datasets** : JOIN entre pyramide des âges, DVF, logements sociaux, etc.
- **Scalable** : fonctionne pour commune, département, région, France entière
- **Aucun outil spécialisé supplémentaire** : un seul paradigme couvre tous les cas

### Effort estimé
- `download_dataset_to_cache` : ~100 lignes Python (httpx + pandas + sqlite3)
- `query_cache` : ~50 lignes Python (sqlite3 + formatage)
- Migration des tools existants vers le cache : optionnelle (les tools actuels restent valides)
