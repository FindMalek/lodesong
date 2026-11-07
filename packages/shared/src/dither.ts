const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

export function ditherSeed(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 0x01000193);
  }
  return value >>> 0;
}

const unit = (seed: number, salt: number) => (Math.imul(seed ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b) >>> 8) / 16777216;

/** One ordered-dither frame as on/off cells, row by row. `time` (seconds) drifts the glow; 0 is the still frame. */
export function ditherCells(cols: number, rows: number, seed: number, time = 0): Uint8Array {
  const cx = 0.2 + unit(seed, 1) * 0.6;
  const cy = 0.2 + unit(seed, 2) * 0.6;
  const angle = unit(seed, 3) * Math.PI * 2;
  const phase = unit(seed, 4) * Math.PI * 2;
  const reach = 0.45 + unit(seed, 5) * 0.3;
  const drift = time * 0.25;
  const x0 = cx + Math.cos(phase + drift) * 0.12;
  const y0 = cy + Math.sin(phase + drift * 0.8) * 0.12;
  const cells = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col / cols;
      const y = row / rows;
      const glow = Math.max(0, 1 - Math.hypot(x - x0, (y - y0) * (rows / cols)) / reach);
      const ramp = (x * Math.cos(angle) + y * Math.sin(angle) + 1) / 2;
      const level = glow * 0.9 + ramp * 0.1;
      const threshold = ((BAYER_4[(row % 4) * 4 + (col % 4)] ?? 0) + 0.5) / 16;
      cells[row * cols + col] = level > threshold ? 1 : 0;
    }
  }
  return cells;
}

/** The on cells as one SVG path of horizontal runs, `cell` units per cell. */
export function ditherPath(cells: Uint8Array, cols: number, cell: number): string {
  const rows = cells.length / cols;
  let path = "";
  for (let row = 0; row < rows; row += 1) {
    let col = 0;
    while (col < cols) {
      if (!cells[row * cols + col]) {
        col += 1;
        continue;
      }
      const start = col;
      while (col < cols && cells[row * cols + col]) col += 1;
      path += `M${start * cell} ${row * cell}h${(col - start) * cell}v${cell}h${-(col - start) * cell}z`;
    }
  }
  return path;
}
