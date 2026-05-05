# Podstatus Visual Overhaul — Design

**Date:** 2026-05-04
**Target:** `podstatus/` web UI
**Audience:** Conference booth visitors (kiosk display on Raspberry Pi 5, 1280×800 LCD)

## Goals

Replace the current plain bootstrap UI of the podstatus app with a visually rich shipping-yard scene. When the red chaos button is pressed, on-screen pods (rendered as shipping containers) should explode in fire and smoke and respawn — synchronized in spirit (not in time) with the physical fog machine puff and the BlinkStick LEDs on the 3D-printed containers.

Backend stays untouched. All work is in the frontend.

## Visual concept

A side-view 2D shipping yard. Bottom third is dock and water; upper two-thirds is sky, sized to give explosions and smoke pillars theatrical headroom.

### Scene layers (back to front)

1. **Sky** — gradient (soft blue → pale haze), 3-4 SVG clouds drifting at parallax speeds, soft sun blob upper-left.
2. **Lighthouse** — far right, white/red striped silhouette with a slow rotating beam (low opacity, atmospheric) and a 1Hz blinking red top light.
3. **Distant background** — desaturated harbor silhouette.
4. **Water** — 2-3 stacked wave layers (gradients/SVG paths) translating horizontally at different speeds, with random white-glint highlights.
5. **Dock** — wooden pier across the bottom width with bollards and lampposts.
6. **Ships (nodes)** — 1-4 cargo ships side-by-side, each with hull, deck, smokestack (continuous thin gray wisps), bow lantern (warm pulsing glow), and a hostname placard.
7. **Containers (pods)** — up to 5 stacked on ship decks, generic shipping-container palette (rust-red, navy, sea-green, orange, off-white), big stenciled white index "0"–"4" on the side, pod-name placard underneath.
8. **Foreground** — 3 SVG seagulls flying random arcs across the sky on long-delay loops.
9. **Chrome layer** — VSHN logo (top-left), QR card for `https://vs.hn/boothraffle` with "🎁 Win a prize!" caption (top-right). Both with semi-transparent rounded backdrops for legibility.
10. **FX canvas** — full-viewport `<canvas>` overlay above the scene, below chrome, for explosions/smoke/embers/splashes.

## Pod state model & identity

Each pod (5 fixed indices, statefulset semantics — terminate-and-respawn, never appearing/disappearing) maps to a stable on-screen container.

- **Identity**: index 0-4 (from `statefulset.kubernetes.io/pod-name` label, already streamed)
- **Color**: fixed per index from a typical container palette
- **Stencil**: large white "0"–"4" via SVG `<text>` (the only on-container label)
- **Slot**: assigned to its node's ship deck (3 slot positions per ship); when `node_name` changes, container slides to the new ship over ~600ms

### State visuals (CSS classes)

| State | Visual |
|---|---|
| `Running` | Solid color, full opacity, gentle bob with ship, soft inner highlight, ~2% breathing scale |
| `Pending` | 60% opacity, dashed yellow outline pulsing at 1Hz, suspended slightly above slot |
| `Terminating` | Red flashing outline at 4Hz, small rotation jitter — kicks off death sequence |
| `Failed` | Blackened/scorched filter, thin smoke wisp from top, no bob |

## Pod death-and-respawn sequence (showpiece)

Triggered when SSE reports a transition into `Terminating` (or pod disappears). Total ~5-6s.

| Phase | Window | Effect |
|---|---|---|
| 1. Warning | 0–300ms | Red flashes (CSS filter), small shake |
| 2. Detonation | 300–900ms | Container scales +10% then bursts. Canvas: orange-yellow radial flash, 30-50 debris shards (gravity, fan-out), 8-12 ember particles (slow upward drift). Subtle screen shake (~80ms). |
| 3. Smoke pillar | 700–2700ms (overlaps 2) | ~40 dark-gray smoke puffs, scaling 1×→4×, drifting up + slightly left, fading to 0 over 2s. CSS-animated flame sprite on scorched deck slot. |
| 4. Aftermath | 2700–4000ms | Smoke thins, scorch-mark SVG visible, flame fades. |
| 5. Respawn | triggered by `pod:running` (typically 2–6s after death) | Quadcopter delivery drone flies in from off-screen left at ~y=200, hovers above the slot, lowers a cargo container on a cable, releases it (green pulse on landing), then flies off-screen right. Total ~7.7s. Triggered as soon as K8s reports the new pod Running, queued if the death visuals haven't finished yet. |

