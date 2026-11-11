#!/usr/bin/env python3
"""
Batch-fix nav header across all itinerary pages.
Replaces whatever nav block exists with the standardized version matching index.html,
but with ../ prefixed paths for the subdirectory context.
"""

import os
import re
import glob

ITINERARIES_DIR = "/home/user/ui-ux-pro-max-skill/voyageai/itinerarios"

# Standard nav block for itinerary pages (note ../ paths)
STANDARD_NAV = '''<nav role="navigation" aria-label="Navegación principal">
  <a href="../index.html" class="nav-logo" aria-label="Routlo inicio">
    <img src="../assets/routlo-logo.png" alt="Routlo" style="height:38px;border-radius:8px;background:#fff;padding:3px 10px;">
  </a>
  <ul class="nav-links" role="list">
    <li><a href="../index.html">Inicio</a></li>
    <li><a href="../itinerarios.html" class="active">Itinerarios</a></li>
    <li><a href="../mapa.html">Mapa</a></li>
    <li><a href="../chatbot.html">Chatbot IA</a></li>
    <li class="nav-auth" id="navAuth"></li>
  </ul>
  <button class="nav-mobile-btn" aria-label="Abrir menú" onclick="toggleMenu()">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
  </button>
</nav>'''

TOGGLE_MENU_JS = """  function toggleMenu() {
    const nav = document.querySelector('nav');
    nav.classList.toggle('menu-open');
  }"""

def fix_file(filepath):
    filename = os.path.basename(filepath)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # ── 1. Replace the entire <nav ...>...</nav> block ──────────────────────────
    # Greedy match that handles nested elements: find <nav ...> ... </nav>
    # Use a loop to find the outermost nav properly
    nav_pattern = re.compile(r'<nav\b[^>]*>.*?</nav>', re.DOTALL | re.IGNORECASE)
    match = nav_pattern.search(content)
    if match:
        content = content[:match.start()] + STANDARD_NAV + content[match.end():]
    else:
        print(f"  WARNING: No <nav> found in {filename}")

    # ── 2. Remove skip-to-content links right after the nav ─────────────────────
    content = re.sub(
        r'\s*<a\s+href="#(?:main-content|content|inicio)"[^>]*class="[^"]*skip[^"]*"[^>]*>.*?</a>',
        '', content, flags=re.DOTALL | re.IGNORECASE
    )
    content = re.sub(
        r'\s*<a\s+class="[^"]*skip[^"]*"[^>]*href="[^"]*"[^>]*>.*?</a>',
        '', content, flags=re.DOTALL | re.IGNORECASE
    )

    # ── 3. Fix getElementById('main-nav') → document.querySelector('nav') ───────
    content = content.replace("getElementById('main-nav')", "document.querySelector('nav')")
    content = content.replace('getElementById("main-nav")', 'document.querySelector("nav")')

    # ── 4. Add toggleMenu() if missing ──────────────────────────────────────────
    if 'function toggleMenu' not in content:
        # Inject just before first </script> that contains window/document logic
        # or before the last </script> block in the file
        # Strategy: inject after the first <script> tag (inline script block)
        script_tag_pattern = re.compile(r'(<script\b[^>]*>)', re.IGNORECASE)
        first_script = script_tag_pattern.search(content)
        if first_script:
            insert_pos = first_script.end()
            content = (
                content[:insert_pos]
                + "\n"
                + TOGGLE_MENU_JS
                + "\n"
                + content[insert_pos:]
            )
        else:
            print(f"  WARNING: No <script> found in {filename} — could not inject toggleMenu()")

    # ── 5. Remove id="main-nav" from nav tag (already replaced, but clean any remnants) ──
    # Already handled by full replacement in step 1.

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  FIXED: {filename}")
    else:
        print(f"  UNCHANGED: {filename}")

    return content != original


def main():
    files = sorted(glob.glob(os.path.join(ITINERARIES_DIR, "*.html")))
    print(f"Processing {len(files)} itinerary files...\n")
    fixed = 0
    for fp in files:
        result = fix_file(fp)
        if result:
            fixed += 1
    print(f"\nDone. {fixed}/{len(files)} files modified.")


if __name__ == '__main__':
    main()
