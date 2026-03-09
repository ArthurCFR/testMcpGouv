import asyncio
import json
import logging
import math
from collections import defaultdict

import httpx
from mcp.server.fastmcp import FastMCP

from helpers import cache_manager, datagouv_api_client, tabular_api_client

logger = logging.getLogger("datagouv_mcp")

# DVF par département — dataset 642205e1f2a0d0428a738699
# Couvre 2014–2022. Alsace-Moselle (57, 67, 68) : fichiers vides (régime juridique local).
_DVF_DEP_RESOURCES: dict[str, str] = {
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
    # 57 (Moselle), 67 (Bas-Rhin), 68 (Haut-Rhin) : fichiers vides — Alsace-Moselle
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

_ALSACE_MOSELLE = {"57", "67", "68"}

# Max pages fetched per commune (100 rows/page → cap at 20 000 transactions)
_MAX_PAGES = 200
_PAGE_SIZE = 100
_CONCURRENCY = 8


def _dept_from_commune(code: str) -> str:
    code = code.strip().upper()
    if code.startswith("2A"):
        return "2a"
    if code.startswith("2B"):
        return "2b"
    return code[:2].lower()


async def _fetch_all_rows(
    resource_id: str,
    code_commune: str,
    session: httpx.AsyncClient,
) -> tuple[list[dict], int]:
    """
    Fetch all DVF rows for a given commune via Tabular API (paginated, parallel).
    Returns (rows, total_in_dataset).
    """
    first = await tabular_api_client.fetch_resource_data(
        resource_id,
        page=1,
        page_size=_PAGE_SIZE,
        params={"code_commune__exact": code_commune},
        session=session,
    )
    total = first.get("meta", {}).get("total", 0)
    all_rows: list[dict] = list(first.get("data", []))

    if total <= _PAGE_SIZE:
        return all_rows, total

    total_pages = min(math.ceil(total / _PAGE_SIZE), _MAX_PAGES)

    sem = asyncio.Semaphore(_CONCURRENCY)

    async def fetch_page(page_num: int) -> list[dict]:
        async with sem:
            data = await tabular_api_client.fetch_resource_data(
                resource_id,
                page=page_num,
                page_size=_PAGE_SIZE,
                params={"code_commune__exact": code_commune},
                session=session,
            )
            return data.get("data", [])

    tasks = [fetch_page(p) for p in range(2, total_pages + 1)]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for r in results:
        if isinstance(r, list):
            all_rows.extend(r)

    return all_rows, total


async def _ensure_dept_cached(resource_id: str) -> None:
    """Download DVF dept CSV to SQLite cache if not already cached. Idempotent."""
    if cache_manager.is_cached(resource_id):
        logger.info("DVF dept %s: already cached", resource_id)
        return

    logger.info("DVF dept %s: not cached, downloading...", resource_id)
    resource_data = await datagouv_api_client.get_resource_details(resource_id)
    resource = resource_data.get("resource", {})
    resource_url = resource.get("url")
    if not resource_url:
        raise ValueError(f"No download URL for DVF dept resource {resource_id}")
    resource_title = resource.get("title") or resource.get("name") or resource_id

    async with httpx.AsyncClient(follow_redirects=True, timeout=300.0) as client:
        resp = await client.get(resource_url)
        resp.raise_for_status()
        content = await resp.aread()

    file_size_mb = len(content) / (1024 * 1024)
    logger.info("DVF dept %s: downloaded %.1f MB, ingesting...", resource_id, file_size_mb)

    filename = resource_url.split("/")[-1].split("?")[0].lower()
    is_gzipped = filename.endswith(".gz") or "gzip" in resp.headers.get("content-type", "")

    cache_manager.ingest_csv_to_cache(
        resource_id=resource_id,
        content=content,
        is_gzipped=is_gzipped,
        resource_url=resource_url,
        resource_title=resource_title,
    )
    logger.info("DVF dept %s: cached (%.1f MB)", resource_id, file_size_mb)


def _fetch_rows_from_cache(resource_id: str, code_commune: str) -> tuple[list[dict], int]:
    """Query cached DVF dept SQLite for a specific commune. Returns (rows, total)."""
    safe_code = "".join(c for c in code_commune if c.isalnum())
    sql = (
        f"SELECT * FROM data WHERE code_commune = '{safe_code}' "
        f"LIMIT {_MAX_PAGES * _PAGE_SIZE}"
    )
    rows = cache_manager.run_query(resource_id, sql, max_rows=_MAX_PAGES * _PAGE_SIZE)
    return rows, len(rows)


def _aggregate_by_street(rows: list[dict], min_transactions: int = 3) -> list[dict]:
    """
    Group transactions by street, compute avg price/m² (residential only).
    Only returns streets with at least min_transactions sales, which naturally
    filters out one-off noise and keeps output proportional to commune size.
    """
    streets: dict[str, dict] = defaultdict(lambda: {"prices": [], "types": set()})

    for row in rows:
        if row.get("logement") not in ("True", True, "true", 1, "1"):
            continue
        voie = (row.get("adresse_nom_voie") or "").strip()
        if not voie:
            continue
        try:
            surface = float(row.get("surface_reelle_bati") or 0)
            valeur = float(row.get("valeur_fonciere") or 0)
        except (ValueError, TypeError):
            continue
        if surface <= 0 or valeur <= 0:
            continue

        streets[voie]["prices"].append(valeur / surface)
        t = row.get("type_local")
        if t:
            streets[voie]["types"].add(t)

    result = []
    for voie, data in streets.items():
        if len(data["prices"]) < min_transactions:
            continue
        result.append({
            "rue": voie,
            "nb_transactions": len(data["prices"]),
            "prix_m2_moyen": round(sum(data["prices"]) / len(data["prices"])),
            "types_biens": ", ".join(sorted(data["types"])),
        })

    result.sort(key=lambda x: x["nb_transactions"], reverse=True)
    return result


def register_get_dvf_par_rue_tool(mcp: FastMCP) -> None:
    @mcp.tool()
    async def get_dvf_par_rue(code_commune: str, min_transactions: int = 3) -> str:
        """
        Get DVF real estate transaction statistics grouped by street (voie) for a French commune.
        Returns all streets with at least min_transactions residential sales, sorted by volume,
        with average price per m² (residential properties only, 2014–2022).

        All transactions for the commune are fetched upfront (parallel pages via Tabular API).
        The min_transactions filter then naturally bounds the output without an arbitrary cap:
        small communes return a handful of streets, large cities return proportionally more.
        Increase min_transactions (e.g. 10) for dense cities to keep the output compact.

        NOT available for Alsace-Moselle (departments 57, 67, 68) due to local legal regime.

        Data source: data.gouv.fr — "Compilation des données de valeurs foncières (DVF) par
        département" (dataset 642205e1f2a0d0428a738699).

        Parameters:
            code_commune: INSEE commune code (5 characters, e.g. "34172" for Montpellier)
            min_transactions: minimum number of residential sales for a street to be included
                              (default: 3 — filters out one-off noise while keeping all
                              meaningful streets; use higher values for dense cities)
        """
        code_commune = code_commune.strip()
        if not code_commune:
            return "❌ Error: code_commune cannot be empty."

        dept = _dept_from_commune(code_commune)

        if dept in _ALSACE_MOSELLE:
            dept_names = {"57": "Moselle", "67": "Bas-Rhin", "68": "Haut-Rhin"}
            return (
                f"⚠️  Le département {dept} ({dept_names.get(dept, '')}) fait partie de l'Alsace-Moselle.\n"
                "Le régime juridique local exclut ces départements du dispositif DVF.\n"
                "Aucune donnée de transactions immobilières n'est disponible."
            )

        resource_id = _DVF_DEP_RESOURCES.get(dept)
        if not resource_id:
            return (
                f"❌ Département '{dept}' non trouvé dans la base DVF.\n"
                "Note : DOM/TOM non inclus dans ce dataset."
            )

        logger.info(f"get_dvf_par_rue: commune={code_commune}, dépt={dept}")

        try:
            async with httpx.AsyncClient(timeout=30.0) as session:
                all_rows, total = await _fetch_all_rows(resource_id, code_commune, session)
        except tabular_api_client.ResourceNotAvailableError:
            logger.info(
                "Tabular API unavailable for dept %s, falling back to SQLite cache", dept
            )
            try:
                await _ensure_dept_cached(resource_id)
                all_rows, total = _fetch_rows_from_cache(resource_id, code_commune)
            except Exception as e:  # noqa: BLE001
                logger.exception(f"Cache fallback failed for dept {dept}")
                return f"❌ Données DVF indisponibles pour le département {dept} (Tabular API 404, cache échoué : {e})"
        except Exception as e:  # noqa: BLE001
            logger.exception(f"Error fetching DVF par rue for {code_commune}")
            return f"❌ Erreur lors de la récupération des données : {e}"

        if not all_rows:
            return (
                f"Aucune transaction trouvée pour la commune {code_commune} "
                f"(département {dept.upper()}).\n"
                "La commune peut être trop petite ou le code INSEE est incorrect."
            )

        streets = _aggregate_by_street(all_rows, min_transactions=max(1, min_transactions))

        if not streets:
            return (
                f"Aucune rue avec ≥ {min_transactions} transactions résidentielles pour {code_commune}.\n"
                f"({len(all_rows)} transactions brutes trouvées.) "
                f"Essayez min_transactions=1 pour voir toutes les rues."
            )

        capped = total > _MAX_PAGES * _PAGE_SIZE
        fetched = len(all_rows)

        lines = [
            f"DVF — Prix par rue — commune {code_commune} (2014–2022)",
            f"Source : DVF par département (dépt {dept.upper()}), data.gouv.fr — Tabular API",
            f"Transactions récupérées : {fetched:,}"
            + (f" / {total:,} (limité à {_MAX_PAGES * _PAGE_SIZE:,} max)" if capped else f" / {total:,}"),
            f"{len(streets)} rues avec ≥ {min_transactions} transactions résidentielles :",
            "",
            f"{'Rue':<40} {'Nb transac.':<13} {'Prix m² moy.':<14} {'Types'}",
            "-" * 80,
        ]

        for s in streets:
            voie = s["rue"][:39]
            nb = s["nb_transactions"]
            prix_str = f"{s['prix_m2_moyen']:,} €/m²".replace(",", " ")
            lines.append(f"{voie:<40} {str(nb):<13} {prix_str:<14} {s['types_biens']}")

        lines += [
            "",
            "JSON :",
            json.dumps(streets, ensure_ascii=False),
        ]

        return "\n".join(lines)
