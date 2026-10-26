#!/usr/bin/env python3
"""
Inject Google Analytics 4 + Google AdSense into every HTML file.

Replace the two placeholder IDs before running:
  GA4_ID    → your Measurement ID from analytics.google.com  (e.g. G-AB12CD34EF)
  ADSENSE_ID → your Publisher ID from adsense.google.com     (e.g. ca-pub-1234567890123456)
"""
import os, re

# ── CONFIGURE THESE ──────────────────────────────────────────────────────────
GA4_ID     = "G-XXXXXXXXXX"          # ← reemplaza con tu Measurement ID real
ADSENSE_ID = "ca-pub-XXXXXXXXXXXXXXXX"  # ← reemplaza con tu Publisher ID real
# ─────────────────────────────────────────────────────────────────────────────

SNIPPET = f"""  <!-- Google Analytics 4 -->
  <script async src="https://www.googletagmanager.com/gtag/js?id={GA4_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){{dataLayer.push(arguments);}}
    gtag('js', new Date());
    gtag('config', '{GA4_ID}');
  </script>
  <!-- Google AdSense (Auto Ads) -->
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client={ADSENSE_ID}" crossorigin="anonymous"></script>
"""

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

def process(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Skip if already injected
    if GA4_ID in content or 'googletagmanager.com/gtag' in content:
        print(f"  [skip] {os.path.relpath(path, ROOT)}")
        return False

    if '</head>' not in content:
        print(f"  [warn] no </head> found: {os.path.relpath(path, ROOT)}")
        return False

    new_content = content.replace('</head>', SNIPPET + '</head>', 1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"  [ok]   {os.path.relpath(path, ROOT)}")
    return True

updated = 0
for dirpath, _, files in os.walk(ROOT):
    # Skip node_modules / .git / scripts dir itself
    if any(x in dirpath for x in ['.git', 'node_modules', 'scripts']):
        continue
    for fname in files:
        if fname.endswith('.html'):
            if process(os.path.join(dirpath, fname)):
                updated += 1

print(f"\n✓ {updated} archivos actualizados")
print(f"\nRECUERDA reemplazar en el script:")
print(f"  GA4_ID     = '{GA4_ID}'  →  tu Measurement ID real")
print(f"  ADSENSE_ID = '{ADSENSE_ID}'  →  tu Publisher ID real")
print(f"\nLuego vuelve a ejecutar: python3 voyageai/scripts/inject_analytics.py")
