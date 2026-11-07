# Working on Odd Folks Atlas

## Product and licensing

- Product name: **怪可爱图鉴 · Odd Folks Atlas**. Chinese is the primary header line; English is a smaller second line.
- This is a self-hosted avatar editor. Do not add an official hosted service, supported SDK, third-party API contract or account/UID allocation system unless the repository owner explicitly changes the scope.
- Source is available under **PolyForm Noncommercial 1.0.0**, not an OSI open-source license. Read the unchanged `LICENSE` before using or redistributing code. Internal use, free distribution, or absence of payment do not by themselves make a commercial purpose noncommercial. The license's explicit permitted-purpose and organization provisions control.
- Project artwork and screenshots use **CC BY-NC 4.0**, only to the extent rights can be granted. Read `ASSET_LICENSE.md` and `THIRD_PARTY_NOTICES.md`. Fonts, icons and audio keep their own OFL/MIT/CC0 licenses. Never replace third-party notices with the project license.
- Do not assume a known character, celebrity, trademark or uploaded image is cleared for redistribution. Do not add assets or hotlinks without the necessary rights. Update the asset inventory when assets change.

## Run and test

Node.js 22+. No build step or runtime npm dependencies.

```sh
npm test
npm run dev
```

The explicit local editor is at `http://127.0.0.1:4180`. `npm start` is read-only unless the operator deliberately configures HTTPS session authentication. Follow `docs/SELF_HOST.md` and `docs/LOGIN.md` for deployment.

## Structure

- `dist/`: browser JavaScript, HTML, CSS and local assets; these are editable source files, not disposable build output.
- `dist/model.js`, `avatar-recipes-v3.js`, `avatar-identity-v3.{js,json}`: validated transforms, recipes and canonical material definitions.
- `service/self-host.cjs`: standalone entry point and static routing.
- `service/`: versioned persistence, authentication, validation and upload processing.
- `tests/`: Node tests using temporary directories and loopback servers.
- `docs/screenshots/`: real screenshots of this release running locally, not mockups.

## Invariants

- No production credentials, cookies, tokens, user databases, private hostnames or deployment history in the repository. Never commit `data/`, auth directories, uploads, backups, `.env` or logs.
- Default read-only and exact-origin session checks must remain fail closed. Never expose `--local-demo` publicly or replace authentication with a fixed `true`.
- Preserve optimistic concurrency, atomic writes, preceding-version backups, data-directory locks and corrupt-data refusal. Do not silently reset or overwrite persisted data on upgrade.
- A brand click or favicon update must not change the editor seed, undo history, selected avatar, transforms or saved configuration. Keep brand state independent. Respect reduced motion; do not update favicon on each animation frame.
- Keep assets and runtime requests on the deployment's own origin. Do not introduce dependencies on the original author's server.
- Manifest changes need explicit versioning and tests. The standalone manifest is independent; do not import another instance's production identity or migration data.

Before submitting: run `npm test`, JavaScript syntax checks, and desktop/mobile browser smoke tests for touched UI. Recheck local-asset hashes, external requests, missing images, errors and unexpected writes. Update docs and capture real screenshots when visible behavior changes. Preserve full license texts and attribution.
