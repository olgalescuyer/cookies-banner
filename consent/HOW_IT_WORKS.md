# How the Consent Manager Works

A dependency-free, vanilla JS cookie consent manager (`consent-manager.js` + `consent-manager.css`). It renders a consent banner, a preferences modal, and a floating "manage consent" icon, persists choices to `localStorage`, and syncs them to Google's `gtag` Consent Mode.

## Files

| File | Role |
|---|---|
| `consent-manager.js` | All logic: DOM creation, event handling, storage, gtag integration. Exposes `window.consentManager`. |
| `consent-manager.css` | All visual styling, driven by CSS custom properties on `#cm-wrapper`. |
| `README.txt` | Copy-paste snippet for embedding on a page (via jsDelivr CDN, pinned to a git tag). |

## Public API

Loading the script self-invokes an IIFE that attaches four methods to `window.consentManager`:

- **`init(config)`** — creates (or recreates) the `ConsentManager` instance and renders the UI. Safe to call again: it destroys the previous instance first.
- **`update(newConfig)`** — deep-merges `newConfig` into the current config and re-runs `init`. Used to change settings at runtime without a full page reload.
- **`resetConsent()`** — clears all stored consent keys and re-initializes, as if the visitor were new (used for "reset my cookie choices" links).
- **`getInstance()`** — returns the live `ConsentManager` instance for advanced/manual use.

## Lifecycle on `init()`

1. **Validate config** — requires a non-empty `config.consentTypes` array; throws otherwise.
2. **Build the DOM shell** — a single `#cm-wrapper` is inserted as the first child of `<body>`; the backdrop, cookie icon, and modal are all appended inside it as siblings.
3. **Conditionally show the backdrop** if `config.backdrop.show` is true.
4. **Always create** the cookie icon and the preferences modal (both start hidden/hidden-by-CSS).
5. **Decide what to show first:**
   - If the visitor has **not** consented yet (`hasConsented` flag not in storage) and `config.autoShow !== false` → show the banner + backdrop.
   - Otherwise → just show the floating cookie icon.
6. **Wire up event listeners** (buttons, focus trap, keyboard).
7. **Run consent callbacks on load** — replays the visitor's stored choices (or defaults for required types) so `gtag('consent', 'update', ...)`, `onAccept`/`onReject` callbacks, and script injection stay in sync with what's already on disk, even on a return visit where no button is clicked.

## Consent types

Each entry in `config.consentTypes` describes one category (e.g. `essential`, `analytics`, `marketing`):

```js
{
  id: 'analytics',              // used to build the localStorage key and DOM ids
  label: 'Statistiques',        // shown as the fieldset legend in the modal
  description: '<p>...</p>',    // HTML shown under the legend
  required: true | false,       // true = always on, checkbox disabled, forced to accepted
  defaultValue: true | false,   // pre-checked state before the visitor has ever chosen (non-required only)
  gtag: 'analytics_storage'     // or an array, e.g. ['ad_storage', 'ad_user_data', 'ad_personalization']
  scripts: [ { url, load, type, crossorigin, integrity } ], // 3rd-party scripts to inject once accepted
  onAccept() {},                // fired when this type becomes accepted
  onReject() {},                // fired when this type becomes rejected
}
```

## Where consent is stored

Everything lives in `localStorage` (guarded — if it's unavailable, the manager degrades gracefully and just won't persist choices between visits):

- `cm.<namespace.>hasConsented` — presence-only flag; once set, the banner won't auto-show again.
- `cm.<namespace.>consent.<typeId>` — `'true'` or `'false'` per consent type.
- `config.namespace` (optional) lets you run multiple independent consent managers on the same domain without key collisions.

`clearAllConsents()` (used by `resetConsent()`) wipes any key prefixed with `cm.`, `cmb_`, or `cmc_`.

## How a user action flows through the code

**Banner "Accept all" / "Reject non-essential"** → `handleConsentChoice(accepted)`:
1. Marks `hasConsented`, removes the banner, hides the backdrop/modal, shows the icon.
2. Builds a `consentStates` map (required types forced `true`, everything else set to `accepted`).
3. Delegates to `batchUpdateConsents(...)`.

**Modal "Save and close" / "Reject non-essential"** (in `setupEventListeners`):
1. Reads the current checkbox states directly from the DOM.
2. Calls `batchUpdateConsents(...)` with those states.
3. Closes the modal, hides backdrop, shows the icon.

**`batchUpdateConsents(consentStates)`** is the single source of truth for applying a set of choices:
1. Diffs each type's new state against what's currently stored — only types that actually changed are processed (no-op call returns `false`).
2. Persists each changed value to `localStorage`.
3. Builds one combined `gtag('consent', 'update', {...})` call covering every changed type that has a `gtag` mapping.
4. Pushes a `dataLayer` event (`config.eventName`, default `cm_consent_update`) so GTM triggers can listen for consent changes.
5. For newly-accepted types: injects their `scripts` and fires `onAccept()`.
   For newly-rejected types: fires `onReject()` (scripts are never removed once injected — see below).
