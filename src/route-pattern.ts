import type { StateLauncherRoutePattern } from './index'

const descendantWildcard = '/*'

export function normalizeRoutePattern(pattern: StateLauncherRoutePattern): string {
  if (typeof pattern !== 'string' || pattern.length === 0 || !pattern.startsWith('/')) {
    throw new TypeError('State launcher route patterns must be non-empty pathnames.')
  }

  const normalizedPattern = normalizePathname(pattern)

  if (normalizedPattern.includes('?') || normalizedPattern.includes('#')) {
    throw new TypeError('State launcher route patterns must not include queries or hashes.')
  }

  if (normalizedPattern.includes('*') && !normalizedPattern.endsWith(descendantWildcard)) {
    throw new TypeError('State launcher route wildcards must use a terminal /* suffix.')
  }

  return normalizedPattern
}

export function matchesRoutePattern(pathname: string, pattern: StateLauncherRoutePattern): boolean {
  const normalizedPathname = normalizePathname(pathname)
  const normalizedPattern = normalizeRoutePattern(pattern)

  if (!normalizedPattern.endsWith(descendantWildcard)) {
    return normalizedPathname === normalizedPattern
  }

  const basePathname = normalizePathname(normalizedPattern.slice(0, -descendantWildcard.length))

  return (
    basePathname === '/' ||
    normalizedPathname === basePathname ||
    normalizedPathname.startsWith(`${basePathname}/`)
  )
}

export function hasMatchingRoute(
  pathname: string,
  routes: readonly StateLauncherRoutePattern[],
): boolean {
  return routes.some((route) => matchesRoutePattern(pathname, route))
}

function normalizePathname(pathname: string): string {
  const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`

  if (withLeadingSlash === '/') {
    return withLeadingSlash
  }

  return withLeadingSlash.replace(/\/+$/, '') || '/'
}
