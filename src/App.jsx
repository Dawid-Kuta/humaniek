import { Suspense, useCallback, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, Html, useProgress } from '@react-three/drei'
import Model from './components/Model'
import Sidebar from './components/Sidebar'
import SearchBar from './components/SearchBar'
import LayersPanel from './components/LayersPanel'
import LicenseModal from './components/LicenseModal'
import { findEntryByMeshName } from './lib/anatomy'
import { DEFAULT_VISIBILITY } from './lib/layers'

function Loader() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div className="flex flex-col items-center gap-3 text-slate-200">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
        <span className="text-sm">Ładowanie modelu… {Math.round(progress)}%</span>
      </div>
    </Html>
  )
}

export default function App() {
  const [selected, setSelected] = useState(null) // anatomy entry
  const [highlightName, setHighlightName] = useState(null) // mesh name from search
  const [visibility, setVisibility] = useState(DEFAULT_VISIBILITY)
  const [availableSystems, setAvailableSystems] = useState(null)
  const [licenseOpen, setLicenseOpen] = useState(false)

  const toggleSystem = useCallback((id) => {
    setVisibility((v) => ({ ...v, [id]: v[id] === false }))
  }, [])

  const handleSelectMesh = useCallback((meshName) => {
    const entry = findEntryByMeshName(meshName)
    if (entry) {
      setSelected(entry)
    } else {
      // Unknown mesh — still show something useful.
      setSelected({ mesh_name: meshName, name_lat: meshName, name_pl: '', wikipedia: {} })
    }
  }, [])

  const handlePick = useCallback((entry) => setSelected(entry), [])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <Canvas
        camera={{ position: [0, 0.5, 3], fov: 45, near: 0.01, far: 1000 }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#0b1120']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 7]} intensity={1.1} />
        <directionalLight position={[-5, -3, -5]} intensity={0.4} />

        <Suspense fallback={<Loader />}>
          <Model
            onSelect={handleSelectMesh}
            selectedName={selected?.mesh_name}
            highlightName={highlightName}
            visibility={visibility}
            onSystemsFound={setAvailableSystems}
          />
          <Environment preset="city" />
        </Suspense>

        <OrbitControls
          makeDefault
          enablePan
          enableZoom
          enableRotate
          minDistance={0.2}
          maxDistance={50}
          dampingFactor={0.1}
        />
      </Canvas>

      {/* UI overlay (pointer-events disabled so the canvas stays interactive) */}
      <div className="pointer-events-none absolute inset-0">
        <LayersPanel
          visibility={visibility}
          onToggle={toggleSystem}
          available={availableSystems}
        />

        <SearchBar onPick={handlePick} onHighlight={setHighlightName} />

        <div className="pointer-events-auto absolute bottom-4 left-4 z-10 rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-xs text-slate-300 backdrop-blur">
          <p className="font-semibold text-slate-100">Humaniek — Atlas anatomii 3D</p>
          <p className="mt-1 text-slate-400">
            Klik = wybór · Przeciągnij = obrót · Scroll = zoom · Prawy przycisk = przesuń
          </p>
        </div>

        <button
          onClick={() => setLicenseOpen(true)}
          className="pointer-events-auto absolute bottom-4 right-4 z-10 rounded-full border border-white/10 bg-slate-900/70 px-4 py-2 text-xs font-medium text-slate-300 backdrop-blur transition hover:bg-slate-800/80 hover:text-white"
        >
          Licencja
        </button>

        <Sidebar entry={selected} onClose={() => setSelected(null)} />
      </div>

      <LicenseModal open={licenseOpen} onClose={() => setLicenseOpen(false)} />
    </div>
  )
}
