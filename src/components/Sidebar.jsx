import { useEffect, useState } from 'react'
import { byPolishName, displayName, useDetails } from '../lib/anatomy'
import { FACT_LABELS, FACT_ORDER, PL_FACT_LABELS, SIDE_LABELS } from '../lib/facts'
import { SYSTEM_BY_ID } from '../lib/layers'

function Paragraphs({ text }) {
  const blocks = String(text || '')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
  return (
    <div className="space-y-2.5 text-[0.92rem] leading-relaxed text-slate-200">
      {blocks.map((block, i) => {
        const heading = block.match(/^=+\s*(.+?)\s*=+$/)
        if (heading) {
          return (
            <h4 key={i} className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {heading[1]}
            </h4>
          )
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {block}
          </p>
        )
      })}
    </div>
  )
}

function FactValue({ fact }) {
  const text = fact.pl || fact.en
  return (
    <dd className="mt-0.5 text-sm text-slate-100" title={fact.pl ? `EN: ${fact.en}` : undefined}>
      {text.split('\n').map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
      {!fact.pl && <span className="ml-1 rounded bg-slate-700/80 px-1 py-px align-middle text-[10px] font-medium text-slate-300">EN</span>}
    </dd>
  )
}

function Chips({ ids, index, onSelect, onPreview }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {[...ids].sort(byPolishName(index)).map((id) => {
        const entry = index?.byId.get(id)
        return (
          <button
            key={id}
            onClick={() => onSelect({ id })}
            onMouseEnter={() => onPreview([id])}
            onMouseLeave={() => onPreview(null)}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-200 transition hover:border-violet-400/60 hover:bg-violet-500/15"
          >
            {entry ? displayName(entry) : id}
          </button>
        )
      })}
    </div>
  )
}

