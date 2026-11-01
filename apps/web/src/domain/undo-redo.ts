export class UndoRedoHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private current: T;

  constructor(
    initial: T,
    private readonly limit = 100,
  ) {
    this.current = initial;
  }

  get value(): T {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  push(next: T): T {
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.current = next;
    this.future = [];
    return this.current;
  }

  undo(): T {
    const previous = this.past.pop();
    if (previous === undefined) return this.current;
    this.future.push(this.current);
    this.current = previous;
    return this.current;
  }

  redo(): T {
    const next = this.future.pop();
    if (next === undefined) return this.current;
    this.past.push(this.current);
    this.current = next;
    return this.current;
  }
}
