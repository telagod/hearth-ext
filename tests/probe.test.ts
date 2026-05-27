import { describe, expect, it } from 'vitest';

/**
 * Pure-function unit test for the deny-host regexes used by the probe.
 * We import the regex set inline (not exported) to avoid coupling the
 * probe module to a `document`/`window` environment in Node tests.
 */

const DENY_HOSTS = [
  /\.bank\./i,
  /\.alipay\.com$/i,
  /mail\.google\.com$/i,
  /accounts\.google\.com$/i,
  /^(?:.+\.)?notion\.so$/i,
];

function isDenied(host: string): boolean {
  return DENY_HOSTS.some((rx) => rx.test(host));
}

describe('probe deny-list', () => {
  it('denies bank-like hosts', () => {
    expect(isDenied('mybank.bank.com')).toBe(true);
    expect(isDenied('test.bank.foo')).toBe(true);
  });

  it('denies google mail/accounts', () => {
    expect(isDenied('mail.google.com')).toBe(true);
    expect(isDenied('accounts.google.com')).toBe(true);
  });

  it('denies alipay', () => {
    expect(isDenied('payment.alipay.com')).toBe(true);
    expect(isDenied('www.alipay.com')).toBe(true);
  });

  it('denies notion subdomains', () => {
    expect(isDenied('user.notion.so')).toBe(true);
    expect(isDenied('notion.so')).toBe(true);
  });

  it('allows generic web hosts', () => {
    expect(isDenied('developer.mozilla.org')).toBe(false);
    expect(isDenied('github.com')).toBe(false);
    expect(isDenied('arxiv.org')).toBe(false);
  });
});
