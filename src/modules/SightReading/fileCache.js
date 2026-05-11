/**
 * fileCache.js
 * Persists the user's scanned/picked file list across page reloads using IndexedDB.
 * File objects can't be serialized, so we store the raw ArrayBuffer + metadata
 * and reconstruct File objects on restore.
 */

const DB_NAME = 'PianoAppFileCache'
const DB_VER  = 2           // bumped to drop the old meta store
const FILES   = 'files'     // objectStore: rows of { name, type, folder, content: ArrayBuffer }

// ── IndexedDB helpers ────────────────────────────────────────────────────────

function openDB () {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = e => {
      const db = e.target.result
      // Drop old meta store if it exists (v1 → v2 migration)
      if (db.objectStoreNames.contains('meta')) db.deleteObjectStore('meta')
      if (!db.objectStoreNames.contains(FILES))
        db.createObjectStore(FILES, { autoIncrement: true })
    }
    req.onsuccess = e => res(e.target.result)
    req.onerror   = e => rej(e.target.error)
  })
}

const txDone = tx =>
  new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = e => rej(e.target.error) })

const storeGetAll = store => new Promise((res, rej) => {
  const r = store.getAll(); r.onsuccess = e => res(e.target.result); r.onerror = e => rej(e.target.error)
})

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Persist a list of file entries to IndexedDB.
 * Each entry must have { name, type, folder, fileObj }.
 * @param {Array<{ name: string, type: 'midi'|'score', folder: string, fileObj: File }>} entries
 */
export async function saveFilesToCache (entries) {
  try {
    // Read all ArrayBuffers first (before opening the write transaction)
    const rows = await Promise.all(
      entries.map(async e => ({
        name:    e.name,
        type:    e.type,
        folder:  e.folder ?? 'My Files',
        content: await e.fileObj.arrayBuffer(),
      }))
    )
    const db = await openDB()
    const tx = db.transaction([FILES], 'readwrite')
    tx.objectStore(FILES).clear()
    rows.forEach(r => tx.objectStore(FILES).add(r))
    await txDone(tx)
  } catch (err) {
    console.warn('[fileCache] save failed:', err)
  }
}

/**
 * Restore previously saved file entries from IndexedDB.
 * Returns null if nothing is cached.
 * @returns {Promise<{ entries: Array, folderName: string } | null>}
 */
export async function loadFilesFromCache () {
  try {
    const db   = await openDB()
    const tx   = db.transaction([FILES], 'readonly')
    const rows = await storeGetAll(tx.objectStore(FILES))
    if (!rows || rows.length === 0) return null
    const entries = rows.map(r => ({
      name:    r.name,
      type:    r.type,
      folder:  r.folder ?? 'My Files',
      fileObj: new File([r.content], r.name),
    }))
    return { entries }
  } catch (err) {
    console.warn('[fileCache] load failed:', err)
    return null
  }
}

/**
 * Wipe the cache entirely.
 */
export async function clearFilesCache () {
  try {
    const db = await openDB()
    const tx = db.transaction([FILES, META], 'readwrite')
    tx.objectStore(FILES).clear()
    tx.objectStore(META).clear()
    await txDone(tx)
  } catch (err) {
    console.warn('[fileCache] clear failed:', err)
  }
}
