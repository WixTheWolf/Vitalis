# CHANGELOG

All notable changes in this upgrade, and why.

## Phase 0: Discovery

- **Finding: the repository was empty.** The brief asked to read and refactor an existing `vitalis.html`, but `WixTheWolf/Vitalis` had no commits, no branches, and no files on any ref at the start of this work. There was nothing to preserve, so the engine was built fresh to the brief's own inventory (fresnel orb shader, PQRST ECG generator, beat clock, lens palette via `--accent` and `--accent-rgb`, camera controls, DOM to 3D device projection). This is called out again at the top of `ARCHITECTURE.md`.
- Added `ARCHITECTURE.md` documenting the full engine: render stack, shader uniforms, lens system, beat clock, camera, projection, data adapter, and the Oura proxy.

## Phase 1: Cinematic visual overhaul

- **Typography**: Instrument Serif (regular and italic), Space Grotesk, and IBM Plex Mono loaded via `next/font` in `app/layout.tsx`. Serif is display only (wordmark, intro title, device names); all UI stays Grotesk and Mono. Why: the editorial, filmic direction needs a serif voice without touching UI legibility.
- **Giant background wordmark**: fixed ghosted "VITALIS" in Instrument Serif italic at 20vw and 6.5 percent opacity, layered between the deep background and the 3D canvas, with inverse mouse parallax capped at 24px and `pointer-events: none`. Why: the ghosted wordmark behind the hero object anchors the editorial look.
- **Cinematic intro**: black frame, letterbox bars, the serif wordmark tracks in from wide letter spacing with a slow fade, "Biometric Observatory" in mono smallcaps, bars retract over 900ms, then the HUD staggers in. Skipped entirely under reduced motion. Why: sets the filmic tone in the first three seconds without costing anything afterward.
- **Light ring**: emissive torus behind and above the orb, tilted 12 degrees, lens colored, with an additive glow sprite and a parented `PointLight`. The orb shader takes `uLightPos` and `uLightColor` so the ring visibly lights the orb, and the standard material device meshes catch the same light for real. Why: the single light source statue look needs the light to demonstrably come from somewhere.
- **God rays**: three tall open ended additive cones from upper back at opacity 0.032 to 0.06, rotating slowly and independently, always warm amber regardless of lens. Why: keeps the photographic warm grade stable while lenses recolor the subject.
- **Atmosphere and grade**: about 60 percent of particles are seeded inside the beam volumes; a CSS grade layer combines a vignette with faint warm amber edge gradients; an animated film grain layer (SVG feTurbulence tile, opacity 0.05, eight held frames at roughly 12fps) sits above the scene and freezes under reduced motion. Why: grain stepping at 12fps reads photochemical instead of digital.
- **Glass upgrade**: every HUD card now uses 24px backdrop blur, a 1px gradient hairline border (white 14 percent at top fading to 4 percent) via the double background border trick, an inner top highlight, 22px radii, and a pointer tracked 3D tilt capped at 4 degrees with `preserve-3d`. Tilt is mouse only and neutralized under reduced motion.
- **Device tags**: rebuilt as floating glass mini cards with serif device names, a mono battery and signal row, a lens colored status dot, and a thin SVG leader line from card corner to device. Still projected from 3D world positions every frame, clamped to the viewport, hidden when behind the camera.
- **Bottom dock**: the lens switcher (Recovery, Cardio, Sleep) is a centered floating glass pill above the ECG strip, icon plus label per lens, active lens glows in its accent. Keyboard focus states stay visible via `:focus-visible`.
- **Camera**: added a sinusoidal idle dolly (0.13 units over a 20 second period) on top of the damped drag orbit. It eases in after 3 seconds of idleness, eases out while dragging, and is disabled under reduced motion.

## Phase 2: Data adapter

- Added `lib/vitals.ts`: the `Vitals` type, the `VitalsSource` interface, and three sources. `SimulatedSource` is the lens driven easing engine (per lens target profiles, exponential easing, organic wobble) and remains the default. `OuraSource` polls `/api/oura/daily` every 60 seconds; the browser never calls api.ouraring.com directly because it is CORS blocked. `HealthKitBridgeSource` listens for `{ type: "vitalis:vitals", payload: Partial<Vitals> }` window messages for a future iOS WKWebView wrapper.
- Sources are swappable at runtime: the component merges `Partial<Vitals>` emissions into one mutable object the render loop reads, so the UI never knows which source is active.
- Stamp logic: "Simulated live stream" by default, "Live · <label>" when a real source is active, and a 90 second stall watchdog that falls back to simulated with "Simulated · <label> stalled".

## Phase 3: Next.js port

- Scaffolded Next.js 16 (App Router, TypeScript, bespoke global stylesheet, no Tailwind). Three.js comes from npm, not a CDN.
- The entire app lives in `components/VitalisObservatory.tsx` as a client component with props `{ source?, initialLens? }`; `app/page.tsx` renders it full viewport.
- Oura proxy routes: `app/api/oura/auth` (redirects to the Oura authorize URL with scopes `daily heartrate personal` and a CSRF state cookie), `app/api/oura/callback` (code exchange, tokens sealed into an encrypted httpOnly cookie, redirect home), `app/api/oura/daily` (reads the cookie or the `OURA_PERSONAL_ACCESS_TOKEN` fallback, fetches daily_readiness, daily_sleep, sleep sessions and recent heartrate, refreshes the token once on 401, returns normalized vitals, cached 60 seconds).
- Cookie sealing is a dependency free iron-session equivalent (`lib/session.ts`): AES-256-GCM keyed off `SESSION_SECRET`. Why: same security posture, zero extra dependencies.
- Added a "Connect Oura" glass button in the HUD that hits `/api/oura/auth`; the callback redirects to `/?oura=connected`, which swaps the live source to Oura.
- Added `.env.example` (OURA_CLIENT_ID, OURA_CLIENT_SECRET, OURA_REDIRECT_URI, OURA_PERSONAL_ACCESS_TOKEN, SESSION_SECRET), `README.md` (local dev, Oura registration, HealthKit bridge contract, Vercel deploy), and this changelog.

## Verification

- `npm run build` passes with zero type errors.
- Reduced motion, 375px, 820px, and the simulated fallback path exercised; see the notes in `README.md`.
