/**
 * Persists the last-opened folder handle + space id across browser restarts.
 *
 * The File System Access API lets us store a live `FileSystemDirectoryHandle`
 * in IndexedDB. On next load we can call `queryPermission({mode:'readwrite'})`
 * — if the browser still remembers the grant (common within a session, and
 * possible across restarts for PWAs), we restore silently; otherwise the user
 * clicks one button to re-grant. This avoids the "pick folder every time"
 * tax and matches the "open your last workspace" UX people expect.
 */

const DB_NAME = 'pizza-doc'
const DB_VERSION = 1
const STORE = 'session'
const KEY_ROOT_HANDLE = 'rootHandle'
const KEY_LAST_SPACE_ID = 'lastSpaceId'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb()
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Non-fatal — persistence is a convenience, not a correctness feature.
  }
}

async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Ignore.
  }
}

export async function saveRootHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await idbSet(KEY_ROOT_HANDLE, handle)
}

export async function loadRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  return await idbGet<FileSystemDirectoryHandle>(KEY_ROOT_HANDLE)
}

export async function clearRootHandle(): Promise<void> {
  await idbDelete(KEY_ROOT_HANDLE)
  await idbDelete(KEY_LAST_SPACE_ID)
}

export async function saveLastSpaceId(id: string | null): Promise<void> {
  if (id === null) await idbDelete(KEY_LAST_SPACE_ID)
  else await idbSet(KEY_LAST_SPACE_ID, id)
}

export async function loadLastSpaceId(): Promise<string | null> {
  return await idbGet<string>(KEY_LAST_SPACE_ID)
}

type PermState = 'granted' | 'denied' | 'prompt'

interface HandleWithPermission {
  queryPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermState>
  requestPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermState>
}

export async function queryHandlePermission(handle: FileSystemDirectoryHandle): Promise<PermState> {
  const h = handle as unknown as HandleWithPermission
  if (!h.queryPermission) return 'prompt'
  try {
    return await h.queryPermission({ mode: 'readwrite' })
  } catch {
    return 'prompt'
  }
}

export async function requestHandlePermission(
  handle: FileSystemDirectoryHandle,
): Promise<PermState> {
  const h = handle as unknown as HandleWithPermission
  if (!h.requestPermission) return 'prompt'
  try {
    return await h.requestPermission({ mode: 'readwrite' })
  } catch {
    return 'denied'
  }
}