function Section({ title, children, aside }) {
  return (
    <section className="border-t border-white/10 pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

const ToolButton = ({ onClick, active, children, title }) => (
  <button
    onClick={onClick}
    title={title}
    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
      active ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100' : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
    }`}
  >
    {children}
  </button>
)

export default function Sidebar({ index, entry, selection, isolated, xray, onXray, onClose, onSelect, onFocus, onIsolate, onHide, onPreview, inModel }) {
  const { details, error } = useDetails(index, selection.id)
  const [tab, setTab] = useState('pl')

  useEffect(() => {
    onPreview(null)
    setTab('pl')
  }, [selection.id, onPreview])

  const name = entry ? displayName(entry) : selection.id
  const system = entry && SYSTEM_BY_ID[entry.s]
  const facts = details?.facts ? [...details.facts].sort((a, b) => FACT_ORDER.indexOf(a.k) - FACT_ORDER.indexOf(b.k)) : []
  const plf = details?.plf || {}
  const plfKeys = Object.keys(PL_FACT_LABELS).filter((k) => plf[k] && !(k === 'artery' && plf.artery === plf.nerve))
  const descPl = details?.wpl?.x ? details.wpl : null
  const descEn = details?.def?.x ? { x: details.def.x, u: details.def.src?.[0] || details?.wen?.u, cut: details.def.cut, zanatomy: true } : details?.wen?.x ? details.wen : null
  const activeTab = tab === 'pl' && !descPl ? 'en' : tab === 'en' && !descEn ? 'pl' : tab
  // English infobox images are human anatomy illustrations; Polish articles
  // sometimes lead with comparative zoology photos.
  const image = details?.wen?.img || details?.wpl?.img
  const onModel = (ids) => (inModel ? ids.filter((id) => inModel(id)) : ids)
  const att = details?.att
  const batt = details?.batt
  const markerOn = selection.mk && selection.on && index?.byId.get(selection.on)
  const parent = entry?.pa && index?.byId.get(entry.pa)

  return (
    <aside className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex max-h-[62vh] flex-col rounded-t-2xl border-t border-white/10 bg-slate-900/95 text-slate-100 shadow-2xl backdrop-blur md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[27rem] md:rounded-none md:border-l md:border-t-0">
      <header className="flex items-start justify-between gap-3 border-b border-white/10 p-5 pb-4">
        <div className="min-w-0">
          {system && (
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              <span className="h-2 w-2 rounded-full" style={{ background: system.color }} />
              {system.label}
            </p>
          )}
          <h2 className="text-xl font-semibold leading-tight">{name}</h2>
          {entry?.la && <p className="mt-1 text-sm italic text-cyan-300/90">{entry.la}</p>}
          {entry?.pl && entry?.en && <p className="mt-0.5 text-xs text-slate-400">{entry.en}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {selection.side && <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-200">{SIDE_LABELS[selection.side]}</span>}
            {selection.mk && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-200">
                {selection.mk === 'o' ? 'Przyczep początkowy' : 'Przyczep końcowy'}
                {markerOn ? ` · ${displayName(markerOn)}` : ''}
              </span>
            )}
          </div>
          {parent && (
            <button
              onClick={() => onSelect({ id: parent.id, side: selection.side })}
              onMouseEnter={() => onPreview([parent.id])}
              onMouseLeave={() => onPreview(null)}
              className="mt-2 block text-left text-xs text-slate-300 hover:text-violet-200"
            >
              Część struktury: <span className="font-medium text-violet-300 underline decoration-violet-400/40 underline-offset-2">{displayName(parent)}</span>
            </button>
          )}
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

      <div className="flex flex-wrap gap-2 border-b border-white/10 px-5 py-3">
        <ToolButton onClick={onFocus} title="Przybliż kamerę (F)">Przybliż</ToolButton>
        <ToolButton onClick={onXray} active={xray} title="Pozostałe struktury półprzezroczyste (X)">
          Prześwietl
        </ToolButton>
        <ToolButton onClick={onIsolate} active={isolated} title="Ukryj wszystko poza tą strukturą (Esc przywraca)">
          {isolated ? 'Pokaż resztę' : 'Pokaż tylko to'}
        </ToolButton>
        <ToolButton onClick={onHide} title="Ukryj tę strukturę (H)">Ukryj</ToolButton>
      </div>

      <div className="thin-scroll flex-1 space-y-5 overflow-y-auto p-5">
        {error && <p className="text-sm text-red-300">Nie udało się wczytać opisu.</p>}
        {!details && !error && <p className="text-sm text-slate-400">Wczytywanie opisu…</p>}

        {image && (
          <figure className="overflow-hidden rounded-xl bg-white/95">
            <img src={image} alt={name} loading="lazy" className="mx-auto max-h-56 w-auto object-contain" />
          </figure>
        )}

        {facts.length > 0 && (
          <dl className="space-y-3">
            {facts.map((f) => (
              <div key={f.k}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{FACT_LABELS[f.k] || f.k}</dt>
                <FactValue fact={f} />
              </div>
            ))}
          </dl>
        )}

        {entry?.ch?.length > 0 && (
          <Section title={`Części (${entry.ch.length})`}>
            <Chips ids={entry.ch} index={index} onSelect={onSelect} onPreview={onPreview} />
          </Section>
        )}

        {att && (att.o.length > 0 || att.e.length > 0) && (
          <Section title="Przyczepy w modelu 3D">
            {onModel(att.o).length > 0 && (
              <div className="mb-2">
                <p className="text-xs text-slate-400">Początkowy na:</p>
                <Chips ids={onModel(att.o)} index={index} onSelect={onSelect} onPreview={onPreview} />
              </div>
            )}
            {onModel(att.e).length > 0 && (
              <div>
                <p className="text-xs text-slate-400">Końcowy na:</p>
                <Chips ids={onModel(att.e)} index={index} onSelect={onSelect} onPreview={onPreview} />
              </div>
            )}
          </Section>
        )}

        {batt && (batt.o.length > 0 || batt.e.length > 0) && (
          <Section title="Mięśnie przyczepiające się do tej kości">
            {batt.o.length > 0 && (
              <div className="mb-2">
                <p className="text-xs text-slate-400">Przyczepy początkowe ({batt.o.length}):</p>
                <Chips ids={onModel(batt.o)} index={index} onSelect={onSelect} onPreview={onPreview} />
              </div>
            )}
            {batt.e.length > 0 && (
              <div>
                <p className="text-xs text-slate-400">Przyczepy końcowe ({batt.e.length}):</p>
                <Chips ids={onModel(batt.e)} index={index} onSelect={onSelect} onPreview={onPreview} />
              </div>
            )}
          </Section>
        )}

        {plfKeys.length > 0 && (
          <Section title="Z polskiej Wikipedii">
            <dl className="space-y-3">
              {plfKeys.map((k) => (
                <div key={k}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {k === 'nerve' && plf.artery === plf.nerve ? 'Unaczynienie i unerwienie' : PL_FACT_LABELS[k]}
                  </dt>
                  <dd className="mt-0.5 text-sm leading-relaxed text-slate-200">{plf[k]}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        {(descPl || descEn) && (
          <Section
            title="Opis"
            aside={
              descPl && descEn ? (
                <div className="flex rounded-lg bg-white/5 p-0.5 text-[11px] font-medium">
                  {[
                    ['pl', 'Polski'],
                    ['en', 'English'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setTab(id)}
                      className={`rounded-md px-2 py-0.5 transition ${activeTab === id ? 'bg-cyan-500/25 text-cyan-100' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null
            }
          >
            {activeTab === 'pl' && descPl && (
              <>
                {descPl.generic && <p className="mb-2 text-xs text-amber-300/90">Artykuł ogólny: {descPl.t}</p>}
                <Paragraphs text={descPl.x} />
                <a href={descPl.u} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-medium text-cyan-400 hover:text-cyan-300">
                  Wikipedia (PL): {descPl.t} ↗
                </a>
              </>
            )}
            {activeTab === 'en' && descEn && (
              <>
                <Paragraphs text={descEn.x} />
                {descEn.cut && <p className="mt-2 text-xs text-slate-500">Opis skrócony — pełna treść w źródle.</p>}
                {descEn.u && (
                  <a href={descEn.u} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-medium text-cyan-400 hover:text-cyan-300">
                    {descEn.zanatomy ? 'Źródło definicji Z-Anatomy' : `Wikipedia (EN): ${descEn.t}`} ↗
                  </a>
                )}
              </>
            )}
          </Section>
        )}

        {details && !facts.length && !descPl && !descEn && !att && !batt && (
          <p className="text-sm text-slate-400">Brak opisu dla tej struktury — dostępne są tylko nazwy.</p>
        )}

        {details && (details.ta2 || details.qid || details.syn) && (
          <Section title="Nazewnictwo i identyfikatory">
            <dl className="space-y-1.5 text-xs text-slate-300">
              {details.syn?.la?.length > 0 && (
                <div>
                  <dt className="inline text-slate-500">Synonimy (łac.): </dt>
                  <dd className="inline italic">{details.syn.la.join(', ')}</dd>
                </div>
              )}
              {details.syn?.en?.length > 0 && (
                <div>
                  <dt className="inline text-slate-500">Synonimy (ang.): </dt>
                  <dd className="inline">{details.syn.en.join(', ')}</dd>
                </div>
              )}
              {details.ta2 && (
                <div>
                  <dt className="inline text-slate-500">Terminologia Anatomica 2 (TA2): </dt>
                  <dd className="inline">{details.ta2}</dd>
                </div>
              )}
              {details.qid && (
                <div>
                  <dt className="inline text-slate-500">Wikidata: </dt>
                  <dd className="inline">
                    <a href={`https://www.wikidata.org/wiki/${details.qid}`} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300">
                      {details.qid}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </Section>
        )}
      </div>
    </aside>
  )
}
