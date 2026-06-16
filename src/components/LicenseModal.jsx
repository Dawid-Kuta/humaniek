export default function LicenseModal({ open, onClose }) {
  if (!open) return null

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 text-slate-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">Licencja</h2>
          <button
            onClick={onClose}
            aria-label="Zamknij"
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-300">
          <p>
            <span className="font-medium text-slate-100">Model 3D:</span> Z-Anatomy by
            Gauthier Kervyn,{' '}
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-400 hover:text-cyan-300"
            >
              CC-BY-SA 4.0
            </a>
            .
          </p>
          <p>
            <span className="font-medium text-slate-100">Opisy:</span> Wikipedia,{' '}
            <a
              href="https://creativecommons.org/licenses/by-sa/3.0/"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-400 hover:text-cyan-300"
            >
              CC-BY-SA 3.0
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
