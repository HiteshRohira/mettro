# Mettro

A fast, modern metro companion for iOS. It starts with **Delhi Metro** (DMRC, Rapid Metro Gurugram and the Airport Express), and is built so more cities can be added.

Built with Expo SDK 58, React Native 0.88 and Expo Router. Text is set in Inter.

## Features

- **Journey planner**: live routes, train times, platforms and fares from the official DMRC journey planner, with *fastest* and *fewest changes* options. If DMRC is unreachable, an offline planner takes over.
- **Live trip tracking**: stop-by-stop progress that blends GPS with the timetable (useful underground). You can tap any station to correct your position.
- **Live Activity**: shows the next station, a countdown, your arrival time, where to change trains and when to get off. It appears on the Lock Screen and in the Dynamic Island.
- **First & last trains** for every station, in every direction (544 direction timings).
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

All data comes from DMRC's public website API (`backend.delhimetrorail.com/api/v2/en`):

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

The app also checks DMRC's station count in the background, and shows a notice in *More* when new stations appear.

## Adding a city

Put the city's data in `src/data/<city>/network.json`, using the same schema as Delhi. Then add an API adapter alongside `src/lib/api.ts`. Everything in the UI is driven by `src/lib/network.ts`.

*Not affiliated with DMRC.*
