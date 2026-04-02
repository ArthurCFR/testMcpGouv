import json
import logging
import os

import httpx
from mcp.server.fastmcp import FastMCP

logger = logging.getLogger("datagouv_mcp")

_BAN_URL = "https://api-adresse.data.gouv.fr/search/"
_COMMUNE_AGENT_URL = os.environ.get("COMMUNE_AGENT_URL", "http://localhost:3000")


def register_get_accessibility_snapshot_tool(mcp: FastMCP) -> None:
    @mcp.tool()
    async def get_accessibility_snapshot(address: str) -> str:
        """
        Géocode une adresse française via l'API BAN et retourne un bloc json-accessibility
        à inclure dans la réponse pour afficher la carte d'accessibilité (transports en commun,
        aéroports proches) directement dans la conversation.

        QUAND APPELER : dès qu'un utilisateur mentionne une adresse postale précise
        (numéro + rue + ville, ou lieu-dit + commune). Appelle ce tool automatiquement,
        sans attendre que l'utilisateur le demande.

        IMPORTANT : le résultat contient un bloc ```json-accessibility``` que tu dois
        inclure VERBATIM dans ta réponse finale (après ===RÉPONSE===), sans le modifier.

        Parameters:
            address: Adresse postale complète (ex: "15 rue de la Paix, Paris",
                     "3 impasse des Lilas, Marcillac-Vallon")
        """
        address = address.strip()
        if not address:
            return "❌ Erreur : l'adresse ne peut pas être vide."

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    _BAN_URL,
                    params={"q": address, "limit": 1},
                    headers={"User-Agent": "CommuneAgent/1.0 (accessibility)"},
                )
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            logger.exception("BAN API HTTP error")
            return f"❌ Erreur BAN API : {e.response.status_code} — {e.response.text[:200]}"
        except Exception as e:
            logger.exception("BAN API network error")
            return f"❌ Erreur réseau BAN API : {e}"

        features = data.get("features", [])
        if not features:
            return (
                f"❌ Adresse introuvable dans la BAN : « {address} ».\n"
                f"Essayez avec l'adresse complète (numéro + rue + ville)."
            )

        feature = features[0]
        props = feature["properties"]
        coords = feature["geometry"]["coordinates"]  # GeoJSON : [lng, lat]
        lng, lat = coords[0], coords[1]
        label = props.get("label", address)
        score = props.get("score", 0)

        if score < 0.3:
            return (
                f"⚠️ Adresse géocodée avec un faible indice de confiance (score={score:.2f}) : "
                f"« {label} ». Précisez l'adresse si le résultat semble incorrect."
            )

        snap_data = {"address": label, "lat": lat, "lng": lng}
        bloc = f"```json-accessibility\n{json.dumps(snap_data, ensure_ascii=False)}\n```"

        # Fetch real transit data from the commune-agent accessibility API
        transit_summary = ""
        airport_summary = ""
        try:
            analyze_url = f"{_COMMUNE_AGENT_URL}/api/accessibility/analyze"
            acc_resp = await client.post(
                analyze_url,
                json={"lat": lat, "lng": lng, "address": label},
                timeout=30.0,
            )
            if acc_resp.status_code == 200:
                acc = acc_resp.json()
                transit_lines = []
                for stop in acc.get("transitStops", [])[:6]:
                    type_label = stop["type"]
                    raw_lines = stop.get("lines", [])
                    if type_label == "tram" and raw_lines:
                        line_str = ", ".join(
                            l if l.upper().startswith("T") else f"T{l}"
                            for l in raw_lines[:2]
                        )
                    elif raw_lines:
                        line_str = ", ".join(raw_lines[:2])
                    else:
                        line_str = ""
                    suffix = f" ligne {line_str}" if line_str else ""
                    transit_lines.append(
                        f"- {stop['name']} ({type_label}{suffix}) : {stop['walkingTime']} min à pied ({stop['walkingDistance']} m)"
                    )
                transit_summary = "\n".join(transit_lines) if transit_lines else "Aucun transport à moins de 20 min à pied."

                airport_lines = []
                for a in acc.get("airports", [])[:2]:
                    airport_lines.append(
                        f"- Aéroport {a['city']} {a['iata']} : {a['drivingTime']} min en voiture ({a['drivingDistance']} km)"
                    )
                airport_summary = "\n".join(airport_lines)
        except Exception as e:
            logger.warning("Accessibility analyze call failed: %s", e)
            transit_summary = "Données de transports non disponibles (service non joignable)."

        transit_section = f"**Transports en commun (à pied depuis l'adresse) :**\n{transit_summary}"
        airport_section = (f"\n\n**Aéroports proches (en voiture) :**\n{airport_summary}") if airport_summary else ""

        return (
            f"✅ Adresse géocodée : « {label} » (lat={lat:.6f}, lng={lng:.6f}, score={score:.2f})\n\n"
            f"{transit_section}{airport_section}\n\n"
            f"Ces données de proximité sont disponibles pour le rapport.\n\n"
            f"Inclus VERBATIM le bloc suivant dans ta réponse finale (après ===RÉPONSE===) "
            f"pour afficher la carte d'accessibilité inline :\n\n"
            f"{bloc}"
        )
