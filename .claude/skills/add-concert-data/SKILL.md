---
name: add-concert-data
description: Collect concert details from Gabri via a fill-in template, then write them into src/data.ts. Use whenever the user wants to add a new concert or fill in / update the fields of an existing one (voto, vicinanza, canzoni note, companions, ticket, trip origin, etc.) — e.g. "I saw X, what do you need", "add this concert", "fill in the data for Y", "update the Caparezza row".
---

# Adding / updating concert data

The user (Gabri) logs concerts in `src/data.ts`. When he wants to record a show he
attended — or fill in the blanks on a future row that has now happened — **do not
ask for the fields one by one**. Present a single copy-paste template he fills and
pastes back. This is the workflow he settled on; follow it exactly.

## Step 1 — Locate or scaffold the row

- Read `src/data.ts` first. If the concert is **already present** (future entries
  often exist with only `cost`/`with`), you're filling in its blanks —
  prefill everything already recorded.
- If it's a **new** concert, you're creating a new `Concert` row.
- If it's a **festival** (one ticket/trip bundling ≥2 concerts, see `CLAUDE.md`),
  present one per-concert block (artist, with, voto, vicinanza, canzoni note, and a
  per-day `date` if multi-day) plus a shared ticket/trip block. `cost`,
  `gift`/`accredito`, `from`/`km`, `venue`, `city`, `date` and `comments` live on the
  festival, not the concert.

## Step 2 — Present the template

Rules the template must obey (these are the corrections Gabri asked for, in order):

1. **The legend is inside the template** — it must be self-contained so the copied
   text explains itself. Don't put the legend only in your chat reply.
2. **Don't assume unknown values.** Leave experiential fields (voto, vicinanza,
   canzoni note) and anything not already in the data blank. Only prefill what's
   genuinely recorded in `src/data.ts` already.
3. **Mutually exclusive fields are checkbox lists**, so he can't enter an invalid
   enum. He marks exactly one `[X]`. Applies to: voto, vicinanza, canzoni
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

VOTO (overall rating, 1 worst → 5 best):
  [ ] 1   [ ] 2   [ ] 3   [ ] 4   [ ] 5

VICINANZA (how close to the stage, 6 best → 1 worst):
  [ ] 6  Transenna   (front rail)
  [ ] 5  Sottopalco  (right by the stage)
  [ ] 4  Centro      (mid floor)
  [ ] 3  Fondo       (back of the floor)
  [ ] 2  Tribuna     (seated stand)
  [ ] 1  Anello alto (top tier / farthest)

CANZONI NOTE (share of setlist you already knew):
  [ ] 1  Nessuna     (none)
  [ ] 2  Poche       (few)
  [ ] 3  Circa metà  (about half)
  [ ] 4  Molte       (many)
  [ ] 5  Tutte       (all)
  [ ] na  can't recall

BIGLIETTO (ticket — pick one):
  [ ] Paid — cost in €:  __________
  [ ] Paid — non ricordo quanto (can't recall the price)
  [ ] Gift (regalo, someone gave it to me)
  [ ] Accredito (guest list / press — free, not a present)

DA DOVE (trip origin / home base — pick one):
  [ ] Milano
  [ ] Genova

COMMENTO (optional — free text on the evening; leave blank if you have nothing to say):
  ______________________________________________________
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

After the block, add two short notes (outside the copy area): **`km`** is computed by
you once the origin is picked (he doesn't fill it), and any **new `with`** name will
be registered in `PEOPLE`.

## Step 3 — Write the data

When he pastes it back:

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
