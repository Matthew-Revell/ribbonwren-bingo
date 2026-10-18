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

Etsy does not allow selling access codes or licenses to software. Pro is sold only from this site, through Lemon Squeezy. Etsy-audience PDFs still cannot contain a checkout link, an upgrade pitch, or the words “Test mode.”

`src/config.js` is the only place that knows the checkout. `purchaseUrl` is the Get Pro link. While it is empty, the public page shows **Pro coming soon** and does not link anywhere. `lemonSqueezy` holds `storeId`, `productId`, `variantIds`, and `mode`.

These values are the **test** store (store `500556`, product `1449237`, variant `2262220`). While `mode` is `"test"`, the public site does not show the checkout link. It says **Pro coming soon**. A dev build, or `?lstest=1` on the page, shows Get Pro for QA, with a small Test mode marker. That marker is not drawn on a PDF. `mode` `"live"` shows the checkout on the public site and hides the marker.

To go live, edit only `src/config.js`: replace `purchaseUrl` with the live checkout URL, replace the ids inside `lemonSqueezy`, and set `mode` to `"live"`. No other file needs a new id.

## Lemon Squeezy license keys

A license key is a UUID. The browser calls the public License API with no API key. The first time, it activates the key as `Ribbonwren Bingo - <browser>` and stores the instance id. Later visits validate that instance. A key is accepted only when `meta.store_id`, `meta.product_id`, and `meta.variant_id` match `lemonSqueezy`. The page stores the key, the instance id, and the time of the last successful check. It does not store the buyer’s name or email.

If a later check cannot connect, Pro stays unlocked for 14 days after that last real network success. Grace applies only to a stored Lemon Squeezy record whose key matches the one entered and whose instance id is a real activation id. A timestamp more than 5 minutes in the future gets no grace, so a `validatedAt` of +365 days cannot extend the 14 days. The offline path never saves a future time, and it does not move the stored time forward. Setting the computer clock back can still stretch that 14 days. That can't be prevented without a server. The first activation has no offline grace. A `#unlock=` link accepts a signed code only. Paste a license key into the box. If validate says this device is gone (HTTP 404 or `instance_id not found`), Pro locks and the page asks you to paste the key. It does not activate by itself. Only **Unlock**, after a paste or submit, can activate. **Deactivate this device** calls the deactivate endpoint and frees one of the 3 activations. **Remove unlock from this browser** and **Clear my data** call deactivate first, then forget this browser. If that call cannot connect, the page says it could not free the slot and lets you remove the copy here anyway.

Get Pro opens the checkout in a new tab. The link adds `locale=en` (Lemon Squeezy `checkout_options.locale`) when the URL does not already set a locale, so the checkout opens in English.

The License API responds with `Access-Control-Allow-Origin: *`, including to `Origin: https://matthew-revell.github.io`, so GitHub Pages can call it directly. No backend is required.

A test purchase: open the checkout, use card `4242 4242 4242 4242`, any future expiry, any CVC, and any name. The receipt’s license key goes in **Enter unlock code**. Deactivate the device when you are done so the 3-activation test key is not used up.

The signed-code generator on the owner page is for owner codes and for future website sales. The license PDF (`ribbonwren-bingo-license-<order>.pdf`) is for those website sales. It must not be uploaded to a marketplace or described as a marketplace delivery.

Custom “your words” printables are the Etsy product. Those PDFs are checked, including the document title, subject, keywords, producer, and creator. Web addresses, email addresses, links, and checkout names (Lemon Squeezy, Gumroad) are a hard block. That includes short links (`bit.ly`, `linktr.ee`, `twitch.tv`, `discord.gg`), endings such as `.xyz`, `.site`, `.shop`, `.store`, `.link`, `.click`, `.online`, and `.page`, a host written as `ribbonwren dot com` or `ribbonwren(.)com`, and spaced or ideographic dots. A phrase such as “Dot com bubble” or “polka dot store” is only a warning. Words such as Pro, Unlock, Upgrade, and QR, and a name-like false address such as `Mr.Me` or `Join.us`, show a warning that names only the categories that were found. They print only if the owner checks **Print these words anyway**, and that box clears when the flagged words change. The owner page promises **2 business days** for those custom orders only. Public pages do not.

Owner download names look like `RW-Bingo_<order#>_<N>c_<Letter|A4>.pdf`. They are at most 70 characters and use only letters, digits, periods, underscores, and hyphens. Around 19 MB the owner page warns and can split the set. A marketplace file limit is 20 MB, and at most 5 files.

Owner word lists are one item per line. Commas and semicolons split items when most lines use them, including a trailing newline. A line such as `Snow, Sled, Cocoa, Elf, Mittens` in a mostly one-per-line list stays one square, and the page warns and offers **Split on commas**. Straight quotes, curly double quotes, and curly single quotes that wrap an item keep `"milk, cookies"` as one item. An apostrophe such as Santa’s stays in the word. Picture uploads accept PNG, JPEG, WebP, and HEIC. HEIC is converted in the browser when it can be; otherwise the page explains how to export a JPEG. The owner page says pictures can't be checked for QR codes. Etsy listings can't include one.

## Unlock codes

A signed code is still checked offline with the public key in `src/unlock/public-key.js`. A UUID license key takes the Lemon Squeezy path above. Owner codes stay on the signed path.

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

## Privacy

Word lists, pictures, and unlocks stay in this browser. There is no account and no analytics. A Lemon Squeezy unlock stores the full license key in local storage (`rwb-unlock-pro`), with the instance id and the time of the last successful check. The full key has to stay there so a later visit can validate this device or free its activation. The buyer’s name and email from the license reply are not stored. After a successful unlock the text box is cleared and the page shows only the last four characters. **Clear my data** removes the saved list and the unlock. If this browser’s license slot cannot be freed because the network fails, the list and the key stay until you choose to clear them anyway.

## Deploy

Merging to `main` is the go-live. GitHub Actions runs the tests on pull requests and on `main`. Pages deploy runs only after Tests succeeds for a push to this repository's `main`. A pull request does not deploy, including one from a fork whose branch is named `main`. A manual deploy has to be started from `main`, and it re-runs the tests first. Either way, the deploy stops if `KEY_STATUS` is not `"production"` or the public key is still the committed test key.

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. Until that is set, the workflow has nowhere to publish. The deploy file takes effect once it is on `main`.

## What is not in this version

Four-up sheets, calling slips, a Winter Classroom theme, and batch CSV or ZIP export were left out so the printable cards, the call sheet, unique reprints, privacy, and owner mode could ship together. There is no buyer account.
