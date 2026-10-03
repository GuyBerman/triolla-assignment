# Squanchy Bakery — Fridge Monitor

Upload the temperature logger files the branches send in, see how every fridge
across all twelve branches is doing on one screen, and answer the inspector's
question — _when did this fridge go above five degrees, and for how long?_ —
without opening a spreadsheet.

Built for a phone, because that is where it will be used.

| Dashboard                            | Fridge detail                                     | Inspector report                           |
| ------------------------------------ | ------------------------------------------------- | ------------------------------------------ |
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
