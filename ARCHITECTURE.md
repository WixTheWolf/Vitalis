# VITALIS Architecture

## Provenance note (Phase 0 finding)

The task called for reading and refactoring an existing `vitalis.html` prototype. At the start of this work the `WixTheWolf/Vitalis` repository was completely empty: no commits, no branches, and no `vitalis.html` on any ref. There was therefore nothing to read or preserve. The engine described below was built fresh, but it follows the architecture the brief itself inventories: a Three.js scene with a fresnel orb shader, a PQRST ECG generator with a beat clock that links R peaks to the orb pulse, a lens palette system driven by the CSS variables `--accent` and `--accent-rgb`, drag orbit camera controls, and DOM to 3D projection for floating device tags. If a local `vitalis.html` exists somewhere and diverges from this document, reconcile it against this file first.

## High level layout

```
app/
  layout.tsx            Fonts (next/font), global CSS, metadata
  page.tsx              Renders <VitalisObservatory /> full viewport
  globals.css           All bespoke styling: glass, grain, grade, dock, intro
  api/oura/
    auth/route.ts       Redirect to Oura OAuth authorize
    callback/route.ts   Code exchange, sealed httpOnly cookie, redirect home
    daily/route.ts      Server side proxy to api.ouraring.com/v2, 60s cache
components/
  VitalisObservatory.tsx  The whole client side engine (Three.js via npm)
lib/
  vitals.ts             Vitals type, VitalsSource interface, three sources
  session.ts            AES-256-GCM cookie sealing (iron-session equivalent)
  oura.ts               Oura API fetch, token refresh, normalization, cache
```

## Rendering stack (z order, back to front)

1. `.bg`: deep charcoal radial gradient, plain CSS.
2. `.wordmark`: fixed ghosted "VITALIS" in Instrument Serif italic, about 20vw, 6 percent opacity, inverse mouse parallax up to 24px, `pointer-events: none`.
3. `<canvas>`: transparent WebGL stage. Receives pointer input for orbit.
4. `.leaders` SVG plus the two device tag mini cards, positioned per frame from projected 3D anchors.
5. `.grade`: CSS vignette plus warm amber edge gradient, non interactive.
6. `.grain`: SVG feTurbulence tile, opacity 0.05, stepped 12fps background shift, static under reduced motion.
7. HUD: top bar, metric card columns, lens dock, ECG strip.
8. Intro overlay: letterbox bars plus serif title, skipped entirely under reduced motion.

## The orb shader

`ShaderMaterial` on an icosahedron (radius 1.35, detail 5), additive blending, no depth write. Uniforms:

| Uniform       | Type  | Purpose |
| ------------- | ----- | ------- |
| `uTime`       | float | Drives slow banding drift across the surface |
| `uPulse`      | float | Beat envelope, spiked to 1.0 on each ECG R peak, exponential decay |
| `uColor`      | vec3  | Active lens accent, lerped on the CPU each frame for smooth lens cross fades |
| `uLightColor` | vec3  | Light ring color, warm lambert contribution so the ring reads as the light source |
| `uLightPos`   | vec3  | World position of the light ring, synced from the ring group every frame |
| `uRimPower`   | float | Fresnel falloff exponent (2.6) |

Fragment: fresnel rim `pow(1 - dot(N, V), uRimPower)` times accent, plus a lambert term toward `uLightPos`, plus banding, plus a pulse boost. Vertex: positions scale by `1 + uPulse * 0.035` so beats physically swell the orb. An inner additive core sphere adds body.

## The light ring and god rays

A `ringGroup` at (0, 1.15, -1.7), tilted 12 degrees: emissive torus (accent colored, additive), an additive radial glow sprite behind it, and a `PointLight` parented inside so standard materials (the device anchor meshes) are genuinely lit by the ring. The orb fakes the same via `uLightPos`.

God rays are three tall open ended cones from upper back, additive, opacity 0.03 to 0.06, always warm amber (`#ffb46b`) regardless of lens so the grade stays filmic. Each rotates slowly and independently; rotation stops under reduced motion. Particles are distributed with about 60 percent density inside the beam volumes.

## Beat clock and PQRST ECG

