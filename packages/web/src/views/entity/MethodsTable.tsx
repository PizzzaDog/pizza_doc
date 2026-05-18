import { Badge } from '@/components/ui/badge'
import type { Method } from '@pizza-doc/core'
import { SectionHeading } from './EntityIssues'
import { RefLink } from './RefLink'

/**
 * Component methods table. Shows name + params + returns, plus an optional
 * block listing each method's `calls` / `throws` lists inline.
 */
export function MethodsTable({
  spaceId,
  methods,
  emptyLabel = 'No methods declared.',
}: {
  spaceId: string
  methods: ReadonlyArray<Method>
  emptyLabel?: string
}) {
  return (
    <section aria-label="Methods">
      <SectionHeading>Methods</SectionHeading>
      {methods.length === 0 ? (
        <p className="text-ui text-fg-tertiary">{emptyLabel}</p>
      ) : (
        <div className="rounded-md border border-border-subtle">
          <table className="w-full text-ui">
            <thead>
              <tr className="border-b border-border-subtle text-left">
                <th className="px-3 py-2 text-[10px] font-mono uppercase tracking-wide text-fg-tertiary">
                  name
                </th>
                <th className="px-3 py-2 text-[10px] font-mono uppercase tracking-wide text-fg-tertiary">
                  params
                </th>
                <th className="px-3 py-2 text-[10px] font-mono uppercase tracking-wide text-fg-tertiary">
                  returns
                </th>
                <th className="px-3 py-2 text-[10px] font-mono uppercase tracking-wide text-fg-tertiary">
                  http
                </th>
              </tr>
            </thead>
            <tbody>
              {methods.map((m) => (
                <tr key={m.name} className="border-b border-border-subtle last:border-0 align-top">
                  <td className="px-3 py-2 font-mono text-[12px] text-fg-primary">{m.name}</td>
                  <td className="px-3 py-2">
                    {m.params.length === 0 ? (
                      <span className="text-fg-tertiary">—</span>
                    ) : (
                      <ul className="flex flex-col gap-0.5">
                        {m.params.map((p) => (
                          <li key={p.name} className="font-mono text-[12px]">
                            <span className="text-fg-primary">{p.name}</span>
                            <span className="text-fg-tertiary">: </span>
                            <span className="text-fg-secondary">{p.type}</span>
                            {p.optional ? <span className="ml-1 text-fg-tertiary">?</span> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[12px] text-fg-secondary">{m.returns}</td>
                  <td className="px-3 py-2">
                    {m.httpMethod ? (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="ghost">{m.httpMethod}</Badge>
                        {m.httpPath ? (
                          <span className="font-mono text-[11px] text-fg-tertiary">
                            {m.httpPath}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-fg-tertiary">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <MethodCallsBlock spaceId={spaceId} methods={methods} />
        </div>
      )}
    </section>
  )
}

function MethodCallsBlock({
  spaceId,
  methods,
}: {
  spaceId: string
  methods: ReadonlyArray<Method>
}) {
  const withCallsOrThrows = methods.filter((m) => m.calls.length > 0 || m.throws.length > 0)
  if (withCallsOrThrows.length === 0) return null
  return (
    <div className="border-t border-border-subtle px-3 py-3">
      <ul className="flex flex-col gap-2">
        {withCallsOrThrows.map((m) => (
          <li key={m.name}>
            <span className="font-mono text-[12px] text-fg-primary">{m.name}</span>
            {m.calls.length > 0 ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wide text-fg-tertiary">
                  calls
                </span>
                {m.calls.map((c) => (
                  <RefLink key={c.target} spaceId={spaceId} refUri={c.target} />
                ))}
              </div>
            ) : null}
            {m.throws.length > 0 ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wide text-fg-tertiary">
                  throws
                </span>
                {m.throws.map((t) => (
                  <span key={t} className="font-mono text-[12px] text-fg-secondary">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
