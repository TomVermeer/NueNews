import type { SourceKind } from '@nuenews/shared'
import type { Provider } from './types'

export class UnknownProviderError extends Error {
  constructor(kind: string) {
    super(`No provider registered for source kind "${kind}"`)
    this.name = 'UnknownProviderError'
  }
}

export interface ProviderRegistry {
  get(kind: SourceKind): Provider
  kinds(): SourceKind[]
}

export function createRegistry(providers: Provider[]): ProviderRegistry {
  const byKind = new Map<SourceKind, Provider>()
  for (const provider of providers) {
    if (byKind.has(provider.kind)) {
      throw new Error(`Duplicate provider for source kind "${provider.kind}"`)
    }
    byKind.set(provider.kind, provider)
  }

  return {
    get(kind) {
      const provider = byKind.get(kind)
      if (!provider) throw new UnknownProviderError(kind)
      return provider
    },
    kinds: () => [...byKind.keys()],
  }
}
