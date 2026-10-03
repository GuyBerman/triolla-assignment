# Squanchy Fridge Monitor — Claude Code Guide

## Project Overview

A phone-first tool for **Summer Smith**, operations at Squanchy Bakery (12 branches). Branch managers email her temperature-logger files; she used to paste them into one Excel sheet (~3000 rows) every Sunday. This app lets her upload those files, see how every fridge is doing, and answer the Ministry of Health inspector: _"when did this fridge go above five degrees, and for how long?"_

She is **not technical**, and she looks at this **on her phone, between branches**. Copy, status labels, and error messages are written for her, not for a developer.

The one sentence that is really the spec (her words):

> "Sometimes a fridge will show a jump for one reading, and that is fine. But a fridge that is slowly warming up is not fine."

---

## Repo Structure

**Package manager:** `npm`
**Runtime:** Node 20+. Postgres 16 via Docker Compose (host port **5432**).

```
api/                  Express 4 + TypeScript (ESM, run with tsx — no build step)
  migrations/         node-pg-migrate TypeScript migrations (auto-run on boot)
  src/ingest/         parse logger files: headers, dates, units, duplicates
  src/analysis/       decide what is wrong: excursions, drift, gaps, status
  src/services/       load readings, run analysis, shape the response
  src/routes/         HTTP
  scripts/            seed + sample-data generator
  tests/              vitest, pure functions only (no DB, no HTTP)
app/                  Expo SDK 57 / React Native 0.86 / React 19
  src/screens/        Branches, branch fridges, search, detail, upload, rules, inspector
  src/api/            client + hand-mirrored types
data/                 sample CSVs in deliberately different shapes (~3291 rows)
PLAN.md               original plan, committed unedited (including mistakes)
NOTES.md              judgement calls, open questions, AI-tool mistakes
README.md             clone-to-running
docker-compose.yml    Postgres 16 only
```

---

## Key Commands

From repo root:

```bash
docker compose up -d          # Postgres on localhost:5432
```

API (`api/`):

```bash
npm install
npm run seed                  # migrate + load data/*.csv through the real ingest path
npm run seed -- --reset       # wipe tables first (also clears ingest_rules)
npm run dev                   # http://localhost:4000  (tsx watch, migrations on boot)
npm test                      # vitest — must stay green
npm run typecheck             # tsc --noEmit
npm run migrate:create -- name_here
```

App (`app/`):

```bash
npm install
npx expo start                # press w for web (http://localhost:8081)
npm run typecheck
```

Health check: `http://localhost:4000/api/health`

After **every** code change: `npm run typecheck` in the package you touched. After ingest/analysis changes: `npm test` in `api/`. After UI changes: exercise the flow in the browser, not just a screenshot.

---

## Tech Stack

### Backend (`api/`)

- **Express 4**, `"type": "module"`, **tsx** (no `dist/`, `noEmit: true`)
- **pg** driver, raw SQL, **no ORM**
- **node-pg-migrate** v9 — `runner` named export, TypeScript migrations, `singleTransaction: true`
- **csv-parse** 7, **multer** 2 (not 1.x — that had a critical advisory)
- **vitest** 5, `globals: false` — always `import { describe, expect, it } from 'vitest'`
- Defaults in `src/config.ts` so no `.env` is required:
  - `DATABASE_URL=postgres://postgres:postgres@localhost:5432/squanchy`
  - `LOGGER_TIMEZONE=Asia/Jerusalem`
  - `PORT=4000`

### Frontend (`app/`)

- **Expo 57** + **React Native 0.86** + **React 19**
- **React Navigation** bottom-tabs + native-stack
- **react-native-svg** — charts are hand-rolled (see below)
- **expo-document-picker**, **expo-clipboard**, **@expo/vector-icons** (Ionicons)
- API URL from `expo-constants` `hostUri` so a physical phone works (never hardcode `localhost` as the only option)
- Style with `StyleSheet` + `app/src/theme.ts`. No NativeWind, no Tamagui, no charting library.

---

## Product Rules (do not violate)

These are load-bearing. A change that typechecks but produces a sentence Summer would be wrong to believe is a bug.

