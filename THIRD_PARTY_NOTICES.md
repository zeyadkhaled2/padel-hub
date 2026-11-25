# Third-Party Open-Source Notices

Raketna uses open-source software components. Components with copy-left or distribution-notice obligations are documented below and accompanied by their verbatim license texts in `public/licenses/`.

## `libheif-js` (wrapping `libheif` and `libde265`)

- **Package & Version:** `libheif-js@1.23.5` (Emscripten WebAssembly build of `libheif` + `libde265`)
- **Usage in Raketna:** Optional, on-demand client-side HEIC/HEIF image decoding fallback used only when a seller selects an Apple HEIC/HEIF photo in a browser that does not natively decode HEIC.
- **License:** GNU Lesser General Public License, Version 3 (`LGPL-3.0`), incorporating the GNU General Public License, Version 3 (`GPL-3.0`), plus MIT License for sample/wrapper code.
- **Upstream Corresponding Source:**
  - `libheif-js` wrapper & build scripts: https://github.com/catdad-experiments/libheif-js (version `1.23.5`, npm package `libheif-js@1.23.5`)
  - `libheif` library (struktur AG): https://github.com/strukturag/libheif
  - `libde265` HEVC decoder (struktur AG): https://github.com/strukturag/libde265
- **Runtime Distribution & LGPL-3.0 Compliance:**
  1. **Unmodified standalone module (LGPL-3.0 §4(d)(1)):** Raketna does **not** statically bundle or minify `libheif-js` into application Webpack chunks. During installation/build (`scripts/sync-heic-assets.mjs`), the unmodified upstream ES module `libheif-bundle.mjs` and its verbatim `LICENSE` file are staged at `/vendor/libheif/libheif-bundle.mjs` and `/vendor/libheif/LICENSE.txt`, and loaded dynamically at runtime via native `import()`.
  2. **Prominent notices & verbatim licenses (LGPL-3.0 §4(a), §4(b), §4(c)):**
     - Runtime notice: `public/licenses/libheif-js-NOTICE.txt` (served at `/licenses/libheif-js-NOTICE.txt`)
     - Verbatim LGPL-3.0 + GPL-3.0 + MIT license texts: `public/licenses/libheif-js-LICENSE.txt` (served at `/licenses/libheif-js-LICENSE.txt`)
     - Linked from Raketna's site footer (`Open-source notices` / `إشعارات المصادر المفتوحة`) and `/[locale]/about#open-source-notices`.
  3. **Replacing / relinking with a modified Library:** Any user or operator may replace `/vendor/libheif/libheif-bundle.mjs` (or override the request in browser DevTools or a local deployment) with any interface-compatible build of `libheif-js` exposing a default export factory returning `{ HeifDecoder }`, without modifying or rebuilding Raketna's application code.
