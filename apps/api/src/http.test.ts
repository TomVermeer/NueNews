import { describe, expect, it } from 'vitest'
import { errorBody, formatIssues } from './http'

describe('formatIssues', () => {
  const issues = [
    { path: ['sources', 0, 'url'], message: 'Invalid URL' },
    { path: [], message: 'Required' },
  ]

  it('joins each issue as "path: message", naming the path as the caller likes', () => {
    expect(formatIssues(issues, (path) => path || 'json')).toBe(
      'sources.0.url: Invalid URL; json: Required',
    )
    expect(formatIssues(issues, (path) => `config.${path}`)).toBe(
      'config.sources.0.url: Invalid URL; config.: Required',
    )
  })

  it('is empty without issues', () => {
    expect(formatIssues([], (path) => path)).toBe('')
  })
})

describe('errorBody', () => {
  it("builds the API's standard error shape", () => {
    expect(errorBody('not_found', 'No such route')).toEqual({
      error: { code: 'not_found', message: 'No such route' },
    })
  })
})
