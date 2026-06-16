import rawDb from '../data/anatomy_db.json'

/**
 * Normalize a mesh name so that lookups are resilient to:
 *  - leading / trailing whitespace
 *  - case differences
 */
export function normalize(name) {
  return (name || '').trim().toLowerCase()
}

export const anatomyDb = rawDb

// Map normalized mesh_name -> entry for O(1) lookups on click.
export const meshIndex = (() => {
  const map = new Map()
  for (const entry of rawDb) {
    const key = normalize(entry.mesh_name)
    if (key && !map.has(key)) map.set(key, entry)
  }
  return map
})()

export function findEntryByMeshName(meshName) {
  return meshIndex.get(normalize(meshName)) || null
}

/**
 * Pick the best description source, in priority order:
 *   1. wikipedia.pl  (Polish structured entry)
 *   2. wikipedia.en  (English structured entry)
 *   3. entry.description  (flat fallback text, often English + trailing URL)
 * Returns { extract, url, lang } or null.
 */
export function pickWikipedia(entry) {
  if (!entry) return null

  const wiki = entry.wikipedia || {}
  if (wiki.pl && (wiki.pl.extract || wiki.pl.description)) {
    return { extract: wiki.pl.extract || wiki.pl.description, url: wiki.pl.url || null, lang: 'pl' }
  }
  if (wiki.en && (wiki.en.extract || wiki.en.description)) {
    return { extract: wiki.en.extract || wiki.en.description, url: wiki.en.url || null, lang: 'en' }
  }

  // Flat `description` field: pull a trailing URL out of the text if present.
  const raw = (entry.description || '').trim()
  if (raw) {
    const urlMatch = raw.match(/https?:\/\/\S+/i)
    const url = urlMatch ? urlMatch[0] : null
    const text = raw.replace(/https?:\/\/\S+/gi, '').replace(/\n{3,}/g, '\n\n').trim()
    const lang = url && url.includes('pl.wikipedia.org') ? 'pl' : 'en'
    return { extract: text, url, lang }
  }

  return null
}

/**
 * Search entries by latin name, polish name or mesh name.
 * Returns at most `limit` results.
 */
export function searchEntries(query, limit = 30) {
  const q = normalize(query)
  if (!q) return []
  const results = []
  for (const entry of anatomyDb) {
    const hay = `${entry.name_lat || ''} ${entry.name_pl || ''} ${entry.mesh_name || ''}`.toLowerCase()
    if (hay.includes(q)) {
      results.push(entry)
      if (results.length >= limit) break
    }
  }
  return results
}
