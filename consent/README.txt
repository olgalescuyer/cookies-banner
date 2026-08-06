Consent Manager Installation Instructions

Add the following code to your HTML page, inside the <head> tag:

<!-- Cookies Banner -->
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>

<!-- Consent CSS -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/<your-path>/consent/consent-manager.css" />

<!-- 1. Consent defaults — localStorage keys updated to cm. -->
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  gtag('consent', 'default', {
    analytics_storage: localStorage.getItem('cm.consent.analytics') === 'true' ? 'granted' : 'denied',
    ad_storage: localStorage.getItem('cm.consent.marketing') === 'true' ? 'granted' : 'denied',
    ad_user_data: localStorage.getItem('cm.consent.marketing') === 'true' ? 'granted' : 'denied',
    ad_personalization: localStorage.getItem('cm.consent.marketing') === 'true' ? 'granted' : 'denied',
    functionality_storage: localStorage.getItem('cm.consent.essential') === 'true' ? 'granted' : 'denied',
    security_storage: localStorage.getItem('cm.consent.essential') === 'true' ? 'granted' : 'denied',
  });
</script>

<!-- 2. Consent Manager JS -->
<script src="https://cdn.jsdelivr.net/<your-path>/consent/consent-manager.js"></script>

<!-- 3. Init -->
<script>
  document.addEventListener('DOMContentLoaded', function () {
    window.consentManager.init({
      policyUrl: 'https://www.mu.se/content/privacy-policy',
      // Reuses this site's own Webflow variables instead of the generic
      // defaults, so the banner/icon match the rest of mu.se exactly.
      // fontFamily: self-hosted font, no third-party request.
      // iconOffset: this site's "large axis" spacing token.
      // See "Fonts" / "Theme" below.
      theme: {
        fontFamily: 'var(--_typography---body)',
        iconOffset: 'var(--_utilities---axis--x-lg)',
      },
      backdrop: { show: true },
      icon: { position: 'bottomLeft' },
      prompt: { position: 'bottomRight' },
      consentTypes: [
        {
          id: 'essential',
          label: 'Essential',
          description: '<p>These cookies are necessary for the website to function properly and cannot be switched off. They help with things like logging in and setting your privacy preferences.</p>',
          required: true,
        },
        {
          id: 'analytics',
          label: 'Statistics',
          description: '<p>These cookies help us improve the site by tracking which pages are most popular and how visitors move around the site.</p>',
          defaultValue: false,
          gtag: 'analytics_storage',
          // Domains matched against iframe[data-consent-src] elsewhere on the
          // page (e.g. MuseScore score embeds, audio.com audio players,
          // youtube-nocookie.com videos pasted as raw Code Embed elements —
          // NOT Webflow's native Video element, which can't carry custom
          // attributes) — see step 6.
          embedHosts: ['musescore.com', 'audio.com', 'youtube-nocookie.com', 'youtube.com'],
          // First-party cookies (set on our own domain by gtag.js) to
          // actively delete if this consent type is later revoked. Only
          // works for first-party cookies — third-party ones (Comeet,
          // MuseScore, audio.com, YouTube) can never be deleted by our JS,
          // only prevented before consent is given.
          firstPartyCookies: ['_ga', /^_ga_/],
        },
        {
          id: 'marketing',
          label: 'Marketing',
          description: '<p>These cookies are used by us and our advertising partners to show you relevant ads on this site and elsewhere, and to measure how those campaigns perform.</p>',
          defaultValue: false,
          gtag: ['ad_storage', 'ad_user_data', 'ad_personalization'],
        },
      ],
      text: {
        prompt: {
            description: "<p>We use cookies on our site to enhance your user experience, provide personalized content, and analyze our traffic.</p>",
            acceptAllButtonText: "Accept all",
            acceptAllButtonAccessibleLabel: "Accept all cookies",
            rejectNonEssentialButtonText: "Reject non-essential",
            rejectNonEssentialButtonAccessibleLabel: "Reject all non-essential cookies",
            preferencesButtonText: "Preferences",
            preferencesButtonAccessibleLabel: "Toggle preferences"
            },
            preferences: {
            title: "Customize your cookie preferences",
            description: "<p>We respect your right to privacy. You can choose not to allow some types of cookies. Your cookie preferences will apply across our website.</p>",
            saveButtonText: "Save and close",
            saveButtonAccessibleLabel: "Save your cookie preferences"
          }
      },
    });
  });
</script>

Fonts
-----
`theme.fontFamily` (optional) sets the CSS `font-family` used inside the
banner/modal. Pass either:
  - a var() reference to a CSS variable your site already defines, e.g.
    theme: { fontFamily: 'var(--brand-font)' }
  - a literal font-family value, e.g. theme: { fontFamily: '"Inter", sans-serif' }

If omitted, it falls back to a system font stack (no network request).

Do NOT set this to a Google Fonts family / load Google Fonts as a
fallback: the consent manager renders before any consent decision is
made, so a call to fonts.googleapis.com / fonts.gstatic.com at that
point sends the visitor's IP to Google before they've consented to
anything. If a project wants a branded (non-system) look, self-host the
font file(s) on the same server as the site (as mu.se already does via
its Webflow-hosted typography variable, referenced above) and point
theme.fontFamily at that. See HOW_IT_WORKS.md → "Fonts" for details.

Icon offset
-----------
`theme.iconOffset` (optional) sets how far the cookie icon (`icon.position:
'bottomLeft' | 'bottomRight'`) sits from the screen edge — a CSS length
(e.g. '20px') or a var() reference to a spacing token your site already
defines, e.g. theme: { iconOffset: 'var(--space-lg)' }.

If omitted, it falls back to a generic 20px, not tied to any site's
design system. See HOW_IT_WORKS.md → "Styling" for details.

<!-- 4. Google tag (gtag.js) -->

<!-- 5. Spark Hire Recruit (formerly Comeet) source attribution.
     Kept inert (type="text/plain") until "analytics" consent is granted —
     consent-manager.js scans for script[type="text/plain"][data-consent-id]
     and activates matching tags on accept (see _activateInertScripts).
     Ref: https://developers.comeet.com/reference/cookies-consent -->

<script type="text/plain" data-consent-id="analytics">
(function(){var a=function(){window.COMEET.set("candidate-source-storage",!0)};window.COMEET?a():window.comeetUpdate=a})();
</script>

<!-- 6. Third-party embeds inside page content (e.g. a MuseScore score player
     or an audio.com audio player pasted into a blog post). A plain
     <iframe src="..."> can't be gated after the fact — the browser fetches
     it during HTML parsing, before any script runs. The only required edit
     when pasting the embed is renaming src to data-consent-src;
     consent-manager.js matches its hostname against each consent type's
     embedHosts (see "analytics" above) and shows a click-to-load
     placeholder until that type is accepted. See HOW_IT_WORKS.md →
     "Auto-gated Embeds". -->
<!--

<iframe data-consent-src="https://musescore.com/user/19710/scores/87402/embed"
        title="Étude Opus 10 No. 4 in C♯ Minor"
        allow="autoplay; fullscreen"></iframe>

<iframe data-consent-src="https://audio.com/..."
        title="..."
        allow="autoplay"></iframe>
-->
