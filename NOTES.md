# Notes

## How long it took

About five hours end to end: roughly 40 minutes reading the email and planning
(the result is in [PLAN.md](PLAN.md), committed before any code was written),
then the build in four phases, then docs and a clean-room check that the README
actually works from `docker compose down -v`.

The time did not go where I expected. Reading the files correctly and deciding
*what counts as a problem* took far longer than the API, the database and all
four screens put together. That split feels right for this problem: Summer's
pain is not that she lacks a dashboard, it is that the answers are hard to get
out of the data.

## The one thing that mattered most

Summer's email contains one sentence that is really the whole specification:

> "Sometimes a fridge will show a jump for one reading, and that is fine. But a
> fridge that is slowly warming up is not fine."

Everything else is a detail. A tool that cannot tell a door opening from a
failing fridge will either cry wolf until she stops reading it, or stay quiet
while stock spoils — and she has already told us she misses things. So the
analysis is built around that distinction rather than around a threshold
alarm, and most of the test suite exists to defend it.

Her sixteen sample rows are also not a sample. They are a test fixture, and
nearly every row has something wrong with it. They are committed verbatim as
[`api/tests/fixtures/brief-sample.tsv`](api/tests/fixtures/brief-sample.tsv).
What is hidden in them:

| In the data | What it is | Handled in |
| --- | --- | --- |
| Haifa at 38.3, 39.0 | Fahrenheit, not a broken fridge | `ingest/temperature.ts` |
| `14/09/2026` vs `2026-09-14` | two date formats in one upload | `ingest/timestamp.ts` |
| `ERR` | a failed reading, not a zero | `ingest/temperature.ts` |
| Jerusalem 06:15 twice | duplicate row from pasting | `UNIQUE (logger_id, recorded_at)` |
| Tel Aviv 05:45 after 06:30 | rows out of order | `ingest/parseFile.ts` |
| `tel aviv` vs `Tel Aviv` | same branch, two spellings | `ingest/names.ts` |
| `TL-0417` on Walk-in, then Display 2 | a logger was physically moved | `logger_assignments` |
| Tel Aviv 9.4 between two 4s | a door opening | `analysis/excursions.ts` |
| Rishon 4.6 → 7.1 climbing | a fridge dying | `analysis/drift.ts` |
| Only one `Time` column | date and time together, not split | `ingest/headers.ts` |

---

## Decisions Summer did not ask for

She was unreachable, so these are judgement calls. Each one is a place where I
had to invent a rule, and each is a question for her in the next section.

**A breach has to last 30 minutes to count.** This is the single most
consequential number in the system and it is a guess. Her "jump for one
reading is fine" sets a floor, and the Ministry of Health presumably sets the
real figure, but nobody told me what it is. It lives in
[`api/src/analysis/config.ts`](api/src/analysis/config.ts) as one line with the
reasoning next to it. **This is the first thing to check against the actual
regulation** — if the real rule is 15 minutes, the Rishon report changes.

**Warn about fridges that are still within limits.** A threshold alarm cannot
fire until the stock is already warm, which means it would not have saved the
Rishon dairy. Drift detection is the only check here that arrives in time to
act on, so it exists even though she did not ask for it.

**A warm period is never allowed to span a gap in the data.** If a logger goes
quiet for six hours and comes back warm, we do not know it was warm the whole
time. Reporting that as one six-hour violation would be inventing evidence, in
a tool whose output goes to a health inspector. Runs break at gaps instead.

**"No data" is its own state, and it is worse than "fine".** A silent logger
is not a cold fridge. Conflating the two is how Petah Tikva would be missed.

**A fridge that breached and recovered stays amber for the week.** It is
working now, but stock sat warm for hours and somebody still has to decide
about it. See the AI section below, because this one started out wrong.

**Logger assignments are time windows, not a column on the fridge.** `TL-0417`
moving to Display 2 is a fact with a date, not an edit. Without this, moving a
logger silently rewrites the history of both fridges — and the vacated fridge
would look fine rather than unmonitored.

**Dates are read day-first, and timestamps as Israel time.** `14/09/2026` is
unambiguous, but `05/09/2026` is not, and the files carry no timezone at all.
Both assumptions are stated, both are in one place
(`LOGGER_TIMEZONE`, `ingest/timestamp.ts`), and the app tells her when it had
to guess. Getting this wrong by a day in an inspector report would be
embarrassing in a way a bug usually is not.

