# Réseaux tram/metro absents de l'index — causes connues

## TCL Lyon (lignes A/B/C/D + trams T1–T7)
Feed 1 (abebedc6) : contient les routes metro/tram (route_type 0/1) + trips + stop_times
**mais pas de stops.txt** — les positions d'arrêts sont absentes.
Feed 2 (99e0887d) : contient stops.txt + tous les arrêts **mais uniquement des bus** (route_type 3).
Les stop_ids des deux feeds sont dans des espaces de numérotation différents (pas de jointure possible).
→ TCL publie ses données scindées sur le PAN, sans feed complet combiné.

## RTM Marseille
Même symptôme que TCL : le feed "Réseaux urbains de la Métropole Aix-Marseille-Provence"
ne contient probablement pas de stops.txt ou utilise des route_types non standard.

## Star Rennes (metro A/B)
Feed sans stops.txt ou route_type non standard (le VAL de Rennes utilise route_type=1 en théorie).

## Twisto Caen, Fil Bleu Tours, T2C Clermont-Ferrand
Ces réseaux utilisent du BHNS (Bus à Haut Niveau de Service) — infrastructure dédiée mais
classé route_type=3 (bus) dans leur GTFS, pas route_type=0 (tram).
Le script filtre correctement : ce ne sont pas des trams au sens GTFS.

## Correction possible
Pour Lyon/Rennes/Marseille : trouver un feed GTFS complet sur le portail open data
de l'opérateur directement (SYTRAL, Kéolis Rennes, RTM) et ajouter l'URL dans FEEDS
dans scripts/ingest-tram-metro.ts.
