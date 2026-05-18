import { decodeRefFromRoute } from '@/lib/entity-ref'
import { EntityView } from '@/views/entity/EntityView'
import { useParams } from '@tanstack/react-router'

/** Thin adapter: parse the route param, hand off to the dispatcher view. */
export function EntityRoute() {
  const { spaceId, refPath } = useParams({ from: '/space/$spaceId/entity/$refPath' })
  const refUri = decodeRefFromRoute(refPath)
  return <EntityView spaceId={spaceId} refUri={refUri} />
}
