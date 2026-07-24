---
name: add-concert-data
description: Collect concert details from Gabri via a fill-in template, then write them into src/data.ts. Use whenever the user wants to add a new concert or fill in / update the fields of an existing one (voto, vicinanza, canzoni note, companions, ticket, posto, trip origin, etc.) — e.g. "I saw X, what do you need", "add this concert", "fill in the data for Y", "update the Caparezza row".
---

# Adding / updating concert data

The user (Gabri) logs concerts in `src/data.ts`. When he wants to record a show he
attended — or fill in the blanks on a future row that has now happened — **do not
ask for the fields one by one**. Present a single copy-paste template he fills and
pastes back. This is the workflow he settled on; follow it exactly.

## Step 1 — Locate or scaffold the row

- Read `src/data.ts` first. If the concert is **already present** (future entries
  often exist with only `posto`/`cost`/`with`), you're filling in its blanks —
  prefill everything already recorded.
- If it's a **new** concert, you're creating a new `Concert` row.
- If it's a **festival** (one ticket/trip bundling ≥2 concerts, see `CLAUDE.md`),
  present one per-concert block (artist, with, voto, vicinanza, canzoni note, and a
  per-day `date` if multi-day) plus a shared ticket/trip block. `posto`, `cost`,
  `gift`/`accredito`, `from`/`km`, `venue`, `city`, `date` live on the festival, not
  the concert.

## Step 2 — Present the template

Rules the template must obey (these are the corrections Gabri asked for, in order):

1. **The legend is inside the template** — it must be self-contained so the copied
   text explains itself. Don't put the legend only in your chat reply.
2. **Don't assume unknown values.** Leave experiential fields (voto, vicinanza,
   canzoni note) and anything not already in the data blank. Only prefill what's
   genuinely recorded in `src/data.ts` already.
3. **Mutually exclusive fields are checkbox lists**, so he can't enter an invalid
   enum. He marks exactly one `[X]`. Applies to: posto, voto, vicinanza, canzoni
   note, ticket type, trip origin.
4. **Prefill known fields** with the `[X]` already placed / value filled in.
5. No filler underscores after a prefilled free-text value (e.g. the names line).

Use this exact shape (adapt the header and the prefilled marks to the actual row):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<ARTIST> · <dd/mm/yyyy> · <venue>, <city>
(mark exactly one [X] where there are boxes; fill the blanks)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CON CHI (with) — list names, comma-separated:
  <prefill known names, else leave blank>

POSTO (where you stood — pick one):
  [ ] Gradinata
  [ ] Pit/Gold
  [ ] Platea
  [ ] Prato/Parterre

VOTO (overall rating, 1 worst → 5 best):
  [ ] 1   [ ] 2   [ ] 3   [ ] 4   [ ] 5

VICINANZA (how close to the stage):
  [ ] 1  Transenna (front rail)
  [ ] 2
  [ ] 3
  [ ] 4
  [ ] 5
  [ ] 6  Anello alto (top tier / farthest)

CANZONI NOTE (share of setlist you already knew):
  [ ] 1  Nessuna     (none)
  [ ] 2  Poche       (few)
  [ ] 3  Circa metà  (about half)
  [ ] 4  Molte       (many)
  [ ] 5  Tutte       (all)
  [ ] na  can't recall

BIGLIETTO (ticket — pick one):
  [ ] Paid — cost in €:  __________
  [ ] Gift (regalo, someone gave it to me)
  [ ] Accredito (guest list / press — free, not a present)

DA DOVE (trip origin / home base — pick one):
  [ ] Milano
  [ ] Genova
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

After the block, add two short notes (outside the copy area): **`km`** is computed by
you once the origin is picked (he doesn't fill it), and any **new `with`** name will
be registered in `PEOPLE`.

## Step 3 — Write the data

When he pastes it back:

- Map answers to the `Concert`/`Festival` fields. Enum values come straight from the
  types in `src/data.ts` — `posto`, `voto` 1–5, `vicinanza` 1–6, `canzoniNote`
  1–5|"na", `from` "m"|"g". Ticket: Paid → `cost`, Gift → `gift:true`, Accredito →
  `accredito:true`.
- **New people:** any `with` name not in `PEOPLE` must be added to that array
  (keep it roughly alphabetical), or the build fails.
- **`km`:** never derive it in app code. Reuse the exact `km` of an existing
  `(from, venue)` pair if one exists (e.g. Genova + Arena del Mare = 4); otherwise
  compute it offline with the haversine + jitter recipe in `CLAUDE.md`.
- **New venue/city:** add coordinates to `VENUE_COORDS`/`CITY_COORDS` or the map
  silently skips it.
- Keep `ALLDATA` sorted by date. Match the field order of neighbouring rows.

## Step 4 — Verify & ship

- Run `pnpm build` (typecheck + build) before committing — bad enum values fail it.
- Commit and push to the working branch, then follow the repo's deploy-preview
  workflow in `CLAUDE.md` (open a PR, report the Netlify preview URL). Only merge to
  `main` when the user explicitly asks.
