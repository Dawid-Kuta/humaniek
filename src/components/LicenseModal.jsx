const LINK = 'text-cyan-400 hover:text-cyan-300'

const SOURCES = [
  {
    title: 'Model 3D',
    body: (
      <>
        <a className={LINK} href="https://www.z-anatomy.com/" target="_blank" rel="noreferrer">Z-Anatomy</a> (Gauthier Kervyn i in.),
        oparty na BodyParts3D (DBCLS, CC BY-SA 2.1 JP). Licencja{' '}
        <a className={LINK} href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>.
        Siatki uproszczone, przekolorowane i skompresowane skryptem <code>scripts/optimize-model.mjs</code>.
      </>
    ),
  },
  {
    title: 'Nazewnictwo (PL / łac. / EN)',
    body: (
      <>
        Tabela terminologii TA2 projektu Z-Anatomy — tłumaczenie polskie: Jadwiga Palosz. Licencja{' '}
        <a className={LINK} href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>.
        Identyfikatory według Terminologia Anatomica 2 (FIPAT).
      </>
    ),
  },
  {
    title: 'Opisy, przyczepy, unerwienie, unaczynienie',
    body: (
      <>
        Wikipedia polska i angielska (wstępy artykułów, infoboksy, wybrane zdania) oraz definicje Z-Anatomy oparte na Wikipedii.
        Licencja{' '}
        <a className={LINK} href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>.
        Pola z infoboksów angielskiej Wikipedii przetłumaczone na polski (słownik terminów TA2 oraz tłumaczenie redakcyjne
        w <code>scripts/sources/translations-pl.json</code>) — oryginał widać po najechaniu kursorem, pola bez tłumaczenia
        oznaczono „EN”. Przypisanie artykułów:{' '}
        <a className={LINK} href="https://www.wikidata.org/" target="_blank" rel="noreferrer">Wikidata</a> (CC0).
      </>
    ),
  },
  {
    title: 'Ilustracje',
    body: <>Miniatury z Wikimedia Commons (licencje wolne, szczegóły na stronie pliku w Wikipedii).</>,
  },
]

export default function LicenseModal({ open, onClose }) {
  if (!open) return null

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900 p-6 text-slate-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">Źródła i licencje</h2>
          <button onClick={onClose} aria-label="Zamknij" className="rounded-full p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <dl className="mt-4 space-y-4 text-sm leading-relaxed text-slate-300">
          {SOURCES.map((s) => (
            <div key={s.title}>
              <dt className="font-medium text-slate-100">{s.title}</dt>
              <dd className="mt-0.5">{s.body}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 border-t border-white/10 pt-4 text-xs text-slate-500">
          Atlas służy celom edukacyjnym i nie zastępuje podręcznika ani porady lekarskiej. Tabele mięśni i kości do pobrania:{' '}
          <a className={LINK} href={`${import.meta.env.BASE_URL}data/export/miesnie.csv`}>miesnie.csv</a>,{' '}
          <a className={LINK} href={`${import.meta.env.BASE_URL}data/export/kosci.csv`}>kosci.csv</a>.
        </p>
      </div>
    </div>
  )
}
