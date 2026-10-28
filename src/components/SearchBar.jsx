import { useEffect, useMemo, useState } from 'react'
import { displayName, searchStructures } from '../lib/anatomy'
import { SYSTEM_BY_ID } from '../lib/layers'

export default function SearchBar({ index, onPick, onHighlight }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const results = useMemo(() => searchStructures(index, query, 50), [index, query])

  useEffect(() => setActive(0), [results])

  // Live-highlight the active result in the model while the list is open.
  useEffect(() => {
    onHighlight(open && results[active] ? results[active].id : null)
  }, [open, results, active, onHighlight])

  const pick = (entry) => {
    setQuery(displayName(entry))
    setOpen(false)
    onHighlight(null)
    onPick({ id: entry.id })
  }

  const clear = () => {
    setQuery('')
    setOpen(false)
    onHighlight(null)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && results[active]) {
      pick(results[active])
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setOpen(false)
      e.currentTarget.blur()
    }
  }

  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-20 w-[min(92vw,32rem)] -translate-x-1/2 max-md:left-auto max-md:right-3 max-md:w-[calc(100vw-5.5rem)] max-md:translate-x-0">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={index ? `Szukaj wśród ${index.list.length} struktur (PL / łac. / EN)…` : 'Wczytywanie bazy…'}
          disabled={!index}
          className="w-full rounded-full border border-white/10 bg-slate-900/80 py-3 pl-11 pr-10 text-sm text-slate-100 shadow-lg outline-none backdrop-blur placeholder:text-slate-500 focus:border-cyan-400/60"
        />
        {query && (
          <button onClick={clear} aria-label="Wyczyść" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <ul className="thin-scroll mt-2 max-h-[55vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/95 py-1 shadow-2xl backdrop-blur">
          {results.length === 0 && <li className="px-4 py-3 text-sm text-slate-400">Brak wyników</li>}
          {results.map((entry, i) => (
            <li key={entry.id}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(entry)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-start gap-3 px-4 py-2 text-left ${i === active ? 'bg-white/10' : 'hover:bg-white/5'}`}
              >
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: SYSTEM_BY_ID[entry.s]?.color }} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-100">{displayName(entry)}</span>
                  {entry.la && <span className="block text-xs italic text-slate-400">{entry.la}</span>}
                  {entry.pl && entry.en && <span className="block text-[11px] text-slate-500">{entry.en}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
