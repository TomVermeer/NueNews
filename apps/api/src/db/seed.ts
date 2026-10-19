import type { Db } from './client'
import { users } from './schema'

/** v1 runs as a single local user. Real auth will replace this later. */
export const LOCAL_USER_ID = 'local'

export function ensureLocalUser(db: Db): string {
  db.insert(users).values({ id: LOCAL_USER_ID, name: 'Local user' }).onConflictDoNothing().run()
  return LOCAL_USER_ID
}
