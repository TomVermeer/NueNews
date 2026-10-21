/** A default widget title built from its sources' names: "Tweakers" or "Tweakers +2". */
export function suggestTitle(names: readonly string[]): string | undefined {
  const [first, ...rest] = names
  if (!first) return undefined
  return rest.length === 0 ? first : `${first} +${rest.length}`
}
