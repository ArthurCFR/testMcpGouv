# Backlog — datagouv-mcp

## [FEAT] Granularité sections cadastrales (quartiers DVF)

**Problème** : l'analyse est aujourd'hui limitée à la maille commune. Pas de zoom intra-communal.

**Source** : Statistiques totales DVF — resource `851d342f-9c96-41c1-924a-11a7a7aae8a6`
(dataset `64998de5926530ebcecc7b15`)

**Ce que c'est** : le dataset contient un champ `echelle_geo` = `section | commune | departement`.
Chaque section cadastrale d'une commune est filtrable via `code_parent = code_commune`.
Exemple pour Montpellier (34172) : 209 sections, chacune avec nb_ventes, moy/med prix m² appart/maison.

**Nouvel outil** : `get_dvf_sections_commune(code_commune)`
- Appel Tabular API direct (pas de cache nécessaire — petite volumétrie)
- Filtre `code_parent__exact = code_commune` sur la ressource `851d342f`
- Retourne : toutes les sections avec leurs stats de prix (med_prix_m2 appart + maison, nb ventes)
- **Zéro infrastructure supplémentaire**, fonctionne immédiatement

**Limites** : les sections (ex: `34172000AL`) sont des codes cadastraux, pas des noms de quartiers.
Pas de correspondance directe avec les quartiers administratifs ou les IRIS INSEE.

---

## [FEAT] Granularité rues (DVF par département)

**Problème** : impossible d'analyser les prix au niveau d'une rue ou d'un quartier nommé.

**Source** : "Compilation des données de valeurs foncières (DVF) par département"
- Dataset ID : `642205e1f2a0d0428a738699`
- 100 fichiers CSV, un par département (ex: dépt 34 → resource `649e15f5-3a18-41e8-8481-f490340751a6`)
- Tailles : 7 MB (Lozère) → 94 MB (Gironde), Paris = 71 MB
- Colonnes : `adresse_nom_voie`, `code_commune`, `annee` (2014–2022), `valeur_fonciere`,
  `type_local`, `surface_reelle_bati`, `nombre_pieces_principales`, `longitude`, `latitude`, `logement`
- Accessible via Tabular API (filtrable par `code_commune`) **ET** téléchargeable pour le cache

**Nouvel outil** : `get_dvf_par_rue(code_commune)`
- Déduit le département depuis le code commune (ex: `34172` → `34`, `2A001` → `2a`)
- Vérifie si le fichier département est en cache SQLite
- Si non → `download_dataset_to_cache(DEP_RESOURCE_ID)` (~30s première fois, ~7-94 MB)
- Lance `query_cache` avec GROUP BY :
  ```sql
  SELECT adresse_nom_voie,
         COUNT(*) AS nb_transactions,
         ROUND(AVG(valeur_fonciere / surface_reelle_bati)) AS prix_m2_moyen,
         type_local
  FROM data
  WHERE code_commune = '34172' AND logement = 'True' AND surface_reelle_bati > 0
  GROUP BY adresse_nom_voie
  ORDER BY nb_transactions DESC
  LIMIT 50
  ```
- Retourne le top des rues avec prix médians, nb transactions, types de biens

