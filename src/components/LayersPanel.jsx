import { useState } from 'react'
import { SYSTEMS } from '../lib/layers'

export default function LayersPanel({ visibility, onToggle, onSetAll, counts, hiddenCount, onReset }) {
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768)

  return (
    <div className="pointer-events-auto absolute left-3 top-4 z-20 w-64 max-w-[calc(100vw-1.5rem)] md:left-4">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-2xl backdrop-blur">
        <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left" aria-expanded={open}>
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5" />
            </svg>
            <span className="max-md:hidden">Warstwy</span>
          </span>
          <svg className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <>
            <ul className="thin-scroll max-h-[60vh] overflow-y-auto border-t border-white/10 px-2 py-2">
              {SYSTEMS.map((s) => {
                const isOn = visibility[s.id] !== false
                const count = counts?.[s.id] ?? null
                const exists = !counts || count > 0
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => onToggle(s.id)}
                      disabled={!exists}
                      title={s.en}
                      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition ${exists ? 'hover:bg-white/5' : 'cursor-not-allowed opacity-40'}`}
                    >
                      <span className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${isOn ? 'bg-cyan-500' : 'bg-slate-600'}`}>
                        <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${isOn ? 'translate-x-4' : 'translate-x-0'}`} />
                      </span>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className={`flex-1 ${isOn ? 'text-slate-100' : 'text-slate-400'}`}>{s.label}</span>
                      {count !== null && <span className="text-[11px] tabular-nums text-slate-500">{count}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="flex flex-wrap gap-1.5 border-t border-white/10 px-3 py-2.5 text-[11px]">
              <button onClick={() => onSetAll(true)} className="rounded-md bg-white/5 px-2 py-1 text-slate-300 hover:bg-white/10">
                Pokaż wszystkie
              </button>
              <button onClick={() => onSetAll(false)} className="rounded-md bg-white/5 px-2 py-1 text-slate-300 hover:bg-white/10">
                Ukryj wszystkie
              </button>
              <button onClick={onReset} className="rounded-md bg-white/5 px-2 py-1 text-slate-300 hover:bg-white/10">
                {hiddenCount ? `Przywróć ukryte (${hiddenCount})` : 'Widok początkowy'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
