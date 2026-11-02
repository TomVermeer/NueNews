/** One row of a `ResolveList`: a source address the user enters and looks up. */
export interface SourceRow {
  /**
   * Rows are keyed by id, not index: ResolveInput keeps its own text, so removing a row would
   * otherwise leave the old text in the row that moves up.
   */
  readonly id: number
  /** The canonical key (feed URL or channel ID). Empty until the address has been looked up. */
  value: string
  /** The user's own name for the source, or empty. */
  label: string
  /** The name the lookup found, used to suggest a title. */
  name: string
}

let nextRowId = 0

/** A new row, empty or prefilled from a stored source. */
export function newSourceRow(value = '', label = ''): SourceRow {
  return { id: nextRowId++, value, label, name: '' }
}

/** The rows that have been looked up. */
export function resolvedRows(rows: readonly SourceRow[]): SourceRow[] {
  return rows.filter((row) => row.value)
}

/** The name each row is known by (the user's label, else the looked-up name), skipping unknowns. */
export function rowNames(rows: readonly SourceRow[]): string[] {
  return rows.map((row) => row.label.trim() || row.name).filter((name) => name)
}

/** The row's label for the stored config: present only when the user typed one. */
export function labelOf(row: SourceRow): { label?: string } {
  const label = row.label.trim()
  return label ? { label } : {}
}
