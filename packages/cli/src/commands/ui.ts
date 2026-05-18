import { execFile } from 'node:child_process'
import * as fs from 'node:fs'
import { createServer } from 'node:http'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSpace } from '@pizza-doc/core'
import { nodeFileSystem } from '@pizza-doc/core/node-io'
import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, green, red, yellow } from '../util/colors.js'
import { expectedSpaceId, findSpaceRoot, resolveSpaceDir } from '../util/space-path.js'
import { CLI_VERSION } from '../util/version.js'

type UiServeContext =
  | { mode: 'global' }
  | { mode: 'local-space'; spaceDir: string; spaceId: string; changeId: string | null }

/**
 * `pd ui [--port <n>] [--no-open]`
 *
 * Serve the bundled Pizza Doc web app from `packages/web/dist/` on a
 * local port and (by default) open the user's browser at it. The web app
 * uses the File System Access API to read/write the space, which means
 * this is Chromium-only — Firefox / Safari users will see the picker but
 * not be able to open a folder.
 *
 * No Vite dev server is started — we serve a static build. This keeps
 * the user-facing surface dependency-free at runtime: just node:http
 * and the bundle that's already on disk next to the CLI.
 */
export async function cmdUi(args: ParsedArgs): Promise<number> {
  const bundleDir = findWebBundle()
  if (!bundleDir) {
    console.error(red('pd ui: cannot find the web bundle.'))
    console.error(
      dim(
        '  Looked for packages/web/dist/index.html relative to this CLI binary.\n' +
          '  If you cloned the repo, build the UI first:  pnpm --filter @pizza-doc/web build',
      ),
    )
    return 1
  }
  const port = parsePort(args.flags.port) ?? 5173
  const open = args.flags['no-open'] !== true
  const context = await resolveUiServeContext(args)
  const server = createServer((req, res) => {
    handleRequest(bundleDir, context, req, res)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve())
  }).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `${red(`pd ui: port ${port} is in use.`)} ${dim('Pass --port <n> to pick another.')}`,
      )
      return Promise.reject(err)
    }
    throw err
  })
  const url =
    context.mode === 'local-space'
      ? `http://127.0.0.1:${port}/space/${encodeURIComponent(context.spaceId)}`
      : `http://127.0.0.1:${port}/`
  console.log(`${green('✓')} ${bold('Pizza Doc UI')} serving from ${dim(bundleDir)}`)
  console.log(`  ${cyan(url)}`)
  if (context.mode === 'local-space') {
    const change = context.changeId ? ` ${dim(`change=${context.changeId}`)}` : ''
    console.log(`  ${green('✓')} auto-opened ${dim(context.spaceDir)}${change}`)
  } else {
    console.log(`  ${dim('global mode: choose a space from the UI')}`)
  }
  console.log(
    dim(
      '  The UI uses the File System Access API (Chromium-only). Firefox / Safari\n' +
        '  will load the page but cannot open a space folder.',
    ),
  )
  if (open) tryOpenBrowser(url)
  console.log(`\n${dim('Ctrl+C to stop.')}`)
  // Hold the process alive on the listening server.
  await new Promise<void>(() => undefined)
  return 0
}

async function resolveUiServeContext(args: ParsedArgs): Promise<UiServeContext> {
  if (args.flags.global === true) return { mode: 'global' }

  let dir: string | null = null
  if (args.positional[0]) {
    dir = resolveSpaceDir(args.positional[0])
  } else {
    const found = findSpaceRoot()
    if (found?.kind === 'space') dir = found.path
  }
  if (!dir) return { mode: 'global' }

  const loadResult = await loadSpace(nodeFileSystem(dir), '.', expectedSpaceId(dir))
  const spaceId = loadResult.space?.meta.id ?? expectedSpaceId(dir) ?? path.basename(dir)
  const changeId = typeof args.flags.change === 'string' ? args.flags.change : null
  return { mode: 'local-space', spaceDir: dir, spaceId, changeId }
}

/**
 * Walk up from the CLI binary to find a sibling `packages/web/dist/`. In
 * dev-symlink mode this lands on the workspace's web package; once we
 * ship via npm, the bundle would live under the published cli package.
 */
