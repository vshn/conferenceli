# Harbour Evolution — Design

**Date:** 2026-09-15
**Status:** Approved, ready to implement
**Scope:** `podstatus/` visualization only

## Problem

Conference booth attendees recur. Someone who saw the kraken at KubeCon last year
gets no "wow" from the kraken this year. The current novelty engine is a finite
catalogue — 10 ambient events, 5 signature events, 7 cameos — and adding cameo #8
buys exactly one more visit before it's stale again.

The scene also has exactly one look (plus a night dimmer), so the harbour a
returning visitor remembers is pixel-identical to the one in front of them.

## Decisions

Four decisions were made during design, in order:

1. **Novelty axis: a harbour with memory.** Not more cameos, not visitor
   personalisation, not crowd interaction. The world itself changes.
2. **Memory horizon: one conference, fresh each time.** No cross-conference
   archive, no season carryover, no migration format. Operationally simplest.
3. **Evolution drivers: procedural seed + wall-clock day arc.** Explicitly *not*
   kill-count progression and *not* real cluster state.
4. **Visual scope includes new rendering and new animations**, not just the
   systems that schedule them.

Decision 2 costs the literal cross-year payoff: a visitor returning a year later
sees a fresh harbour, not one that remembers them. The compensation is decision 3
— each conference is a *run*, procedurally varied, with an arc deeper than any
single visitor can exhaust. Recognisably the same harbour; never the same
specifics.

## Architecture

Two new concepts, each attaching to a seam that already exists.

### The Seed (`static/js/theatre/seed.js`)

A deterministic PRNG plus a generated world spec.

- **Source.** `config.py` holds `CONFERENCE_SLUG`; the server derives a per-day
  seed as `<slug>-<day-index>` and renders it into `index.html` as a data
  attribute. Stable within a day, different across days, reproducible forever.
  `?seed=` overrides for previewing.
- **PRNG.** FNV-1a string hash into mulberry32. No dependency.
- **Governs world generation only.** Coastline, skyline, cloud and star layout,
  lighthouse placement, palette shift, weather timeline, micro-life cast, event
  deck, harbour name. Per-animation jitter stays on `Math.random()` — a tugboat
  should not take an identical path every time.
- **Art-directed ranges, never free random.** Every seeded value is a pick from a
  curated range or an authored variant list. A bad-looking harbour must be
  impossible by construction, not merely unlikely.
- **The event deck.** Each run benches a subset of cameos and promotes one to
  *headliner* with boosted weight. A visitor may spend a whole conference never
  seeing the kraken.
- **The harbour gets a name** ("Port Kestrel"), shown in the chrome, so the
  variation is something visitors can notice and talk about.

### The Director (`static/js/theatre/director.js`)

A wall-clock state machine over seven phases: `dawn → morning → midday →
afternoon → golden → dusk → night`.

- **Maps onto booth hours, not real time.** `BOOTH_OPEN`/`BOOTH_CLOSE` in config;
  the full cycle compresses onto them, so doors open at dawn and teardown is at
  night. Real time would mean dawn never occurs during a conference and every
  dawn-locked animation would be dead content.
- **Pure function of (seed, wall clock).** No accumulated state, so a kiosk that
  crashes at 14:30 reloads into exactly the right phase and weather. No drift, no
  resync.
- **Owns the `night-mode` class.** The manual night override (`/nightmode`,
  `state.mode`) resolves to `effectivePhase = 'night'` and always wins over the
  timeline. `scene.js` no longer toggles the class itself.
- **`?fast=N`** compresses the whole day into N minutes for verification.

## Rendering upgrades

The Director is invisible unless the renderer expresses phase.

1. **Water reflections.** Ships are mirrored into a `<g class="reflections">`
   placed as the first child of `layer-ships` — same SVG root, so `<use>` is
   safe (cross-root `<use>` between the layer SVGs is deliberately avoided).
   Mirror-and-squash transform about the waterline, plus blur, low opacity and a
   horizontal wobble. The lighthouse reflection and the sun/moon glitter column
   are authored shapes rather than `<use>` clones, since their sources live in
   layers below the opaque water rect.
2. **Palette as data.** Sky, water, hill haze, overlay colour and overlay opacity
   become CSS custom properties the Director interpolates between phase palettes.
   `styles.css` keeps owning the look. Crossfades are continuous (2s tick), so
   nothing snaps.
3. **A sun that moves.** Sun and moon leave their pinned `(220, 205)` and ride an
   elliptical arc driven by phase progress. Containers get a drop-shadow whose
   offset, length and opacity follow the sun — long raking shadows at golden hour
   read instantly as "the day is passing".
4. **Skyline with windows.** A seeded city silhouette behind the hills, with
   windows that light up individually and staggered as dusk falls, plus dock lamp
   glow cones.

## New animation catalogue

**Death variants** (today: explode, topple, crumple) — add `overboard` (slides
off the deck, splash, bobs, sinks with bubbles), `crushed` (crane arm flattens
it), `dematerialise` (glitchy scanline dissolve — the honest visual for
`kubectl delete`), `launched` (ballistic arc offscreen, distant splash).

**Respawn variants** (today: drone) — add `crane-lift`, `heli-sling`,
`submarine`, and a rare `printer` that materialises the container layer by layer.
The shared cargo-container builder is extracted so all five reuse it.

**Aftermath** — drifting debris that sinks, an oil slick, a rescue boat.

**Phase-locked events** (`theatre/events/phase.js`) — `fishing-fleet` (dawn),
`sun-dip` with a rare green flash (golden), `starling-murmuration` (dusk),
`plankton-bloom`, `searchlight-sweep`, `shooting-star`, `aurora` (night),
`pilot-boat` (midday), plus micro-life: `dock-worker`, `forklift`, `harbour-cat`.

**Weather** — rain and snow as new particle types in `effects.js`, driven by the
seeded weather timeline, with a global wind parameter that bends smoke.

## Event bus integration

Kept minimal and backwards compatible:

- Optional `phaseWeights` per event (`{ dawn: 3, midday: 0.2 }`) multiplied into
  the existing weight. Events without one behave exactly as today.
- `dayOnly`/`nightOnly` resolve against the Director's phase rather than the
  binary mode, so they keep working unchanged.
- The Director scales category timer intervals, so dawn is sparse and midday busy.

## Operator controls

`/control` gains a Director section: current phase and seed displayed, jump to
phase, freeze the arc, force weather, reroll the seed. Server-side state is
broadcast on the existing `/stream_events` channel.

## Performance

`effects.js` already has an FPS-driven quality scaler. Reflections, rain and
window lighting register with it and degrade first on the Pi.

## Non-goals

- No cross-conference persistence, archive format, or migration.
- No kill-count-driven progression.
- No change to the pod/node mapping: ships stay nodes, the five containers stay
  pods, chaos still explodes things. The demo's meaning is untouched.
