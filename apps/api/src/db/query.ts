/** The first row of a result, or undefined when there is none. */
export function firstRow<T>(rows: readonly T[]): T | undefined {
  return rows[0]
}

/** The first row of a result. For inserts and updates with `.returning()`, which always yield one. */
export function onlyRow<T>(rows: readonly T[]): T {
  const [row] = rows
  if (row === undefined) throw new Error('Expected the query to return a row')
  return row
}
