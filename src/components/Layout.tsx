// App shell.
//
// Two navigations off one list of tabs: a bottom bar on phones and tablets,
// where thumbs already are, and a left sidebar from 1024px, where there is
// width to spare. Only one is ever mounted visibly, but both read from TABS
// so a tab can never exist in one and not the other.

import { NavLink, Outlet } from 'react-router-dom';
import { useRuleReminder } from '../hooks/useRuleReminder';
import { useGroupBadge } from '../hooks/useGroupBadge';
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
  { to: '/lift', label: 'Workouts', d: 'M2 10v4M5 7v10M19 7v10M22 10v4M5 12h14' },
  { to: '/rules', label: 'Rules', d: 'M3 7l2 2 4-4M12 7h9M3 16l2 2 4-4M12 16h9' },
  { to: '/groups', label: 'Groups', d: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM22 19v-1a4 4 0 0 0-3-3.87M16 4.13A4 4 0 0 1 16 11.5' },
  { to: '/more', label: 'More', d: 'M5 12h.01M12 12h.01M19 12h.01' },
];

// The sidebar is 248px wide from `lg` up, and the screen is inset by the same
// amount. Tailwind cannot read a JS constant, so the two literals are kept
// next to each other here: lg:w-[248px] on the nav, lg:pl-[248px] on the screen.

function TabIcon({ d }: { d: string }) {
  return (
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
      <path d={d} />
    </svg>
  );
}

/** The reminder dot, and the same news spelled out for anyone who cannot see it. */
function ReminderDot({ className }: { className: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`h-[7px] w-[7px] rounded-full bg-brand-mid ring-2 ring-white ${className}`}
      />
      <span className="sr-only">— rules still to do today</span>
    </>
  );
}

export function Layout({ children }: {
  /** A screen to wrap directly. Routes nested under Layout use the Outlet. */
  children?: ReactNode;
}) {
  // From 6pm, an unfinished checklist puts a dot on the Rules tab.
  const remind = useRuleReminder();
  // An unread nudge, or a post nobody has seen, puts one on Groups.
  const groupNews = useGroupBadge();

  return (
    <div className="min-h-screen">
      {/* ---- Sidebar: desktop only ---------------------------------------- */}
      <nav
        aria-label="Main"
        className="fixed top-0 bottom-0 left-0 z-10 hidden flex-col border-r border-line
          bg-surface px-3 py-6 lg:flex lg:w-[248px]"
      >
        <NavLink to="/" className="mb-6 flex items-center gap-2.5 px-2">
          <img src="/milo-mark.png" alt="" className="h-9 w-9 object-contain" />
          <span className="font-wordmark text-xl leading-none tracking-[0.02em] text-brand uppercase">
            Milo IQ
          </span>
        </NavLink>

        <ul className="flex flex-col gap-1">
          {TABS.map((tab) => {
            const dot = (tab.to === '/rules' && remind) || (tab.to === '/groups' && groupNews);
            return (
              <li key={tab.to}>
                <NavLink
                  to={tab.to}
                  end={tab.to === '/'}
                  className={({ isActive }) =>
                    `flex h-11 items-center gap-3 rounded-input px-3 text-[15px] font-bold transition
                     ${isActive
                       ? 'bg-brand-pill text-brand'
                       : 'text-ink-mute hover:bg-muted hover:text-ink-soft'}`
                  }
                >
                  <TabIcon d={tab.d} />
                  {tab.label}
                  {dot && <ReminderDot className="ml-auto" />}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ---- The screen itself -------------------------------------------- */}
      <div className="pb-[84px] lg:pb-0 lg:pl-[248px]">
        {children ?? <Outlet />}
      </div>

      {/* ---- Bottom bar: phone and tablet --------------------------------- */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/97
          backdrop-blur lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto grid max-w-md grid-cols-6 px-0.5 pt-2 sm:px-1.5">
          {TABS.map((tab) => {
            const dot = (tab.to === '/rules' && remind) || (tab.to === '/groups' && groupNews);
            return (
              <li key={tab.to} className="min-w-0">
                <NavLink
                  to={tab.to}
                  end={tab.to === '/'}
                  className={({ isActive }) =>
                    `flex h-[76px] flex-col items-center gap-1 pt-0.5 text-[10px] font-bold
                     transition sm:text-[11px]
                     ${isActive ? 'text-brand' : 'text-ink-ghost hover:text-ink-soft'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`relative flex h-[30px] w-[46px] items-center justify-center
                          rounded-[15px] transition ${isActive ? 'bg-brand-pill' : 'bg-transparent'}`}
                      >
                        <TabIcon d={tab.d} />
                        {dot && <ReminderDot className="absolute top-0.5 right-2" />}
                      </span>
                      <span className="w-full truncate px-0.5 text-center">
                        {tab.label}
                      </span>
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
 * Standard page wrapper: one column on a phone, and on desktop a comfortable
 * measure rather than the full width of the window.
 *
 * `wide` is for the two screens that have something to do with the extra
 * room — Today's two columns and the Trends charts. Everything else stays
 * narrow, because a settings list stretched to 1200px is harder to read, not
 * easier.
 */
export function Page({ title, eyebrow, subtitle, back, action, wide = false, children }: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  back?: ReactNode;
  /** Controls sitting to the right of the title, like Today's day stepper. */
  action?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`screen-top mx-auto flex flex-col gap-4 px-5 pb-7 lg:px-8 lg:pb-12
        ${wide ? 'max-w-md lg:max-w-5xl' : 'max-w-md lg:max-w-2xl'}`}
    >
      <header className="flex flex-col gap-2">
        {back}
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <h1 className="display text-[42px] text-ink lg:text-[52px]">{title}</h1>
          </div>
          {action && <div className="flex shrink-0 gap-1.5">{action}</div>}
        </div>
        {subtitle && <p className="text-[15px] leading-snug text-ink-soft">{subtitle}</p>}
      </header>
      {children}
    </div>
  );
}
