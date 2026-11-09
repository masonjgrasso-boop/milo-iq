// Shared UI pieces, all built from the tokens in index.css.
//
// Screens are assembled from these and nothing else, so spacing, radius and
// colour stay consistent and a change lands everywhere at once. Nothing here
// knows about Firebase or app state.

import { useEffect, useRef } from 'react';
import type { ButtonHTMLAttributes, ComponentPropsWithRef, ReactNode } from 'react';

/* ---------------------------------------------------------------- surfaces */

/**
 * The standard card. Callers set their own inner spacing.
 *
 * Only the white one is raised: the tinted tones are quieter asides, and
 * giving them a border and a shadow too would make a screen of them look
 * like a stack of equally loud boxes.
 */
const CARD_TONES = {
  surface: 'border border-line bg-surface shadow-card',
  cream: 'bg-cream',
  wash: 'border border-brand-pill bg-brand-wash',
  muted: 'bg-muted',
};

export function Card({ children, tone = 'surface', className = '' }: {
  children: ReactNode;
  tone?: keyof typeof CARD_TONES;
  className?: string;
}) {
  return (
    <div className={`rounded-card p-[18px] ${CARD_TONES[tone]} ${className}`}>
      {children}
    </div>
  );
}

/** The dark green card used for the one number that matters most on a screen. */
export function HeroCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`hero-surface rounded-hero p-5 text-white shadow-hero ${className}`}>
      {children}
    </div>
  );
}

/** A quiet box for a line of explanation inside a card. */
export function NoteBox({ children, tone = 'muted', className = '' }: {
  children: ReactNode;
  tone?: 'muted' | 'cream' | 'wash';
  className?: string;
}) {
  const tones = {
    muted: 'bg-muted text-ink-soft',
    cream: 'bg-cream text-ink-mute',
    wash: 'bg-brand-wash text-brand',
  };
  return (
    <div className={`rounded-input px-3 py-2.5 text-[13px] leading-relaxed ${tones[tone]} ${className}`}>
      {children}
    </div>
  );
}

/** Thin rule between rows in a list. */
export function Divider() {
  return <div className="h-px bg-line-soft" />;
}

/* -------------------------------------------------------------- typography */

/** Small uppercase kicker. Sits above a title or labels a section. */
export function Eyebrow({ children, className = 'text-brand' }: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`eyebrow ${className}`}>{children}</div>;
}

/* ----------------------------------------------------------------- buttons */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'onHero' | 'ink';
  size?: 'sm' | 'md' | 'lg';
  /** Buttons fill their column by default; `false` makes one hug its label. */
  block?: boolean;
};

const VARIANTS = {
  primary: 'bg-brand text-white hover:bg-brand-hi active:bg-brand-hi',
  secondary: 'border border-line-in bg-surface text-ink hover:bg-muted',
  ghost: 'bg-brand-wash text-brand hover:bg-brand-pill',
  danger: 'bg-transparent text-danger hover:bg-cream',
  // On the dark hero the roles invert: white block, green label.
  onHero: 'bg-surface text-brand hover:bg-canvas',
  ink: 'bg-ink text-white hover:bg-ink/90',
};

const SIZES = {
  sm: 'h-[38px] rounded-chip px-4 text-sm',
  md: 'h-[52px] rounded-btn px-[18px] text-base',
  lg: 'h-[54px] rounded-btn px-[18px] text-base',
};

export function Button({
  variant = 'primary', size = 'md', block = true, className = '', ...props
}: ButtonProps) {
  return (
    <button
      type={props.type ?? 'button'}
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-bold transition
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand
        disabled:cursor-not-allowed disabled:opacity-50
        ${block ? 'w-full' : ''} ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
    />
  );
}

/** A square icon-only button, as used by the day stepper on Today. */
export function IconButton({
  label, active = true, className = '', ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      {...props}
      className={`flex h-10 w-10 items-center justify-center rounded-input border text-lg transition
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand
        disabled:cursor-not-allowed
        ${active
          ? 'border-line-in bg-surface text-ink hover:bg-muted'
          : 'border-line bg-muted text-ink-off'} ${className}`}
    />
  );
}

/* ------------------------------------------------------------------ fields */

