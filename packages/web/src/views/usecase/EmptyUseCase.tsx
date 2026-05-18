import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Shown when the selected flow has zero steps.
 */
export function EmptyUseCase({ useCaseId, flowLabel }: { useCaseId: string; flowLabel: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>{flowLabel} is empty</CardTitle>
          <CardDescription>
            No steps declared yet on{' '}
            <span className="font-mono text-[11px] text-fg-primary">usecase:{useCaseId}</span>.
            Steps describe how control flows between components.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