**"Now" means the newest reading in the data, not the clock.** She uploads
weekly batches. Measuring staleness against wall-clock time would turn the
whole dashboard grey a few hours after every upload.

**A file in the wrong unit is refused, not converted silently.** If a logger
registered as Celsius sends readings with a median above 30, something is
wrong and guessing is dangerous. Above 30 it refuses the file and says what to
change; between 20 and 30 it imports and warns, because a genuinely dead
fridge can sit at 22°C and refusing that data would hide a real emergency.

**No login.** Scoped out deliberately, per your instruction. Honest to say it
is a gap rather than a decision — see below.

**Routes do not decide what a fridge is doing.** HTTP lives in `src/routes/`,
orchestration in `src/services/`, SQL in `repository.ts` / `ruleStore.ts`.
The actual rules are still in `ingest/` and `analysis/` — a `FridgeService`
class that only forwarded to those would have been a third name for the same
work. Rules stay route → `ruleStore` because there is nothing to orchestrate.

---

## What I would ask Summer before this goes live

In rough order of how much the answers would change:

1. **What does the Ministry of Health actually require?** How long above five
   degrees is a reportable excursion, and is it five degrees for every fridge?
   The 30-minute rule is my invention and the whole compliance story rests on
   it.
2. **Do all fridges share the same limit?** A walk-in, a dairy fridge and a
   cream cake display plausibly have different requirements. The schema
   already stores a per-fridge threshold; the UI has no way to set it, because
   I do not know what the right values are.
3. **Should she be told between uploads?** Today the tool only knows what has
   been uploaded, so a fridge can fail on Tuesday and go unseen until Sunday.
   That is the same weekly blind spot she has now, just with a nicer view of
   it. If branches could email files to an address that ingested them
   automatically, the Rishon problem largely disappears.
4. **Who else needs to see this?** If branch managers get access, this needs
   accounts and per-branch permissions, which is a different application.
   If it is only her, it can stay as simple as it is.
5. **What happens when a fridge is found warm?** Is there a stock disposal
   record, a sign-off, a note to the inspector? Right now the tool reports and
   stops, and an inspector will likely want to see what was *done*.
6. **How do loggers really get moved and replaced?** I inferred moves from the
   data because the files are all we have, but if there is a real asset list,
   reading it would be more reliable than guessing from readings.
7. **Are the files always CSV?** CSV, TSV and `.xlsx` are handled. Old
   binary `.xls` is not — she is asked to save it as `.xlsx` or CSV. Macros
   and charts are ignored; only sheets that look like a logger table are read.

---

## What is not done

- **No login or users.** Anyone who can reach the API can read and upload.
  Fine on a laptop, not fine on the internet.
- **No alerting.** No email, no push. The tool is silent until she opens it.
- **Old `.xls` files are refused.** `.xlsx` and `.xlsm` are read; the
  pre-2007 binary format is not.
- **No way to edit anything in the UI** — thresholds, branch names, fridge
  names, logger assignments are all inferred from files or set to defaults.
- **No pagination.** Twenty fridges and ~3,300 readings are fine; twenty
  thousand would not be.
- **Date range on the inspector report is fixed buttons** (7/30/90 days)
  rather than a real date picker, so "what about last March" is not
  answerable in the UI, though the API accepts arbitrary `from` and `to`.
- **The API types are hand-mirrored** in `api/src/types.ts` and
  `app/src/api/types.ts`. One backend and one client did not justify a shared
  package, but the two files have to be edited together and nothing enforces
  that.
- **`npm audit` reports 10 moderate advisories in `app/`.** They are all the
  same underlying `uuid` advisory, surfacing ten times along one chain
  (`uuid` → `xcode` → `@expo/config-plugins` → `expo`). It sits in Expo's
  native build tooling rather than anything the app ships, and cannot be
  cleared without Expo publishing an update, so I left it. `api/` reports
  zero, after replacing `multer` 1.x (one critical) and bumping `vitest` and
  `csv-parse`.
- **The sample data generator lives at `api/scripts/generateData.ts`**, not
  `data/generate.ts` as planned, because it needed the API's own types.

### What one more hour would buy

The date picker on the inspector report, and per-fridge thresholds editable in
the UI. Both are small, and both are currently papered over by an assumption I
cannot verify.

If I had a second hour I would spend it on **email ingestion** rather than
anything in the app. Every remaining weakness in this tool traces back to the
fact that data arrives in a weekly batch; nothing in the UI fixes that.

