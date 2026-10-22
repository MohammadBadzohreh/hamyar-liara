// Opt-in bounded demo load, not a memory leak.
export class ResourceScenario {
  memory = null;
  expiresAt = 0;
  lastReport = -Infinity;
  timer;
  start() {
    this.reset();
    this.expiresAt = Date.now() + 60000;
    this.timer = setTimeout(() => this.reset(), 60000);
    this.timer.unref?.();
    return { expiresAt: this.expiresAt, maxMiB: 50 };
  }
  run() {
    if (Date.now() >= this.expiresAt) return true;
    if (Date.now() - this.lastReport < 1000) return false;
    this.lastReport = Date.now();
    this.memory ??= Buffer.alloc(50 * 1024 * 1024, 1);
    const until = performance.now() + 200;
    while (performance.now() < until) Math.sqrt(Math.random());
    return true;
  }
  reset() {
    clearTimeout(this.timer);
    this.expiresAt = 0;
    this.lastReport = -Infinity;
    this.memory = null;
  }
}
