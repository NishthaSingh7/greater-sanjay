export class ApiKeyPool {
  private keys: string[];
  private index = 0;

  constructor(keys: string[]) {
    this.keys = keys.filter((k) => k.trim().length > 0);
  }

  hasKeys(): boolean {
    return this.keys.length > 0;
  }

  getCurrentKeyIndex(): number {
    return this.index;
  }

  getKey(): string {
    if (!this.hasKeys()) {
      throw new Error('No API keys configured. Add keys in Settings.');
    }
    return this.keys[this.index];
  }

  rotate(): boolean {
    if (this.keys.length <= 1) {
      return false;
    }
    this.index = (this.index + 1) % this.keys.length;
    return true;
  }

  updateKeys(keys: string[]): void {
    this.keys = keys.filter((k) => k.trim().length > 0);
    this.index = 0;
  }

  keyCount(): number {
    return this.keys.length;
  }

  isRateLimitError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return (
      message.includes('rate limit') ||
      message.includes('quota') ||
      message.includes('429') ||
      message.includes('resource exhausted')
    );
  }
}
