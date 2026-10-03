
## Running it



### 1. Start the database

```bash
docker compose up -d
```

Postgres comes up on port **5432**.

### 2. Start the API

```bash
cd api
npm install
npm run seed      # loads the sample logger files from data/
npm run dev
```


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
