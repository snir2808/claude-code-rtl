/**
 * Fake timers for the activate() tests. While installed, setTimeout,
 * setInterval, their clear functions, Date.now() and `new Date()` follow a
 * clock that moves only when a test calls tick() or jump(). Mocha keeps its
 * own references to the real timers, so its timeouts are not affected.
 */

interface Timer {
  at: number;
  every: number | null;
  callback: () => void;
}

type Globals = Record<'setTimeout' | 'setInterval' | 'clearTimeout' | 'clearInterval' | 'Date', unknown>;

const realSetImmediate = setImmediate;

/** Lets pending promise callbacks and immediates run. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((resolve) => realSetImmediate(resolve));
  }
}

function fakeDate(now: () => number): DateConstructor {
  const RealDate = Date;
  function FakeDate(this: unknown, ...args: unknown[]): Date | string {
    if (!new.target) {
      return new RealDate(now()).toString();
    }
    return args.length === 0 ? new RealDate(now()) : (Reflect.construct(RealDate, args) as Date);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = now;
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  return FakeDate as unknown as DateConstructor;
}

export class FakeClock {
  private readonly timers = new Map<number, Timer>();
  private nextId = 1;
  private saved: Globals | undefined;

  constructor(public now = new Date(2026, 9, 10, 9, 0).getTime()) {}

  install(): void {
    const globals = globalThis as unknown as Globals;
    this.saved = {
      setTimeout: globals.setTimeout,
      setInterval: globals.setInterval,
      clearTimeout: globals.clearTimeout,
      clearInterval: globals.clearInterval,
      Date: globals.Date,
    };
    const clear = (id: unknown): void => {
      if (typeof id === 'number') {
        this.timers.delete(id);
      }
    };
    globals.setTimeout = (callback: () => void, ms = 0) => this.add(callback, ms, null);
    globals.setInterval = (callback: () => void, ms = 0) => this.add(callback, ms, Math.max(ms, 1));
    globals.clearTimeout = clear;
    globals.clearInterval = clear;
    globals.Date = fakeDate(() => this.now);
  }

  uninstall(): void {
    if (this.saved) {
      Object.assign(globalThis, this.saved);
      this.saved = undefined;
    }
    this.timers.clear();
  }

  /** Timers and intervals still scheduled. */
  get pending(): number {
    return this.timers.size;
  }

  /** Moves the clock without running any timer, as a sleeping machine does. */
  jump(ms: number): void {
    this.now += ms;
  }

  /** Moves the clock, running every timer that falls due on the way, in order. */
  async tick(ms: number): Promise<void> {
    const end = this.now + ms;
    for (;;) {
      let nextId: number | undefined;
      let next: Timer | undefined;
      for (const [id, timer] of this.timers) {
        if (timer.at <= end && (!next || timer.at < next.at)) {
          nextId = id;
          next = timer;
        }
      }
      if (nextId === undefined || !next) {
        break;
      }
      this.now = next.at;
      if (next.every === null) {
        this.timers.delete(nextId);
      } else {
        next.at += next.every;
      }
      next.callback();
      await flush();
    }
    this.now = end;
    await flush();
  }

  private add(callback: () => void, ms: number, every: number | null): number {
    const id = this.nextId++;
    this.timers.set(id, { at: this.now + Math.max(ms, 0), every, callback });
    return id;
  }
}
