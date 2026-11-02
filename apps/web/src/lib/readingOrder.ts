/** Top to bottom, then left to right: the order a one-column layout shows grid widgets in. */
export function readingOrder<T extends { x: number; y: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.y - b.y || a.x - b.x)
}
