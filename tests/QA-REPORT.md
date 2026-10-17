# QA report

Recorded against the MVP on this branch. Automated commands were run in this environment (Node 22, poppler-utils, Playwright Chromium / Firefox / WebKit).

## Automated

| Check | Result |
| --- | --- |
| `npm test` (Vitest: shuffle, cards, limits, unlock, source rules, PDF) | 44 passed |
| `npm run test:e2e` | 16 passed, 2 skipped |
| `npm run build` | `dist/` produced |

The two skipped end-to-end cases are the 100-card Pro download on Firefox and WebKit. That case runs in Chromium. The same unlock and download path is covered for an ordinary file in all three browsers.

PDF checks, using poppler, include:

- Letter 612×792 pt and A4 595.28×841.89 pt, including 2-up landscape.
- Embedded subset fonts (Nunito 400/700/800, Caveat 700, DM Serif Display). No Helvetica.
- `PrintScaling` set to None, and a 1-inch call-sheet square.
- Free footer present on free cards and absent on Pro.
- Owner-audience PDFs: extracted text and document info have no `http`, upgrade language, QR wording, or the word Pro. A raw scan of the file finds no `http`.
- 300 call-sheet items flow onto more than one page.
- A picture is embedded once. 100 word cards stay under 3 MB. 30 cards render in under 3 seconds here.
- Theme colors sampled from a raster of page 1, within 2 levels per channel.
- License PDF names the buyer, the order, the code id, and the unlock link, and does not say Etsy.

Unit checks include the frozen `rwb-v1` shuffle, owner file names (`RW-Bingo_<order>_<N>c_<Letter|A4>.pdf`, at most 70 safe characters), comma and semicolon lists, the 19 MB split helper, and a ledger with no email column.

## Not automated

These still need a person, on purpose:

- A real printer, at 100% / Actual size, confirming the call-sheet square is 1 inch.
- A production key, created with `tools/make-keys.mjs` and stored outside the repo, then swapped in before any sale. The committed key is test-only.
- A real HEIC photo from a phone. The suite uploads a file that is not a real HEIC and checks the explanation. `heic2any` is bundled for photos the browser can convert.
- Checkout. `purchaseUrl` is empty, so the public page says “Pro coming soon.”
- The Etsy listing itself, and a manual look at an uploaded custom-order PDF in Etsy’s preview.
- Lighthouse. Not run in this environment.

## Policy choices locked in

- Pro is not sold or delivered through Etsy. One config value, `purchaseUrl`, is the Get Pro link. Empty hides the purchase button.
- The 2-business-day line appears only on the owner page, and only for custom orders.
- Free public PDFs keep the small footer. Owner and shop PDFs do not.
- No buyer account and no email capture.
