# cookies-consent

A dependency-free, vanilla JS cookie consent banner with Google Consent Mode (`gtag`) support.

## Documentation

- **[Installation instructions](consent/README.txt)** — the copy-paste snippet to add to your page's `<head>` (CDN links + config example).
- **[How it works](consent/HOW_IT_WORKS.md)** — architecture, public API (`init`/`update`/`resetConsent`), consent-type config reference, localStorage key scheme, the gtag/Consent Mode integration, script injection, and styling hooks.

## Files

| File | Role |
|---|---|
| [`consent/consent-manager.js`](consent/consent-manager.js) | All logic. |
| [`consent/consent-manager.css`](consent/consent-manager.css) | All styling. |
| [`consent/README.txt`](consent/README.txt) | Embed snippet. |
| [`consent/HOW_IT_WORKS.md`](consent/HOW_IT_WORKS.md) | Technical deep-dive. |
