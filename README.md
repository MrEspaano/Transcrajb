# Transcrajb V1

Transcrajb är en webbapp för live-transkribering av fysiska möten på svenska, med automatisk generering av:

- rå transkribering
- sammanfattning
- protokollutkast

Vid finalize exporteras resultatet automatiskt till Google Docs (eller mock-export lokalt om credentials saknas).

## Teknik

- Next.js 14 + TypeScript (App Router)
- API-routes för mötesflöde
- Prisma + Postgres (Neon)
- SSE för live-segment i UI
- OpenAI STT (valfritt) + fallback mock-STT
- Google Docs/Drive export (valfritt) + fallback mock-export

## Kom igång

1. Installera dependencies:

```bash
npm install
```

2. Skapa `.env.local` från exempel:

```bash
cp .env.example .env.local
```

3. Starta appen:

```bash
npm run dev
```

Öppna `http://localhost:3000`.

## Miljövariabler

- `DATABASE_URL` (Neon/Postgres, krävs för persistent data)
- `OPENAI_API_KEY` för riktig STT-transkribering av audio chunks
- `TRANSCRAJB_USE_MOCK_STT=true|false` (default i exempel är `true`)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_DRIVE_FOLDER_ID` (valfri)
- `TRANSCRAJB_USE_MOCK_GOOGLE=true|false`

Om Google credentials saknas skapas export i `.exports/<meetingId>.txt`.

## Neon + Prisma setup

1. Skapa en Neon databas och kopiera connection string.
2. Sätt `DATABASE_URL` i `.env.local` och i Vercel Environment Variables.
3. Kör schema-sync lokalt:

```bash
npm run db:push
```

4. Deploya till Vercel (Prisma Client genereras via `postinstall`).

## API-kontrakt (V1)

- `POST /api/meetings`
- `GET /api/meetings`
- `GET /api/meetings/{id}`
- `POST /api/meetings/{id}/audio-chunk`
- `GET /api/meetings/{id}/live` (SSE)
- `POST /api/meetings/{id}/finalize`
- `POST /api/meetings/{id}/export/google-doc`
- `GET /api/participants`
- `POST /api/participants`

## Test

```bash
npm run test
```

## Nuvarande begränsningar

- Talaridentifiering använder heuristik + valfri embedding, inte full akustisk diarization-motor
- Riktig Google-export kräver service account med korrekt delning/behörighet

## Nästa steg (prioriterat)

1. Implementera Prisma-repository mot Postgres och flytta bort in-memory store
2. Lägg till bakgrundsjobb-queue för finalize/export med återupptagning
3. Lägg till autentisering och workspace-scope för fler team
4. Bygg ut observability (structured logs, metrics, traces)
