import { describe, it, expect } from 'vitest';
import { isLocalHost, planAppCheck } from './appcheck';

describe('isLocalHost', () => {
  it('recognises the usual local names', () => {
    for (const host of ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']) {
      expect(isLocalHost(host)).toBe(true);
    }
  });

  it('ignores case and stray whitespace', () => {
    expect(isLocalHost('LocalHost')).toBe(true);
    expect(isLocalHost('  localhost ')).toBe(true);
  });

  it('accepts an mDNS name, for testing on a phone over wifi', () => {
    expect(isLocalHost('masons-macbook.local')).toBe(true);
  });

  it('does not match a hostname that merely starts with localhost', () => {
    // A debug token is a credential for the project, so this has to be exact.
    expect(isLocalHost('localhost.evil.example')).toBe(false);
    expect(isLocalHost('notlocalhost')).toBe(false);
    expect(isLocalHost('localhost.com')).toBe(false);
  });

  it('does not match the live site', () => {
    expect(isLocalHost('milo-iq.web.app')).toBe(false);
    expect(isLocalHost('milo-iq.firebaseapp.com')).toBe(false);
  });

  it('does not match a host that merely ends in local without a dot', () => {
    expect(isLocalHost('mylocal')).toBe(false);
  });
});

describe('planAppCheck', () => {
  it('stays off when no site key is configured', () => {
    expect(planAppCheck({ hostname: 'milo-iq.web.app' })).toEqual({ mode: 'off' });
  });

  it('treats an empty or whitespace key as no key', () => {
    expect(planAppCheck({ siteKey: '', hostname: 'milo-iq.web.app' })).toEqual({ mode: 'off' });
    expect(planAppCheck({ siteKey: '   ', hostname: 'milo-iq.web.app' })).toEqual({ mode: 'off' });
  });

  it('goes live on the deployed site', () => {
    expect(planAppCheck({ siteKey: 'abc123', hostname: 'milo-iq.web.app' }))
      .toEqual({ mode: 'live', siteKey: 'abc123' });
  });

  it('uses a debug token on a development machine', () => {
    expect(planAppCheck({ siteKey: 'abc123', hostname: 'localhost' }))
      .toEqual({ mode: 'debug', siteKey: 'abc123' });
  });

  it('trims the key, since it is pasted from a console', () => {
    expect(planAppCheck({ siteKey: '  abc123\n', hostname: 'localhost' }))
      .toEqual({ mode: 'debug', siteKey: 'abc123' });
  });

  it('never goes to debug mode on a host that is not local', () => {
    // The thing that must not happen: a deployed site asking for a debug token.
    for (const host of ['milo-iq.web.app', 'localhost.evil.example', 'example.com']) {
      expect(planAppCheck({ siteKey: 'abc123', hostname: host }).mode).toBe('live');
    }
  });
});
