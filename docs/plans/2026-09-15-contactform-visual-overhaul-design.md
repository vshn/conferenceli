# Contactform visual overhaul — design

Date: 2026-09-15

## Problem

The contactform is filled in by conference attendees standing at the VSHN booth,
on their own phone, while someone talks to them. The old form was
flask-bootstrap with the Bootswatch `sandstone` theme and the default
`render_form` macro. Two problems:

1. **It looked like a template.** Generic Bootswatch styling, a logo at 50%
   width eating the first screen, white labels on a blue ground with no card.
2. **It fought the phone.** No `autocomplete`/`inputmode`/`autocapitalize`
   hints, so nothing autofilled and iOS capitalised email addresses. Inputs
   inherited a sub-16px size, so Safari zoomed in on every focus. `height:
   100vh` on `body` broke as soon as the keyboard opened. The submit button was
   below seven fields, out of thumb reach.

## Direction

**The page is the ticket that prints.** The booth's payoff is physical — a
Brother QL prints a raffle ticket and/or a voucher a metre away. So the form
card is a ticket with a real tear line: a perforated rule with semicircular
notches punched through both edges, letting the blue dot-halftone ground show
through the holes.

The tear encodes the exchange: above it is what you *get* (campaign, what
prints), below it is what you *give* (the fields). That is the single bold
element; everything else stays quiet.

## Tokens

| Role | Value | Notes |
| --- | --- | --- |
| `--ground-top` / `--ground-bot` | `#5a9be0` / `#2f6bb5` | VSHN blue, under the existing halftone asset |
| `--paper` / `--paper-sunk` / `--rule` | `#ffffff` / `#f6f8fb` / `#dce3eb` | label stock, input wells, perforation |
| `--ink` / `--ink-soft` | `#10202f` / `#5a6b7c` | thermal print; `--ink-soft` is 4.9:1 on paper |
| `--signal` / `--signal-press` | `#c2381a` / `#9e2c13` | the red chaos button on the booth table → primary CTA; white on it is 5.4:1 |
| `--focus` | `#1f4e87` | focus ring, admin button |

## Type

**No webfonts, deliberately.** Two reasons: an external request on conference
wifi is a failure mode we don't need, and embedding Google Fonts while
collecting EU/CH personal data is the exact pattern ruled unlawful in LG
München 3 O 17493/20 (2022).

- Body and inputs: `system-ui` stack — SF on iOS, Roboto on Android. Best
  rendering on the precise devices this runs on.
- Eyebrow, field labels, "optional" tags and the button: `ui-monospace`
  (SF Mono / Cascadia), uppercase, letterspaced. This is the label-printer
  voice, and the sans/mono contrast is what carries the personality without
  a single byte downloaded.

`styles.css` carries a documented hook: drop woff2 files into `static/fonts/`,
add `@font-face`, prepend the family to `--font-sans` / `--font-mono`. Nothing
else changes.

## Layout

Mobile first, one column, `--ticket-w: 33rem` on desktop.

```
        [ VSHN logo, 150px ]
  ╭────────────────────────────╮
  │ KUBECON 2026        (mono) │  eyebrow = config.CAMPAIGN_NAME
  │ Two fields.                │  display
  │ Then it prints.            │
  │ Your raffle ticket and …   │  lede, config-aware
  ⊂- - - - - - - - - - - - - -⊃  ← tear + punched notches
  │ NAME                       │
  │ [___________________]      │
  │ COMPANY         optional   │
  │ …                          │
  ├────────────────────────────┤
  │  [  PRINT MY TICKET  ]     │  sticky bottom
  ╰────────────────────────────╯
```

The notches are a two-layer `mask-image` with `mask-composite: intersect` on
`.ticket__stub` (bottom corners) and `.ticket__body` (top corners), wrapped in
`@supports`. Elevation is `filter: drop-shadow` rather than `box-shadow` so the
shadow follows the punched silhouette. Without mask support the ticket keeps
the perforation and has square shoulders — no broken layout.

`.actionbar` is `position: sticky; bottom: 0`, styled as the ticket's own bottom
edge. While stuck, white ticket padding sits behind its rounded corners so they
read as square; once it rejoins the ticket the blue ground rounds them.

## Copy

Only two of seven fields are required, so the asterisks are gone and the other
five carry a quiet `optional` tag instead — five small tags read as *less* work
than two asterisks read as more. That is what makes the headline "Two fields"
verifiable rather than a claim.

`booth_copy()` in `app.py` derives headline, lede and button label from
`VOUCHER_TYPE` and `PRINT_RAFFLE_TICKET`, read fresh per request because
`/config` changes them at runtime. The button names what happens — "Print my
ticket" / "Print my voucher" / "Send my details" — and becomes "Printing…"
while disabled on submit, which also kills the double-tap that would otherwise
produce two labels and a duplicate lead.

## Mobile friction fixes

- `autocomplete` on every field (`name`, `email`, `organization`,
  `organization-title`, `tel`, `country-name`) so phones autofill.
- `autocapitalize="off"`, `autocorrect="off"`, `spellcheck="false"` on email.
- `inputmode` for email/tel, `enterkeyhint` chaining through the fields.
- 16px input text — anything smaller makes iOS zoom on focus.
- 52px inputs, 56px button, 44px checkbox rows.
- `min-height: 100dvh` replacing `100vh`; `viewport-fit=cover` plus
  `env(safe-area-inset-bottom)` so the sticky bar clears the home indicator.
- Notes textarea 5 rows → 3.
- Country list becomes real `<optgroup>`s (`Nearby` / `All countries`) via a
  dict of choices, replacing the `"---"` separator row.
- `theme-color`, `color-scheme: light`, `robots: noindex`.

## Non-goals

- No change to which data is collected or how it reaches Odoo/CSV/Nextcloud.
- No field reordering or progressive disclosure — same seven fields, same order.
- `bootstrap-flask` stays in `pyproject.toml`; podstatus still uses it.

## Files

| File | Change |
| --- | --- |
| `contactform/static/css/styles.css` | rewritten, hand-written, no framework |
| `contactform/templates/base.html` | Bootstrap out, custom flash markup in |
| `contactform/templates/_fields.html` | new — WTForms field macros |
| `contactform/templates/form.html` | the ticket |
| `contactform/templates/config.html` | new — `/config` gets a plain admin card |
| `contactform/templates/success.html` | restyled |
| `contactform/static/js/app.js` | new — replaces `alert-autoclose.js` |
| `contactform/app.py` | drop `Bootstrap5`, label/copy changes, `booth_copy()` |
| `contactform/odoo_client.py` | `load_countries` returns optgroups |
