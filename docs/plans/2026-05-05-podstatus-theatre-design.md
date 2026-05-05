# Podstatus Theatre Layer — Design

**Date:** 2026-05-05
**Target:** `podstatus/` web UI (frontend) + small backend additions in `podstatus/app.py`
**Audience:** Conference booth visitors (kiosk display on Raspberry Pi 5, 1280×800 LCD)

## Goal

Layer unexpected, occasional events on top of the existing shipping-yard scene so passersby keep getting fresh "did you see that?!" moments. Most events are pure theatre; a handful are dramatic enough to actually delete a pod, reinforcing the chaos engineering story without disrupting the live demo.

## Design constraints

- **Tone:** mostly on-theme (nautical / shipping yard) with occasional absurd cameos. Realism makes the rare absurd moments hit harder.
- **Cluster impact:** events may delete pods (containers) but never affect ships (nodes).
- **Cadence:** ambient surprises every 30–60s, signature & cameo events each every 3–5 min on independent timers — so something "big" happens every ~2–3 min.
- **No new dependencies:** reuse existing SVG layers (`#layer-sky`, `#layer-water`, `#layer-ships`, `#layer-foreground`, `#layer-night-additive`), the particle canvas (`#layer-fx`, `#layer-fx-bright`), and `anime.js`.
- **Don't break the live demo:** never overlap two big events, suppress for ~8s after a real chaos press, keep all timings in one config object so booth operators can tune live.

---

## Event roster

### Ambient layer (every 30–60s, on-theme, theatre-only)

Small surprises that keep the scene feeling alive between big moments. Each is short (5–15s), uses existing layers, never touches pods.

1. **Tugboat / fishing boat traversal** — small SVG silhouette crosses horizon left→right behind ships. Wake trail via splash particles. ~12s.
2. **Cargo helicopter flyby** — diagonal across sky; tiny shadow cast on dock.
3. **Lighthouse beam sweep** — once a minute the lighthouse rotates a long cone of light across the scene (extra-visible at night).
4. **Fog wisp drift** — low-altitude haze (smoke particles, white tint) drifts across foreground for ~10s.
5. **Distant lightning flash** — silent flash bleaches the sky for ~100ms; faint rumble suggested by water-ripple boost.
6. **Submarine periscope** — periscope rises in water briefly, scans, ducks back. Easter egg.
7. **Whale spout** — tiny puff of water at horizon, fluke briefly visible.
8. **Seagull frenzy** — existing seagulls converge on one spot then scatter (someone "dropped a sandwich").
9. **Crane swing on dock** — silhouette of a gantry crane in foreground swings a phantom container sideways and back.
10. **Cloud shadow** — slow gradient shadow drifts across the dock as a cloud passes overhead.

### Signature pod-kill events (every 3–5 min, mostly on-theme, with teeth)

Dramatic events that target a specific container visually and *actually delete that pod* at the climax frame. Existing death/scorch animation takes over from impact.

1. **Lightning strike** — sky darkens 1–2s, ominous flicker, then a forked bolt cracks from cloud to one container. White-out flash punches through night overlay. Pod killed at impact. ~4s.
2. **Rogue wave** — water layer animates a massive swell rolling toward one ship. Wave crashes, container is washed overboard, sinks. Pod killed when it hits water. ~5s.
3. **Crane mishap** — gantry crane swings in from foreground, lowers a hook onto a container, lifts it 30px… cable snaps, container drops, smashes apart with debris. Pod killed at impact. ~6s.
4. **Cargo fire** — one container starts smoking (slow build, ~5–8s of embers + smoke). Fire visibly grows. Then a sudden explosion. Pod killed. The slow build is itself an attention-grabber.
5. **Pirate broadside** — small pirate ship (jolly roger) sails into foreground, pauses, cannon flash + smoke puff, cannonball arcs across screen, hits a container. Pod killed at impact. Pirate ship sails back out. ~8s.

Per-event cooldown: ~12 min so visitors don't see "lightning strike" twice in 5 min.

### Absurd cameos (every 3–5 min, separate timer, weighted lower per-event)

Pop-culture rule-breakers. Two have teeth, the rest are pure spectacle.

1. **Kraken attack** *(pod kill)* — water churns, giant tentacle rises between two ships, slaps down on one container, drags it under. Big splash. Pod killed when tentacle hits. ~5s. Ship is unaffected; only the container is taken.
2. **UFO abduction** *(pod kill)* — saucer descends, hovers over one container, beams it up. Container slides up the beam, vanishes. Saucer streaks off. Pod killed when beam closes. ~6s.
3. **Jaws fin** *(pure tease)* — single shark fin circles in the water for ~8s, then disappears. Nothing happens. The *not* happening is the joke.
4. **Loch Ness sighting** *(easter egg)* — three small humps surface in sequence, then a head briefly, then everything ducks under. ~3s. Blink and you miss it.
5. **Meteor streak** *(night-only)* — streak of light arcs across the sky and disappears past the horizon. Single bright trail using ember particles.
6. **Godzilla silhouette** *(theatre)* — distant black silhouette stomps across the far horizon behind background ships, head visible above the skyline, then gone. ~6s.
7. **Giant rubber duck** *(theatre, optional)* — bath-toy-yellow giant duck the size of a ship floats slowly across the harbor. Does nothing, just exists. ~15s.

