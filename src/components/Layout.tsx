// App shell: a scrolling page with a fixed bottom tab bar, which is where
// thumbs already are on a phone.

import { NavLink, Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';

interface Tab {
  to: string;
  label: string;
  icon: ReactNode;
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const TABS: Tab[] = [
  {
    to: '/',
    label: 'Today',
    icon: (
      <>
        <rect x="3" y="4.5" width="18" height="16" rx="2.5" {...stroke} />
        <path d="M3 9h18M8 2.5v4M16 2.5v4" {...stroke} />
      </>
    ),
  },
  {
    to: '/trends',
    label: 'Trends',
    icon: <path d="M3 16.5l5-5 4 3.5 8-8M15 7h5v5" {...stroke} />,
  },
  {
    to: '/lift',
    label: 'Lift',
    icon: (
      <path
        d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"
        {...stroke}
      />
    ),
  },
  {
    to: '/photos',
    label: 'Photos',
    icon: (
      <>
        <rect x="3" y="6" width="18" height="14" rx="2.5" {...stroke} />
        <path d="M8 6l1.5-2.5h5L16 6" {...stroke} />
        <circle cx="12" cy="13" r="3.5" {...stroke} />
      </>
    ),
  },
  {
    to: '/more',
    label: 'More',
    icon: (
      <>
        <circle cx="5" cy="12" r="1.5" {...stroke} />
        <circle cx="12" cy="12" r="1.5" {...stroke} />
        <circle cx="19" cy="12" r="1.5" {...stroke} />
      </>
    ),
  },
];

export function Layout() {
  return (
    <div className="min-h-screen pb-20">
      <Outlet />

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto flex max-w-md">
          {TABS.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                end={tab.to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition ${
                    isActive ? 'text-brand-600' : 'text-slate-400 hover:text-slate-600'
                  }`
                }
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                  {tab.icon}
                </svg>
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Standard page wrapper: one column, comfortable on a phone. */
export function Page({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md px-5 py-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
      </header>
      {children}
    </div>
  );
}
