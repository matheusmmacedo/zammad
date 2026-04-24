# klaos-branding

KLaOS Helpdesk (Zammad) visual identity package — brand colors, logo, favicon.

## What's in here

- `custom.css` — CSS overrides mapping Zammad UI to KLaOS tokens (primary `#514CF1`, accent `#22F0C2`, dark backgrounds).
- `assets/logo-klaos.svg` — primary logo (monochrome white, 487×118 viewbox).
- `assets/favicon-klaos.png` — 32px favicon.

Source of truth: `klaos.ai` (extracted from `tailwind.config.js` and `src/index.css` of the main klaos product, 2026-04-24).

## How to apply (manual, until wired into .zpm installer)

**1. Custom CSS**
- `helpdesk.klaos.ai/#settings/branding` (or Admin → Settings → Branding)
- Paste the contents of `custom.css` into "Custom CSS"
- Save

**2. Logo**
- Same branding page → Logo → upload `assets/logo-klaos.svg`
- Timeline / logo-small: Zammad auto-generates a 32px version, or use `assets/favicon-klaos.png`

**3. Favicon**
- `helpdesk.klaos.ai/#settings/branding` → Favicon → upload `assets/favicon-klaos.png`

## Next steps (task #10 follow-up)

- Wire as a proper `.zpm` package so all three apply automatically on install.
- The install can write the CSS to the `settings` table (key `branding_custom_css` or similar) and write logo/favicon bytes to the appropriate Zammad settings rows.
