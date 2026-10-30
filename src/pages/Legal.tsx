// Privacy policy and terms.
//
// Written to be read, not to be skipped. Anyone self-hosting Milo IQ should
// read these and adjust them: they describe how the app behaves, but you are
// the one running the Firebase project, so you are the data controller.

import { Link } from 'react-router-dom';
import { Page } from '../components/Layout';

function Legal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Page title={title}>
      <Link
        to="/"
        className="mb-4 inline-block text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        &larr; Back
      </Link>
      <div className="space-y-5 text-sm leading-relaxed text-slate-700">{children}</div>
    </Page>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-base font-semibold text-slate-900">{heading}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function Privacy() {
  return (
    <Legal title="Privacy">
      <p className="text-slate-600">
        Milo IQ is open-source software you or someone you know is running. There is no
        company behind it, no analytics, no advertising and nothing is sold.
      </p>

      <Section heading="What is stored">
        <p>
          Whatever you enter: your height, weight, age, sex, goal, food and calorie logs,
          weigh-ins, rules, workouts and any progress photos you upload. Your name and
          email address come from whichever sign-in provider you used.
        </p>
      </Section>

      <Section heading="Where it is stored">
        <p>
          In a Google Firebase project owned by whoever deployed this copy of the app.
          Google processes it on their behalf. Nobody else receives it.
        </p>
      </Section>

      <Section heading="Who can see it">
        <p>
          Only you, unless you join a group and tick something to share. Sharing is off by
          default for every category.
        </p>
        <p>
          When you do share, only the specific summary you ticked is published to that
          group — not your underlying logs. Weight is shared as a change over time, never
          as a number on the scale. Untick a box and that section is removed immediately.
        </p>
        <p>
          A coach in a group you join can see the same shared summary as other members,
          plus any notes they write about you. A coach cannot see your raw logs.
        </p>
        <p className="text-slate-600">
          One honest caveat about photos: shared photo thumbnails are published as links
          that work for anyone holding them. Milo IQ only ever shares the small thumbnail,
          never the full-size image, but a link already fetched by someone cannot be
          withdrawn afterwards. Share photos only with people you trust.
        </p>
      </Section>

      <Section heading="No tracking">
        <p>
          No analytics, no advertising identifiers, no third-party trackers, no cookies
          beyond the one your sign-in provider needs to keep you signed in.
        </p>
      </Section>

      <Section heading="Your data is yours">
        <p>
          You can export everything as JSON or CSV at any time, and you can delete your
          account from inside the app. Deletion removes your logs, photos, group
          memberships and the account itself. It is immediate and cannot be undone.
        </p>
      </Section>

      <Section heading="Children">
        <p>Milo IQ is not intended for anyone under 13.</p>
      </Section>

      <Section heading="Changes">
        <p>
          Whoever runs this copy may update this page. The source history records every
          change.
        </p>
      </Section>
    </Legal>
  );
}

export function Terms() {
  return (
    <Legal title="Terms">
      <Section heading="Milo IQ is not medical advice">
        <p>
          This is important, so it goes first. Milo IQ estimates calorie targets and
          maintenance levels from formulas and from your own logs. Those are estimates,
          not clinical guidance.
        </p>
        <p>
          Talk to a doctor or a registered dietitian before making significant changes to
          how you eat or train, especially if you are pregnant, have an eating disorder or
          a history of one, are managing diabetes, heart or kidney conditions, or are
          taking medication affected by diet or weight.
        </p>
        <p>
          The app will not recommend eating below a safe minimum intake, but it cannot
          know your circumstances. Use your judgement, and a professional&rsquo;s.
        </p>
      </Section>

      <Section heading="The software is provided as is">
        <p>
          Milo IQ is free, open-source software released under the MIT licence. It comes
          with no warranty of any kind. Whoever runs this copy is not liable for any loss
          arising from using it, including loss of data.
        </p>
      </Section>

      <Section heading="Keep your own backups">
        <p>
          Use the export function now and then. Data can be lost to a mistake, a billing
          lapse on the hosting account, or a bug.
        </p>
      </Section>

      <Section heading="Groups">
        <p>
          You decide what you share and with whom. Share only with people you trust, and
          remember that anyone who can see something can also screenshot it. Leaving a
          group ends access to anything new, immediately.
        </p>
      </Section>

      <Section heading="Acceptable use">
        <p>
          Do not use Milo IQ to harass anyone, to upload anything you do not have the
          right to upload, or to attempt to reach another user&rsquo;s data.
        </p>
      </Section>

      <Section heading="Your account">
        <p>
          You can delete your account at any time from the app. Whoever runs this copy may
          remove accounts that abuse the service.
        </p>
      </Section>
    </Legal>
  );
}
