# QA report

Recorded against the MVP on this branch. Automated commands were run in this environment (Node 22, poppler-utils, Playwright Chromium / Firefox / WebKit).

## Automated

| Check | Result |
| --- | --- |
| `npm test` (Vitest: shuffle, cards, limits, unlock, Lemon Squeezy, deploy guard, source rules, PDF) | 76 passed |
| `npm run test:e2e` | 54 passed |
| `npm run build` | `dist/` produced |

The 100-card Pro download runs in Chromium, Firefox, and WebKit. A call sheet for one card says “1 card”.

PDF checks, using poppler, include:

- Letter 612×792 pt and A4 595.28×841.89 pt, including 2-up landscape.
- Embedded subset fonts (Nunito 400/700/800, Caveat 700, DM Serif Display). No Helvetica.
- `PrintScaling` set to None, and a 1-inch call-sheet square.
- Free footer present on free cards and absent on Pro.
- Owner-audience PDFs block web addresses, emails, links, and checkout names (Lemon Squeezy, Gumroad), including `linktr.ee`, `twitch.tv`, `discord.gg`, `.xyz`, `.click`, `.online`, `.page`, `ribbonwren dot com`, and obfuscated dots. Phrases such as “Dot com bubble” and “polka dot store”, a name-like false address such as `Mr.Me`, and words such as Pro or QR, print only after the owner checks the override. The warning names only the categories that were flagged, and the override clears when those words change. A raw scan of an ordinary owner file finds no `http`.
- 300 call-sheet items flow onto more than one page.
- A picture is embedded once. 100 word cards stay under 3 MB. 30 cards render in under 3 seconds here.
- Theme colors sampled from a raster of page 1, within 2 levels per channel.
- License PDF names the buyer, the order, the code id, and the unlock link, and does not say Etsy.

Unit checks include the frozen `rwb-v1` shuffle (seeds ignore case, spaces, hyphens, en dashes, em dashes, and underscores, and a seed of `---` is rejected), owner file names (`RW-Bingo_<order>_<N>c_<Letter|A4>.pdf`, at most 70 safe characters, accents folded), comma and semicolon lists including a trailing newline, curly quotes, and a warning plus one-click split when a mostly line-based list still contains `Snow, Sled, Cocoa, Elf, Mittens`, the 19 MB split helper, a ledger with no email column, and the Lemon Squeezy license check with a mocked `fetch` (activate only on submit, validate, no second activation when validate returns 404 or `instance_id not found`, store/product/variant mismatch, activation limit, disabled or refunded, offline grace that rejects a future or +365 day timestamp, and deactivate). The browser test activates a mocked key, clears the key box, shows “Key ending in …”, reloads, validates, and deactivates. Remove unlock and Clear my data call deactivate first. A free-card PDF from that run contains no “Test mode”, no Lemon Squeezy address, and no “Get Pro.”

## Tester licensing pass

A manual pass of the eight license checks, in Chromium and WebKit, passed except the three bugs below. Nothing was left activated. The full license key is not copied into this report.

- Remove unlock and Clear my data now call deactivate before they forget a Lemon Squeezy unlock. If that call cannot connect, the page warns and offers Remove anyway or Clear anyway.
- A validate response of 404 or `instance_id not found` locks Pro, drops the stored instance, and asks for the key again. The page does not activate on its own.
- Offline grace rejects a `validatedAt` more than five minutes ahead, including one year ahead, and stays capped at 14 days from the last successful network check.
- After a successful unlock the box is cleared and the page shows the last four characters of the key. Get Pro adds `locale=en`. The full key remains in local storage; that is noted under Privacy in the README.

## Not automated

These still need a person, on purpose:

- A real printer, at 100% / Actual size, confirming the call-sheet square is 1 inch.
- A production key, created with `tools/make-keys.mjs` and stored outside the repo, then swapped in before any sale. The committed key is test-only.
- A real HEIC photo from a phone. The suite uploads a file that is not a real HEIC and checks the explanation. The page policy blocks the HEIC library’s dynamic code, so a photo the browser itself cannot decode gets that explanation. `heic2any` stays bundled for a browser that allows it.
- A live Lemon Squeezy purchase. The checkout URL and test store ids are in `src/config.js`. While `mode` is `"test"`, the public site shows “Pro coming soon” and does not link the checkout. A dev build or `?lstest=1` shows it for QA. Unit tests mock the License API. A real test-mode key still has to be bought with card `4242 4242 4242 4242`.
- The Pages deploy itself. It runs only after Tests succeeds for a push to this repository's `main`. A pull request, including one from a fork whose branch is named `main`, does not deploy. A manual run has to be started from `main`. The job refuses to publish while `KEY_STATUS` is not `"production"`.
- The Etsy listing itself, and a manual look at an uploaded custom-order PDF in Etsy’s preview.
- Lighthouse. Not run in this environment.

## Policy choices locked in

- Pro is not sold or delivered through Etsy. `purchaseUrl` is the Get Pro link. Empty shows “Pro coming soon.” The test checkout is set. Etsy PDFs still have no upgrade wording, checkout link, or Test mode marker.
- The 2-business-day line appears only on the owner page, and only for custom orders.
- Free public PDFs keep the small footer. Owner and shop PDFs do not.
- No buyer account and no email capture.