### Concurrency rules

- Each container has its own state machine; deaths on different containers run in parallel.
- Re-killing same container during phases 1-4: cancel current tween/particles, restart at phase 1.
- Re-killing during phase 5 (respawn): let respawn complete, then immediately queue the kill, to avoid mid-air-explosion jankiness.

## Node lifecycle (ship animations)

### Steady state
- Vertical bob (~3px sine, ~3s period, randomized phase per ship)
- Smokestack wisps thin gray smoke (Canvas, 1 puff every ~400ms)
- Bow lantern with breathing warm glow (CSS `box-shadow`, 4s)
- Hostname placard on hull

### Joining (new node in stream)
1. Sails in from off-screen right (~80px/s, ease-out, ~2s)
2. Splash particle burst at waterline (15-20 white droplets)
3. Horn-puff: white smoke ring from stack, 1×→3× scale + fade (~600ms)
4. Other ships reflow positions over 1s (`transition: left ease-in-out`)

### Going NotReady
1. Lantern dark; smokestack smoke turns black + denser
2. Lists 10° (`transform: rotate`) over ~3s
3. Hull translates down ~30px, slight darkening filter
4. Stays in stricken state — does **not** fully sink, so recovery is graceful
5. On `KubeletReady` recovery: reverse over ~1.5s, lantern relights with yellow flash

### Fully gone (disappears from stream entirely)
- Continue rotation past 30°, hull slides below waterline over ~2.5s, splash burst, DOM remove
- Containers still assigned to it ride down with the ship (poetic + accurate)
- Remaining ships slide to fill gap

## Idle ambiance

All cheap CSS animations, target <2% CPU when idle:

- **Clouds** — 3-4 SVGs drifting L→R at 60-120s/crossing
- **Sun** — static radial gradient blob, sets warm tone
- **Lighthouse beam** — low-opacity rotating SVG triangle, 8s/rotation
- **Lighthouse blink** — 1Hz red dot at top
- **Water waves** — 2-3 layers, 8/14/22s `translateX` rates; random white glints fading in/out
- **Seagulls** — 3 SVG silhouettes, looping random arcs every 15-45s, 4Hz wing-flap via `d`-attribute swap
- **Smokestacks** — thin gray wisps from each ship, low rate
- **Audio** — none

## Layout & responsive behavior

Fixed 1280×800. Wrap in a 1280×800 container with `transform: scale()` to fit other displays — preserves layout exactly with letterboxing if aspect differs.

| Zone | Y range | Contents |
|---|---|---|
| Chrome strip | 0–140px | VSHN logo (left, ~120×60px), QR card (right, ~120×120 + caption) |
| Sky / FX headroom | 140–480px | Clouds, sun, lighthouse top, smoke pillars |
| Ships & containers | 480–720px | Up to 4 ships, containers stacked on decks |
| Waterline / dock | 720–800px | Pier edge, water, ripples |

Ships centered via Flexbox `space-evenly`, width = `min(280px, (1280 - 100) / nodeCount)` — capped 600px so a single ship doesn't look comical. Each ship has 3 slot positions (4 × 3 = 12 capacity, plenty for 5 pods). Lighthouse pinned `right: 20px` behind ships z-layer.

`prefers-reduced-motion` disables the screen shake; everything else stays gentle.

## Technical architecture

### Stack