A continuous phase accumulator advances by `dt / (60 / hr)`. The waveform is a sum of five gaussians (P, Q, R, S, T) over phase. When phase crosses the R peak (0.28) the beat fires: `uPulse` snaps to 1 and decays with `exp(-dt * 3.2)`, and the ring glow breathes slightly. The ECG strip is a canvas ring buffer appended in real time and stroked in the accent color each frame. The same clock drives both, so the strip and the orb are sample accurate to each other.

## Lens system

Three lenses: `recovery` (#34d2a4), `cardio` (#ff5d73), `sleep` (#8b7bff). Switching a lens:

1. Sets `--accent` and `--accent-rgb` on `document.documentElement`; every DOM accent (dock glow, stamp dot, ECG stroke, numbers) follows via CSS.
2. Sets a target `THREE.Color`; ring, glow sprite, point light, and `uColor` lerp toward it each frame.
3. Retargets the simulated data engine (per lens vitals profiles).

God rays deliberately ignore the lens.

## Camera

Custom drag orbit (spherical coordinates with damping), wheel zoom clamped to [4.8, 11], plus an idle dolly: a sinusoidal radius offset with a 20 second period and 0.12 unit amplitude that eases in after 3 seconds without interaction, eases out while dragging, and is disabled under reduced motion.

## DOM to 3D device tag projection

Two anchor meshes (an Oura style torus and a watch box, both `MeshStandardMaterial` so the ring light hits them) are projected each frame with `Vector3.project(camera)` into screen space. Each glass mini card is moved imperatively via `transform`, and an SVG leader line connects the card corner to the anchor point. Tags hide when the anchor is behind the camera and clamp to the viewport.

## Data adapter (Phase 2)

`lib/vitals.ts` defines `Vitals` and `VitalsSource { start(cb), stop(), label }`. Three sources:

- `SimulatedSource`: the lens driven easing engine. Eases every value toward the active lens profile with organic noise, ticks at 4Hz.
- `OuraSource`: polls `/api/oura/daily` every 60 seconds. Never calls api.ouraring.com from the browser.
- `HealthKitBridgeSource`: listens for `window` messages of shape `{ type: "vitalis:vitals", payload: Partial<Vitals> }` for an iOS WKWebView wrapper.

The component owns a mutable vitals object and merges `Partial<Vitals>` emissions into it, so sources can be swapped at runtime without the UI knowing. A watchdog checks real sources every 5 seconds: 90 seconds without an emission stops the source, restarts `SimulatedSource`, and stamps "Simulated · <label> stalled". A healthy real source stamps "Live · <label>"; the default stamp is "Simulated live stream".

## Oura proxy (Phase 3)

- `auth`: redirects to `cloud.ouraring.com/oauth/authorize` with scopes `daily heartrate personal` and a CSRF state cookie. If only `OURA_PERSONAL_ACCESS_TOKEN` is configured, it short circuits home as connected.
- `callback`: verifies state, exchanges the code at `api.ouraring.com/oauth/token`, seals `{ accessToken, refreshToken, expiresAt }` into an AES-256-GCM encrypted httpOnly cookie keyed off `SESSION_SECRET` (see `lib/session.ts`), redirects to `/?oura=connected`.
- `daily`: reads the cookie (or the PAT env fallback), fetches `daily_readiness`, `daily_sleep`, `sleep` sessions (for real durations, HRV, RHR, respiration), and recent `heartrate`, refreshes the token once on 401 and re seals the cookie, normalizes everything into `Partial<Vitals>`, and caches per token for 60 seconds (module level cache plus `Cache-Control: private, max-age=60`).

## Motion accessibility

`prefers-reduced-motion: reduce` disables: the intro (skipped entirely), grain animation (texture stays, static), wordmark parallax, idle camera dolly, god ray rotation, particle drift, device bobbing, card hover tilt, and HUD stagger animations. Data driven rendering (ECG trace, HUD numbers) continues, with the orb pulse flattened to a subtle brightness change only.

## Responsive behavior

Breakpoints at 820px and 640px. Below 640px the two metric columns collapse into one horizontal scroll snap row under the top bar, the dock and ECG shrink, device tags compact, and the wordmark scales up to stay legible. Verified layouts: 375px, 820px, desktop.
