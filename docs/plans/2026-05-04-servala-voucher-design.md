# Servala Voucher — Design

Date: 2026-05-04
Status: Validated, ready for implementation plan

## Goal

Add a Servala voucher option to the contactform print pipeline, alongside the existing APPUiO voucher. The voucher type is selectable per event via the config form. The Servala voucher uses a per-event static code (every printed voucher carries the same code), while the per-user raffle code continues to be generated and used as the per-lead identifier.

The existing APPUiO voucher design and behavior are preserved verbatim.

## Spec for the Servala voucher

Printed text:

> Hi {Name}.
> Your personal voucher code to try Servala, the Sovereign App Store: {Code}.
> Start here: https://portal.servala.com.

Plus a QR code pointing to the same URL, and a small staff-only identifier showing the per-user raffle code in the corner of the label.

## Design decisions

### 1. Voucher selection model

Replace the existing `PRINT_APPUIO_VOUCHER` boolean with a tri-state `VOUCHER_TYPE` enum: `none` / `appuio` / `servala`. One event = one voucher type; combinations like "both on" are not meaningful.

### 2. Static Servala code — storage and editing

`SERVALA_VOUCHER_CODE` follows the same pattern as `CAMPAIGN_NAME` etc.: env var sets the default, the config form overrides and persists to `config.json`. This lets booth staff change the code mid-event without a redeploy.

### 3. Per-user code on the Servala label

The static code is shown prominently. The per-user raffle `voucher_code` is also printed on the Servala label in small font in the bottom-right corner, for staff identification if a customer brings the voucher back without their raffle ticket. The raffle ticket itself is unchanged.

### 4. Servala logo

A new asset `contactform/static/images/servala-bw.png` (sourced from `tmp/Servala-3.png`). Black-on-transparent wordmark, used in the same `<img class="logo">` slot as the APPUiO logo. Likely needs `.logo { width: ~50% }` instead of 70% due to the wider aspect ratio — confirm during implementation.

### 5. Servala signup URL

Configurable via `SERVALA_SIGNUP_URL` env var, default `https://portal.servala.com`. Mirrors the existing `APPUIO_SIGNUP_URL` pattern. Both the printed text and the QR code use this value.

## Components

### Configuration (`contactform/config.py`)

New env vars:

- `VOUCHER_TYPE` — default `"appuio"`. Values: `none` / `appuio` / `servala`.
- `SERVALA_VOUCHER_CODE` — default `""`.
- `SERVALA_SIGNUP_URL` — default `"https://portal.servala.com"`.
- `SERVALA_LOGO_PATH` — default `"contactform/static/images/servala-bw.png"`.

Removed: `PRINT_APPUIO_VOUCHER`.

`config.json` persistence: replace the `PRINT_APPUIO_VOUCHER` key with `VOUCHER_TYPE` and `SERVALA_VOUCHER_CODE`. On load, a one-shot migration maps a legacy `PRINT_APPUIO_VOUCHER` key to `VOUCHER_TYPE` (`true → "appuio"`, `false → "none"`) so existing deployments don't need manual file edits.

### Config form (`contactform/app.py`)

`ConfigForm`:
- `print_appuio_voucher: BooleanField` → `voucher_type: SelectField` with choices `[("none","None"), ("appuio","APPUiO"), ("servala","Servala")]`.
- New `servala_voucher_code: StringField` (optional; empty allowed when type is none/appuio).

`config_endpoint()` instantiates the form from `config.VOUCHER_TYPE` / `config.SERVALA_VOUCHER_CODE` and writes them back on submit.

### Voucher rendering (`contactform/label_voucher.py`)

Refactor:

- `print_voucher` → renamed to `print_appuio_voucher`. HTML, CSS, and behavior unchanged.
- New `print_servala_voucher(name, voucher_code, config, printer_config)` — `voucher_code` is the per-user raffle code, rendered only as the small corner identifier.
- New private helper `_render_and_print(label_html, css, extra_files, label_filename, name_data, config, printer_config)` — owns the html2image setup, label generation, print call, and tempfile cleanup. Both voucher functions delegate the pipeline to it.

Servala label HTML structure:

```
[ Servala wordmark logo, .logo ]
"Hi {name}."                       .text
"Your personal voucher code to try
 Servala, the Sovereign App Store:" .text
"{SERVALA_VOUCHER_CODE}"            .text (bold)
"Start here: {SERVALA_SIGNUP_URL}"  .text_small
[ QR code → SERVALA_SIGNUP_URL ]
"#{voucher_code}"                   .identifier (small, bottom-right)
```

New CSS class `.identifier` (approx: `position: fixed; bottom: 10px; right: 15px; font-size: 18px; color: #888;`).

QR code is built from `SERVALA_SIGNUP_URL` as-is — no query parameters, since the code is static and the URL is not personalized.

### Lead-submission wiring (`contactform/app.py`, `index()`)

```python
if config.VOUCHER_TYPE == "appuio":
    threading.Thread(target=print_appuio_voucher, args=(...)).start()
elif config.VOUCHER_TYPE == "servala":
    if not config.SERVALA_VOUCHER_CODE:
        logging.error("VOUCHER_TYPE=servala but SERVALA_VOUCHER_CODE is empty; skipping voucher print")
    else:
        threading.Thread(target=print_servala_voucher, args=(name_data, voucher_code, config, printer_config)).start()
# VOUCHER_TYPE == "none" → no voucher printed
```

Raffle ticket logic is untouched. `voucher_code` continues to flow into `print_raffle` and the CSV.

### Odoo lead description

Voucher-type-aware:

```python
voucher_label = {"appuio":  "APPUiO Voucher Code",
                 "servala": "Raffle Code",
                 "none":    "Raffle Code"}[config.VOUCHER_TYPE]
"description": f"{form.notes.data}<br><br>{voucher_label}: {voucher_code}",
```

For Servala the per-event static code is the same for every lead, so it adds no value to the lead description; only the per-user code is logged.

### Templates

`form.html` and `success.html` — to be checked during implementation for any APPUiO-specific text. If present, parameterize off `config.VOUCHER_TYPE`.

## Verification checklist

1. `VOUCHER_TYPE=appuio` → existing APPUiO label prints identically to before (visual diff).
2. `VOUCHER_TYPE=servala` + `SERVALA_VOUCHER_CODE=XYZ123` → Servala label prints with logo, name, static code, signup URL, QR resolves to portal.servala.com, small per-user code visible in corner.
3. `VOUCHER_TYPE=servala` + empty `SERVALA_VOUCHER_CODE` → voucher print skipped, error logged, raffle still prints.
4. `VOUCHER_TYPE=none` → only raffle prints.
5. Config form: switching voucher type and saving persists to `config.json`.
6. Existing `config.json` with legacy `PRINT_APPUIO_VOUCHER` key loads as the equivalent `VOUCHER_TYPE` on first start.
7. Odoo lead description shows correct label per voucher type.