- Existing Flask + Bootstrap5 + htmx + SSE — kept. **Backend untouched.**
- New frontend: vanilla ES modules, no build step.
- Single dependency: `anime.js` (~7kb) vendored into `static/js/vendor/`.
- All visuals SVG-first (including VSHN logo derived via CSS filters, and QR generated once as SVG with Python `qrcode` lib's `SvgPathImage`).

### File layout

```
podstatus/
├── templates/
│   ├── base.html          # minor edit: drop bg image, add scene container
│   └── index.html         # rewritten: scene SVG + canvas + module script
├── static/
│   ├── css/styles.css     # rewritten: scene layout, animations, idle FX
│   ├── images/
│   │   ├── vshn-logo.svg  # copied from tmp/2021_LOGO_VSHN_color.svg
│   │   └── qr-boothraffle.svg  # generated once, vendored
│   └── js/
│       ├── scene.js       # SVG scene composition + DOM management
│       ├── state.js       # SSE handlers, pod/node state machine
│       ├── effects.js     # Canvas particle system
│       ├── animations.js  # death/respawn/sail-in timelines
│       └── vendor/anime.min.js
```

### Module responsibilities

- **`state.js`** — source of truth: `pods[index]` and `nodes[name]` maps. Subscribes to `/stream_pods` and `/stream_nodes`. Emits typed events (`pod:running`, `pod:terminating`, `node:joined`, `node:notready`, etc.) on a tiny EventTarget.
- **`scene.js`** — listens for state events, mutates the DOM (creates/moves SVG elements, toggles state classes). Static SVG markup defined as JS template strings (no separate asset files for scene primitives).
- **`animations.js`** — listens for the same events and triggers timelines (e.g., `pod:terminating` → `playDeath(podIndex)` coordinating SVG class toggles, Canvas emitter calls, anime.js sequences).
- **`effects.js`** — exposes `emit({type, x, y, count, ...})`. Single global `requestAnimationFrame` loop with a particle pool (max ~500 active particles, recycled — no per-frame allocation).

### Performance targets

- 60fps idle, ≥30fps during 3+ concurrent explosions on Pi 5
- Auto-degrade: drop ember count if RAF falls below 25fps
- Hard cap on simultaneous particles
- Object pooling for particles to avoid long-running Chromium memory leaks

## Implementation phases

Each phase shippable independently:

1. **Scaffolding** — replace `index.html` with new layout shell, wire empty JS module stubs. Existing SSE rendered as plain text temporarily.
2. **Static scene** — SVG ships, dock, water, sky, lighthouse, clouds, VSHN logo, QR. No animation.
3. **State binding** — connect SSE to `state.js`; render containers in correct slots; apply state classes.
4. **Idle ambiance** — ship bob, water, clouds, lighthouse beam, seagulls, smokestack wisps.
5. **Pod death sequence** — Canvas particle system, explosion + smoke + scorch + crane respawn.
6. **Node lifecycle** — sail-in, list/sink, recovery.
7. **Polish & perf** — verify 30fps+ on real Pi, tune particle counts, honor `prefers-reduced-motion`.

## Out of scope / open items

- Final container palette and hull colors — pick during phase 2 by feel.
- Crane visual style (industrial gantry vs simple hook on cable) — decide in phase 5.
- Optional easter eggs (kill counter, day/night cycle, etc.) — not in v1.
- Audio (music/SFX) — not in v1; physical buzzer + fog hiss covers the sensory layer.
- Additional death-sequence variants (sinking, seagull-snatch, etc.) — possible v2.
- Fog machine sync — independent. Local HTTP server on `localhost:6543` accepts `HEAD` to fire the relay (~1-2s startup). On-screen explosion fires instantly via SSE; the lingering smoke pillar phase naturally overlaps with the real fog plume.

## Risks & mitigations

- **GPU under sustained particle load** → hard particle cap, auto-degrade ember count below 25fps.
- **Long-running Chromium kiosk + Canvas memory leaks** → recycle particle objects from a pool.
- **Re-kill mid-respawn jankiness** → queue kill until respawn completes (Section "Concurrency rules").
- **Aspect-ratio drift if LCD is replaced** → fixed 1280×800 wrapper with `transform: scale()` fit.

## Backend changes

None. Existing endpoints `/stream_pods`, `/stream_nodes`, `/chaos` already provide everything the new frontend needs.
