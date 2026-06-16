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
 * Pick the best Wikipedia source: Polish first, then English.
 * Each value is either null or { title, description, extract, url }.
 */
export function pickWikipedia(entry) {
  if (!entry || !entry.wikipedia) return null
  const { pl, en } = entry.wikipedia
  if (pl && (pl.extract || pl.description)) return { ...pl, lang: 'pl' }
  if (en && (en.extract || en.description)) return { ...en, lang: 'en' }
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