1. **A one-reading jump is a door opening, not an alarm.** Sustained time above the fridge's limit (default 30 min, `ANALYSIS.excursionMinDurationMinutes`) is an excursion. Below that: `doorEvents`, never `alarm`.
2. **Never claim a fridge was warm across a hole in the data.** Break runs at gaps. Inventing a six-hour violation for an inspector is worse than saying "we don't know".
3. **`ERR` is not zero.** Store as `status: 'error'`, `temp_c: null`. A failed reading must not split a real violation in two, and must not look like a cold fridge.
4. **"No data" outranks "ok".** A silent logger is not a cold fridge. Status order: `alarm` > `no_data` > `warning` > `ok`.
5. **`asOf` is the newest reading in the dataset, not the wall clock.** She uploads weekly batches. Clock-based staleness greys out the whole dashboard hours after every upload.
6. **A recovered breach stays a warning for the period on screen.** Do not turn a fridge green with "nothing above 5.0°C for long enough to matter" days after it sat at 8°C. That sentence is only for fridges that truly had no excursion.
7. **Drift uses median-of-halves (`robustTrend`), never least-squares.** A door-opening spike tilts OLS and reports a healthy fridge as "warming up: 4.0°C to 3.6°C". Require `driftMinWindowHours` and `driftMinRiseC` as well as slope — 0.1° of noise over 90 minutes is not a trend.
8. **Displayed numbers must add up.** Derive deltas from the rounded values shown, not from pre-rounded floats (`"4.0°C to 4.4°C (+0.5°)"` is forbidden).
9. **A rejected upload leaves no phantom fridge.** Resolve units and drop untrusted loggers _before_ creating branches/fridges.
10. **Logger-to-fridge is a time window** (`logger_assignments.valid_from` / `valid_to`), not a column on the fridge. Moving `TL-0417` from Walk-in to Display 2 must not rewrite history.
11. **Dedup is `UNIQUE (logger_id, recorded_at)` + `ON CONFLICT DO NOTHING`.** Application-level "did we see this" is not enough; she re-pastes overlapping files.
12. **Conversion rules apply at the next ingest, not retroactively.** Re-uploading the same file is skipped as duplicates, so a new rule will not rewrite existing rows.

Defaults and the clamps that are not a judgement (cadence, minimum readings) live in `api/src/analysis/config.ts`. The judgements she can change are a row in `analysis_settings`, edited on the Settings tab, and passed into `analyseReadings`. Analysis does not read the database. Do not scatter magic numbers. Only "above five degrees" came from Summer; everything else is a guess listed in `NOTES.md`.

---

## Ingestion (`api/src/ingest/`)

Pipeline is pure functions, then `ingestFile` writes through them. **Seed must go through `ingestFile`**, not a SQL shortcut. If seeding works, uploading works.

| Concern      | Module           | Notes                                                                                                                                        |
| ------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Column names | `headers.ts`     | Synonym match, never positional. Exact before substring.                                                                                     |
| Dates        | `timestamp.ts`   | ISO + day-first. Wall clock → UTC via `Asia/Jerusalem`. Two-pass DST.                                                                        |
| Units        | `temperature.ts` | `ERR` refused as a number. Median > 30°C on a "C" logger → reject the file (actionable message). 20–30 → warn (a dead fridge can sit at 22). |
| Names        | `names.ts`       | `canonicalize` folds `tel aviv` ≡ `Tel Aviv`, `Be'er Sheva` ≡ `Beer Sheva`.                                                                  |
| File shape   | `parseFile.ts`   | Detect delimiter (comma/tab/semicolon/pipe). `.xlsx` via exceljs. In-file dedup. Spreadsheet row numbers.                                    |
| Scale rules  | `conversion.ts`  | Per-branch/fridge/logger `×` and `+` after unit conversion. Most specific match wins.                                                        |
| Persist      | `ingest.ts`      | Three stages: unit-check → create entities for survivors → convert + insert.                                                                 |

The number in the file is stored as written. A header or a cell suffix does not convert it, and a high median does not refuse the file. Conversion happens only when a rule says so: "treat as Fahrenheit" converts, then × and + run. "As written" multiplies the file number itself.

Sample files in `data/` are traps, not decoration: Fahrenheit + day-first + `ERR` (Haifa), reordered columns, Tel Aviv logger move, Rishon ramp, Jerusalem duplicate row. Do not "clean them up".

---

## API

Mounted at `/api`:

| Method          | Path                                  | Purpose                                                                    |
| --------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| GET             | `/health`                             | API + DB                                                                   |
| GET             | `/fridges`                            | every fridge, worst-first, plain-language `statusReason`                   |
| GET             | `/fridges/:id?days=`                  | readings, excursions, door events, gaps                                    |
| PUT             | `/fridges/:id`                        | that fridge's degree limit (`thresholdC`)                                  |
| GET             | `/search?q=&aboveC=`                  | name filter and/or "reached this °C"; status recomputed against `aboveC`   |
| GET             | `/reports/excursions?days=&fridgeId=` | inspector answer; **include fridges with zero excursions**                 |
| POST            | `/uploads`                            | multipart `file`                                                           |
| GET             | `/uploads`                            | history                                                                    |
| GET/POST/DELETE | `/rules`                              | ingest conversion rules                                                    |
| GET/PUT         | `/settings`                           | the judgements she can change (how long is too warm, silence, drift, gaps) |

Unparseable date query params **fall back**, they do not become `Invalid Date` (that produces an empty report that looks like a clean record).

