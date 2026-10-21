export interface AuthenticatedUser {
  id: string
  email?: string
}

/** Works out who is calling from the request headers. Resolves with nothing when nobody is signed in. */
export type Authenticator = (headers: Headers) => Promise<AuthenticatedUser | undefined>
