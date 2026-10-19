import { hc } from 'hono/client'
import type { AppType } from '@nuenews/api'

export const api = hc<AppType>('/').api.v1