**Map département → resource_id** (à hardcoder dans le tool) :
```python
_DVF_DEP_RESOURCES = {
    "01": "03133a59-bd5e-48a7-93f5-3607f3e21c6f",  # Ain
    "02": "4d11bf4c-3681-4633-8add-0a2a91f94050",  # Aisne
    "03": "e8477f22-ac39-4b21-bd3c-8e0ce4000e6b",  # Allier
    "04": "c8af7d12-eb7e-4e21-ad30-809bd01574c0",  # Alpes-de-Haute-Provence
    "05": "c13dea4a-b84e-42dd-b3b1-089c83560ae0",  # Hautes-Alpes
    "06": "341220a6-1d63-461e-82e8-b8ef5824ab70",  # Alpes-Maritimes
    "07": "f49ee3b2-6694-44b4-9636-1a571196005b",  # Ardèche
    "08": "a79f3a05-d353-4792-accc-537436cfd909",  # Ardennes
    "09": "f006e69e-ce48-4b25-a6b7-fd0893cda502",  # Ariège
    "10": "bd873458-04c0-4637-aeba-d599f271f71a",  # Aube
    "11": "ffc78847-c1b4-4d90-993f-8a2ed04d6b98",  # Aude
    "12": "3c6a826f-65b3-4670-ba74-eff4740b5f24",  # Aveyron
    "13": "b09315f4-7e4c-4b5e-bfe8-029b7087aac0",  # Bouches-du-Rhône
    "14": "1c273781-fddc-43dc-b6e5-c7f8ffb5a369",  # Calvados
    "15": "3037168a-fe1a-4163-ad47-c21d0b3309d9",  # Cantal
    "16": "76a76fe2-cd4c-435f-ae0f-9b4aeb0ad5f8",  # Charente
    "17": "025064b0-37c3-4253-a1a0-3aa83bd2634e",  # Charente-Maritime
    "18": "c500c9b7-f084-4f6d-8ef3-b29c14a93a28",  # Cher
    "19": "d66fed4c-1bc8-4150-a3a5-c726ec75df36",  # Corrèze
    "21": "11970065-afdb-4507-9544-58639540e854",  # Côte-d'Or
    "22": "2e274c55-2a1c-4a1f-b8c3-658a8495c419",  # Côtes-d'Armor
    "23": "0c2ae8e9-e558-4ae6-9796-62253431e933",  # Creuse
    "24": "b7eb3959-3523-4626-90df-cf04919bf64f",  # Dordogne
    "25": "cd1cacee-1d46-4c26-a6d5-8688d7f7bfbd",  # Doubs
    "26": "5fa44358-b09c-4281-baea-d34badf4a59f",  # Drôme
    "27": "3084a946-0152-4649-a732-3dbc6a063f61",  # Eure
    "28": "17484aee-221f-4728-be3c-18e8e3ba446f",  # Eure-et-Loir
    "29": "2fac80bd-d7cb-4111-88c4-c8b51ee56763",  # Finistère
    "2a": "923c8ff2-c34b-4ba1-9396-bdca92dde12f",  # Corse-du-Sud
    "2b": "82d65330-0649-4db8-972e-b60519672127",  # Haute-Corse
    "30": "56d10a2b-e6ba-487c-9252-1ad695c14821",  # Gard
    "31": "81d76cbc-b788-4596-8e3e-7a0beed70878",  # Haute-Garonne
    "32": "7c9c2de4-55c9-4820-bf16-263fdd50b5ff",  # Gers
    "33": "cf28bf1d-9e68-4e2c-b6ce-91ac3ce7972d",  # Gironde
    "34": "649e15f5-3a18-41e8-8481-f490340751a6",  # Hérault
    "35": "07be19bd-46d8-4fbf-b12e-b833c09dc1c3",  # Ille-et-Vilaine
    "36": "7ff438af-237b-4d46-986d-97603bc758f7",  # Indre
    "37": "cdc2b647-9987-4c79-83df-31725c40de48",  # Indre-et-Loire
    "38": "6e84f649-83bd-4c7c-9829-88d09bc91984",  # Isère
    "39": "1a7f16db-2e67-49cd-a305-d25a6f1803bc",  # Jura
    "40": "11e3851e-c7fe-4a61-88c5-28cdeae9dbde",  # Landes
    "41": "543dccc7-9441-4b7d-8c24-50e487c83528",  # Loir-et-Cher
    "42": "d890e6c5-21aa-48ff-bd99-c5936798a856",  # Loire
    "43": "379a7b3d-c569-45e0-a208-b7ae542b4c90",  # Haute-Loire
    "44": "3d44211d-eb1d-4b33-8837-db952283be56",  # Loire-Atlantique
    "45": "ba20de89-e653-476d-91fe-f91af6aad04d",  # Loiret
    "46": "62b750bd-fd53-4d52-b9bc-47724e04fe29",  # Lot
    "47": "69004e5a-130a-4f08-9dcb-e0bceecb604a",  # Lot-et-Garonne
    "48": "a5c42524-7911-4392-9cf5-4798633e988d",  # Lozère
    "49": "c9cad749-3712-48da-9adb-61535ffe30fa",  # Maine-et-Loire
    "50": "da3d1afc-4b95-41a9-8f56-fefb74bcc4ac",  # Manche
    "51": "6be6f1e0-d7bd-4072-acf4-5a7e6a7f44fb",  # Marne
    "52": "001857f7-f958-486e-afce-025e43611ed6",  # Haute-Marne
    "53": "32e0fd56-ecd3-49e2-bb02-3cf667794049",  # Mayenne
    "54": "141ef75a-e44b-489d-8ba2-29677c314db9",  # Meurthe-et-Moselle
    "55": "95049d70-8ddd-4380-962f-11fa86f62862",  # Meuse
    "56": "4593e833-b41f-4d62-8491-9f0b6b09860f",  # Morbihan
    # 57 (Moselle), 67 (Bas-Rhin), 68 (Haut-Rhin) : fichiers vides (664 B) — région Alsace-Moselle,
    # DVF non applicable (régime juridique local différent)
    "58": "7fa45509-aba9-4a56-9f41-007f8f5a6882",  # Nièvre
    "59": "dba38734-d603-4256-9bd2-2e360b44e088",  # Nord
    "60": "d5443a2f-5f0e-41b1-8345-75ed9bb32ad4",  # Oise
    "61": "ada15bb7-595f-490d-8cde-12b7acc7a2e7",  # Orne
    "62": "5e5253cc-9e90-452b-b5b4-295c3fe5651a",  # Pas-de-Calais
    "63": "b3281f54-87c2-4823-a116-a04a909d1941",  # Puy-de-Dôme
    "64": "7bd87189-35e5-4b18-9f31-3b5bce213e55",  # Pyrénées-Atlantiques
    "65": "7553ef49-081b-468f-84ba-41ad74e8a271",  # Hautes-Pyrénées
    "66": "c6ea5261-71c1-42e5-9eba-abbca0e30967",  # Pyrénées-Orientales
    "69": "6719fde5-5f01-4cca-a76a-a2a4c7bbbcdd",  # Rhône
    "70": "5c875511-b6dc-49f3-adef-5d3d3adbcca8",  # Haute-Saône
    "71": "d6c40ee3-4c58-49ab-ae1c-1a2db5d1581b",  # Saône-et-Loire
    "72": "68059603-6645-4f52-9b1b-65f939d82124",  # Sarthe
    "73": "4b68f1e6-611b-4ec0-b94b-cf0fe16a32cb",  # Savoie
    "74": "9cb5fd18-be16-4364-8a6b-16a01ed23971",  # Haute-Savoie
    "75": "332eb6ef-fa7e-45dd-96b6-36d347113984",  # Paris
    "76": "39d46d56-934b-4728-b2a0-0fef9dc5d17b",  # Seine-Maritime
    "77": "e9bfc73d-99b0-421e-803b-b6979981c4f8",  # Seine-et-Marne
    "78": "a5b8aa7f-26b9-4329-9214-cc9b539e78b1",  # Yvelines
    "79": "f4f9b53b-c663-42c2-b4aa-233099eb25cf",  # Deux-Sèvres
    "80": "24e7626c-9490-47cf-9eeb-9e9087316c55",  # Somme
    "81": "33dca368-7844-4479-9557-970036e015cc",  # Tarn
    "82": "7969b77f-4507-4d43-93d1-3104a98dcff2",  # Tarn-et-Garonne
    "83": "e0ecd63d-8c65-4ec1-9d14-aed2115e4ec8",  # Var
    "84": "b292ed18-9620-4145-9384-e9a616a4a5a7",  # Vaucluse
    "85": "a9d0d413-0895-471c-a9b3-84c8d1aa6c7e",  # Vendée
    "86": "e36f6aea-7d1b-443e-bb38-20662eeefc4a",  # Vienne
    "87": "377663cc-8d78-40dd-8849-3982de7a0017",  # Haute-Vienne
    "88": "444358d9-a3d0-48bd-8ac9-07a4440f11f8",  # Vosges
    "89": "cf3db781-b043-4901-8286-c44fcdd5fb80",  # Yonne
    "90": "167795e4-c782-466c-b8bd-1f40a476486e",  # Territoire de Belfort
    "91": "8fc69940-02a0-4bee-ad41-5f168b1876dd",  # Essonne
    "92": "1bfafb0d-570b-45ef-ac48-ad413870848c",  # Hauts-de-Seine
    "93": "388a7d2d-034c-474e-964b-991185f166ee",  # Seine-Saint-Denis
    "94": "409623c3-da20-4041-bcee-2189f664bb93",  # Val-de-Marne
    "95": "8e00f2cb-323f-47fc-8308-26536f6a5260",  # Val-d'Oise
}
```

