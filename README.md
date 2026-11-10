# Milo IQ

**Fitness tracking that forgives the days you miss.**

Milo IQ is a free, open-source, installable web app (PWA) for people who struggle with
consistency. Most trackers are built for people who log every day and quietly punish
everyone else. This one is built on the opposite assumption: you *will* miss days, and
missing them should never derail your progress.

Three things follow from that:

- **A missed day is not a fasted day.** Averages and deficits are measured across the
  days you actually logged, so a blank Saturday never masquerades as a day you ate
  nothing.
- **Going over is bounded and handled.** Catch-up spreads the excess over 3–7 days,
  widening the spread rather than deepening the cut, and never recommends eating below
  a safe minimum. If the excess is too large to undo safely, it says so and lets the
  rest go.
- **The app does the maths.** Calorie scaling, maintenance calories, trend weight and
  estimated 1RM are all calculated for you.

---

## Features

| | |
|---|---|
| **Onboarding** | Height, weight, age, sex, activity, goal, target rate, lb/kg and ft-in/cm |
| **Quick calorie calculator** | Serving size + calories per serving + grams eaten → instant total; foods save for one-tap reuse |
| **Daily log** | Calories and weight, with day, week and month views against target |
| **Adaptive maintenance** | Measures what you actually burn from your own logs, with a confidence level |
| **Trends** | Your intake against a maintenance line that moves as it is re-measured, with the gap to your goal shaded in |
| **Change your goal** | Switch between losing, maintaining and gaining at any time; each past day stays judged against the goal you held that day |
| **Catch-up guidance** | A gentle, bounded plan after a heavy few days, in whichever direction your goal points |
| **Rules** | Daily yes/no, daily numeric, and weekly limits, with streaks |
| **Workouts** | Sets, weight and reps, prefilled from last time |
| **Strength graph** | Estimated 1RM, so more reps counts as progress too |
| **Progress photos** | One a week, compressed on device, with side-by-side comparison. Lives at the foot of Trends |
| **Groups** | A private feed for a handful of people: posts, reactions, comments, and a nudge when somebody goes quiet. You pick what to share before you are in |
| **Your data** | Full JSON/CSV export and real account deletion |

---

## Self-hosting

