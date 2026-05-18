/**
 * Ref URIs contain slashes that would otherwise be interpreted as route
 * segments (`module:api/domain:users/component:UserService`). We encode the
 * whole thing as a single URL-safe segment and decode on the detail route.
 */
export function encodeRefForRoute(ref: string): string {
  return encodeURIComponent(ref)
}

export function decodeRefFromRoute(segment: string): string {
  return decodeURIComponent(segment)
}
