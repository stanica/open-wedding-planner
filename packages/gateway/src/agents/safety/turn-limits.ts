export class TurnLimitError extends Error {
  constructor(
    public readonly turnCount: number,
    public readonly maxTurns: number,
  ) {
    super(`Turn limit exceeded: ${turnCount}/${maxTurns}`);
    this.name = "TurnLimitError";
  }
}

export class TurnCounter {
  private count = 0;

  constructor(private readonly maxTurns: number) {}

  increment(): void {
    this.count++;
    if (this.count > this.maxTurns) {
      throw new TurnLimitError(this.count, this.maxTurns);
    }
  }

  getCount(): number {
    return this.count;
  }

  remaining(): number {
    return Math.max(0, this.maxTurns - this.count);
  }

  reset(): void {
    this.count = 0;
  }
}
