"""Create a Workers Static Assets deploy folder with sanitized local lineage."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def package():
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    # Replace only this generated staging directory so CI has a stable deploy path.
    staging = dist / 'deploy'
    if staging.exists():
        shutil.rmtree(staging)
    target = staging / 'stanford-lambdas-lineage'
    target.mkdir(parents=True)
    graph_script = ROOT / 'public' / 'data' / 'graph.js'
    if not graph_script.is_file():
        raise FileNotFoundError('Prepare the ignored local lineage first; public graph data is never committed.')
    source_script = ROOT / 'public' / 'data' / 'source.js'
    if not source_script.is_file():
        raise FileNotFoundError('Prepare the sanitized canonical source before packaging the local editor.')
    for name in ('index.html',):
        (target / name).write_text((ROOT / 'public' / name).read_text())
    static = target / 'static'
    (static / 'data').mkdir(parents=True)
    (static / 'data' / 'graph.js').write_text(graph_script.read_text())
    (static / 'data' / 'source.js').write_text(source_script.read_text())
    for name in ('styles.css', 'lineage.js', 'app.js', 'editor.js', 'favicon.svg', 'favicon.png', 'apple-touch-icon.png', 'og-image.png'):
        shutil.copy2(ROOT / 'public' / name, static / name)
    shutil.copy2(ROOT / 'public' / '_headers', static / '_headers')
    shutil.copytree(ROOT / 'cloudflare', target, dirs_exist_ok=True)
    print(f'Preloaded Cloudflare site folder (sanitized lineage only): {target}')
    return target


if __name__ == '__main__':
    package()
