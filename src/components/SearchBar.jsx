import { useEffect, useMemo, useState } from 'react'
import { searchEntries } from '../lib/anatomy'

export default function SearchBar({ onPick, onHighlight }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const results = useMemo(() => searchEntries(query, 40), [query])

  // Highlight the first match live as the user types.
  useEffect(() => {
    onHighlight(results.length ? results[0].mesh_name : null)
  }, [results, onHighlight])

  const pick = (entry) => {
    setQuery(entry.name_pl || entry.name_lat || entry.mesh_name)
    setOpen(false)
    onHighlight(entry.mesh_name)
    onPick(entry)
  }

  const clear = () => {
    setQuery('')
    setOpen(false)
    onHighlight(null)
  }

  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-20 w-[min(92vw,30rem)] -translate-x-1/2">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Szukaj struktury (łac. / pl)…"
          className="w-full rounded-full border border-white/10 bg-slate-900/80 py-3 pl-11 pr-10 text-sm text-slate-100 shadow-lg outline-none backdrop-blur placeholder:text-slate-500 focus:border-cyan-400/60"
        />
        {query && (
          <button
            onClick={clear}
            aria-label="Wyczyść"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {open && query && (
        <ul className="thin-scroll mt-2 max-h-[50vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/90 py-1 shadow-2xl backdrop-blur">
          {results.length === 0 && (
            <li className="px-4 py-3 text-sm text-slate-400">Brak wyników</li>
          )}
          {results.map((entry) => (
            <li key={entry.mesh_name}>
              <button
                onClick={() => pick(entry)}
                className="flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left hover:bg-white/5"
              >
                <span className="text-sm font-medium text-slate-100">
                  {entry.name_pl || entry.name_lat}
                </span>
                {entry.name_pl && entry.name_lat && (
                  <span className="text-xs italic text-slate-400">{entry.name_lat}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