6. If a previously-accepted type **with scripts** was just revoked, schedules `window.location.reload()` after 100ms, since injected third-party scripts can't be un-run — a reload is the only way to guarantee they stop executing.

## gtag / Consent Mode integration

- The README's install snippet sets Google Consent Mode **defaults** *before* `gtag.js` loads, reading straight from `localStorage` so there's no flash of "granted" before the manager initializes.
- At runtime, `triggerConsentIntegration` / `batchUpdateConsents` call `gtag('consent', 'update', ...)` whenever a mapped type's state changes, and on every page load via `runConsentCallbacksOnLoad` (so a returning visitor's prior choice is re-asserted to `gtag` each time, even without interacting with the banner).
- A consent type can map to multiple gtag parameters at once (e.g. `marketing` → `ad_storage`, `ad_user_data`, `ad_personalization`).

## Third-party script injection

- `scripts` on a consent type are only injected once that type is accepted (`_injectConsentScripts`), and never duplicated (`_injectScript` checks for an existing `<script src="...">` first).
- Supported per-script options: `url` (required), `load: 'async' | 'defer'`, `type`, `crossorigin`, `integrity`.
- There is no mechanism to remove an injected script tag on rejection — that's why revoking a previously-granted, script-bearing consent triggers a full page reload instead.

## Inline scripts authored directly in the page (`data-consent-id`)

Not every third-party integration is a loadable `<script src>` — some (like Spark Hire Recruit/Comeet's source-attribution call, `window.COMEET.set(...)`) are a snippet that must run inline, wrapped in the page's own HTML. For these, `consent-manager.js` supports the same "inert until consented" pattern used by tools like Cookiebot/Usercentrics:

```html
<script type="text/plain" data-consent-id="analytics">
  // runs only after the "analytics" consent type is accepted
  window.COMEET.set('candidate-source-storage', true);
</script>
```

Any `<script type="text/plain" data-consent-id="<typeId>">` tag anywhere in the document is left inert by the browser. `_activateInertScripts(consentId)` finds matching tags and swaps them for a real, executing `<script>` (copying all attributes except `type`) whenever that consent type becomes accepted — called from `_injectConsentScripts`, so it runs at the same points as external script injection: on user acceptance (`batchUpdateConsents`) and on every page load for already-accepted/required types (`runConsentCallbacksOnLoad`).

Caveat: this only gates code *you* control in the page's own markup. A third-party embed's *own* `<script src="...">` (e.g. the widget that renders the actual Spark Hire job listings) still runs unconditionally wherever it's placed — this mechanism can't reach into it. If a vendor's cookies are set as a side effect of that unconditional script loading (rather than through a call you can defer, like Comeet's `.set()`), the only way to gate them is to defer the *entire* embed via the `scripts` array above, which may not be viable if the embed is needed to render page content regardless of consent.

## Gated embeds — cross-origin iframes (`cm-embed`)

Some third-party content isn't a script at all — it's a **cross-origin `<iframe>`** (a MuseScore score player, YouTube, Vimeo, etc.). Neither `scripts` injection nor `data-consent-id` script activation can reach inside a separate origin's browsing context, so any cookies that origin's server sets happen the instant the iframe's `src` loads — regardless of consent. The only way to gate those cookies is to withhold the `src` itself until consent is granted.

For this, wrap the embed in a placeholder instead of an `<iframe>` directly:

```html
<div class="cm-embed" data-consent-id="analytics" data-consent-embed-src="https://musescore.com/embed/...">
  <div class="cm-embed-notice">
    <p>This content requires Statistics cookies to load.</p>
    <div class="cm-embed-actions">
      <button type="button" class="cm-embed-consent-btn">Accept &amp; load</button>
      <button type="button" class="cm-embed-preferences-btn">Manage preferences</button>
    </div>
  </div>
</div>
```

- If that consent type is already accepted (returning visitor), `setupEmbedGating()` (called once from the constructor) loads it immediately — no placeholder shown.
- Otherwise the placeholder renders with two actions:
  - `.cm-embed-consent-btn` ("Accept & load") fast-accepts *only* that one consent type (`batchUpdateConsents({ [consentId]: true })`) and loads the iframe.
  - `.cm-embed-preferences-btn` ("Manage preferences", optional) calls `toggleModal(true)` to open the exact same preferences modal used by the banner/cookie icon, for anyone who wants to review every category rather than fast-accept just this one. Saving from there works too, since the modal's save handler always sends a full per-type map through `batchUpdateConsents`.
- Accepting the same consent type from the main banner/modal also loads any pending embeds for it — `_activateGatedEmbeds(consentId)` runs from the same `_injectConsentScripts` call as the script mechanisms above.
- `data-consent-embed-title` / `data-consent-embed-allow` are optional and copied onto the resulting `<iframe>`'s `title` / `allow` attributes.
- The auto-gated path (`_prepareAutoEmbeds`, below) generates this same notice automatically, reusing the consent type's own `description` text (already authored for the modal) instead of requiring per-embed copy.