**Couverture temporelle** : 2014–2022 (données compilées en 2023, pas de mise à jour prévue).
**Alsace-Moselle** (57, 67, 68) : fichiers vides — régime juridique local, DVF non applicable.

---

## [BACKLOG] Nouveaux outils datasets — Immobilier & Qualité de vie

Datasets potentiels à intégrer comme outils MCP. Chaque item cible un besoin utilisateur
concret dans le contexte de l'analyse d'une commune (achat immobilier, déménagement, etc.).

### 🏫 Qualité / proximité des écoles
**Besoin** : les familles veulent savoir si les écoles proches sont de bonne qualité.
**Sources à explorer** :
- Annuaire de l'éducation (data.gouv.fr) — géolocalisation des établissements scolaires
- Résultats du brevet / bac par établissement (DEPP)
- Secteurs scolaires (carte scolaire) — rare et peu structuré en open data

### 🚌 Transports & accessibilité
**Besoin** : accessibilité en transports en commun, proximité gares/aéroports.
**Sources à explorer** :
- GTFS régionaux / nationaux (horaires TC) — trop volumineux pour usage direct
- Base Nationale des Arrêts (BNA) — localisation des arrêts TC
- Base permanente des équipements (BPE INSEE) : équipements de transport par commune

### 🏗️ PLU / Urbanisme (zonage, droits à construire)
**Besoin** : comprendre les zones constructibles, restrictions d'usage des sols.
**Sources à explorer** :
- Géoportail de l'Urbanisme (GPU) — WMS/WFS, pas vraiment CSV
- GéoRisques (PPRN, zones inondables) — API disponible
- Effort élevé : pas de dataset national unifié en CSV

