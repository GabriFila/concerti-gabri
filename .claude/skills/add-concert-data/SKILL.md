---
name: add-concert-data
description: Collect concert details from Gabri via the questions tool, recap for confirmation, then write them into src/data.ts. Use whenever the user wants to add a new concert or fill in / update the fields of an existing one (voto, vicinanza, canzoni note, companions, ticket, trip origin, etc.) — e.g. "I saw X, what do you need", "add this concert", "fill in the data for Y", "update the Caparezza row".
---

# Adding / updating concert data

The user (Gabri) logs concerts in `src/data.ts`. When he wants to record a show he
attended — or fill in the blanks on a future row that has now happened — **do not
ask for fields free-form and do not make him type a paste-back block**. Use the
questions tool (AskUserQuestion) for anything with a fixed set of answers, then
recap the whole entry in plain text for him to confirm or edit before it's written.
This is the workflow he settled on; follow it exactly.

## Step 1 — Check the date first

Before asking anything else, get today's date and compare it to the concert's date
(the row's `date`, or the day being filled in for an existing future row).

- **Concert date is in the future** (later than today): this is a booked-but-not-yet-
  attended show. **Do not ask about voto, vicinanza, or canzoni note at all** — they
  describe an experience that hasn't happened yet, so they must stay absent from the
  entry (this is what future rows like `Rares` or `Kodaline` in `ALLDATA` already
  look like). Only collect ticket/trip/companions fields.
- **Concert date is today or in the past**: ask about all fields, including the
  experiential ones.

Getting this wrong (asking for a rating on a show that hasn't happened yet) is the
mistake this step exists to prevent.

## Step 2 — Locate or scaffold the row

- Read `src/data.ts` first. If the concert is **already present** (future entries
  often exist with only `cost`/`with`), you're filling in its blanks —
  treat everything already recorded as already answered, don't re-ask it.
- If it's a **new** concert, you're creating a new `Concert` row. If the artist is
  in `WISHLIST`, this is a wish come true — plan to remove it from there (see
  Step 5).
- If it's a **festival** (one ticket/trip bundling ≥2 concerts, see `CLAUDE.md`),
  repeat Steps 3–4 per concert (artist, with, voto, vicinanza, canzoni note, and a
  per-day `date` if multi-day), then once for the shared ticket/trip block. `cost`,
  `gift`/`accredito`, `from`/`km`, `venue`, `city`, `date` and `comments` live on the
  festival, not the concert.

## Step 3 — Ask with the questions tool

Use AskUserQuestion for every field that has a closed set of valid answers, and
skip asking (leave it unset) for anything already known from the data, the user's
message, or ruled out by Step 1. Batch up to 4 questions per call; it supports 1-4
options plus a free-form "Other". Fields to ask this way, each as its own question:

- **VOTO** — overall rating, options "5" down to lower numbers (best-first, since
  higher is better); only when Step 1 allows it.
- **VICINANZA** — options labelled with both the number and `VICINANZA_LABELS` name
  (e.g. "6 Transenna", "5 Sottopalco", ...), best-first; only when Step 1 allows it.
- **CANZONI NOTE** — options labelled with both the number and
  `CANZONI_NOTE_LABELS` name, best-first, plus an "na" option if needed; only when
  Step 1 allows it.
- **BIGLIETTO** — one of: paid (ask the amount as a follow-up, or via "Other" text),
  paid but forgotten, gift, accredito.
- **DA DOVE** — Milano or Genova (home base for the trip).
- **Disambiguation** — anything genuinely ambiguous from the source material: a
  first-name-only companion that matches more than one entry in `PEOPLE` (e.g.
  "Fra" could be "Fra M" or "Fra G"), an uncertain venue, whether a cost mentioned
  by the user is per-ticket or a total across companions, etc.

Free-text fields with no fixed enum — companion names, the venue when it's known
outright, the paid amount, the optional comment — are collected from what the user
already said, or asked for directly in a normal chat message, not via the tool.

## Step 4 — Recap before writing

Before touching `src/data.ts`, send a short plain-text recap of the full entry as
it will be written: artist, date, venue/city, with, voto/vicinanza/canzoniNote (or
"not asked yet — show hasn't happened" if Step 1 skipped them), ticket, trip
origin/km, and comment if any. Ask him to confirm or correct anything before you
write it. Only proceed to Step 5 once he confirms (or edits and then confirms).

## Step 5 — Write the data

Once he's confirmed the recap:

- Map answers to the `Concert`/`Festival` fields. Enum values come straight from the
  types in `src/data.ts` — `voto` 1–5, `vicinanza` 1–6 (6 = transenna, the closest:
  the scale rises with the advantage, see `VICINANZA_LABELS`), `canzoniNote`
  1–5|"na", `from` "m"|"g". Ticket: Paid → `cost` (a number), Paid-but-forgotten →
  `cost:"na"`, Gift → `gift:true`, Accredito → `accredito:true`.
- **`cost:"na"` vs omitting `cost`:** `"na"` means a ticket was bought and the price
  is forgotten; leaving `cost` out means the price isn't defined yet (a future row).
  Both stay out of every money stat — the difference is only what the archive shows
  ("n.d." vs "—"). Never invent or estimate a forgotten price.
- **`comments`:** copy his words verbatim into `comments` (skip the field when he
  left it blank — never write a comment he didn't write). It belongs to the EVENT,
  so on a festival it goes on the row, not on a single set.
- **New people:** any `with` name not in `PEOPLE` must be added to that array
  (keep it roughly alphabetical), or the build fails.
- **Wishlist:** if the artist was in `WISHLIST` (per Step 2), remove it from there
  now — it lives as a real concert in `ALLDATA` from here on.
- **`km`:** never derive it in app code. Reuse the exact `km` of an existing
  `(from, venue)` pair if one exists (e.g. Genova + Arena del Mare = 4); otherwise
  compute it offline with the haversine + jitter recipe in `CLAUDE.md`.
- **New venue/city:** add coordinates to `VENUE_COORDS`/`CITY_COORDS` or the map
  silently skips it.
- Keep `ALLDATA` sorted by date. Match the field order of neighbouring rows.

## Step 6 — Verify & ship

- Run `pnpm build` (typecheck + build) before committing — bad enum values fail it.
- Commit and push to the working branch, then follow the repo's deploy-preview
  workflow in `CLAUDE.md` (open a PR, report the Netlify preview URL). Only merge to
  `main` when the user explicitly asks.
