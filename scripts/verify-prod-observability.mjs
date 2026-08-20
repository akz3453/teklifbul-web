// Teklifbul Rule v1.0 — Live App Check / Sentry presence check (no secrets printed)
const html = await (await fetch('https://nefisoft.com/login.html')).text();
const match = html.match(/assets\/(app-firebase-[^"' ]+\.js)/);
if (!match) {
  console.log(JSON.stringify({ loginHasAppFirebase: false }));
  process.exit(0);
}

const bundle = match[1];
const js = await (await fetch(`https://nefisoft.com/assets/${bundle}`)).text();
const keyMatch = js.match(/6L[A-Za-z0-9_-]{20,}/);
const sentryDsnEmbedded = /ingest\.sentry\.io/.test(js) || /@o\d+\.ingest/.test(js) || /sentry\.io\/\d+/.test(js);

console.log(JSON.stringify({
  bundle,
  appCheckInitPresent: js.includes('initializeAppCheck'),
  skipMissingMessagePresent: js.includes('AppCheck skipped: VITE_RECAPTCHA_ENTERPRISE_SITE_KEY missing'),
  recaptchaSiteKeyEmbedded: Boolean(keyMatch && keyMatch[0].length >= 24),
  siteKeyLength: keyMatch ? keyMatch[0].length : 0,
  sentryDsnEmbedded,
}));
