# Milo IQ

Fitness tracking that forgives the days you miss.

Milo IQ is a free, open-source, installable web app (PWA) for people who
struggle with consistency. Missing a weekend should never derail progress, so
logging takes seconds and the app does all of the math for you.

**Status:** in active development, built in phases. Phase 1 (project setup,
sign-in, onboarding) is complete.

## Stack

React + TypeScript + Vite, Tailwind CSS, Firebase (Auth, Firestore, Storage),
Recharts. No Cloud Functions.

## Running it locally

```bash
npm install
cp .env.example .env.local   # then fill in your Firebase config
npm run dev
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server on http://localhost:5173 |
| `npm run build` | Type-check and build for production |
| `npm test` | Run the unit tests |
| `npm run lint` | Lint the source |
| `npm run icons` | Regenerate the PWA icons in `public/` |

Full self-hosting instructions (creating the Firebase project, enabling each
sign-in provider, deploying rules and hosting) land in a later phase.

## License

MIT
