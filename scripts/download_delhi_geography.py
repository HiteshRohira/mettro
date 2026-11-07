#!/usr/bin/env python3
"""Download source OSM route relations and reviewed station nodes.
Usage: python3 scripts/download_delhi_geography.py /tmp/delhi-osm.json
"""
import concurrent.futures
import datetime
import json
import sys
import subprocess
from pathlib import Path
sys.dont_write_bytecode = True
from build_delhi_geography import DATA, RELATIONS

ids = list(json.loads((DATA / 'station-osm.json').read_text())['nodes'].values())
paths = [f'relation/{rid}/full.json' for rid in sorted({r for rs in RELATIONS.values() for r in rs})]
paths += ['nodes.json?nodes=' + ','.join(map(str, ids[i:i+50])) for i in range(0, len(ids), 50)]

def fetch(path):
    url = 'https://api.openstreetmap.org/api/0.6/' + path
    response = subprocess.check_output(['curl', '--fail', '--silent', '--show-error',
        '--location', '--max-time', '60', '--user-agent', 'Mettro-geography-builder/1.0', url])
    return json.loads(response)['elements']

if __name__ == '__main__':
    elements = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(fetch, paths):
            for e in result:
                elements[(e['type'], e['id'])] = e
    snapshot = {'osm3s': {'timestamp_osm_base': datetime.datetime.now(datetime.timezone.utc).isoformat()},
                'elements': list(elements.values())}
    Path(sys.argv[1]).write_text(json.dumps(snapshot))
    print(f'Downloaded {len(elements)} OSM elements to {sys.argv[1]}')
