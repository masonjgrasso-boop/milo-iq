import { Link } from 'react-router-dom';
import { ProviderButtons } from '../components/ProviderButtons';

/** The four things the app does, as the tilted glass cards on the dark panel. */
const FEATURES = [
  { title: 'Nutrition', sub: 'Calories & weight', tilt: '-2deg' },
  { title: 'Habits', sub: 'Small daily rules', tilt: '2deg' },
  { title: 'Workouts', sub: 'Set once, just lift', tilt: '1.5deg' },
  { title: 'Photos', sub: 'One a week', tilt: '-1.5deg' },
];

export function SignIn() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      {/* The dark panel, with one corner cut away into the page below it. */}
      <div
        className="relative overflow-hidden rounded-br-[120px] px-[22px] pb-10 text-white"
        style={{
          background: 'radial-gradient(90% 70% at 0% 100%, #45705f 0%, #1f4536 45%, #173528 100%)',
          paddingTop: 'max(58px, calc(env(safe-area-inset-top) + 14px))',
        }}
      >
        <div className="flex h-[52px] w-fit items-center gap-3 rounded-full bg-canvas pr-[18px] pl-3 shadow-lift">
          <img src="/milo-mark.png" alt="" className="h-10 w-10 object-contain" />
          <span aria-hidden="true" className="h-5 w-px bg-line-in" />
          <span
            className="px-1 py-0.5 text-[17px] leading-none font-black text-brand uppercase italic"
            style={{
              fontStretch: '125%',
              letterSpacing: '-0.01em',
              background:
                'linear-gradient(transparent 58%, #bfe5cc 58%, #bfe5cc 92%, transparent 92%)',
            }}
          >
            Free to all
          </span>
        </div>

        {/* Two columns, the right one dropped slightly, which is what gives the
            stack its scattered look without any absolute positioning. */}
        <ul className="mt-7 grid grid-cols-2 gap-x-3 gap-y-4">
          {FEATURES.map((feature, index) => (
            <li
              key={feature.title}
              className="rounded-[18px] border border-white/20 bg-white/10 p-4 backdrop-blur-[10px]"
              style={{
                transform: `rotate(${feature.tilt})`,
                marginTop: index % 2 === 1 ? 16 : 0,
                boxShadow: '0 16px 30px -18px rgb(0 0 0 / 0.55)',
              }}
            >
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-brand-lite" />
                <span className="display text-[18px] tracking-[0.05em]">{feature.title}</span>
              </span>
              <span className="mt-1.5 block text-xs leading-tight font-medium opacity-80">
                {feature.sub}
              </span>
            </li>
          ))}
        </ul>

        <p className="display mt-8 max-w-[250px] text-[40px]">
          Daily progress
          <br />
          <span className="text-brand-lite">made simple</span>
        </p>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-[22px] px-7 py-8">
        <div className="flex flex-col gap-2.5">
          <h1 className="font-wordmark text-[54px] leading-none tracking-[0.02em] text-brand uppercase">
            Milo IQ
          </h1>
          <p className="text-[17px] text-ink-soft">Track the journey.</p>
          <Link to="/" className="text-sm font-bold text-ink-mute hover:text-brand">
            &larr; Back
          </Link>
        </div>

        <ProviderButtons />

        <p className="text-center text-xs leading-relaxed text-ink-faint">
          By continuing you agree to the{' '}
          <Link to="/terms" className="font-semibold text-brand underline">Terms</Link> and{' '}
          <Link to="/privacy" className="font-semibold text-brand underline">Privacy</Link>.
        </p>
      </div>
    </div>
  );
}
