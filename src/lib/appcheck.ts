// Whether and how to start Firebase App Check.
//
// App Check attests that a request came from this app rather than from a
// script someone pointed at the project. It is a layer on top of the security
// rules, never a replacement: the rules still decide who may read what.
//
// Three outcomes, decided here so the decision is testable without a browser:
//
//   off    - no site key configured. The app runs exactly as before. This is
//            what a self-hoster gets until they set one up, and it is why
//            adding App Check cannot break an existing deployment.
//   debug  - running on a developer's own machine. The SDK prints a debug
//            token to the console, which gets registered once in the Firebase
//            console, and reCAPTCHA is not involved at all.
//   live   - anywhere else. Real reCAPTCHA Enterprise attestation.

export type AppCheckPlan =
  | { mode: 'off' }
  | { mode: 'debug'; siteKey: string }
  | { mode: 'live'; siteKey: string };

/**
 * Hostnames that mean "this is someone's development machine".
 *
 * A debug token is a bearer credential for the project, so this list stays
 * narrow and is matched exactly rather than by substring — "localhost" must
 * not match "localhost.evil.example".
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

export function isLocalHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (LOCAL_HOSTS.has(host)) return true;
  // mDNS names a phone on the same wifi uses to reach a dev server.
  return host.endsWith('.local');
}

export function planAppCheck({ siteKey, hostname }: {
  siteKey?: string;
  hostname: string;
}): AppCheckPlan {
  const key = siteKey?.trim();
  if (!key) return { mode: 'off' };
  return isLocalHost(hostname) ? { mode: 'debug', siteKey: key } : { mode: 'live', siteKey: key };
}
