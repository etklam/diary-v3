import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../../apps/api/src/app';

describe('bounded authentication rate limiter', () => {
  it('clears expired identities without weakening an active identity limit', () => {
    const limiter = createRateLimiter({ windowMs: 100, maxBuckets: 3 });
    limiter.consume('expired', 1, 0);
    limiter.consume('active', 1, 75);
    expect(limiter.size).toBe(2);
    limiter.consume('new', 1, 101);
    expect(limiter.size).toBe(2);
    expect(() => limiter.consume('active', 1, 101)).toThrow('Too many requests');
    expect(() => limiter.consume('expired', 1, 101)).not.toThrow();
  });

  it('fails closed at capacity rather than evicting active limits', () => {
    const limiter = createRateLimiter({ windowMs: 100, maxBuckets: 2 });
    limiter.consume('first', 1, 0);
    limiter.consume('second', 1, 1);
    expect(() => limiter.consume('third', 1, 2)).toThrow('Too many requests');
    expect(() => limiter.consume('first', 1, 2)).toThrow('Too many requests');
    expect(limiter.size).toBe(2);
    expect(() => limiter.consume('third', 1, 102)).not.toThrow();
    expect(limiter.size).toBe(1);
  });
});
