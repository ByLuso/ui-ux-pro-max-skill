#!/usr/bin/env python3
"""
Standardize nav HTML + CSS across all 30 itinerary pages.

Changes applied:
  1. Fix inline CSS: nav {} -> nav[role="navigation"] {} so footer navs are
     not accidentally positioned fixed (same bug that was fixed in shared.css).
  2. Add España nav link before navAuth li (if missing).
  3. Remove obsolete #como-funciona footer links.

Run from repo root:
    python3 voyageai/scripts/update_itinerarios.py
"""

import os
import re

ITINERARIOS_DIR = os.path.join(os.path.dirname(__file__), '..', 'itinerarios')

ESPANA_LINK = '    <li><a href="../itinerarios-espana.html">España</a></li>'
NAVAUTH_LI = '    <li class="nav-auth" id="navAuth"></li>'


def fix_nav_css_in_style_block(content: str) -> str:
    """Replace bare `nav` element selectors with `nav[role="navigation"]`."""

    def patch_style(m):
        style = m.group(1)
        # Match nav as CSS element selector:
        #   - negative lookbehind: not preceded by . # or word/hyphen chars
        #   - positive lookahead: followed by whitespace, { or .
        # This avoids touching .nav-links, #nav, or already-fixed selectors.
        style = re.sub(
            r'(?<![.\#\w-])nav(?=[\s.{])',
            'nav[role="navigation"]',
            style
        )
        return f'<style>{style}</style>'

    return re.sub(r'<style>(.*?)</style>', patch_style, content, flags=re.DOTALL)


def add_espana_nav_link(content: str) -> str:
    """Insert España link into nav ul before navAuth li (once only)."""
    if 'itinerarios-espana.html' in content:
        return content
    if NAVAUTH_LI not in content:
        return content
    return content.replace(
        NAVAUTH_LI,
        f'{ESPANA_LINK}\n{NAVAUTH_LI}',
        1
    )


def remove_como_funciona_links(content: str) -> str:
    """Remove any footer anchor pointing to #como-funciona."""
    return re.sub(
        r'\s*<a[^>]+href="[^"]*#como-funciona"[^>]*>[^<]*</a>',
        '',
        content
    )


def process_file(filepath: str) -> bool:
    with open(filepath, encoding='utf-8') as f:
        original = f.read()

    content = fix_nav_css_in_style_block(original)
    content = add_espana_nav_link(content)
    content = remove_como_funciona_links(content)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False


def main():
    changed = []
    skipped = []

    for fname in sorted(os.listdir(ITINERARIOS_DIR)):
        if not fname.endswith('.html'):
            continue
        fpath = os.path.join(ITINERARIOS_DIR, fname)
        if process_file(fpath):
            changed.append(fname)
        else:
            skipped.append(fname)

    print(f"Updated {len(changed)}/{len(changed)+len(skipped)} files:")
    for f in changed:
        print(f"  ✓ {f}")
    if skipped:
        print(f"\nNo changes needed in {len(skipped)} files:")
        for f in skipped:
            print(f"  – {f}")


if __name__ == '__main__':
    main()
