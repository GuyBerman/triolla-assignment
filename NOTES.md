# Notes

## How long it took

The whole assigment took about 7 hours

## Decisions Summer did not ask for

**DB** Summer asked for something basic to undersand only the certain file she uploaded I thought it will be better to save the data and have more info about each from previus files too

**Settings** A settings screen to prevent future problems and let summer control what she needs for example she can choose what degree is the limit so we know to suspect a fridge

**Special calculations** Summer methioned some loggers shows the wrong number and she calculate the real one in her head - I added the rules which she can choose a branch there and define a speical calculation method and then all number are correct

**UI** Summer mentiond she wastes a lot of time looking for problems - I have added easy way to see issues and fix a problem before it actually happens (Too warm , No data , Watch , OK)

**Warn about fridges that are still within limits.** A threshold alarm cannot
fire until the stock is already warm, which means it would not have saved the
Rishon dairy. Drift detection is the only check here that arrives in time to
act on, so it exists even though she did not ask for it.

**A warm period is never allowed to span a gap in the data.** If a logger goes
quiet for six hours and comes back warm, we do not know it was warm the whole
time. Reporting that as one six-hour violation would be inventing evidence, in
a tool whose output goes to a health inspector. Runs break at gaps instead.

**"No data" is its own state, and it is worse than "fine".** A silent logger
is not a cold fridge.

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

**A file in the wrong unit is refused, not converted silently.** If a logger
registered as Celsius sends readings with a median above 30, something is
wrong and guessing is dangerous. Above 30 it refuses the file and says what to
change; between 20 and 30 it imports and warns, because a genuinely dead
fridge can sit at 22°C and refusing that data would hide a real emergency.

**The judgements are editable; the clamps are not.** How long above the limit
counts, how long a silence is No data, and what counts as warming up or a gap
are on Settings (the Branches header, and Rules → Settings), because those were guesses listed for her to confirm.
Cadence limits and "at least eight readings" stay in `analysis/config.ts`. A
box for those would let a typo call noise a trend, and one reading stays a
door opening because the duration cannot be set to zero. Changing a setting
recomputes every fridge on the next look, including files she already
uploaded. It does not change a fridge's own degree limit.

---

## What I would ask Summer before this goes live

In rough order of how much the answers would change:

1. **What does the Ministry of Health actually require?** How long above five
   degrees is a reportable excursion, and is it five degrees for every fridge?
   The 30-minute rule is my invention and the whole compliance story rests on
   it.
2. **Do all fridges share the same limit?** A walk-in, a dairy fridge and a
   cream cake display plausibly have different requirements. The schema
   already stores a per-fridge threshold, and Settings (and the fridge page)
   can change it. A new fridge still starts at 5° until she says otherwise.
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
   stops, and an inspector will likely want to see what was _done_.
6. **How do loggers really get moved and replaced?** I inferred moves from the
   data because the files are all we have, but if there is a real asset list,
   reading it would be more reliable than guessing from readings.
7. **Are the files always CSV?** CSV, TSV and `.xlsx` are handled. Old
   binary `.xls` is not — she is asked to save it as `.xlsx` or CSV. Macros
   and charts are ignored; only sheets that look like a logger table are read.

---

## What is not done

- **No alerting.** No email, no push. The tool is silent until she opens it.
- **No way to rename a fridge or move its logger in the UI.** Those still
  come from the file. The degree limit is editable on Settings and on the
  fridge page. Settings also covers the shared judgements (how long is too
  warm, when a logger is silent, warming up, gaps).
- **Date range on the inspector report is fixed buttons** (7/30/90 days)
  rather than a real date picker, so "what about last March" is not
  answerable in the UI, though the API accepts arbitrary `from` and `to`.

### What one more hour would buy

The date picker on the inspector report. The per-fridge degree limit is
editable now; the right number for each fridge is still hers to decide.

If I had a second hour I would spend it on **email ingestion** rather than
anything in the app. Every remaining weakness in this tool traces back to the
fact that data arrives in a weekly batch; nothing in the UI fixes that.

---

## How I worked with AI tools

I used Cursor, with Claude, for the planning and most of the code.

The first version left the judgements in code: how long above the limit
counts, how long a silence is No data, what counts as warming up or a gap.
None of those numbers came from Summer. They were guesses, and the only way
to change one was to edit the source. I caught it by reading that list back.
If she disagrees with 30 minutes, she should be able to say so from her phone.

They are now a row on Settings. The cadence clamps stayed in code, because a
typo there would call noise a trend.

Where to see it:

- the note above, "The judgements are editable; the clamps are not"
- [`api/src/analysis/settings.ts`](api/src/analysis/settings.ts) and the Settings screen
- commit `0375f07`