**Bug note:** `batchUpdateConsents` used to assume its input always covers *every* configured consent type (true for the banner/modal callers, which build a full map). The embed button's `batchUpdateConsents({ [consentId]: true })` call is a partial map — before the fix, every omitted type registered as "changing to `undefined`," and `setConsentChoice` threw calling `.toString()` on `undefined`, silently aborting the whole function before it ever reached the code that loads the iframe (the button appeared to do nothing). `batchUpdateConsents` now skips any type not present in the passed object, so partial updates work.

### When a CMS editor can only paste the vendor's own embed code

Hand-authoring the full `.cm-embed` structure above isn't realistic for most CMS workflows (Webflow content editors, etc.) — they paste whatever `<iframe>` snippet the third party (MuseScore, YouTube...) gives them, as-is.

Important constraint: **no purely after-the-fact JS scan can stop a live `<iframe src="...">` from loading** — not even a `MutationObserver`. Browsers begin fetching an iframe's `src` the moment the HTML parser inserts the element into the DOM, which happens before any deferred or `DOMContentLoaded`-scheduled script runs. By the time our code could inspect the element, the request (and any cookies from its response) has typically already fired — which is exactly why the MuseScore cookies showed up in DevTools with nothing dynamic having happened yet. There is no attribute you can *add* to a live `src` that retroactively makes the browser wait.

The one unavoidable step is renaming the attribute that triggers the fetch, so the browser never sees a real `src` in the first place:

```html
<!-- editor pastes this — the only edit is src → data-consent-src -->
<iframe data-consent-src="https://musescore.com/embed/..." title="..." allow="..."></iframe>
```

Everything else is centralized in config instead of per-embed markup, via `embedHosts` on a consent type:

```js
{
  id: 'analytics',
  label: 'Statistiques',
  embedHosts: ['musescore.com'],
  // ...
}
```

`_prepareAutoEmbeds()` (called once from the constructor, before `setupEmbedGating()`) scans for `iframe[data-consent-src]`, matches each one's hostname against every consent type's `embedHosts`, and — if it matches — transforms it into the exact same `.cm-embed` structure described above (auto-generating the notice/button), which then flows through the identical `setupEmbedGating()` / `_activateGatedEmbeds()` logic. One attribute rename per embed, zero other markup, and the domain→consent mapping lives in one place a developer controls.

If even that one rename isn't achievable (a fully locked-down embed block that only accepts the vendor's unmodified code), pre-load gating isn't achievable client-side at all — the realistic fallback is the same as the Incapsula case: document the cookies as an unavoidable consequence of the embedded third-party service rather than attempting to block them.

Styling lives in `.cm-embed` / `.cm-embed-notice` / `.cm-embed-consent-btn` in `consent-manager.css`. Since this markup sits inline in page content (not inside `#cm-wrapper`), it declares its own fallback custom properties (`--embedBackgroundColor`, `--embedTextColor`, `--embedPrimaryColor`) rather than inheriting `#cm-wrapper`'s.

## UI structure & positioning

- `icon.position`: `'bottomLeft' | 'bottomRight'` (CSS class `cm-pos-bottom-left` / `cm-pos-bottom-right`).
- `prompt.position` (banner): `'center' | 'bottomLeft' | 'bottomCenter' | 'bottomRight'`.
- `backdrop.show`: boolean — dims/blurs the page and blocks interaction while the banner or modal is open; clicking it "nudges" (shakes) the open panel instead of closing it.
- Cookie icon: hidden by default (`display: none`), shown once the banner is dismissed or when the visitor previously consented, and clicking it toggles the preferences modal.
- Accessibility: focus is trapped inside whichever panel (banner or modal) is open via a manual Tab/Shift+Tab handler, `Escape` closes the modal, focus moves to the first actionable button on open, and each button supports a separate `*AccessibleLabel` string for `aria-label`.

## Styling

All visual tokens are CSS custom properties set on `#cm-wrapper` in `consent-manager.css`:

```css
--boxShadow, --fontFamily, --primaryColor, --backgroundColor,
--textColor, --backdropBackgroundColor, --backdropBackgroundBlur,
--iconColor, --iconBackgroundColor
```

Override these (e.g. in a page-level stylesheet loaded after `consent-manager.css`) to reskin the banner/modal/icon without touching the JS. Layout classes (`cm-pos-*`, `cm-loaded`, `cm-nudge`) are toggled by the JS at the moments described above.

## Text customization

All visitor-facing copy is optional and falls back to English defaults if omitted from `config.text`:

- `text.prompt.*` — banner description and button labels/accessible labels (Accept all, Reject non-essential, Preferences).
- `text.preferences.*` — modal title, description, Save button, and policy link text.

`config.policyUrl`, if set, renders a "Privacy policy" link in the modal footer.

## Debugging

Set `config.debug: true` to get `console.log` output whenever a `gtag('consent', 'update', ...)` call or a `dataLayer` event push happens, both on page load and after a user action — useful for verifying Consent Mode wiring in GTM Preview or the browser console.
