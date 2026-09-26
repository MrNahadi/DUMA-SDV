import { describe, expect, it } from 'vitest';
import { aiStatus } from './status';

describe('aiStatus', () => {
  it('is ready with a key online', () => expect(aiStatus({ apiKey: 'k' }, true)).toEqual({ kind: 'ready' }));
  it('is offline with a key and no network', () => expect(aiStatus({ apiKey: 'k' }, false)).toEqual({ kind: 'offline' }));
  it('reports no key before offline', () => {
    expect(aiStatus({ apiKey: null }, true)).toEqual({ kind: 'noKey' });
    expect(aiStatus({ apiKey: null }, false)).toEqual({ kind: 'noKey' });
  });
});
