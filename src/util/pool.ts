export class Pool<T extends { active: boolean }> {
  readonly items: T[] = [];

  constructor(private create: () => T) {}

  obtain(): T {
    for (const item of this.items) if (!item.active) return item;
    const item = this.create();
    this.items.push(item);
    return item;
  }

  get activeCount(): number {
    let n = 0;
    for (const item of this.items) if (item.active) n++;
    return n;
  }
}
