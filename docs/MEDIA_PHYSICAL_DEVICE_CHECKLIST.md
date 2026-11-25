# Media Optimization V1 — Physical-Device Testing Checklist

Automated verification ran on **Chromium** (Desktop `1280/1440px` + Playwright `Pixel 7` mobile emulation at `390px`). Real-device browser engines, camera pipelines, hardware HEIC decoders, memory ceilings, and mobile cellular networks **cannot** be certified from desktop emulation alone.

Complete this manual checklist on physical devices before declaring mobile upload certification complete.

---

## 1. Physical iPhone — iOS Safari (Latest iOS)

- [ ] **12 MP HEIC portrait & landscape camera photos:**
  - Select 4 fresh iPhone camera photos (`.HEIC`, default High Efficiency camera setting — do **not** switch to Most Compatible).
  - Verify native Safari decoding runs (**0 network request** to `/vendor/libheif/libheif-bundle.mjs` in Web Inspector Network tab).
  - Verify upright portrait orientation matches the camera preview (no 90°/180° rotation or double-rotation).
  - Verify outgoing upload size drops cleanly below `1 MB` (and `<= 4,000,000` bytes).
- [ ] **48 MP iPhone ProRAW / 48 MP HEIF camera photos (`8064×6048`):**
  - Select 4 consecutive 48 MP photos at once.
  - Verify serial preparation (`1` photo at a time) completes without tab reload, WebKit Jetsam crash, or blank canvas output.
  - Cancel photo #1 mid-preparation and confirm remaining photos prepare and upload cleanly without freezing.
- [ ] **WebP vs. JPEG canvas fallback:**
  - Verify resulting uploaded photos render crisply in saved gallery and buyer detail view with no black fill on transparent PNGs.
- [ ] **Arabic RTL (`390px` / `375px` viewport) + Light & Dark themes:**
  - Verify `0px` horizontal overflow, readable badges/size deltas, and touch targets `>= 44px`.

## 2. Physical iPhone — Chrome on iOS (WKWebView)

- [ ] **4-photo HEIC batch upload:**
  - Select 4 real camera photos; confirm preparation completes sequentially without tab termination.
  - Verify whether WKWebView decodes HEIC natively or loads `/vendor/libheif/libheif-bundle.mjs` cleanly.
- [ ] **Interrupted / cancelled upload & Retry:**
  - Toggle Airplane Mode mid-upload (or tap **Cancel** during upload/saving), confirm previously saved photos stay intact, restore connectivity, tap **Retry**, and verify zero duplicate photo attachments.
- [ ] **Backgrounding tab during upload:**
  - Switch apps briefly during an active upload, return to Chrome, tap **Retry** if failed, and verify reconciliation prevents duplicates.

## 3. Physical Mid-Range / Low-End Android — Chrome on Android

- [ ] **Memory pressure on 4-photo camera burst (12 MP–50 MP JPEG/HEIC):**
  - Select 4 high-resolution camera photos simultaneously on a 3–4 GB RAM Android device.
  - Confirm serial preparation completes smoothly without Chrome tab kill or UI freeze.
  - Cancel photo #1 mid-preparation and verify photos #2–#4 still prepare cleanly.
- [ ] **HEIC/HEIF photo fallback (lazy standalone module):**
  - Select a real `.HEIC` photo (e.g., sent via AirDrop/WhatsApp-as-document or Samsung HEIF camera setting).
  - Confirm `/vendor/libheif/libheif-bundle.mjs` loads lazily (HTTP `200`), displays `HEIC converted` / `تم تحويل HEIC`, and uploads cleanly.
- [ ] **Flaky cellular / Egyptian 4G upload recovery:**
  - Start uploading 4 photos on throttled/flaky cellular, cancel during retry backoff, verify zero unexpected background uploads fire after Cancel, then tap **Retry** and verify exact saved count (`4 of 4`).
- [ ] **Cancelled replacement:**
  - Replace Photo #1 on a 4-photo listing, tap **Cancel** mid-upload, then tap **Retry**, and verify total count remains `4 of 4` with Photo #1 updated cleanly.

## 4. Desktop Safari (macOS) & Desktop Firefox

- [ ] **macOS Safari:** Native HEIC decoding (0 fallback module requests), conditional `GET` / `HEAD` `304 Not Modified` on approved public photos, and `404 private, no-store` after listing withdrawal.
- [ ] **Firefox Desktop:** Worker + `OffscreenCanvas` or main-thread `<canvas>` fallback works cleanly on large JPEG, transparent PNG, and real HEIC (lazy `/vendor/libheif/libheif-bundle.mjs`).
- [ ] **Open-source notices:** Footer link `Open-source notices` / `إشعارات المصادر المفتوحة` navigates to `/[locale]/about#open-source-notices` and opens `/licenses/libheif-js-NOTICE.txt` and `/licenses/libheif-js-LICENSE.txt` cleanly.

## 5. Sign-Off Record

| Device / Browser | OS / Version | Result | Notes |
|---|---|---|---|
| iPhone — iOS Safari | Pending | Not tested | |
| iPhone — Chrome on iOS | Pending | Not tested | |
| Android (mid/low-end) — Chrome | Pending | Not tested | |
| macOS — Desktop Safari | Pending | Not tested | |
| Desktop — Firefox | Pending | Not tested | |
