# Ribbonwren Bingo

A bingo and party-game card generator for [Ribbonwren Paper Co.](https://matthew-revell.github.io/ribbonwren-bingo/). Cards and the call sheet are built in the browser. Word lists, pictures, and unlock codes stay on the device. There is no account and no email field.

## Run it

```bash
npm install
npm run dev
```

Open http://127.0.0.1:4173/ribbonwren-bingo/ (the dev server in this repo uses that base path; `npm run dev` alone uses Vite’s default port). Owner mode is at `owner.html` and is not linked from the public pages.

```bash
npm test          # unit tests and PDF checks (needs poppler: pdfinfo, pdffonts, pdftotext, pdftoppm)
npm run test:e2e  # Chromium, Firefox, and WebKit
npm run build     # static site in dist/
```

## What a visitor can do

- Paste a word list and download up to 10 cards, plus a call sheet, on US Letter or A4, one or two cards per page.
- Everyday and Christmas themes, with an ink-saver option.
- The same list, settings, and seed always reprint the same cards (`rwb-v1`). Seeds ignore case, spaces, hyphens, en dashes, em dashes, and underscores, so `kj4p-92` and `KJ4P_92` are the same game. A seed with no letters or digits, such as `---`, is rejected. Any future change to the shuffle must use `rwb-v2`.
- A small footer on free cards. It includes a shop link only when `shopUrl` is set in `src/config.js`.

Pro, once a code is unlocked in the browser: up to 500 cards, pictures in the squares, save and load a game file, and no free footer. Lifetime price in the copy is $19.99.

## Pro is not an Etsy product

Etsy does not allow selling access codes or licenses to software. Pro is sold only from this site, through a checkout that is not chosen yet (Lemon Squeezy or Gumroad are the two candidates).

`src/config.js` has one purchase URL, `purchaseUrl`. While it is empty, the public page shows **Pro coming soon** and does not link anywhere. When checkout exists, set `purchaseUrl` to that page. Nothing else in the app needs to change.

The signed-code generator on the owner page is for owner codes and for future website sales. The license PDF (`ribbonwren-bingo-license-<order>.pdf`) is for those website sales. It must not be uploaded to a marketplace or described as a marketplace delivery.

Custom “your words” printables are the Etsy product. Those PDFs are checked, including the document title, subject, keywords, producer, and creator. Web addresses, email addresses, links, and checkout names (Lemon Squeezy, Gumroad) are a hard block. That includes short links (`bit.ly`, `linktr.ee`, `twitch.tv`, `discord.gg`), endings such as `.xyz`, `.site`, `.shop`, `.store`, `.link`, `.click`, `.online`, and `.page`, a host written as `ribbonwren dot com` or `ribbonwren(.)com`, and spaced or ideographic dots. A phrase such as “Dot com bubble” or “polka dot store” is only a warning. Words such as Pro, Unlock, Upgrade, and QR, and a name-like false address such as `Mr.Me` or `Join.us`, show a warning that names only the categories that were found. They print only if the owner checks **Print these words anyway**, and that box clears when the flagged words change. The owner page promises **2 business days** for those custom orders only. Public pages do not.

Owner download names look like `RW-Bingo_<order#>_<N>c_<Letter|A4>.pdf`. They are at most 70 characters and use only letters, digits, periods, underscores, and hyphens. Around 19 MB the owner page warns and can split the set. A marketplace file limit is 20 MB, and at most 5 files.

Owner word lists are one item per line. Commas and semicolons split items when most lines use them, including a trailing newline. A line such as `Snow, Sled, Cocoa, Elf, Mittens` in a mostly one-per-line list stays one square, and the page warns and offers **Split on commas**. Straight quotes, curly double quotes, and curly single quotes that wrap an item keep `"milk, cookies"` as one item. An apostrophe such as Santa’s stays in the word. Picture uploads accept PNG, JPEG, WebP, and HEIC. HEIC is converted in the browser when it can be; otherwise the page explains how to export a JPEG.

## Unlock codes

A code is a signed payload. The browser checks the signature with the public key in `src/unlock/public-key.js`. It does not call a payment processor. A second code type can be plugged in later by setting `externalCodeType` and passing a verifier. That path is off.

The repository includes a **TEST/DEV** key pair so the tests can run. The public page shows a banner while `KEY_STATUS` is not `"production"`. Do not sell codes from this copy.

Before any real sale:

1. Run `node tools/make-keys.mjs ~/ribbonwren-unlock-PRIVATE.jwk`. The tool will not write a private key inside this repo. It prints an **owner code** along with the public key. Keep that code with the private key.
2. Keep that file, and one backup you control. Anyone with it can mint codes.
3. Replace the public key in `src/unlock/public-key.js` with the key the tool prints, and set `KEY_STATUS` to `"production"`.
4. Open `owner.html` and paste the owner code (or open the `owner.html#unlock=` link the tool prints). The code maker on that page only makes Pro codes for website sales, and it stays behind the owner gate, so this command is how you get in:

```bash
node tools/make-owner-code.mjs ~/ribbonwren-unlock-PRIVATE.jwk "Matthew" "owner"
```

An owner unlock and a Pro unlock are stored in separate browser slots, so accepting one does not erase the other.

Revoke a code by adding its id to `public/revoked.json`.

## Deploy

Merging to `main` is the go-live. GitHub Actions runs the tests on pull requests and on `main`. Pages deploy runs only after Tests succeeds for a push to this repository's `main`. A pull request does not deploy, including one from a fork whose branch is named `main`. A manual deploy has to be started from `main`, and it re-runs the tests first. Either way, the deploy stops if `KEY_STATUS` is not `"production"` or the public key is still the committed test key.

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. Until that is set, the workflow has nowhere to publish. The deploy file takes effect once it is on `main`.

## What is not in this version

Four-up sheets, calling slips, a Winter Classroom theme, and batch CSV or ZIP export were left out so the printable cards, the call sheet, unique reprints, privacy, and owner mode could ship together. There is no buyer account.
