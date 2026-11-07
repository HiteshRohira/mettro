#!/usr/bin/env bash
# Downloads raw DMRC data into <raw_dir>: line_list.json, station_list.json, st/<CODE>.json
# Usage: ./scripts/download_delhi_raw.sh /tmp/dmrc
set -euo pipefail
RAW="${1:?usage: download_delhi_raw.sh <raw_dir>}"
B=https://backend.delhimetrorail.com/api/v2/en
get() { curl -s -m 40 -A "Mozilla/5.0" -H "Referer: https://www.delhimetrorail.com/" -H "Origin: https://www.delhimetrorail.com" "$B/$1" -o "$2"; }
mkdir -p "$RAW/st"
get line_list "$RAW/line_list.json"
get station_list "$RAW/station_list.json"
python3 -I -c "import json,sys;print('\n'.join(x['station_code'] for x in json.load(open(sys.argv[1]))))" "$RAW/station_list.json" |
while read -r c; do
  [[ "$c" == *" "* ]] && continue   # skip depot pseudo-entries
  [ -s "$RAW/st/$c.json" ] || { get "station/$c" "$RAW/st/$c.json"; sleep 0.3; }
done
echo "Downloaded $(ls "$RAW/st" | wc -l | tr -d ' ') stations to $RAW"
