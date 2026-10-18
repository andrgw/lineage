"""Create a data-free static site bundle suitable for Cloudflare Pages."""
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def package():
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    # A new directory prevents stale data from a previous bundle being published.
    target = Path(tempfile.mkdtemp(prefix='framework-', dir=dist))
    for name in ('index.html', 'styles.css', 'lineage.js', 'app.js', '_headers'):
        text = (ROOT / 'public' / name).read_text()
        if name == 'index.html':
            text = text.replace('  <script src="data/graph.js"></script>\n', '')
        (target / name).write_text(text)
    print(f'Data-free Cloudflare Pages folder: {target}')
    return target


if __name__ == '__main__':
    package()
