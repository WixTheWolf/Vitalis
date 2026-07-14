# VITALIS

A cinematic 3D biometric observatory for wearables (Oura Ring and Apple Watch), built with Next.js and Three.js. A beating fresnel orb, a single glowing light ring, warm god rays, film grain, glass HUD cards, and a live PQRST ECG strip whose R peaks drive the orb pulse. Data flows through a source agnostic adapter: simulated by default, Oura Cloud via a server side proxy, or live HealthKit samples pushed from an iOS wrapper.

See `ARCHITECTURE.md` for how the engine is put together and `CHANGELOG.md` for what changed and why.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values, see below
npm run dev                  # http://localhost:3000
```

`npm run build` must pass with zero type errors; run it before shipping.

The app works with no environment at all: it boots on the simulated source and everything renders. Environment variables are only needed for the Oura connection.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `OURA_CLIENT_ID` | Oura OAuth application client id |
| `OURA_CLIENT_SECRET` | Oura OAuth application client secret |
| `OURA_REDIRECT_URI` | Must exactly match the URI registered with Oura |
| `OURA_PERSONAL_ACCESS_TOKEN` | Solo use fallback, skips OAuth entirely |
| `SESSION_SECRET` | 32+ char random string encrypting the token cookie |

Generate a secret with `openssl rand -base64 48`.

## Registering an Oura application

1. Go to https://cloud.ouraring.com/oauth/applications and create an application.
2. Set the redirect URI to `http://localhost:3000/api/oura/callback` for local dev.
3. Copy the client id and secret into `.env.local`.
4. Start the app, click "Connect Oura" in the top right, and approve the scopes (`daily heartrate personal`).
5. On success you land back on the app, the stamp switches to "Live · Oura", and `/api/oura/daily` starts serving normalized vitals with a 60 second cache.

Solo shortcut: skip all of the above, create a Personal Access Token at https://cloud.ouraring.com/personal-access-tokens, and set `OURA_PERSONAL_ACCESS_TOKEN`. The "Connect Oura" button then connects instantly with no OAuth flow.

## HealthKit bridge contract (future iOS wrapper)

The observatory listens for `window` messages so a WKWebView wrapper can push live HealthKit samples. Post messages of this exact shape, as often as samples arrive:

```js
window.postMessage(
  {
    type: "vitalis:vitals",
    payload: {
      hr: 62,            // bpm
      hrv: 74,           // ms, SDNN or rMSSD
      rhr: 49,           // bpm
      spo2: 98,          // percent
      respRate: 14.2,    // breaths per minute
      steps: 6480,
      battery: { watch: 67 }
    }
  },
  "*"
);
```

Every field is optional (`Partial<Vitals>`); send whatever HealthKit delivers and the observatory merges it. From Swift, evaluate JavaScript on the web view:

```swift
webView.evaluateJavaScript(
  "window.postMessage({ type: 'vitalis:vitals', payload: { hr: \(bpm) } }, '*')"
)
```

Mount the component with `source="healthkit"` (or expose a query param in your wrapper's page) to start on the bridge source. If the bridge goes silent for 90 seconds the app falls back to the simulated stream and says so in the stamp.

## Vercel deploy

1. Push this repository to GitHub.
2. Import the repo at https://vercel.com/new; the Next.js defaults are correct.
3. In the Vercel project settings, add the environment variables listed above.
4. Set `OURA_REDIRECT_URI` to the production callback, `https://your-domain.vercel.app/api/oura/callback`, and register that same URI on your Oura application.
5. Deploy. The 60 second vitals cache is per serverless instance, which is fine for this use.

## Accessibility and responsiveness

- `prefers-reduced-motion: reduce` skips the cinematic intro entirely and disables grain animation, wordmark parallax, idle camera dolly, god ray rotation, particle drift, hover tilts, and HUD stagger. Data rendering continues.
- Layout is verified at 375px, 820px, and desktop widths. Below 640px the metric columns collapse into one horizontal scroll row.
- The lens dock is keyboard operable with visible focus states.
