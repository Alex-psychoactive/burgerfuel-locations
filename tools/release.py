"""
Cut a release: bump the version everywhere and rebuild the Webflow bundle.

    python tools/release.py          # next version (4 -> 5 -> 6 ...)
    python tools/release.py 7        # a specific version

It
  * writes version.json            (what loader.js reads on every page load)
  * rewrites every ?v=N            (index.html's own script/stylesheet tags)
  * regenerates js/markup.js       (the page markup, as a script for Webflow)

Then commit, tag and push:

    git commit -am "Release vN: ..."
    git tag vN
    git push origin main --tags

The tag is the backup: `git checkout vN -- .` restores any past release.
"""
import datetime, io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def path(*p): return os.path.join(ROOT, *p)
def read(p): return io.open(path(p), encoding='utf-8').read()
def write(p, s): io.open(path(p), 'w', encoding='utf-8', newline='\n').write(s)

try:
    current = int(json.loads(read('version.json'))['version'])
except (IOError, OSError, KeyError, ValueError):
    current = 4
new = int(sys.argv[1]) if len(sys.argv) > 1 else current + 1

write('version.json', json.dumps({
    'version': str(new),
    'released': datetime.date.today().isoformat()
}, indent=2) + '\n')

for f in ('index.html',):
    s = read(f)
    write(f, re.sub(r'\?v=\d+', '?v=%d' % new, s))

# js/markup.js — the <body> of index.html minus its <script> tags
s = read('index.html')
body = re.search(r'<body[^>]*>(.*?)</body>', s, re.S).group(1)
body = re.sub(r'<script[^>]*></script>\s*', '', body).strip()
write('js/markup.js',
      '(function(){var m=document.getElementById("bf-locator");'
      'if(!m||m.getAttribute("data-bf-mounted"))return;'
      'm.setAttribute("data-bf-mounted","1");m.innerHTML=' + json.dumps(body) + ';})();\n')

print('v%d -> v%d. Now: git commit -am "Release v%d: ..." && git tag v%d && git push origin main --tags'
      % (current, new, new, new))
