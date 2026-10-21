import type { Db } from './client'
import { users } from './schema'

/** v1 runs as a single local user. Real auth will replace this later. */
export const LOCAL_USER_ID = 'local'

export async function ensureLocalUser(db: Db): Promise<string> {
  await db.insert(users).values({ id: LOCAL_USER_ID, name: 'Local user' }).onConflictDoNothing()
  return LOCAL_USER_ID
}
