/**
 * Feature detection for the File System Access API.
 * Pizza Doc v1 requires it (Chromium-based browsers); Safari and Firefox
 * show the unsupported screen until the Tauri desktop wrapper lands.
 */
export function isFileSystemAccessSupported(): boolean {
  if (typeof window === 'undefined') return false
  return (
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
    'function'
  )
}
