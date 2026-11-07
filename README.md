# Mettro

A fast, modern metro companion for iOS. It starts with **Delhi Metro** (DMRC, Rapid Metro Gurugram and the Airport Express), and is built so more cities can be added.

Built with Expo SDK 58, React Native 0.88 and Expo Router. Text is set in Inter.

## Screenshots

<p align="center">
  <img src="https://github.com/user-attachments/assets/9fed65b0-5520-4bf7-8543-6b0e51eb729a" alt="Delhi Metro journey planner in dark mode" width="280">
  <img src="https://github.com/user-attachments/assets/3d8b8500-fc5f-4080-9ffb-f7f3f94a3530" alt="Route to AIIMS with train times, platform, fare and last train warning in dark mode" width="280">
</p>

[Watch the UI walkthrough](https://github.com/user-attachments/assets/880ba636-0ea6-423f-b431-e5e96da132d8) · [Full-resolution screenshots](https://github.com/HiteshRohira/mettro/pull/2#issuecomment-6710805250)

<details>
<summary>Explore the UI in dark and light mode</summary>

| Screen | Dark | Light |
|---|---|---|
| Journey planner | <img src="https://github.com/user-attachments/assets/9fed65b0-5520-4bf7-8543-6b0e51eb729a" alt="Journey planner in dark mode" width="240"> | <img src="https://github.com/user-attachments/assets/41b6a115-860c-48ad-a416-e1a9e7624e03" alt="Journey planner in light mode" width="240"> |
| Route & fare | <img src="https://github.com/user-attachments/assets/3d8b8500-fc5f-4080-9ffb-f7f3f94a3530" alt="Route & fare in dark mode" width="240"> | <img src="https://github.com/user-attachments/assets/06a61b73-2cb8-422e-8a72-91def9a87d47" alt="Route & fare in light mode" width="240"> |
| Active trip | <img src="https://github.com/user-attachments/assets/30e151d4-07e4-4d94-9cc1-3fe18cc4dde5" alt="Active trip in dark mode" width="240"> | <img src="https://github.com/user-attachments/assets/6c73d817-b88d-4d45-a1d4-fa03ce91ad31" alt="Active trip in light mode" width="240"> |
| Station & train timings | <img src="https://github.com/user-attachments/assets/ed76acc8-74a3-42cb-ab2e-d0e65b9c09f7" alt="Station & train timings in dark mode" width="240"> | <img src="https://github.com/user-attachments/assets/13c70635-2f49-45f3-ba98-ec555c98e11b" alt="Station & train timings in light mode" width="240"> |
| Network map | <img src="https://github.com/user-attachments/assets/83bd4a50-f979-4f30-a3aa-8852a9563f8a" alt="Network map in dark mode" width="240"> | <img src="https://github.com/user-attachments/assets/6c44ce65-9f61-4724-9632-c6c3d0998d9a" alt="Network map in light mode" width="240"> |
| Preferences & travel info | <img src="https://github.com/user-attachments/assets/b5681c9d-d996-4d12-ac0e-9eeaaa89d39f" alt="Preferences & travel info in dark mode" width="240"> | <img src="https://github.com/user-attachments/assets/6a57f585-a00e-490b-8472-7fa152c98724" alt="Preferences & travel info in light mode" width="240"> |

</details>

## Features

- **Journey planner**: live routes, train times, platforms and fares from the official DMRC journey planner, with *fastest* and *fewest changes* options. If DMRC is unreachable, an offline planner takes over.
- **Live trip tracking**: stop-by-stop progress that blends GPS with the timetable (useful underground). You can tap any station to correct your position.
- **Live Activity**: shows the next station, a countdown, your arrival time, where to change trains and when to get off. It appears on the Lock Screen and in the Dynamic Island.
- **First & last trains** for every station, in every direction (544 direction timings).
- **Station navigation**: choose Apple Maps or Google Maps for directions to the reviewed station coordinates. Google Maps falls back to its website when the app is unavailable. Coordinates represent stations/platforms, not specific entrance gates.
- **Station details**: platforms, gates (with live open/closed status), lifts and escalators, toilets, ATMs and other facilities, parking, feeder buses, nearby places, and phone numbers.
- **Nearby stations** with walking time and the last train from each.
- **Network map** on Apple Maps, with a toggle for each line.
- **Line status**, live from DMRC and refreshed silently in the background. A home-screen widget shows it too. Mettro sends no notifications.
- Fares, ticket and card info, travel rules, helplines, accessibility and Airport Express info.
- Light and dark mode.

## Run it

```bash
npm install
npx expo run:ios            # dev build on the simulator
```

To install on an iPhone, see **[docs/SIDELOADING.md](docs/SIDELOADING.md)**.

## Data

Service, routing and station-detail data comes from DMRC's public website API (`backend.delhimetrorail.com/api/v2/en`):

| Data | Source | When |
|---|---|---|
| Routes, train times, platforms, fares | `station_route/{from}/{to}/{mode}/{time}` | Live, on every search |
| Line status | `line_list` | On app open + background refresh |
| Gate status & station alerts | `station/{code}` | Live, when you open a station |
| Stations, facilities, gates, lifts, parking | `station/{code}` | Bundled snapshot |
| First/last trains, hop times | Crawled from the planner | Bundled snapshot |

To regenerate the bundled snapshot (for example after new stations open):

```bash
RAW=/tmp/dmrc && mkdir -p $RAW/st
./scripts/download_delhi_raw.sh $RAW                           # raw DMRC station data
python3 -I scripts/build_delhi_graph.py   $RAW src/data/delhi   # build the network graph
python3 -I scripts/fetch_delhi_timings.py $RAW src/data/delhi/network.json   # crawl first/last trains
python3 -I scripts/build_delhi_graph.py   $RAW src/data/delhi   # merge timings
python3 -I scripts/harvest_delhi_edges.py $RAW src/data/delhi/network.json   # cross-check edges against the planner
```

Station coordinates and map track alignments use [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright), licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). They are bundled for offline use in `geography.json`; `station-osm.json` records the reviewed station/stop node ID and source name for every station. Regeneration rejects changed identities, non-metro nodes and duplicate positions for review. Interchanges use a representative station position, rather than individual entrances or platforms.

Refresh the geography directly from the OpenStreetMap API:

```bash
python3 scripts/download_delhi_geography.py /tmp/delhi-osm.json
python3 scripts/build_delhi_geography.py /tmp/delhi-osm.json
python3 -I scripts/build_delhi_graph.py /tmp/dmrc src/data/delhi
npm test
```

The graph builder reapplies reviewed coordinates after importing DMRC data. When adding stations or changing routing edges, update the OSM node mapping and route relation IDs, regenerate both datasets, and run the geography checks. Map edges must have track shapes with endpoints at the corrected stations. The snapshot date is recorded in `geography.json`.

The app also checks DMRC's station count in the background, and shows a notice in *More* when new stations appear.

## Adding a city

Put the city's data in `src/data/<city>/network.json`, using the same schema as Delhi. Then add an API adapter alongside `src/lib/api.ts`. Everything in the UI is driven by `src/lib/network.ts`.

*Not affiliated with DMRC.*
