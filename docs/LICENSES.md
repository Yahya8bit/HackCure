# LICENSES — third-party dependencies

Generated from installed package metadata (Python: `importlib.metadata` in the api image;
JavaScript: `frontend/package-lock.json`), 2026-10-10. Regenerate after any dependency change.
Licence strings are copied from package metadata; TODO-verify with a licence scanner before any commercial release.

## Notes
- All runtime dependencies are permissive (MIT, BSD, Apache-2.0, PSF, MPL-2.0 for certifi's CA bundle) **except**
  `psycopg2-binary` (LGPL-3.0): used unmodified as a dynamically loaded library, which LGPL permits; swapping it for
  `psycopg` (also LGPL) changes nothing. TODO-verify with legal counsel.
- Only 5 JavaScript packages ship to users' browsers (react, react-dom, scheduler, loose-envify, js-tokens — all MIT).
  Everything marked dev-only is build/test tooling (Vite, Babel, esbuild, Rollup, puppeteer-core for e2e).
- `pytest` is installed in the api image for convenience (tests run in-container); it is not used at runtime.

## Fonts and icons (bundled in the repo, served locally — no CDN)

| asset | version | license | where |
|---|---|---|---|
| Readex Pro (woff2, Arabic + Latin subsets, 400/600) | from @fontsource/readex-pro 5.3.0 | SIL OFL-1.1 | `frontend/src/shared/fonts/` (+ `LICENSE.txt`) |
| IBM Plex Sans Arabic (woff2, Arabic + Latin subsets, 400/600) | from @fontsource/ibm-plex-sans-arabic 5.3.0 | SIL OFL-1.1 | `frontend/src/shared/fonts/` |
| Tabler Icons (path data of 38 outline icons) | 3.49.0 | MIT, © Paweł Kuna | `frontend/src/shared/icons.jsx` (header credits the source); 21 of them as an inline sprite in `frontend/public/welcome/index.html` |
| Readex Pro **variable** (wght axis; latin, latin-ext, arabic subsets) — landing page | from @fontsource-variable/readex-pro 5.2.8 | SIL OFL-1.1 | `frontend/public/welcome/fonts/` (+ `LICENSE.txt`) |
| IBM Plex Sans Arabic 400/600 (latin, latin-ext, arabic subsets) — landing page | from @fontsource/ibm-plex-sans-arabic 5.3.0 | SIL OFL-1.1 | `frontend/public/welcome/fonts/` |

The @fontsource, @fontsource-variable and @tabler packages were used only to copy these files; they are not dependencies of the build.

## Container images

| image | used for | license |
|---|---|---|
| postgres:16.6-alpine | database | PostgreSQL License |
| python:3.12.8-slim | api runtime | PSF-2.0 (+ Debian packages, various) |
| node:22.12.0-alpine | frontend build stage only (not in final image) | MIT |
| nginx:1.27.3-alpine | TLS proxy / static files | BSD-2-Clause |
| grafana/k6:0.55.0 | load test only, run separately, not distributed | AGPL-3.0 |

### Python (backend image, from installed package metadata)

| package | version | license |
|---|---|---|
| annotated-doc | 0.0.5 | MIT |
| annotated-types | 0.8.0 | MIT |
| anyio | 4.15.1 | MIT |
| certifi | 2026.7.22 | Mozilla Public License 2.0 (MPL 2.0) |
| cffi | 2.1.1 | MIT-0 |
| click | 8.5.0 | BSD-3-Clause |
| cloudpickle | 3.1.2 | BSD License |
| cryptography | 50.0.2 | Apache-2.0 OR BSD-3-Clause |
| fastapi | 0.143.0 | MIT |
| greenlet | 3.5.6 | MIT AND PSF-2.0 |
| h11 | 0.16.0 | MIT License |
| httpcore | 1.0.9 | BSD-3-Clause |
| httpx | 0.28.1 | BSD License |
| idna | 3.20 | BSD-3-Clause |
| iniconfig | 2.3.1 | MIT |
| joblib | 1.6.0 | BSD-3-Clause |
| numpy | 2.2.1 | BSD License |
| opentelemetry-api | 1.45.1 | Apache-2.0 |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause |
| pluggy | 1.6.0 | MIT License |
| psycopg2-binary | 2.9.10 | GNU Library or Lesser General Public License (LGPL) |
| pycparser | 3.11 | BSD-3-Clause |
| pydantic | 2.14.0 | MIT |
| pydantic_core | 2.50.0 | MIT |
| Pygments | 2.21.0 | BSD-2-Clause |
| pytest | 9.1.1 | MIT |
| PyYAML | 6.0.2 | MIT License |
| scikit-learn | 1.6.0 | BSD License |
| scipy | 1.18.1 | BSD License |
| SQLAlchemy | 2.0.36 | MIT License |
| starlette | 1.7.0 | BSD-3-Clause |
| threadpoolctl | 3.7.0 | BSD-3-Clause |
| typing-inspection | 0.4.4 | MIT |
| typing_extensions | 4.16.0 | PSF-2.0 |
| uvicorn | 0.54.0 | BSD-3-Clause |

### JavaScript (frontend, every package in node_modules incl. transitive)

| package | version | license | dev-only |
|---|---|---|---|
| @babel/code-frame | 7.29.7 | MIT | yes |
| @babel/compat-data | 7.29.7 | MIT | yes |
| @babel/core | 7.29.7 | MIT | yes |
| @babel/generator | 7.29.8 | MIT | yes |
| @babel/helper-compilation-targets | 7.29.7 | MIT | yes |
| @babel/helper-globals | 7.29.7 | MIT | yes |
| @babel/helper-module-imports | 7.29.7 | MIT | yes |
| @babel/helper-module-transforms | 7.29.7 | MIT | yes |
| @babel/helper-plugin-utils | 7.29.7 | MIT | yes |
| @babel/helper-string-parser | 7.29.7 | MIT | yes |
| @babel/helper-validator-identifier | 7.29.7 | MIT | yes |
| @babel/helper-validator-option | 7.29.7 | MIT | yes |
| @babel/helpers | 7.29.10 | MIT | yes |
| @babel/parser | 7.29.9 | MIT | yes |
| @babel/plugin-transform-react-jsx-self | 7.29.7 | MIT | yes |
| @babel/plugin-transform-react-jsx-source | 7.29.7 | MIT | yes |
| @babel/template | 7.29.7 | MIT | yes |
| @babel/traverse | 7.29.10 | MIT | yes |
| @babel/types | 7.29.8 | MIT | yes |
| @esbuild/aix-ppc64 | 0.25.12 | MIT | yes |
| @esbuild/android-arm | 0.25.12 | MIT | yes |
| @esbuild/android-arm64 | 0.25.12 | MIT | yes |
| @esbuild/android-x64 | 0.25.12 | MIT | yes |
| @esbuild/darwin-arm64 | 0.25.12 | MIT | yes |
| @esbuild/darwin-x64 | 0.25.12 | MIT | yes |
| @esbuild/freebsd-arm64 | 0.25.12 | MIT | yes |
| @esbuild/freebsd-x64 | 0.25.12 | MIT | yes |
| @esbuild/linux-arm | 0.25.12 | MIT | yes |
| @esbuild/linux-arm64 | 0.25.12 | MIT | yes |
| @esbuild/linux-ia32 | 0.25.12 | MIT | yes |
| @esbuild/linux-loong64 | 0.25.12 | MIT | yes |
| @esbuild/linux-mips64el | 0.25.12 | MIT | yes |
| @esbuild/linux-ppc64 | 0.25.12 | MIT | yes |
| @esbuild/linux-riscv64 | 0.25.12 | MIT | yes |
| @esbuild/linux-s390x | 0.25.12 | MIT | yes |
| @esbuild/linux-x64 | 0.25.12 | MIT | yes |
| @esbuild/netbsd-arm64 | 0.25.12 | MIT | yes |
| @esbuild/netbsd-x64 | 0.25.12 | MIT | yes |
| @esbuild/openbsd-arm64 | 0.25.12 | MIT | yes |
| @esbuild/openbsd-x64 | 0.25.12 | MIT | yes |
| @esbuild/openharmony-arm64 | 0.25.12 | MIT | yes |
| @esbuild/sunos-x64 | 0.25.12 | MIT | yes |
| @esbuild/win32-arm64 | 0.25.12 | MIT | yes |
| @esbuild/win32-ia32 | 0.25.12 | MIT | yes |
| @esbuild/win32-x64 | 0.25.12 | MIT | yes |
| @jridgewell/gen-mapping | 0.3.13 | MIT | yes |
| @jridgewell/remapping | 2.3.5 | MIT | yes |
| @jridgewell/resolve-uri | 3.1.2 | MIT | yes |
| @jridgewell/sourcemap-codec | 1.6.0 | MIT | yes |
| @jridgewell/trace-mapping | 0.3.31 | MIT | yes |
| @napi-rs/lzma-linux-x64-gnu | 1.5.1 | MIT | yes |
| @puppeteer/browsers | 3.2.4 | Apache-2.0 | yes |
| @rolldown/pluginutils | 1.0.0-beta.27 | MIT | yes |
| @rollup/rollup-android-arm-eabi | 4.64.5 | MIT | yes |
| @rollup/rollup-android-arm64 | 4.64.5 | MIT | yes |
| @rollup/rollup-darwin-arm64 | 4.64.5 | MIT | yes |
| @rollup/rollup-darwin-x64 | 4.64.5 | MIT | yes |
| @rollup/rollup-freebsd-arm64 | 4.64.5 | MIT | yes |
| @rollup/rollup-freebsd-x64 | 4.64.5 | MIT | yes |
| @rollup/rollup-linux-arm-gnueabihf | 4.64.5 | MIT | yes |
| @rollup/rollup-linux-arm-musleabihf | 4.64.5 | MIT | yes |
| @rollup/rollup-linux-arm64-gnu | 4.64.5 | MIT | yes |
| @rollup/rollup-linux-arm64-musl | 4.64.5 | MIT | yes |
| @rollup/rollup-linux-loong64-gnu | 4.64.5 | MIT | yes |
| @rollup/rollup-linux-loong64-musl | 4.64.5 | MIT | yes |
| @rollup/rollup-linux-ppc64-gnu | 4.64.5 | MIT | yes |
| @rollup/rollup-linux-ppc64-musl | 4.64.5 | MIT | yes |
| @rollup/rollup-linux-riscv64-gnu | 4.64.5 | MIT | yes |
| @rollup/rollup-linux-riscv64-musl | 4.64.5 | MIT | yes |
| @rollup/rollup-linux-s390x-gnu | 4.64.5 | MIT | yes |
| @rollup/rollup-linux-x64-gnu | 4.64.5 | MIT | yes |
| @rollup/rollup-linux-x64-musl | 4.64.5 | MIT | yes |
| @rollup/rollup-openbsd-x64 | 4.64.5 | MIT | yes |
| @rollup/rollup-openharmony-arm64 | 4.64.5 | MIT | yes |
| @rollup/rollup-win32-arm64-msvc | 4.64.5 | MIT | yes |
| @rollup/rollup-win32-ia32-msvc | 4.64.5 | MIT | yes |
| @rollup/rollup-win32-x64-gnu | 4.64.5 | MIT | yes |
| @rollup/rollup-win32-x64-msvc | 4.64.5 | MIT | yes |
| @types/babel__core | 7.20.5 | MIT | yes |
| @types/babel__generator | 7.27.0 | MIT | yes |
| @types/babel__template | 7.4.4 | MIT | yes |
| @types/babel__traverse | 7.28.0 | MIT | yes |
| @types/estree | 1.0.9 | MIT | yes |
| @vitejs/plugin-react | 4.7.0 | MIT | yes |
| ansi-regex | 6.4.0 | MIT | yes |
| ansi-styles | 6.2.3 | MIT | yes |
| baseline-browser-mapping | 2.11.28 | Apache-2.0 | yes |
| browserslist | 4.29.3 | MIT | yes |
| caniuse-lite | 1.0.30001815 | CC-BY-4.0 | yes |
| chromium-bidi | 157.0.8090-0 | Apache-2.0 | yes |
| cliui | 9.0.1 | ISC | yes |
| string-width | 7.2.0 | MIT | yes |
| convert-source-map | 2.0.0 | MIT | yes |
| debug | 4.4.3 | MIT | yes |
| devtools-protocol | 0.0.1696802 | BSD-3-Clause | yes |
| electron-to-chromium | 1.5.452 | ISC | yes |
| emoji-regex | 10.6.0 | MIT | yes |
| esbuild | 0.25.12 | MIT | yes |
| escalade | 3.2.0 | MIT | yes |
| fdir | 6.5.0 | MIT | yes |
| fsevents | 2.3.3 | MIT | yes |
| gensync | 1.0.0-beta.2 | MIT | yes |
| get-caller-file | 2.0.5 | ISC | yes |
| get-east-asian-width | 1.7.0 | MIT | yes |
| js-tokens | 4.0.0 | MIT | no |
| jsesc | 3.1.0 | MIT | yes |
| json5 | 2.2.3 | MIT | yes |
| loose-envify | 1.4.0 | MIT | no |
| lru-cache | 5.1.1 | ISC | yes |
| mitt | 3.0.1 | MIT | yes |
| modern-tar | 0.8.5 | MIT | yes |
| ms | 2.1.3 | MIT | yes |
| nanoid | 3.3.20 | MIT | yes |
| node-releases | 2.0.58 | MIT | yes |
| picocolors | 1.1.1 | ISC | yes |
| picomatch | 4.0.7 | MIT | yes |
| postcss | 8.5.29 | MIT | yes |
| puppeteer-core | 25.13.0 | Apache-2.0 | yes |
| react | 18.3.1 | MIT | no |
| react-dom | 18.3.1 | MIT | no |
| react-refresh | 0.17.0 | MIT | yes |
| rollup | 4.64.5 | MIT | yes |
| scheduler | 0.23.2 | MIT | no |
| semver | 6.3.1 | ISC | yes |
| source-map-js | 1.2.2 | BSD-3-Clause | yes |
| string-width | 8.3.0 | MIT | yes |
| strip-ansi | 7.2.0 | MIT | yes |
| tinyglobby | 0.2.17 | MIT | yes |
| typed-query-selector | 2.12.3 | MIT | yes |
| update-browserslist-db | 1.3.4 | MIT | yes |
| vite | 6.4.4 | MIT | yes |
| webdriver-bidi-protocol | 1.0.1 | Apache-2.0 | yes |
| wrap-ansi | 9.0.2 | MIT | yes |
| string-width | 7.2.0 | MIT | yes |
| ws | 8.22.0 | MIT | yes |
| y18n | 5.0.8 | ISC | yes |
| yallist | 3.1.1 | ISC | yes |
| yargs | 18.2.0 | MIT | yes |
| yargs-parser | 22.0.0 | ISC | yes |
| zod | 4.6.5 | MIT | yes |
