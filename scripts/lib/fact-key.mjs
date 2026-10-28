import { createHash } from 'node:crypto'

/**
 * Key of an English fact text in scripts/sources/translations-pl.json. A hash
 * (not the text itself) so a changed Wikipedia infobox simply stops matching
 * and falls back to English instead of showing a stale translation.
 */
export const factKey = (en) => createHash('sha1').update(String(en).replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 10)
