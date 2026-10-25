// Items are bucketed by their center; queries should pad their bounds by the largest item radius.
export class SpatialHash<T> {
  private cells = new Map<number, T[]>();
  private used: T[][] = [];

  constructor(public cellSize: number) {}

  private key(cx: number, cy: number): number {
    return (cx + 0x8000) * 0x10000 + (cy + 0x8000);
  }

  clear(): void {
    for (const cell of this.used) cell.length = 0;
    this.used.length = 0;
  }

  insert(item: T, x: number, y: number): void {
    const k = this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
    let cell = this.cells.get(k);
    if (!cell) this.cells.set(k, (cell = []));
    if (cell.length === 0) this.used.push(cell);
    cell.push(item);
  }

  query(minX: number, minY: number, maxX: number, maxY: number, out: T[]): T[] {
    out.length = 0;
    const x0 = Math.floor(minX / this.cellSize);
    const y0 = Math.floor(minY / this.cellSize);
    const x1 = Math.floor(maxX / this.cellSize);
    const y1 = Math.floor(maxY / this.cellSize);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const cell = this.cells.get(this.key(cx, cy));
        if (cell) for (const item of cell) out.push(item);
      }
    }
    return out;
  }
}
