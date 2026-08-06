import { hasMatchingRoute, matchesRoutePattern, normalizeRoutePattern } from '../src/route-pattern'

test('matches exact route patterns after normalizing trailing slashes', () => {
  expect(normalizeRoutePattern('/billing/')).toBe('/billing')
  expect(matchesRoutePattern('/billing/', '/billing')).toBe(true)
  expect(matchesRoutePattern('/billing/invoices', '/billing')).toBe(false)
})

test('matches descendant wildcard route patterns at a segment boundary', () => {
  expect(matchesRoutePattern('/billing/invoices', '/billing/invoices/*')).toBe(true)
  expect(matchesRoutePattern('/billing/invoices/42', '/billing/invoices/*')).toBe(true)
  expect(matchesRoutePattern('/billing/invoices/42/history', '/billing/invoices/*')).toBe(true)
  expect(matchesRoutePattern('/billing/invoices-old', '/billing/invoices/*')).toBe(false)
})

test('matches any configured route and validates route patterns', () => {
  expect(hasMatchingRoute('/inbox/thread/42', ['/billing', '/inbox/*'])).toBe(true)
  expect(hasMatchingRoute('/settings', [])).toBe(false)

  expect(() => normalizeRoutePattern('billing')).toThrow(
    'State launcher route patterns must be non-empty pathnames.',
  )
  expect(() => normalizeRoutePattern('/billing?tab=security')).toThrow(
    'State launcher route patterns must not include queries or hashes.',
  )
  expect(() => normalizeRoutePattern('/billing/*/history')).toThrow(
    'State launcher route wildcards must use a terminal /* suffix.',
  )
})
