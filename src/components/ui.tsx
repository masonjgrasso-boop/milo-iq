// Small shared UI pieces. Deliberately plain: the app should feel fast and
// obvious, so there is no component library here, just a few consistent styles.

import type { ButtonHTMLAttributes, ComponentPropsWithRef, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const styles =
    variant === 'primary'
      ? 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-700'
      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50';
  return (
    <button
      {...props}
      className={`w-full rounded-xl px-4 py-3 text-base font-semibold transition
        disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function Field({
  label, hint, children,
}: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function NumberInput(props: ComponentPropsWithRef<'input'>) {
  return (
    <input
      type="number"
      inputMode="decimal"
      {...props}
      className={`w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900
        outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 ${props.className ?? ''}`}
    />
  );
}

/** A row of mutually exclusive buttons — faster to tap than a dropdown. */
export function Choice<T extends string>({
  value, options, onChange, columns = 2,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
              selected
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** One labelled figure. Lives here, not in charts, so a card using it
 *  does not drag Recharts into the main bundle. */
export function Stat({ label, value, tone = 'neutral' }: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  const colors = {
    neutral: 'text-slate-900',
    good: 'text-brand-700',
    warn: 'text-amber-700',
  };
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${colors[tone]}`}>{value}</p>
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