---

## Working with AI tools

I built this with Cursor, using Claude for planning and most of the
implementation. Broadly: it was very good at the parts with a clear
specification — parsers, SQL, the SVG chart, test scaffolding — and
consistently wrong in one specific way, which is worth describing precisely
because it is the failure mode to watch for.

**It produced rules that were defensible in isolation and wrong in context.**
Each one typechecked, passed its tests, and read sensibly in review. They were
only visibly wrong when I stopped reading the code and read what the app
actually *said* about the real data.

### The one to look at

The drift detector — the check that catches a fridge slowly dying — was first
written as a **least-squares slope over a 12-hour window**. Textbook, and what
I had asked for in my own plan.

I caught it by reading the dashboard rather than the diff. A healthy fridge
displayed:

> Tel Aviv Display 2 — Warming up: 4.0°C to 3.6°C over the last 12 hours (−0.4°)

A sentence claiming a fridge was warming up while its own two numbers showed it
cooling. The wording was the symptom; the real problem was worse. Least squares
is pulled by outliers, and this dataset is *full* of outliers — every door
opening is a single reading several degrees high. So one delivery at a busy
branch was enough to tilt the slope and report a perfectly good fridge as
drifting. That directly contradicts the one thing Summer stated in plain words:
a one-reading jump is fine.

I replaced it with a comparison of the **median of the first half of the window
against the median of the second half**. A single spike cannot move a median,
and the estimate structurally cannot report a direction that its own two
displayed numbers contradict.

Where to see it:

- the fix — [`robustTrend` in `api/src/analysis/series.ts`](api/src/analysis/series.ts)
- the tests that pin it — `"is not fooled by a single door opening"` and
  `"never reports a direction its own numbers contradict"` in
  [`api/tests/analysis.test.ts`](api/tests/analysis.test.ts)
- the reasoning, in the commit message for Phase 3

### The same mistake, three more times

Worth listing because the pattern is the point, not the individual bugs:

- **The Rishon fridge went green.** A finished breach stopped counting after 24
  hours, so three days after spending nearly four hours at 8°C — the exact
  fridge from Summer's email — the dashboard showed it green, captioned
  *"nothing above 5.0°C for long enough to matter"*. The status was arguable;
  the sentence was false. Caught by reading the screen and noticing a fridge I
  knew had a problem was not listed. Fixed in `analysis/status.ts`, with the
  reasoning in a comment and the regression test named
  `"is still flagged days later, not quietly turned green"`.
- **Drift fired on noise.** A slope threshold alone says nothing about how long
  you measured or how far the fridge actually moved, so 0.1°C of jitter over 90
  minutes was reported as "warming up". Caught when a test fixture I had
  written to check something else produced a drift warning I knew was wrong —
  so the test was failing for the right reason, just not the one I intended.
  Now requires a minimum window and a minimum real rise.
- **A rejected upload left a phantom fridge.** A file refused for a suspect
  unit had already created its branch and fridge, so a Modiin fridge that was
  never successfully imported sat on the dashboard permanently showing "no
  data". Caught by actually uploading a bad file and then looking at the
  dashboard, rather than just reading the rejection message. Entity creation
  now happens after validation.

In all four cases the code was fine and the *judgement* was wrong, and in all
four the only thing that caught it was looking at the output with the domain in
mind. Tests confirmed my assumptions; they could not tell me my assumptions
were wrong.

### Something I rejected

The plan the AI first wrote had **no migration tool** — just
`CREATE TABLE IF NOT EXISTS` run on boot — on the grounds that it kept the
laptop setup simple. I pushed back, because those two things are unrelated:
what makes it laptop-runnable is that the schema applies itself, not that it
lacks versioning. `IF NOT EXISTS` also silently does nothing when a table
already exists but has changed, which during a build means dropping the
database and losing the seeded data on every schema change.

It conceded the point, and the result is `node-pg-migrate` with real
up-and-down migrations that still apply automatically on boot. You can see the
original reasoning in [PLAN.md](PLAN.md), which is committed unedited and still
says "no ORM, no migration tool" — the plan was wrong and I would rather leave
that visible than tidy it up.

That exchange is the honest summary of working this way: it is fast and
genuinely good, and it will confidently hand you a defensible decision that is
wrong for your problem. The useful review question turned out not to be "is
this code correct" but "read me the sentence this shows Summer, and tell me
whether she would be right to believe it".
