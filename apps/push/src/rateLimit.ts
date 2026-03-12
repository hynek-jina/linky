export class RateLimitError extends Error {
  readonly status = 429;
  readonly code = "rate_limited";

  constructor(message: string) {
    super(message);
  }
}

interface RateLimitBucket {
  resetAt: number;
  hits: number;
}

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();

  check(key: string, maxHits: number, windowMs: number, nowMs: number): void {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= nowMs) {
      this.buckets.set(key, {
        hits: 1,
        resetAt: nowMs + windowMs,
      });
      return;
    }

    if (bucket.hits >= maxHits) {
      throw new RateLimitError("Too many requests");
    }

    bucket.hits += 1;
  }

  prune(nowMs: number): void {
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= nowMs) {
        this.buckets.delete(key);
      }
    }
  }
}
