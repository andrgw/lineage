"""Create a static site bundle with the sanitized local lineage preloaded."""
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def package():
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    # A new directory prevents stale data from a previous bundle being published.
    staging = Path(tempfile.mkdtemp(prefix='deploy-', dir=dist))
    target = staging / 'stanford-lambdas-lineage'
    target.mkdir()
    graph_script = ROOT / 'public' / 'data' / 'graph.js'
    if not graph_script.is_file():
        raise FileNotFoundError('Prepare the ignored local lineage first; public graph data is never committed.')
    for name in ('index.html', 'styles.css', 'lineage.js', 'app.js', '_headers'):
        (target / name).write_text((ROOT / 'public' / name).read_text())
    (target / 'data').mkdir()
    (target / 'data' / 'graph.js').write_text(graph_script.read_text())
    print(f'Preloaded Cloudflare site folder (sanitized lineage only): {target}')
    return target


if __name__ == '__main__':
    package()