### ⚡ DPE — Diagnostic de Performance Énergétique
**Besoin** : étiquettes énergie des logements (A à G), indicateur qualité du parc.
**Sources** :
- Dataset ADEME DPE logements existants (data.gouv.fr) — très volumineux, filtrable par commune
- Colonnes clés : `code_insee_commune_actualise`, `etiquette_dpe`, `etiquette_ges`,
  `surface_habitable_logement`, `annee_construction`, `type_batiment`
- **Stratégie** : cache SQLite départemental (même approche que DVF par département)

### 🛒 Commerces & services de proximité
**Besoin** : présence de commerces, médecins, équipements culturels, sportifs, etc.
**Sources** :
- **Base Permanente des Équipements (BPE INSEE)** — par commune, très complet, format CSV
  - Dataset data.gouv.fr dispo, filtrable par `DEPCOM` (code commune)
  - Couvre : commerces, écoles, santé, sports, culture, services publics
- **API OpenStreetMap/Overpass** — temps réel mais hors périmètre data.gouv.fr

### 💼 Emploi & revenus
**Besoin** : niveau de vie, taux de chômage, types d'emplois dominant la commune.
**Sources** :
- **Filosofi (INSEE)** — revenus, taux de pauvreté, niveau de vie médian par commune
  - Disponible en CSV sur data.gouv.fr, filtrable par code commune