Shared types live in `api/src/types/` (`fridge.ts`, `upload.ts`, `rules.ts`, `ingest.ts`, `analysis.ts`, `report.ts`, `settings.ts`), including the Postgres row shapes. The JSON the app sees is **hand-mirrored** in `app/src/api/types.ts`. Edit both. There is no shared package on purpose.

---

## Frontend (`app/`)

### Navigation

```
Tabs: Fridges | Search | Upload | Rules | Inspector
Settings: header button on Branches, and Rules → Settings. Same judgements as `GET/PUT /settings`.
Fridges stack: Dashboard (branches, worst-first) → Branch (all fridges) → FridgeDetail
Search stack: Search (name and/or custom °C) → FridgeDetail
```

Summer thinks in branches. Do not go back to a flat list of 20 fridges on the home screen.

Search is for a different question than the dashboard: "what if I care about 10°C, not 5?" Matching is by **peak reading**, not only a 30-minute excursion, so a brief spike still shows up. Status on those cards is judged against the typed number. Opening a fridge still uses the stored limit.

### Copy

- Status labels: Too warm / No data / Watch / OK — not alarm/warning.
- Reasons are sentences. Lead with the fact, not a number.
- Upload failures say what to change (`That file is empty.`), not `400 Bad Request`.

### Chart

`TemperatureChart` is hand-rolled SVG **so the line breaks across gaps**. A charting library that interpolates over missing data draws an unmonitored fridge as a comfortably cold one. Gap bands and excursion bands stay.

### Layout

Phone-first. Content `maxWidth: 560` so desktop web is not a 1200px-wide card with the temperature on the far right. Theme tokens in `src/theme.ts` — do not invent a second palette.

### API client

`src/api/client.ts`:

- Web: `File` / blob into `FormData`
- Native: `{ uri, name, type }` (the RN fetch shape)
- Do not set `Content-Type` on multipart by hand
- `EXPO_PUBLIC_API_URL` overrides; otherwise host from Expo `hostUri` + port 4000

---

## Tests

`api/tests/`. Named after the **rule they protect**, not the function they call:

```
✓ does not treat a door opening as a violation
✓ is not fooled by a single door opening
✓ never reports a direction its own numbers contradict
✓ will not claim a fridge was warm across a hole it cannot see into
✓ refuses ERR rather than reading it as zero
✓ is still flagged days later, not quietly turned green
```

`api/tests/fixtures/brief-sample.tsv` is Summer's 16 rows **verbatim**. Do not tidy it.

No DB in tests. If a change needs a DB assertion, extract a pure function and test that.

After changing analysis or ingest, add a regression test for the failure mode, not just a happy path.

---

## Database

- Schema only via **migrations** in `api/migrations/`. They run automatically on API/seed boot (`migrateUp` after `waitForDb`).
- Create with `npm run migrate:create -- description` from `api/`.
- `down` must fully reverse. Do not use `CREATE TABLE IF NOT EXISTS` as the schema strategy — it will not alter existing tables.
- `temp_c` is `double precision`, **not `numeric`** (node-postgres returns `numeric` as a string).
- Seed `--reset` truncates: `readings, logger_assignments, uploads, loggers, fridges, branches, ingest_rules`.

---

## Coding Conventions

### Comments

Comment the **why**, especially judgement calls and bugs already made. Do not narrate what the next line does. This codebase's comments are part of the assignment evidence (NOTES points at them).

```ts
// ❌
// Loop over the rows and convert temperature
for (const row of rows) { ... }

// ✅
// Deliberately before branches and fridges are created. A file rejected
// for a bad unit should leave no trace.
```

### Types

String-union types (`FridgeStatus`, `RuleUnit`), not TypeScript `enum`. Strict mode, `noUncheckedIndexedAccess`.

### Scope (do not add unless asked)

No auth, no users, no push/email alerts, no PDF, no paid APIs, no cloud deploy. Each is listed in `NOTES.md` as a gap rather than a half-implementation. `.xlsx` is supported (not old `.xls`).

Do not "clean up" `PLAN.md` — it is the plan as written before code, including the line that said there would be no migration tool.

### Git

Repo-local identity only (never `git config --global`). Do not commit `.env` or secrets. Do not force-push. Incremental commits matching the existing style (Phase N: why, not a file list).

---

## How to verify

1. `cd api && npm test && npm run typecheck`
2. `cd app && npm run typecheck`
3. UI: open `http://localhost:8081`, click through the **actual path you changed** (branch → fridge → upload → rules → inspector). A screenshot of the first paint is not verification.
4. Read the sentence the dashboard shows. If Summer would be wrong to believe it, it is not done.

The useful review question is not "is this code correct" but **"read me the sentence this shows Summer, and tell me whether she would be right to believe it."**