---

## Scheduling & scaffolding

### Event bus

A single `eventBus` module in JS exposes:
- `register(name, {category, weight, cooldownMs, dayOnly?, nightOnly?, run(target?)})` — events register their definition + animation function.
- `tick()` — called by each timer; picks the next eligible event from its category by weighted random over events whose cooldown has expired.
- `fire(name)` — manual trigger from the control panel; bypasses cooldown but still respects suppression.

### Three independent timers

| Category   | Cadence (jitter) | Per-event cooldown |
| ---------- | ---------------- | ------------------ |
| ambient    | 30–60s           | ~3 min             |
| signature  | 4–7 min          | ~12 min            |
| cameo      | 4–7 min          | ~15 min            |

Independent timers mean signatures and cameos interleave naturally — the big-moment cadence ends up around every 2–3 min.

### Suppression rules

An event is **skipped** (not delayed) when:
- The chaos button (or `/control/chaos`) was pressed within the last **8s** — give real chaos breathing room.
- A signature or cameo is currently mid-animation — no overlap of big events. Ambient may still play during them.
- A `dayOnly`/`nightOnly` event's mode doesn't match current `display_mode`.

### Pod-kill plumbing (the one real backend change)

Today `/chaos` deletes a *random* pod. For signatures/cameos to visually target a specific container and have *that* container die, JS needs to call:

```
POST /control/chaos/<index>
```

…which deletes the pod whose `statefulset.kubernetes.io/pod-name` label equals `<index>`. Same session auth as `/control/chaos`. Without this, the kraken grabs container 3 but container 7 explodes — the gag falls apart.

The frontend animation flow for any pod-kill event:
1. Pick a target container index from the currently-running pods (visible in `state.js`).
2. Play the lead-in animation (lightning bolt, wave swell, crane lift, fire build, cannon arc, tentacle rise, UFO descent…).
3. At the climax frame, `POST /control/chaos/<index>` (fire-and-forget).
4. The k8s pod-watch SSE delivers the deletion event a beat later; the existing death animation (`playDeath`) and scorch handling on that index take over.

### Manual triggers on the control panel

`control.html` grows a "Theatre" section: one button per signature + cameo event ("⚡ Lightning", "🌊 Rogue wave", "🏗️ Crane mishap", "🔥 Cargo fire", "🏴‍☠️ Pirates", "🦑 Kraken", "🛸 UFO", "🦈 Jaws fin", "🦕 Nessie", "☄️ Meteor", "🦖 Godzilla", "🦆 Rubber duck"). Each button POSTs to `/control/event/<name>`, server pushes the name through the existing SSE stream (extend `/stream_mode` or add `/stream_events`), client `eventBus` calls `fire(name)`.

When the booth operator spots an interesting visitor, they hit a button and the show happens on demand.

### Config knobs

All timings, weights, cooldowns, and per-event flags live in one `theatre.config.js` object so cadence can be tuned at the conference without touching logic. Sensible defaults match the table above.

### Kill switch

A single `theatreEnabled` flag in the config (and a control-panel toggle) disables all three timers and clears any in-flight surprise. Useful when filming a demo or when something goes wrong.

---

## Backend changes summary

Small, additive:

1. `POST /control/chaos/<index>` — delete pod by index label, session-auth.
2. `POST /control/event/<name>` — push `{event: name}` to a server-side broadcast channel, session-auth.
3. `GET /stream_events` — SSE channel that pushes manual-trigger events to all open frontends. (Or extend `/stream_mode` to multiplex; separate is cleaner.)

No changes to `/chaos`, `/stream_pods`, `/stream_nodes`, `/nightmode`, or the existing animation pipeline.

## Frontend changes summary

New files:
- `podstatus/static/js/theatre/eventBus.js` — registry + scheduler.
- `podstatus/static/js/theatre/config.js` — timings/weights/flags.
- `podstatus/static/js/theatre/events/ambient.js` — 10 ambient event definitions.
- `podstatus/static/js/theatre/events/signature.js` — 5 signature event definitions.
- `podstatus/static/js/theatre/events/cameos.js` — 7 cameo event definitions.

Modified:
- `podstatus/static/js/main.js` — initialise theatre after scene/effects.
- `podstatus/static/js/effects.js` — possibly add 1–2 new particle types if existing ones don't cover (e.g., long lightning bolt path).
- `podstatus/templates/control.html` — Theatre section with manual-trigger buttons.

## Open questions for implementation

- Audio: skipped for now (kiosk has no speakers in the booth setup, per existing scene). Worth revisiting if a Bluetooth speaker is available.
- Telemetry: log each fired event server-side (level INFO) so post-event we can see which surprises actually played during the day.
- Asset budget: each new SVG silhouette (tugboat, helicopter, kraken tentacle, UFO, pirate ship, rubber duck, Godzilla) adds ~1–3 KB. All inline in JS to avoid extra network requests on the kiosk.