- **RP INSEE** (Recensement de la Population) — catégories socioprofessionnelles, actifs/chômeurs
- Données déjà partiellement couvertes par Filosofi IRIS (voir section IRIS)

### 📈 Évolution démographique
**Besoin** : tendances de population (croissance, vieillissement, solde migratoire).
**Sources** :
- **Recensement de la Population INSEE** — évolution pop. par commune, structure par âge
  - Séries historiques disponibles (RP 1968 → 2021)
  - Format CSV data.gouv.fr, code commune = clé de jointure
- Indicateurs : pop_totale, variation_annuelle, part_60_plus, solde_naturel, solde_migratoire

### 🔨 Permis de construire
**Besoin** : activité de construction, dynamisme foncier, projets à venir.
**Sources** :
- **Sit@del2 (CGDD/SDES)** — base nationale des permis de construire accordés
  - Données par commune : nb logements autorisés, commencés, terminés
  - Disponible sur data.gouv.fr en CSV millésimé
- Indicateur de dynamisme : commune en construction active vs. parc ancien figé

### 🏢 Copropriétés
**Besoin** : état du parc de copropriétés, présence de copros dégradées.
**Sources** :
- **Registre national des copropriétés (ANAH)** — data.gouv.fr
  - Nb lots, année de construction, présence syndic, immatriculation
  - Colonnes : `code_insee`, `nb_lots_total`, `periode_construction`, `syndicat`
- Données de suivi des copropriétés fragiles/dégradées (PPPI)

### 🏠 Loyers (encadrement & niveaux)
**Besoin** : niveaux de loyers de marché, zones d'encadrement des loyers.
**Sources** :
- **CLAMEUR / OLAP** — observatoires privés, peu en open data
- **Lovac / PPPI** — logements vacants, pas exactement les loyers
- **Observatoire des loyers (OLAP)** — quelques données agrégées sur data.gouv.fr
  - Maille agglomération/commune, loyers médians par type de bien
- Zones d'encadrement des loyers : liste officielle via data.gouv.fr (non exhaustif)

---

## [FEAT] Données IRIS / quartiers nommés

**Problème** : les sections cadastrales n'ont pas de nom. Les vraies "quartiers" (IRIS INSEE,
QPV, quartiers de ville) sont absents de notre outillage.

**Sources à explorer** :
- **Filosofi par IRIS** : revenus, taux de pauvreté, niveau de vie au niveau des IRIS INSEE.
  Le dataset national n'est pas facilement trouvable via l'API search data.gouv.fr (mauvaise
  indexation). Bordeaux Métropole en a publié une version locale (`67f5bb0403325228295b7e85`).
  À chercher via URL directe : `data.gouv.fr/datasets/revenus-pauvrete-et-niveau-de-vie-en-202X-indicateurs-iris`
- **Contours IRIS** : disponibles via IGN/Géoplateforme mais pas en CSV simple.
- **API Adresse BAN** (dataservice `672cf67802ef6b1be63b8975`, base URL `https://data.geopf.fr/geocodage/`) :
  permet de lister toutes les adresses d'une commune (`?citycode=34172&limit=500`) — utile pour
  valider/enrichir les noms de rues DVF avec coordonnées GPS précises.

**Effort** : non estimé — nécessite d'abord de trouver le bon dataset national IRIS.