function findWebBundle(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  while (true) {
    const candidate = path.join(dir, 'packages', 'web', 'dist', 'index.html')
    if (fs.existsSync(candidate)) return path.dirname(candidate)
    const localDist = path.join(dir, 'web-dist', 'index.html')
    if (fs.existsSync(localDist)) return path.dirname(localDist)
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function parsePort(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null
  return n
}

function handleRequest(
  bundleDir: string,
  context: UiServeContext,
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): void {
  if ((req.url ?? '').startsWith('/api/')) {
    void handleApiRequest(context, req, res)
    return
  }

  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/')
  // Refuse traversal attempts: path.normalize then ensure the resolved
  // path is still inside bundleDir.
  const resolved = path.resolve(bundleDir, `.${path.posix.normalize(urlPath)}`)
  if (!resolved.startsWith(path.resolve(bundleDir))) {
    res.writeHead(403)
    res.end('forbidden')
    return
  }
  let target = resolved
  let stat: fs.Stats | null = null
  try {
    stat = fs.statSync(target)
  } catch {
    stat = null
  }
  if (stat?.isDirectory()) {
    target = path.join(target, 'index.html')
    try {
      stat = fs.statSync(target)
    } catch {
      stat = null
    }
  }
  // SPA fallback: if no file matches, serve index.html so client-side
  // routing works for fresh-loaded deep links.
  if (!stat) {
    target = path.join(bundleDir, 'index.html')
    try {
      stat = fs.statSync(target)
    } catch {
      res.writeHead(404)
      res.end('not found')
      return
    }
  }
  const ext = path.extname(target).toLowerCase()
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
  })
  fs.createReadStream(target).pipe(res)
}

async function handleApiRequest(
  context: UiServeContext,
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === '/api/session') {
    writeJson(res, {
      version: CLI_VERSION,
      mode: context.mode,
      space:
        context.mode === 'local-space'
          ? { id: context.spaceId, path: context.spaceDir, name: path.basename(context.spaceDir) }
          : null,
      changeId: context.mode === 'local-space' ? context.changeId : null,
    })
    return
  }

  if (context.mode !== 'local-space') {
    writeJson(res, { error: 'pd ui is running in global mode' }, 404)
    return
  }

  const fsys = nodeFileSystem(context.spaceDir)
  try {
    if (url.pathname === '/api/fs/list') {
      const dir = safeRel(url.searchParams.get('dir') ?? '.')
      writeJson(res, { files: await fsys.listFiles(dir) })
      return
    }
    if (url.pathname === '/api/fs/read') {
      const file = safeRel(url.searchParams.get('path') ?? '')
      const source = await fsys.readFile(file)
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      })
      res.end(source)
      return
    }
    if (url.pathname === '/api/fs/write') {
      if (req.method !== 'PUT' && req.method !== 'POST') {
        writeJson(res, { error: 'method not allowed' }, 405)
        return
      }
      const file = safeRel(url.searchParams.get('path') ?? '')
      await fsys.writeFile(file, await readBody(req))
      writeJson(res, { ok: true })
      return
    }
    if (url.pathname === '/api/fs/exists') {
      const file = safeRel(url.searchParams.get('path') ?? '')
      writeJson(res, { exists: await fsys.exists(file) })
      return
    }
    if (url.pathname === '/api/fs/mtime') {
      const file = safeRel(url.searchParams.get('path') ?? '')
      writeJson(res, { mtime: await fsys.mtime(file) })
      return
    }
    writeJson(res, { error: 'not found' }, 404)
  } catch (err) {
    writeJson(res, { error: err instanceof Error ? err.message : String(err) }, 400)
  }
}

function safeRel(value: string): string {
  const normalized = value
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/')
  if (normalized === '' || normalized === '.') return '.'
  if (normalized.startsWith('/') || normalized.split('/').some((part) => part === '..')) {
    throw new Error(`unsafe path: ${value}`)
  }
  return normalized.replace(/\/$/, '')
}

async function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function writeJson(res: import('node:http').ServerResponse, body: unknown, status = 200): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-cache',
  })
  res.end(json)
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
}

function tryOpenBrowser(url: string): void {
  // Best-effort: don't fail if the user's environment has no GUI shell
  // (CI, ssh sessions). Just log and let them click.
  const platform = process.platform
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open'
  const args = platform === 'win32' ? ['', url] : [url]
  try {
    execFile(cmd, args, (err) => {
      if (err) console.log(yellow(`  (could not auto-open browser: ${err.message})`))
    })
  } catch (err) {
    console.log(yellow(`  (could not auto-open browser: ${(err as Error).message})`))
  }
}
