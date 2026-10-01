# Squanchy Bakery — Fridge Monitor

Upload the temperature logger files the branches send in, see how every fridge
across all twelve branches is doing on one screen, and answer the inspector's
question — *when did this fridge go above five degrees, and for how long?* —
without opening a spreadsheet.

Built for a phone, because that is where it will be used.

| Dashboard | Fridge detail | Inspector report |
| --- | --- | --- |
| Worst fridge first, in plain English | Chart with the 5°C line, gaps and breaches marked | Copyable answer for the Ministry of Health |

---

## Running it

You need **Docker Desktop** (running) and **Node 20 or newer**. Nothing else,
no accounts, no cloud services. Takes about three minutes, most of it `npm
install`.

### 1. Start the database

```bash
docker compose up -d
```

Postgres comes up on host port **5433** (not 5432, so it will not fight with a
Postgres you may already have running).

### 2. Start the API

```bash
cd api
npm install
npm run seed      # loads the sample logger files from data/
npm run dev
```

`npm run seed` creates the schema if it does not exist, then imports the sample
files. You should see:

```
[seed] done: 12 branches, 20 fridges, 3291 readings
```

The API is now on <http://localhost:4000>. Check it with
<http://localhost:4000/api/health>.

> The database schema is applied by migrations that run automatically whenever
> the API or the seed script starts, so there is no SQL to run by hand.

### 3. Start the app

In a second terminal:

```bash
cd app
npm install
npx expo start
```

Then either:

- **press `w`** to open it in a browser — quickest way to look around; or
- **scan the QR code** with [Expo Go](https://expo.dev/go) on your phone, which
  is what it was designed for. The app works out your machine's address from
  Expo itself, so the phone finds the API with no configuration.

---

## What to look at

The sample data is four and a half days across twelve branches and twenty
fridges, and it contains deliberate problems. Opening the dashboard, worst
first:

| Fridge | What it shows |
| --- | --- |
| **Netanya Dairy** | Slowly died over four days and is now at 8.3°C — still above the limit. This is the case that costs money. |
| **Petah Tikva Display 1** | Stopped reporting mid-week. Grey, not green: a silent logger is not a cold fridge. |
| **Tel Aviv Walk-in** | Its logger was moved to Display 2 on 17 Sept, so nothing has been watching it since — and the app says exactly that, rather than just "no data". |
| **Holon Walk-in** | Warming up but still under 5°C. Flagged *before* anything is breached, which is the only warning that arrives in time to act on. |
| **Rishon LeZion Cream cakes** | Spent 3h45m at up to 8°C on 14 Sept, then recovered. Still amber, because something happened and somebody has to decide about the stock. |
| **Tel Aviv Walk-in**, 14 Sept 06:15 | One reading at 9.4°C between two normal ones. Recorded as a door opening, *not* an alarm. |

Open any fridge for its chart. Tap **Inspector report** for the copyable
summary.

### Try an upload

Go to the **Upload** tab and pick any file from `data/`. Things worth trying:

- **Upload the same file twice.** The second time imports nothing and says so.
  Summer pastes overlapping exports together, so this has to be safe.
- **`data/haifa-dairy.csv`** is in Fahrenheit with day-first dates and contains
  an `ERR` row. It reports what it converted and what it could not read.
- **`data/other-branches.csv`** has its columns in a different order with
  different names. Column order is never assumed.

---

## The API

| | |
| --- | --- |
| `GET /api/health` | API and database status |
| `GET /api/fridges` | every fridge with its current status and a plain-language reason |
| `GET /api/fridges/:id?days=3` | readings, breaches, door openings and gaps for one fridge |
| `GET /api/reports/excursions?days=30&fridgeId=` | the inspector report |
| `POST /api/uploads` | multipart `file`; returns a full import report |
| `GET /api/uploads` | past uploads |

```bash
curl "http://localhost:4000/api/reports/excursions?days=30" | less
curl -F "file=@data/haifa-dairy.csv" http://localhost:4000/api/uploads
```

---

## Tests

```bash
cd api && npm test
```

115 tests, no database or network needed — the parsing and analysis are pure
functions. They are named after the rules they protect rather than the
functions they call, so the suite reads as a list of the judgement calls this
tool makes:

```
✓ does not treat a door opening as a violation
✓ is not fooled by a single door opening
✓ will not claim a fridge was warm across a hole it cannot see into
✓ refuses ERR rather than reading it as zero
✓ never reports a direction its own numbers contradict
```

`api/tests/fixtures/brief-sample.tsv` is the sixteen rows from Summer's email,
exactly as written, used as a regression fixture.

---

## Layout

```
api/            Express + TypeScript
  migrations/   schema, applied automatically on start
  src/ingest/   reading the files: headers, dates, units, duplicates
  src/analysis/ deciding what is wrong: breaches, drift, gaps, status
  src/routes/   the HTTP layer
  scripts/      seed and sample-data generator
  tests/
app/            Expo React Native + TypeScript
data/           sample logger files, in deliberately different shapes
PLAN.md         the plan this was built from, before any code
NOTES.md        decisions, open questions, and what is not done
```

`api/src/analysis/config.ts` holds every threshold this tool judges by — the
5°C limit, how long a breach must last to count, what counts as drift — in one
file with the reasoning next to each. Start there to change its mind about
anything.

---

## If something does not work

**`npm run seed` cannot connect / `ECONNREFUSED`**
Docker Desktop is not running, or the container has not finished starting.
`docker compose ps` should show `squanchy-postgres` as healthy. The API retries
for 15 seconds on startup, so usually waiting is enough.

**Port 5433 or 4000 already in use**
Change the host port in `docker-compose.yml`, or set `PORT` and `DATABASE_URL`
in `api/.env`.

**The app says it cannot reach the API**
On a phone, your laptop and phone must be on the same network. Otherwise set
`EXPO_PUBLIC_API_URL` in `app/.env` to your machine's LAN address, e.g.
`http://192.168.1.20:4000`.

**Starting over**

```bash
docker compose down -v && docker compose up -d
cd api && npm run seed
```

**Dates come out a day wrong**
Logger timestamps are read as Israel time and days before months — see
NOTES.md, which explains the assumption and how to change it.