export function Field({ label, hint, children }: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-bold text-ink-soft">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

const INPUT = `h-[46px] w-full rounded-input border border-line-in bg-surface px-[14px]
  font-bold text-ink placeholder:font-normal placeholder:text-ink-off`;

export function TextInput(props: ComponentPropsWithRef<'input'>) {
  return <input {...props} className={`${INPUT} ${props.className ?? ''}`} />;
}

export function NumberInput(props: ComponentPropsWithRef<'input'>) {
  return (
    <input type="number" inputMode="decimal" {...props} className={`${INPUT} ${props.className ?? ''}`} />
  );
}

/**
 * A number with its unit printed inside the box. The border lives on the
 * label so the whole thing reads as one control, and tapping the unit still
 * focuses the field.
 */
export function UnitInput({ unit, size = 'md', className = '', ...props }:
Omit<ComponentPropsWithRef<'input'>, 'size'> & { unit: string; size?: 'md' | 'lg' }) {
  return (
    <label
      className={`flex items-center gap-1.5 rounded-btn border border-line-in bg-surface px-[14px]
        focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-brand
        ${size === 'lg' ? 'h-[52px]' : 'h-12'} ${className}`}
    >
      <input
        inputMode="decimal"
        {...props}
        className={`w-full border-none bg-transparent font-extrabold text-ink outline-none
          ${size === 'lg' ? 'text-xl' : 'text-[17px]'}`}
      />
      <span className="shrink-0 text-sm text-ink-faint">{unit}</span>
    </label>
  );
}

/* ----------------------------------------------------------------- choices */

/**
 * A segmented control: two or three mutually exclusive options in a tinted
 * trough. Faster to tap than a dropdown and shows every option at once.
 */
export function Segmented<T extends string>({
  value, options, onChange, size = 'md', className = '',
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  /** `lg` is the full-width range toggle; `md` sits inside a card. */
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <div
      className={`grid gap-1.5 bg-brand-wash p-1
        ${size === 'lg' ? 'rounded-[14px]' : 'rounded-input'} ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`text-sm font-bold transition
              focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand
              ${size === 'lg' ? 'h-10 rounded-chip' : 'h-[38px] rounded-[9px]'}
              ${selected ? 'bg-surface text-brand shadow-sm' : 'bg-transparent text-ink-mute'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A row of outlined choices, for when the options need more room than a
 * segmented trough gives them.
 */
export function Choice<T extends string>({ value, options, onChange, columns = 3 }: {
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
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`h-11 rounded-input border text-sm font-bold transition
              focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand
              ${selected
                ? 'border-brand bg-brand text-white'
                : 'border-line-in bg-surface text-ink hover:bg-muted'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A tall option with a supporting line and a radio dot. */
export function OptionRow({ selected, label, sub, onClick }: {
  selected: boolean;
  label: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex items-center justify-between gap-3 rounded-btn border px-3.5 py-3 text-left transition
        focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand
        ${selected ? 'border-brand bg-brand-wash' : 'border-line bg-surface hover:bg-muted'}`}
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-bold text-ink">{label}</span>
        {sub && <span className="text-[13px] text-ink-mute">{sub}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2
          ${selected ? 'border-brand' : 'border-line-mid'}`}
      >
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
      </span>
    </button>
  );
}

/* --------------------------------------------------------------------- bits */

/** One labelled figure in a tinted tile. Three of these fit a phone row. */
export function Stat({ label, value, tone = 'neutral' }: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  const tones = {
    neutral: 'text-ink',
    good: 'text-brand',
    warn: 'text-over',
  };
  return (
    <div className="flex flex-col gap-1 rounded-[14px] bg-brand-wash p-3">
      <span className="text-[11px] font-bold text-ink-soft">{label}</span>
      <span className={`tnum text-xl font-extrabold ${tones[tone]}`}>{value}</span>
    </div>
  );
}

/** A small rounded tag. */
export function Pill({ children, tone = 'wash' }: {
  children: ReactNode;
  tone?: 'wash' | 'onHero';
}) {
  const tones = {
    wash: 'bg-brand-wash text-brand',
    onHero: 'border border-white/20 bg-white/15 text-white',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** The small green dot that marks something live or next up. */
export function Dot({ className = 'bg-brand-lite' }: { className?: string }) {
  return <span aria-hidden="true" className={`h-[7px] w-[7px] shrink-0 rounded-full ${className}`} />;
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-ink-mute">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-line-in border-t-brand" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/* ----------------------------------------------------------------- dialogs */

/**
 * A yes-or-no question: a bottom sheet on a phone, a centred dialog from lg
 * up, which is the same shape the calculator arrives in so a modal always
 * comes from the same place.
 *
 * Escape and the backdrop both cancel. A confirmation that is hard to back
 * out of is a trap, and the whole point of asking is that the answer might
 * be no.
 */
export function ConfirmDialog({
  title, children, confirmLabel, cancelLabel = 'Cancel', busy = false, onConfirm, onCancel,
}: {
  title: string;
  /** The body of the question. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Disables both buttons while the write is in flight. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // Focus lands inside, so a keyboard or screen reader starts on the question
  // rather than wherever it happened to be behind the sheet.
  useEffect(() => {
    panel.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Keep the page behind from scrolling under the sheet.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-ink/60 lg:items-center lg:p-6"
      onClick={onCancel}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-t-card bg-surface p-5 outline-none
          lg:rounded-card lg:p-6"
      >
        <h2 id="confirm-title" className="display text-[26px] text-ink">
          {title}
        </h2>
        <div className="mt-2.5 text-[15px] leading-snug text-ink-soft">{children}</div>

        <div className="mt-5 flex gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? 'Saving…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
