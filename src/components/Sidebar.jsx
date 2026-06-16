import { pickWikipedia } from '../lib/anatomy'

const FIELDS = [
  ['origin', 'Przyczep początkowy'],
  ['insertion', 'Przyczep końcowy'],
  ['function', 'Funkcja'],
  ['innervation', 'Unerwienie'],
  ['blood_supply', 'Unaczynienie'],
]

export default function Sidebar({ entry, onClose }) {
  if (!entry) return null

  const wiki = pickWikipedia(entry)
  const extraFields = FIELDS.filter(([key]) => entry[key])

  return (
    <aside className="pointer-events-auto absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-white/10 bg-slate-900/95 text-slate-100 shadow-2xl backdrop-blur md:w-[26rem]">
      <header className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold leading-tight">
            {entry.name_pl || entry.name_lat}
          </h2>
          <p className="mt-1 truncate text-sm italic text-cyan-300/80">{entry.name_lat}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Zamknij panel"
          className="shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="thin-scroll flex-1 space-y-6 overflow-y-auto p-5">
        {wiki ? (
          <section>
            <p className="leading-relaxed text-slate-200">
              {wiki.extract || wiki.description}
            </p>
            {wiki.url && (
              <a
                href={wiki.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-cyan-400 hover:text-cyan-300"
              >
                Wikipedia ({wiki.lang.toUpperCase()})
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5M19 5l-9 9M10 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-4" />
                </svg>
              </a>
            )}
          </section>
        ) : (
          <p className="text-sm text-slate-400">
            Brak opisu z Wikipedii dla tej struktury.
          </p>
        )}

        {extraFields.length > 0 && (
          <dl className="space-y-4 border-t border-white/10 pt-5">
            {extraFields.map(([key, label]) => (
              <div key={key}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {label}
                </dt>
                <dd className="mt-1 text-sm text-slate-200">{entry[key]}</dd>
              </div>
            ))}
          </dl>
        )}

        <p className="border-t border-white/10 pt-4 text-xs text-slate-500">
          mesh: <code className="text-slate-400">{entry.mesh_name}</code>
        </p>
      </div>
    </aside>
  )
}
