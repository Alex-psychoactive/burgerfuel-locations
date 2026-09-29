"""
Pull the per-store fields the mobile store sheet needs from the live
burgerfuel.com store pages (Webflow CMS "Locations" collection) and merge
them into data/stores.json.

    python tools/scrape-store-details.py

Fields added to each store:
  photos   [url, ...]         store photo slider
  started  str                "How it started" copy
  google   url                "View store on Google"
  facebook url                "View store on Facebook"
  event    {title, body, image, link} | null
  blog     {title, image, tag, url}   | null

Webflow renders every CMS-bound section on every page and hides the empty
ones with `w-condition-invisible`, so a section only counts when that class
is absent. That's also how the event block works: it is a set of fields on
the store's own CMS item, switched on by filling them in.
"""
import io, json, re, sys, time
import requests
from bs4 import BeautifulSoup

BASE = 'https://www.burgerfuel.com/nz/locations/'
ROOT = __file__.rsplit('tools', 1)[0]


def visible(el):
    while el is not None and getattr(el, 'get', None):
        if 'w-condition-invisible' in (el.get('class') or []):
            return False
        el = el.parent
    return True


def text(el):
    return re.sub(r'\s+', ' ', el.get_text(' ', strip=True)).strip() if el else ''


def link_by_text(soup, pattern):
    for a in soup.find_all('a', href=True):
        if re.search(pattern, a.get_text(' ', strip=True), re.I) and visible(a):
            href = a['href'].strip()
            return href if href and href != '#' else None
    return None


def section_after_heading(soup, pattern):
    for h in soup.find_all(['h2', 'h3']):
        if re.fullmatch(pattern, text(h), re.I):
            return h
    return None


def scrape(slug):
    r = requests.get(BASE + slug, timeout=30, headers={'User-Agent': 'Mozilla/5.0'})
    r.raise_for_status()
    soup = BeautifulSoup(r.text, 'html.parser')
    out = {}

    slider = soup.select_one('.slider-main_component')
    out['photos'] = [img['src'] for img in slider.select('.w-dyn-item img[src]')] if slider else []

    h = section_after_heading(soup, r'how it started')
    started = ''
    if h:
        box = h.find_parent(class_=re.compile('container')) or h.parent
        started = ' '.join(text(p) for p in box.find_all(['p']) if visible(p))
    out['started'] = started

    out['google'] = link_by_text(soup, r'view store on google')
    out['facebook'] = link_by_text(soup, r'view store on facebook')

    # event — the two-column block (image + copy); the purple banner repeats it
    ev = None
    grid = soup.select_one('.col-2x-grid.is-event')
    if grid and visible(grid):
        img = grid.select_one('img.event_img')
        title = text(grid.select_one('h2'))
        body = text(grid.select_one('p'))
        btn = grid.select_one('a.button')
        link = btn['href'] if btn and visible(btn) and btn.get('href') not in (None, '', '#') else None
        if title or body:
            ev = {'title': title, 'body': body, 'image': img['src'] if img else None, 'link': link}
    out['event'] = ev

    blog = None
    wrap = soup.select_one('.col-2x-grid.is-store')
    if wrap and visible(wrap):
        item = wrap.select_one('.w-dyn-item')
        if item:
            a = item.find('a', href=True)
            img = item.find('img')
            heads = item.find_all(['h3', 'h4', 'h5', 'p', 'div'])
            title = next((text(x) for x in item.find_all(['h3', 'h4']) if text(x)), '')
            tag = text(item.select_one('[class*=tag]'))
            blog = {
                'title': title,
                'image': img['src'] if img else None,
                'tag': tag or None,
                'url': ('https://www.burgerfuel.com' + a['href']) if a and a['href'].startswith('/') else (a['href'] if a else None),
            }
    out['blog'] = blog
    return out


def main():
    path = ROOT + 'data/stores.json'
    data = json.load(io.open(path, encoding='utf-8'))
    for i, s in enumerate(data['stores']):
        try:
            s.update(scrape(s['slug']))
            flags = ' '.join(k for k in ('event', 'blog') if s.get(k))
            print('%2d %-20s photos:%d %s' % (i + 1, s['slug'], len(s['photos']), flags))
        except Exception as e:  # keep going; a single dead page shouldn't sink the run
            print('%2d %-20s FAILED %s' % (i + 1, s['slug'], e), file=sys.stderr)
        time.sleep(0.25)
    io.open(path, 'w', encoding='utf-8').write(json.dumps(data, ensure_ascii=False, indent=1) + '\n')
    io.open(ROOT + 'js/stores-data.js', 'w', encoding='utf-8').write(
        'window.BF_DATA = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n')


if __name__ == '__main__':
    main()
