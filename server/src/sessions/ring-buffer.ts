/** Keeps the most recent output of a session, bounded by character count. */
export class RingBuffer {
  private chunks: string[] = [];
  private size = 0;

  constructor(private readonly capacity: number) {}

  push(chunk: string) {
    if (chunk.length >= this.capacity) {
      this.chunks = [chunk.slice(chunk.length - this.capacity)];
      this.size = this.capacity;
      return;
    }
    this.chunks.push(chunk);
    this.size += chunk.length;
    while (this.size > this.capacity) {
      const head = this.chunks[0]!;
      const overflow = this.size - this.capacity;
      if (head.length <= overflow) {
        this.chunks.shift();
        this.size -= head.length;
      } else {
        this.chunks[0] = head.slice(overflow);
        this.size -= overflow;
      }
    }
  }

  toString(): string {
    return this.chunks.join('');
  }

  get length(): number {
    return this.size;
  }
}
