// App shell: a scrolling page with a fixed bottom tab bar, which is where
// thumbs already are on a phone.

import { NavLink, Outlet } from 'react-router-dom';
import { useRuleReminder } from '../hooks/useRuleReminder';
import type { ReactNode } from 'react';
import { Eyebrow } from './ui';

interface Tab {
  to: string;
  label: string;
  /** One SVG path, drawn as a 22px stroked icon. */
  d: string;
}

const TABS: Tab[] = [
  { to: '/', label: 'Today', d: 'M6 5h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM3 10h18M8 3v4M16 3v4' },
  { to: '/trends', label: 'Trends', d: 'M3 17l6-6 4 4 8-8M15 7h6v6' },
  { to: '/rules', label: 'Rules', d: 'M3 7l2 2 4-4M12 7h9M3 16l2 2 4-4M12 16h9' },
  { to: '/lift', label: 'Workouts', d: 'M2 10v4M5 7v10M19 7v10M22 10v4M5 12h14' },
  { to: '/photos', label: 'Photos', d: 'M6 7h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3zM9 7l1.5-3h3L15 7M12 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
  { to: '/more', label: 'More', d: 'M5 12h.01M12 12h.01M19 12h.01' },
];

export function Layout() {
  // From 6pm, an unfinished checklist puts a dot on the Rules tab.
  const remind = useRuleReminder();

  return (
    <div className="min-h-screen pb-[84px]">
      <Outlet />

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/97 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto grid max-w-md grid-cols-6 px-1.5 pt-2">
          {TABS.map((tab) => {
            const dot = tab.to === '/rules' && remind;
            return (
              <li key={tab.to}>
                <NavLink
                  to={tab.to}
                  end={tab.to === '/'}
                  className={({ isActive }) =>
                    `flex h-[76px] flex-col items-center gap-1 pt-0.5 text-[11px] font-bold transition
                     ${isActive ? 'text-brand' : 'text-ink-ghost hover:text-ink-soft'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`relative flex h-[30px] w-[46px] items-center justify-center
                          rounded-[15px] transition ${isActive ? 'bg-brand-pill' : 'bg-transparent'}`}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-[22px] w-[22px]"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d={tab.d} />
                        </svg>
                        {dot && (
                          <span
                            aria-hidden="true"
                            className="absolute top-0.5 right-2 h-[7px] w-[7px] rounded-full
                              bg-brand-mid ring-2 ring-white"
                          />
                        )}
                      </span>
                      {tab.label}
                      {/* The dot is colour and position only, so the same news
                          is spelled out for anyone who cannot see it. */}
                      {dot && <span className="sr-only">— rules still to do today</span>}
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/**
 * Standard page wrapper: one column, comfortable on a phone.
 *
 * `eyebrow` is the small uppercase kicker above the title. `back` turns the
 * header into a sub-screen header with a return link above it.
 */
export function Page({ title, eyebrow, subtitle, back, action, children }: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  back?: ReactNode;
  /** Controls sitting to the right of the title, like Today's day stepper. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="screen-top mx-auto flex max-w-md flex-col gap-4 px-5 pb-7">
      <header className="flex flex-col gap-2">
        {back}
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <h1 className="display text-[42px] text-ink">{title}</h1>
          </div>
          {action && <div className="flex shrink-0 gap-1.5">{action}</div>}
        </div>
        {subtitle && <p className="text-[15px] leading-snug text-ink-soft">{subtitle}</p>}
      </header>
      {children}
    </div>
  );
}