You will need [Node.js](https://nodejs.org) 20 or newer and a Google account.

### 1. Get the code

```bash
git clone https://github.com/YOUR-USERNAME/milo-iq.git
cd milo-iq
npm install
```

### 2. Create a Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com) and click
   **Create a project**.
2. Name it whatever you like. **Turn Google Analytics off** — the app does not use it.
3. Wait for it to finish, then click **Continue**.

### 3. Upgrade to the Blaze plan

> **Cloud Storage requires the pay-as-you-go "Blaze" plan, which needs a credit card on
> file.** Everything else in Milo IQ runs on the free Spark plan. If you skip this step,
> the app works fine except for progress photos.

1. Click the **gear icon → Usage and billing → Details & settings**.
2. Click **Modify plan** and choose **Blaze (Pay as you go)**.
3. **Set a budget alert.** Firebase offers this during the upgrade; $5 is plenty. Do not
   skip it — a budget alert is the difference between a surprise and a notification.

Realistic cost for one person: effectively $0/month. The free allowance covers 5 GB of
storage and 1 GB/day of downloads, and a year of weekly photos is about 10 MB.

### 4. Turn on sign-in providers

Go to **Build → Authentication → Get started**, then the **Sign-in method** tab.

**Google** (free, takes a minute):

1. Click **Google**, toggle **Enable**.
2. Choose a support email.
3. **Save**.

**Microsoft** (free, more fiddly — optional):

1. Register an app in the [Azure portal](https://portal.azure.com) under
   **App registrations → New registration**.
2. Copy the **Application (client) ID** and create a **client secret**.
3. In Firebase, enable **Microsoft** and paste both in.
4. Copy the callback URL Firebase shows you back into Azure as a **Redirect URI**.
5. Set `VITE_ENABLE_MICROSOFT=true` in your `.env.local`.

**Apple** (optional):

> **Sign in with Apple requires a paid Apple Developer account**, currently $99/year.
> There is no free path.

1. In the [Apple Developer portal](https://developer.apple.com), create a **Services ID**
   and a **Sign in with Apple** key.
2. In Firebase, enable **Apple** and fill in the Services ID, Team ID, Key ID and private
   key.
3. Set `VITE_ENABLE_APPLE=true` in your `.env.local`.

The app shows only the providers you have enabled, so you can start with Google alone and
add the others later without touching any code.

### 5. Create the database and storage

1. **Build → Firestore Database → Create database.** Pick a location close to you —
   **this cannot be changed later**. Choose **Start in production mode**; the rules in
   this repo get deployed over it in step 7.
2. **Build → Storage → Get started.** Accept the default bucket. (Requires Blaze.)

### 6. Add your config

1. **Gear icon → Project settings → Your apps → the web icon (`</>`)**.
2. Register the app. **Do not** tick Firebase Hosting here.
3. Copy the values out of the `firebaseConfig` block it shows you.

```bash
cp .env.example .env.local
```

Then fill in `.env.local`. These values are not secret — they ship inside the client
bundle by design, and your data is protected by security rules rather than by hiding the
key. `.env.local` is gitignored regardless.

### 7. Deploy the security rules

```bash
npm install -g firebase-tools   # if you do not have it
firebase login
firebase use --add              # pick your project
firebase deploy --only firestore:rules,storage
```

**Do not skip this.** Without it your database is either wide open (if you chose test
mode) or completely closed (production mode) — neither of which is what you want.

### 8. Run it

```bash
npm run dev
```

Open http://localhost:5173.

### 9. Deploy it

```bash
npm run build
firebase deploy --only hosting
```

Firebase gives you a free `*.web.app` URL with HTTPS. On a phone, open it and use
**Add to Home Screen** to install it as an app.

### 10. Switch on the feed's time-to-live

Group feeds keep thirty days. Every post and comment is written with an
`expiresAt` date thirty days out — the security rules refuse one without it —
and Firestore deletes them when that date passes, which is the only way to have
it happen with no backend and whether or not anybody opens the app again.

Firestore needs to be told which field to watch. It is two policies, because
deleting a post does not cascade to its comments:

```bash
gcloud firestore fields ttls update expiresAt \
  --collection-group=posts --enable-ttl --project=YOUR_PROJECT_ID

gcloud firestore fields ttls update expiresAt \
  --collection-group=comments --enable-ttl --project=YOUR_PROJECT_ID
```

Or in the console: **Firestore > Time-to-live (TTL)** > **Create policy**, with
collection group `posts` and field `expiresAt`, then the same again for
`comments`.

Two things worth knowing:

- Deletion is not instant. Google documents it as within 24 hours of expiry,
  so the app also filters the feed to the last thirty days on read. A post
  past its date never shows even if it is still in the database.
- A TTL policy deletes documents, not files. Images attached to feed posts are
  swept by the app instead: each member's own `users/{uid}/posts/` folder is
  tidied of anything older than the window. Progress photos live under
  `users/{uid}/photos/` and are never touched — those are a member's own
  timeline and are kept forever.

Until the policies are on, nothing breaks: posts simply stay longer than
thirty days in the database, while the app still shows only thirty.

---

### 11. Lock it down before sharing it

The security rules are what actually protect your data, and they are already
deployed. These two steps are the layer on top: they make it harder for someone
to point a script at your project at all.

**App Check** (attests that requests come from your app)

1. Google Cloud Console > **Security** > **reCAPTCHA**. Create a key, type
   **Website**. Add `milo-iq.web.app`, `milo-iq.firebaseapp.com` and
   `localhost` (substitute your own domains). Leave "use checkbox challenge"
   off — App Check uses the invisible score-based flow.
2. Copy the **site key** into `.env.local` as
   `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`, then `npm run build && firebase deploy
   --only hosting`. Until you do this the app sends no App Check tokens.
3. Firebase Console > **App Check** > **Apps** > your web app > **reCAPTCHA
   Enterprise**. Paste the same site key and save. This starts **monitoring
   mode**: Firebase records whether requests are attested but allows all of
   them through.
4. Use the app for a day. Under App Check > **APIs**, each of Firestore,
   Storage and Authentication shows a split of verified vs unverified
   requests. Wait until **verified is close to 100%** of your own traffic.
5. Only then, per API, click **Enforce**. Anything unattested is rejected from
   that moment, so an early enforce locks you out of your own app.

For local development the SDK prints a debug token to the browser console on
first load. Register it under App Check > Apps > **Manage debug tokens** and
`localhost` keeps working after enforcement. A debug token is a credential —
do not commit it or paste it anywhere public.

reCAPTCHA Enterprise has a monthly free allowance and bills per assessment
beyond it, so keep a budget alert on the project.

**Restrict the web API key** (stops the key being used from other sites)

1. Google Cloud Console > **APIs & Services** > **Credentials** > the
   **Browser key (auto created by Firebase)**.
2. **Application restrictions** > **Websites**, and add:
   `milo-iq.web.app/*`, `milo-iq.firebaseapp.com/*`, `localhost`,
   `localhost:*/*`.
3. Leave **API restrictions** unrestricted at first. If you do restrict them,
   the app needs all of: Identity Toolkit, Token Service, Firebase
   Installations, Cloud Firestore, Cloud Storage for Firebase, and reCAPTCHA
   Enterprise. Removing any one of those breaks sign-in or saving.

The API key in a web build is public by design — it identifies the project and
authorises nothing. Restricting it is worth doing, but it is a speed bump, not
a security boundary. The rules are the boundary.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:5173 |
| `npm run build` | Type-check and build for production |
| `npm test` | Unit tests for every calculation |
| `npm run test:rules` | Security rule tests against the Firebase emulator |
| `npm run test:all` | Both suites |
| `npm run lint` | Lint the source |
| `npm run icons` | Regenerate the PWA icons in `public/` |

`npm run test:rules` needs **Java 11 or newer** installed, because the Firestore and
Storage emulators run on the JVM. Everything else runs on Node alone.

---

## How it is built

```
src/lib/     Pure functions — all the maths, fully unit tested, no Firebase imports
src/data/    Firestore and Storage access
src/hooks/   React data loading
src/pages/   Screens
tests/rules/ Security rule tests (emulator)
```

Keeping every calculation in `src/lib` as a pure function is what makes the maths
testable and the UI dumb.

### Keeping it cheap

Firestore bills per document read, so the design minimises them:

- **A persistent on-device cache** is enabled at startup. Re-viewing data you have
  already loaded costs nothing.
- **One document per day** holds that day's calories, food entries, weight and rule
  check-offs together. The Trends month view costs about 57 small reads: the 30 days it
  draws, plus four weeks of lead-in so the maintenance line is a measurement from its
  very first point rather than easing in from the estimate.
- **Week and month summaries are precomputed** on every day change, so the 3-month and
  year views cost about 17 and 57 small documents rather than 90 or 365 raw logs.
- **Workout sessions are nested under their exercise** and keyed by date, so the progress
  graph is one ordered read needing no composite index.
- **Each exercise caches its last session**, making prefill a single read rather than a
  query.
- **No Cloud Functions**, so there is no always-on backend to pay for.

### How sharing works

Rather than filtering data at read time, each member publishes a **mirror document**
containing only the sections they ticked. Anything unshared is never written anywhere the
group can read it, so the security rule is a simple membership check and no filtering bug
can leak what was never there.

Leaving a group deletes your member document — which is exactly what every read rule
checks — so access ends immediately.

Two deliberate choices worth knowing about:

- **Weight is shared as a change, not a number.** What a group needs is the direction
  of travel; the figure on the scale is a far bigger ask than most people realise.
- **One admin per group, and the role is caretaking only.** The admin invites, removes,
  renames, deletes, and can take down a post or a comment. They get no extra sight of
  anybody's data — there is deliberately no role that can read more than its owner
  shared.
- **Sharing is chosen before you are in, not discovered afterwards.** Joining or creating
  a group asks about three things — stats, goals hit, progress photos — and writes
  nothing until you answer. All three default to off.
- **Automatic posts are gathered into one card a day per person.** Four things happening
  on one Tuesday is one card with four lines, not four cards. The card's id is the member
  and the day and each line is a keyed entry on it, which also makes writing one
  idempotent: there is no backend here to remove a duplicate.
- **Achievements post the moment they happen; the weekly report waits for the week.**
  Rules kept, a workout finished and a photo uploaded go straight out. The week's weight
  trend and calorie average go out once at the top of a new week, and the week they went
  out for is recorded, so opening the app five times on Monday posts them once.
- **Only photo thumbnails are shared.** A Firebase download URL is a bearer token that
  cannot be revoked without Cloud Functions, so the full-size image is never placed in a
  group-readable document.

---

## Security

- Users can read and write only their own data. Nobody, admin included, can see a
  member's raw logs — only the summary and the posts that member chose to publish.
- A member can never change their own role, so nobody can promote themselves to admin.
- A reaction write can only touch the writer's own key in the post's reaction map, so
  nobody can react on somebody else's behalf or clear theirs.
- Invite codes can be looked up but not listed, so they cannot be enumerated.
- Members write only their own membership record, so nobody can add someone else to a
  group or alter another member's share settings.
- 133 rule tests run against the real emulator and assert the denials, not just the
  permissions. Sixteen of them walk the whole two-user feed flow — one member opts in,
  keeps their rules, finishes a workout, gets a weekly report, and the other reads it —
  through the same functions the app calls, so a missing rule shows up there rather
  than as a feed that stays empty on a phone.
- A post or comment without an expiry inside the thirty-day window is refused, so
  nothing can be written to a feed that never leaves it.
- A member may move a group's "something was posted" marker and change nothing else on
  it, so the dot on the Groups tab costs one small read rather than a wider grant.
- App Check can attest that requests come from your app rather than a script, and the
  web API key can be restricted to your own domains. Both are set up in step 10 and
  neither replaces the rules.

Found a security problem? Please open an issue describing the class of problem, without a
working exploit.

---

## Contributing

Pull requests welcome. Please keep calculations in `src/lib` as pure functions with tests,
and run `npm run test:all` before opening one.

## Licence

MIT — see [LICENSE](LICENSE).

Milo IQ gives estimates, not medical advice. See the in-app Terms page.
