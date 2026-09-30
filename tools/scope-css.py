"""
One-off converter (kept for reference): made css/style.css safe to embed.

  * every rule is scoped under #bf-locator, so nothing leaks onto the host
    page (the Webflow site has its own .nav, resets and :root variables)
  * `rem` → calc(var(--u) * n). The fluid scale lives in --u on
    #bf-locator instead of html{font-size}, so the host page's own rem
    sizes are untouched
  * the html{font-size} scale rules become #bf-locator{--u:…} with px anchors
  * page-state selectors (.is-sheet-open, body[data-view] … set on <body>)
    keep that compound first, then #bf-locator
  * rem inside @media conditions is left alone (always 16px there)

    python tools/scope-css.py css/style.css
"""
import io, re, sys

SCOPE = '#bf-locator'
PAGE_STATE = re.compile(r'^(html|body|:root)\b|^\.(is-sidebar-open|is-sheet-open|has-filter|is-lb-open|is-stuck|is-locked)\b')

def rem_to_u(v):
    def f(m):
        n = m.group(1)
        return 'calc(var(--u) * %s)' % n
    return re.sub(r'(?<![\w.-])(-?\d*\.?\d+)rem\b', f, v)

def rem_to_px(v):
    return re.sub(r'(?<![\w.-])(-?\d*\.?\d+)rem\b',
                  lambda m: ('%g' % (float(m.group(1)) * 16)) + 'px', v)

def scope_selector(sel):
    out = []
    for part in sel.split(','):
        p = part.strip()
        if not p:
            continue
        first = re.split(r'(?<=[^\s>+~])\s*[\s>+~]\s*', p, maxsplit=1)
        head = re.match(r'^[^\s>+~]+', p).group(0)
        rest = p[len(head):]
        if head in (':root', 'html') and not rest:
            out.append(SCOPE)                        # tokens / scale move onto the host
        elif PAGE_STATE.match(head):
            # page-level: html/body/state class alone stays; with a
            # descendant, the host goes in between
            out.append(p if not rest.strip() else head + ' ' + SCOPE + rest)
        elif p.startswith(SCOPE):
            out.append(p)
        else:
            out.append(SCOPE + ' ' + p)
    return ','.join(out)

def transform(css):
    out, i, n = [], 0, len(css)
    stack = []                 # at-rule kinds we're inside
    while i < n:
        if css.startswith('/*', i):
            j = css.index('*/', i) + 2
            out.append(css[i:j]); i = j; continue
        if css[i] == '}':
            if stack: stack.pop()
            out.append('}'); i += 1; continue
        j = i
        # find the next { or } or ; at this level (skip comments and strings)
        while j < n and css[j] not in '{};':
            if css.startswith('/*', j):
                j = css.index('*/', j) + 2; continue
            if css[j] in '"\'':
                q = css[j]; j = css.index(q, j + 1) + 1; continue
            j += 1
        if j >= n:
            out.append(css[i:]); break
        chunk = css[i:j]
        if css[j] == '{':
            # leading whitespace and comments stay as they are
            m = re.match(r'^(\s*(?:/\*.*?\*/\s*)*)', chunk, re.S)
            lead = m.group(1)
            head = chunk[len(lead):].strip()
            if head.startswith('@'):
                kind = head.split()[0].split('(')[0]
                stack.append(kind)
                out.append(chunk + '{'); i = j + 1; continue
            chunk = lead + head
            if stack and stack[-1] in ('@keyframes', '@-webkit-keyframes'):
                stack.append('frame')
                out.append(chunk + '{')
            elif stack and stack[-1] == '@font-face':
                stack.append('ff'); out.append(chunk + '{')
            else:
                stack.append('rule')
                is_scale = head == 'html'
                out.append(lead + scope_selector(head) + '{')
                # read the declaration block
                k = css.index('}', j)
                body = css[j + 1:k]
                if is_scale:
                    body = re.sub(r'font-size\s*:', '--u:', body)
                    body = rem_to_px(body)
                else:
                    body = rem_to_u(body)
                out.append(body)
                i = k; continue
            i = j + 1; continue
        # a declaration or at-statement ending in ; or a stray }
        piece = css[i:j + 1] if css[j] == ';' else css[i:j]
        if stack and stack[-1] in ('frame',):
            piece = rem_to_u(piece)
        out.append(piece)
        i = j + 1 if css[j] == ';' else j
    return ''.join(out)

if __name__ == '__main__':
    p = sys.argv[1]
    src = io.open(p, encoding='utf-8').read()
    io.open(p, 'w', encoding='utf-8', newline='\n').write(transform(src))
    print('scoped', p)
