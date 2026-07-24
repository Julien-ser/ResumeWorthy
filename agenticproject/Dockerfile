FROM python:3.11-slim

# Tectonic: single LaTeX binary (dynamically linked, not fully static --
# python:3.11-slim is missing its runtime libs by default), no TeX Live
# install needed. Official install script from the tectonic-typesetting
# project. curl is build-only (fetches the installer), purged after;
# the graphite2/harfbuzz/fontconfig/openssl libs are tectonic's actual
# runtime deps and must stay installed.
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates \
        libgraphite2-3 libharfbuzz0b libfontconfig1 libssl3 \
    && curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh \
    && mv tectonic /usr/local/bin/tectonic \
    && apt-get purge -y curl && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Pre-warm tectonic's bundle cache at BUILD time, not request time.
# Confirmed live (2026-07-24, real Docker build): tectonic downloads its
# LaTeX format + every package/font/hyphenation file on first invocation
# in a fresh container (~180 files just for babel's default hyphenation
# set, plus fontawesome5's font files) -- 20-40s cold. Baking that
# download into the image means every real request in production starts
# with a warm cache: fast from the first request, and immune to the
# "timeout kills the download mid-way and corrupts the cache for the
# container's whole lifetime" failure mode that a request-time cold
# download risks. Uses the actual template code (not a hand-duplicated
# package list) so this never drifts out of sync with latex_template.py.
RUN python -c "\
import asyncio; \
from latex_template import blocks_to_tex; \
from latex_compile import compile_tex_to_pdf; \
tex = blocks_to_tex( \
    header={'name': 'Warmup', 'email': 'warmup@example.com'}, \
    summary='Warmup pass.', \
    entries=[{'title': 'Role', 'company': 'Co', 'dates': '2024', 'location': 'Remote', \
              'blocks': [{'chosen': 'Did a thing.'}]}], \
    other_sections=[{'title': 'Skills', 'content': 'A, B, C'}], \
    linkedin_url='https://linkedin.com/in/x', github_url='https://github.com/x'); \
asyncio.run(compile_tex_to_pdf(tex, timeout=180.0)); \
print('tectonic bundle cache warmed')"

EXPOSE 8000
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
