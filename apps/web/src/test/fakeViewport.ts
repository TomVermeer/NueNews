import { vi, type Mock } from 'vitest'

type ChangeListener = (event: { matches: boolean }) => void

interface FakeQuery {
  readonly matches: boolean
  addEventListener: Mock<(type: string, listener: ChangeListener) => void>
  removeEventListener: Mock<(type: string, listener: ChangeListener) => void>
}

interface FakeViewport {
  matchMedia: Mock<() => FakeQuery>
  query: FakeQuery
  setCompact: (compact: boolean) => void
}

/**
 * Replaces `matchMedia` with a single query that reports `compact`, so a test can pick the screen
 * size and later flip it. Remove it with `vi.unstubAllGlobals()`.
 */
export function stubViewport(compact: boolean): FakeViewport {
  let matches = compact
  const listeners = new Set<ChangeListener>()
  const query: FakeQuery = {
    get matches() {
      return matches
    },
    addEventListener: vi.fn((type: string, listener: ChangeListener) => {
      listeners.add(listener)
    }),
    removeEventListener: vi.fn((type: string, listener: ChangeListener) => {
      listeners.delete(listener)
    }),
  }
  const matchMedia = vi.fn(() => query)
  vi.stubGlobal('matchMedia', matchMedia)

  return {
    matchMedia,
    query,
    setCompact(next) {
      matches = next
      for (const listener of listeners) listener({ matches: next })
    },
  }
}
