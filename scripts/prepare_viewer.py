"""Prepare local viewer data from the reconciled graph; never copy directory fields."""
import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path.home() / 'Downloads/lfe_stanford_lineage_graph.json'


def prepare(source=DEFAULT_SOURCE):
    raw = json.loads(Path(source).read_text())
    nodes = []
    for record in raw['nodes']:
        nodes.append({
            'id': int(record['Roster_Number']),
            'name': str(record['Full_Name']),
            'display_name': str(record['Display_Name']),
            'class_name': str(record['Class']).strip(),
            'rank': int(record['Class_Order']) - 1,
            'x': float(record['Layout_X']),
            'roles': [role for role, field in [('president', 'Is_President'), ('sensei', 'Is_Sensei')] if record[field]],
        })
    by_id = {node['id']: node for node in nodes}
    if len(by_id) != len(nodes):
        raise ValueError('Duplicate roster IDs')
    if any(not math.isfinite(n['x']) or n['rank'] < 0 for n in nodes):
        raise ValueError('Invalid layout coordinates')
    edges = []
    seen = set()
    for record in raw['edges']:
        a, b = int(record['source']), int(record['target'])
        if a not in by_id or b not in by_id or by_id[a]['rank'] >= by_id[b]['rank']:
            raise ValueError('Invalid or non-chronological edge')
        if (a, b) in seen:
            continue
        seen.add((a, b))
        edges.append({'source': a, 'target': b, 'era': record['era']})
    # Confirm that the supplied layout has not silently changed the existing graph.
    previous = ROOT / 'public/data/lineage_edges.json'
    if previous.exists():
        old = json.loads(previous.read_text())
        prior = {(int(e['big_bro_id'].split('-')[-1]), int(e['little_bro_id'].split('-')[-1])) for e in old}
        if prior != seen:
            raise ValueError('Supplied graph differs from workbook reconciliation; review before importing')
        review = {(int(e['big_bro_id'].split('-')[-1]), int(e['little_bro_id'].split('-')[-1])) for e in old if e.get('review_required')}
        for edge in edges:
            if (edge['source'], edge['target']) in review:
                edge['review_required'] = True
    graph = {'nodes': nodes, 'edges': edges}
    target = ROOT / 'public/data'
    target.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(graph, ensure_ascii=True)
    (target / 'graph.json').write_text(payload + '\n')
    (target / 'graph.js').write_text('globalThis.LINEAGE_DATA = ' + payload + ';\n')
    print(f'Prepared local viewer: {len(nodes)} members, {len(edges)} relationships.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--graph-path', type=Path, default=DEFAULT_SOURCE)
    prepare(parser.parse_args().graph_path)
