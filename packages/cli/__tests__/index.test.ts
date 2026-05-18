import { describe, expect, it, vi } from 'vitest'
import { CLI_VERSION, runCli } from '../src/index.js'

function createIo() {
  return {
    stdout: vi.fn<(message: string) => void>(),
    stderr: vi.fn<(message: string) => void>(),
  }
}

describe('CLI entrypoint', () => {
  it('prints root help successfully', async () => {
    const io = createIo()

    await expect(runCli(['--help'], io)).resolves.toBe(0)

    const output = io.stdout.mock.calls.join('\n')
    expect(output).toContain('pd <command> [args] [flags]')
    expect(output).toContain('validate')
    expect(output).not.toContain('--from-java')
    expect(io.stderr).not.toHaveBeenCalled()
  })

  it('prints the package-aligned version successfully', async () => {
    const io = createIo()

    await expect(runCli(['--version'], io)).resolves.toBe(0)

    expect(io.stdout).toHaveBeenCalledWith(`pizza-doc ${CLI_VERSION}`)
    expect(io.stderr).not.toHaveBeenCalled()
  })

  it('returns usage exit code for unknown commands', async () => {
    const io = createIo()

    await expect(runCli(['wat'], io)).resolves.toBe(2)

    expect(io.stderr.mock.calls.join('\n')).toContain('unknown command: wat')
    expect(io.stdout.mock.calls.join('\n')).toContain('pd <command> [args] [flags]')
  })
})
