import { UseCaseView } from '@/views/usecase/UseCaseView'
import { useParams } from '@tanstack/react-router'

/** Thin adapter: pull params, hand off to the use-case view. */
export function UseCaseRoute() {
  const { spaceId, useCaseId } = useParams({ from: '/space/$spaceId/usecase/$useCaseId' })
  return <UseCaseView spaceId={spaceId} useCaseId={useCaseId} />
}
