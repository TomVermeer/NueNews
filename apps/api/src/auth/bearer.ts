/** The token of an `Authorization: Bearer <token>` header, or undefined for anything else. */
export function bearerToken(header: string | null | undefined): string | undefined {
  const [scheme, token] = (header ?? '').split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined
  return token
}
