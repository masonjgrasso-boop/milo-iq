// What a signed-out visitor sees.
//
// The job of this page is to answer "what is this and is it for me" without
// asking for an account first, which is why the calculator here works before
// sign-in and saves nothing.

import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Dot, Eyebrow, Pill, Stat } from '../components/ui';
import { ProviderButtons } from '../components/ProviderButtons';
// Behind a click, and the service worker caches it before anyone clicks, so
// it costs the landing page nothing to carry.
const CalorieCalculator = lazy(() =>
  import('../components/CalorieCalculator').then((m) => ({ default: m.CalorieCalculator })),
);

const STEPS = [
  {
    title: 'Log food and weight',
    body: 'Read the numbers off a label, say how much you ate, done. Weigh in when you can.',
  },
  {
    title: 'See your real maintenance',
    body: 'After two weeks Milo IQ works out what your body actually burns, from your own logs.',
  },
  {
    title: 'Stay on track after a bad weekend',
    body: 'Miss a few days and it spreads a small, safe adjustment over the next week or two.',
  },
];

const FEATURES = [
  ['Calories in seconds', 'Serving size and calories, then the grams you ate.'],
  ['Your real numbers', 'Maintenance measured from your logs, not a formula.'],
  ['Weight trend', 'Daily noise smoothed into the line that matters.'],
  ['Rules and streaks', 'The habits you want to hold yourself to.'],
  ['Workouts', 'Set a day up once, then just turn up and lift.'],
  ['Progress photos', 'One a week, compressed on your device.'],
  ['Groups', 'Share only what you choose, with people you choose.'],
  ['Yours to take', 'Export everything, or delete it all, any time.'],
];

export function Landing() {
  const [calculating, setCalculating] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 lg:px-8">
        <span className="flex items-center gap-2.5">
          <img src="/milo-mark.png" alt="" className="h-9 w-14 object-contain" />
          <span className="font-wordmark text-xl leading-none tracking-[0.02em] text-brand uppercase">
            Milo IQ
          </span>
        </span>
        <Link
          to="/signin"
          className="text-sm font-bold text-ink-soft transition hover:text-brand"
        >
          Sign in
        </Link>
      </header>

      {/* ---- Hero ---------------------------------------------------------- */}
      <section className="hero-surface text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 lg:grid-cols-2 lg:items-center lg:gap-14 lg:px-8 lg:py-24">
          <div className="flex flex-col items-start gap-5">
            <Pill tone="onHero">
              <Dot />
              Free, open source, no ads
            </Pill>

            <h1 className="display text-[44px] lg:text-[64px]">
              Missing a weekend
              <br />
              <span className="text-brand-lite">is not starting over</span>
            </h1>

            <p className="max-w-md text-[17px] leading-relaxed opacity-85">
              Milo IQ tracks your calories, weight and workouts, works out the maintenance
              calories your body actually burns, and does the maths so you never have to
              guess your way back after a bad few days.
            </p>

            <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
              <Link
                to="/signin"
                className="flex h-[54px] items-center justify-center rounded-btn bg-surface
                  px-7 text-base font-extrabold text-brand transition hover:bg-canvas"
              >
                Get started free
              </Link>
              <button
                type="button"
                onClick={() => setCalculating(true)}
                className="flex h-[54px] items-center justify-center rounded-btn border
                  border-white/30 px-7 text-base font-bold text-white transition hover:bg-white/10"
              >
                Calculate your calories
              </button>
            </div>
          </div>

          {/* An illustration of the Today screen, not real data. */}
          <div className="rounded-card bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-[10px] lg:p-5">
            <p className="eyebrow mb-3 text-brand-pale">A day in Milo IQ</p>
            <div className="flex flex-col gap-3 rounded-hero bg-canvas p-4 text-ink">
              <div className="flex items-end justify-between">
                <span className="flex flex-col gap-0.5">
                  <span className="eyebrow text-[10px] text-brand">Eaten</span>
                  <span className="display tnum text-[40px]">1,740</span>
                </span>
                <span className="flex flex-col items-end gap-0.5">
                  <span className="eyebrow text-[10px] text-brand">Left</span>
                  <span className="tnum text-[22px] font-extrabold">460</span>
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-brand-wash">
                <div className="h-full w-[79%] rounded-full bg-brand" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Below maint." value="538" tone="good" />
                <Stat label="Goal asks" value="499" />
                <Stat label="Ahead by" value="39" tone="good" />
              </div>
              <p className="text-xs text-ink-faint">
                Maintenance measured from your own logs
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---- How it works -------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-5 py-14 lg:px-8 lg:py-20">
        <div className="flex flex-col gap-2">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="display text-[32px] text-ink lg:text-[42px]">Three steps</h2>
        </div>

        <ol className="mt-7 grid gap-4 lg:grid-cols-3 lg:gap-5">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <Card className="flex h-full flex-col gap-2.5">
                <span
                  aria-hidden="true"
                  className="display flex h-10 w-10 items-center justify-center rounded-full
                    bg-brand-wash text-xl text-brand"
                >
                  {index + 1}
                </span>
                <h3 className="text-[17px] font-extrabold text-ink">{step.title}</h3>
                <p className="text-sm leading-relaxed text-ink-soft">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* ---- Features ------------------------------------------------------ */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-14 lg:px-8 lg:py-20">
          <div className="flex flex-col gap-2">
            <Eyebrow>Everything in it</Eyebrow>
            <h2 className="display text-[32px] text-ink lg:text-[42px]">
              What you get
            </h2>
          </div>

          <ul className="mt-7 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(([title, body]) => (
              <li key={title} className="flex flex-col gap-1">
                <span className="flex items-center gap-2">
                  <Dot className="bg-brand-mid" />
                  <span className="text-[15px] font-extrabold text-ink">{title}</span>
                </span>
                <span className="text-sm leading-relaxed text-ink-mute">{body}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- Closing call to action ---------------------------------------- */}
      <section className="mx-auto max-w-6xl px-5 py-14 lg:px-8 lg:py-20">
        <div className="hero-surface flex flex-col gap-6 rounded-hero p-6 text-white lg:flex-row lg:items-center lg:justify-between lg:p-10">
          <div className="flex max-w-md flex-col gap-2.5">
            <h2 className="display text-[32px] lg:text-[40px]">Start today</h2>
            <p className="text-[15px] leading-relaxed opacity-85">
              No cost, no adverts, nothing sold. Sign in and your first number is waiting
              in about a minute.
            </p>
          </div>
          <div className="w-full lg:w-[320px]">
            <ProviderButtons onHero />
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-8 text-[13px] font-bold lg:flex-row lg:justify-between lg:px-8">
          <span className="text-ink-faint">Milo IQ &middot; free and open source</span>
          <nav className="flex gap-6">
            <Link to="/privacy" className="text-ink-mute hover:text-ink-soft">Privacy</Link>
            <Link to="/terms" className="text-ink-mute hover:text-ink-soft">Terms</Link>
            <a
              href="https://github.com/masonjgrasso-boop/milo-iq"
              target="_blank"
              rel="noreferrer"
              className="text-ink-mute hover:text-ink-soft"
            >
              GitHub
            </a>
          </nav>
        </div>
      </footer>

      {calculating && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/60">
              <span className="text-sm font-bold text-white">Opening&hellip;</span>
            </div>
          }
        >
          <CalorieCalculator onClose={() => setCalculating(false)} />
        </Suspense>
      )}
    </div>
  );
}
