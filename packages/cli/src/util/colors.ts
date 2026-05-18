/**
 * Tiny ANSI colour helpers. Keeping this hand-rolled avoids a dep on chalk
 * or picocolors; the CLI does single-digit colour calls per command, not
 * a full pretty-printer.
 */

const isTTY = process.stdout.isTTY && process.env.NO_COLOR !== '1'

const wrap = (code: number) => (s: string) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s)

export const red = wrap(31)
export const green = wrap(32)
export const yellow = wrap(33)
export const blue = wrap(34)
export const magenta = wrap(35)
export const cyan = wrap(36)
export const gray = wrap(90)
export const bold = wrap(1)
export const dim = wrap(2)
