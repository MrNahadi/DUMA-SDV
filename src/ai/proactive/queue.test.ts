import { describe, expect, it } from 'vitest';
import { createSuggestionQueue, EXPIRY_S } from './queue';
import type { Suggestion, TriggerId } from './triggers';

const prio: Record<TriggerId, number> = { newFault: 5, derate: 4, packHot: 3, lowSoc: 2, chargeComplete: 1 };
let n = 0;
const s = (trigger: TriggerId, raisedAtS = n): Suggestion => ({ key: `${trigger}-${++n}`, trigger, priority: prio[trigger], raisedAtS, action: null, facts: {} });

describe('createSuggestionQueue', () => {
  it('shows the first and queues equal or lower priority', () => {
    const q = createSuggestionQueue();
    const a = s('lowSoc');
    const b = s('chargeComplete');
    q.offer(a, 0);
    q.offer(b, 0);
    expect(q.current()).toBe(a);
    expect(q.waiting()).toEqual([b]);
  });

  it('lets higher priority replace the shown one, which goes back to the front', () => {
    const q = createSuggestionQueue();
    const low = s('lowSoc');
    const other = s('chargeComplete');
    const fault = s('newFault');
    q.offer(low, 0);
    q.offer(other, 0);
    q.offer(fault, 1);
    expect(q.current()).toBe(fault);
    expect(q.waiting()).toEqual([low, other]);
    q.resolve(2);
    expect(q.current()).toBe(low);
  });

  it('keeps three waiting and drops the oldest', () => {
    const q = createSuggestionQueue();
    q.offer(s('newFault', 0), 0);
    const w = [s('chargeComplete', 1), s('chargeComplete', 2), s('chargeComplete', 3), s('chargeComplete', 4)];
    for (const x of w) q.offer(x, 5);
    expect(q.waiting()).toEqual(w.slice(1));
  });

  it('shows the highest priority waiting next', () => {
    const q = createSuggestionQueue();
    q.offer(s('newFault'), 0);
    const low = s('chargeComplete');
    const hot = s('packHot');
    q.offer(low, 0);
    q.offer(hot, 0);
    q.resolve(1);
    expect(q.current()).toBe(hot);
  });

  it('expires the shown one after 30 s from when it was shown', () => {
    const q = createSuggestionQueue();
    const a = s('packHot');
    const b = s('lowSoc');
    q.offer(a, 10);
    q.offer(b, 10);
    expect(q.tick(10 + EXPIRY_S - 0.01)).toBe(false);
    expect(q.tick(10 + EXPIRY_S)).toBe(true);
    expect(q.current()).toBe(b);
    expect(q.tick(10 + EXPIRY_S + 29)).toBe(false);
    expect(q.tick(10 + 2 * EXPIRY_S)).toBe(true);
    expect(q.current()).toBeNull();
  });

  it('clears', () => {
    const q = createSuggestionQueue();
    q.offer(s('newFault'), 0);
    q.offer(s('lowSoc'), 0);
    q.clear();
    expect(q.current()).toBeNull();
    expect(q.waiting()).toEqual([]);
  });
});
