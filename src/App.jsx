import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Html, Lightformer, OrbitControls, useProgress } from '@react-three/drei'
import * as THREE from 'three'
import Model, { nodeOf, pickState } from './components/Model'
import Sidebar from './components/Sidebar'
import SearchBar from './components/SearchBar'
import LayersPanel from './components/LayersPanel'
import LicenseModal from './components/LicenseModal'
import { displayName, membersOf, useAnatomyIndex } from './lib/anatomy'
import { DEFAULT_VISIBILITY, SYSTEM_BY_ID } from './lib/layers'
import { SIDE_LABELS } from './lib/facts'

function Loader() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div className="flex w-56 flex-col items-center gap-3 text-slate-200">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
        <span className="text-sm">Ładowanie modelu… {Math.round(progress)}%</span>
        <div className="h-1 w-full overflow-hidden rounded-full bg-slate-700">
          <div className="h-full bg-cyan-400 transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </Html>
  )
}

function Lighting() {
  return (
    <>
      <hemisphereLight args={['#fff7ee', '#2b2723', 0.55]} />
      <directionalLight position={[2, 3.5, 3]} intensity={1.5} color="#fff4e6" />
      <directionalLight position={[-3, 2, -2.5]} intensity={0.55} color="#cfe0ff" />
      {/* Procedural studio environment for soft reflections (no HDR download). */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 5, 1]} rotation-x={Math.PI / 2} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[-5, 1.5, 2]} rotation-y={Math.PI / 2} scale={[3, 6, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[5, 1.5, -1]} rotation-y={-Math.PI / 2} scale={[3, 6, 1]} />
        <Lightformer form="ring" intensity={0.8} color="#9ecbff" position={[0, 2, -6]} scale={4} />
      </Environment>
    </>
  )
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

// Width of the desktop side panel (md:w-[27rem]) and height of the mobile
// bottom sheet (max-h-[62vh]).
const SIDEBAR_PX = 432
const BOTTOM_SHEET_FRACTION = 0.62

// While the camera moves, render at half the native pixel ratio but never
// below 0.75: fill rate, not geometry, limits the frame rate on integrated
// GPUs, and a still image is always rendered sharp. The value goes through
// <Canvas dpr> because R3F resets any other DPR override (drei's
// AdaptiveDpr, setDpr) whenever the Canvas re-renders.
const NATIVE_DPR = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2)
const STILL_DPR = NATIVE_DPR
const MOTION_DPR = Math.min(NATIVE_DPR, Math.max(0.75, NATIVE_DPR / 2))
const MOTION_SETTLE_MS = 300

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

const occlusionRay = new THREE.Raycaster()
occlusionRay.firstHitOnly = true

/** True if every ray from the camera to the given points first hits something outside `ids`. */
function isOccluded(scene, from, points, ids) {
  if (!points.length) return false
  return points.every((p) => {
    occlusionRay.set(from, p.clone().sub(from).normalize())
    occlusionRay.far = from.distanceTo(p) + 0.05
    const hit = occlusionRay.intersectObject(scene, true)[0]
    const sid = hit && nodeOf(hit.object)?.userData.sid
    return sid && !ids.includes(sid)
  })
}

/** Smoothly moves OrbitControls' target + camera to frame a bounding box. */
function CameraRig({ api, focus, panel, onOccluded }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)
  const scene = useThree((s) => s.scene)
  const canvasSize = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const anim = useRef(null)
  const layout = useRef({ panel, canvasSize })
  layout.current = { panel, canvasSize }

  useEffect(() => {
    if (!api || !focus || !controls) return
    let box = focus.id ? api.boundsFor(focus.ids || [focus.id], focus.side) : api.bounds
    if (!box || box.isEmpty()) return
    // Small paired structures (ear ossicles, eyes…) sit far apart: frame the
    // side nearer to the camera instead of the empty space between them.
    if (focus.id && !focus.side) {
      const sides = ['l', 'r'].map((s) => api.boundsFor(focus.ids || [focus.id], s)).filter((b) => !b.isEmpty())
      if (sides.length === 2) {
        const [a, b] = sides.map((s) => s.getCenter(new THREE.Vector3()))
        const extent = Math.max(...sides.map((s) => s.getSize(new THREE.Vector3()).length()))
        if (a.distanceTo(b) > 3 * extent) box = a.distanceTo(camera.position) < b.distanceTo(camera.position) ? sides[0] : sides[1]
      }
    }
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    // Fit into the part of the canvas the side panel / bottom sheet leaves free.
    const { panel: open, canvasSize: cs } = layout.current
    const inset = panelInsets(open, cs)
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    const tanV = tanHalf * ((cs.height - inset.y) / cs.height)
    const tanH = tanHalf * camera.aspect * ((cs.width - inset.x) / cs.width)
    let dist
    if (focus.id) {
      dist = (Math.max(size.length() / 2, 0.025) / Math.sin(Math.atan(Math.min(tanV, tanH)))) * 1.1
    } else {
      // Whole body: fit height and width separately (a sphere fit is far too loose for a standing figure).
      dist = Math.max(size.y / 2 / tanV, size.x / 2 / tanH) * 1.06 + size.z / 2
    }
    let dir = new THREE.Vector3(0, 0.04, 1).normalize()
    if (focus.id) {
      // Look at the structure from the side of the body it lies on (back
      // muscles from behind, lateral ones from the side) unless the current
      // view already roughly faces it.
      dir = camera.position.clone().sub(controls.target).normalize()
      const axis = api.bounds.getCenter(new THREE.Vector3())
      const outward = new THREE.Vector3(center.x - axis.x, 0, center.z - axis.z)
      if (outward.length() > 0.02) {
        outward.normalize()
        if (dir.dot(outward) < 0.2) dir = outward.add(new THREE.Vector3(0, 0.15, 0)).normalize()
      }
    }
    anim.current = {
      fromTarget: controls.target.clone(),
      toTarget: center,
      fromPos: camera.position.clone(),
      toPos: center.clone().addScaledVector(dir, Math.max(dist, 0.05)),
      t: focus.instant ? 1 : 0,
      focus,
    }
    invalidate()
  }, [api, focus, controls, camera, invalidate])

  useEffect(() => {
    if (!controls) return
    const stop = () => (anim.current = null)
    controls.addEventListener('start', stop)
    return () => controls.removeEventListener('start', stop)
  }, [controls])

  useFrame((_, delta) => {
    const a = anim.current
    if (!a || !controls) return
    a.t = Math.min(1, a.t + Math.min(delta, 1 / 30) / 0.75)
    const k = easeInOut(a.t)
    controls.target.lerpVectors(a.fromTarget, a.toTarget, k)
    camera.position.lerpVectors(a.fromPos, a.toPos, k)
    controls.update()
    if (a.t < 1) {
      invalidate()
      return
    }
    anim.current = null
    const { ids, side, checkOcclusion } = a.focus
    if (checkOcclusion && ids && isOccluded(scene, camera.position, api.centersFor(ids, side), ids)) onOccluded?.()
  })
  return null
}

/** Canvas pixels covered by the open side panel (desktop) or bottom sheet (mobile). */
function panelInsets(panel, size) {
  if (panel === 'side') return { x: SIDEBAR_PX, y: 0 }
  if (panel === 'bottom') return { x: 0, y: Math.round(size.height * BOTTOM_SHEET_FRACTION) }
  return { x: 0, y: 0 }
}

/**
 * Moves the projection centre to the middle of the canvas area that the panel
 * leaves free, so whatever the camera targets is not hidden behind it.
 */
function ViewOffset({ panel }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const { x, y } = panelInsets(panel, size)
    if (x || y) camera.setViewOffset(size.width, size.height, x / 2, y / 2, size.width, size.height)
    else camera.clearViewOffset()
    invalidate()
  }, [camera, panel, size, invalidate])
  return null
}

export default function App() {
  const { index, error: indexError } = useAnatomyIndex()
  const [selection, setSelection] = useState(null)
  const [hover, setHover] = useState(null)
  const [searchId, setSearchId] = useState(null)
  const [relatedIds, setRelatedIds] = useState(null)
  const [visibility, setVisibility] = useState(DEFAULT_VISIBILITY)
  const [hidden, setHidden] = useState(() => new Set())
  const [isolatedId, setIsolatedId] = useState(null)
  const [xray, setXray] = useState(false)
  const [focus, setFocus] = useState(null)
  const [api, setApi] = useState(null)
  const [moving, setMoving] = useState(false)
  const [licenseOpen, setLicenseOpen] = useState(false)
  const tooltipRef = useRef(null)
  const pointer = useRef({ x: 0, y: 0 })
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const handleReady = useCallback((modelApi) => {
    setApi(modelApi)
    setFocus({ id: null, instant: true })
  }, [])

  const select = useCallback((target) => {
    setSelection(target)
    setSearchId(null)
  }, [])

  const focusOn = useCallback(
    (target, checkOcclusion = false) => setFocus({ ...target, ids: [...membersOf(index, target.id)], checkOcclusion, nonce: Math.random() }),
    [index],
  )

  // Used by search, side-panel links and double-click: if the structure ends
  // up hidden behind others, X-ray mode is switched on automatically.
  const selectAndFocus = useCallback(
    (target) => {
      setSelection(target)
      setSearchId(null)
      setXray(false)
      focusOn(target, true)
    },
    [focusOn],
  )

  const closeSelection = useCallback(() => {
    setSelection(null)
    setXray(false)
  }, [])

  const selectionIds = useMemo(() => (selection ? membersOf(index, selection.id) : null), [selection, index])
  const searchIds = useMemo(() => (searchId ? membersOf(index, searchId) : null), [searchId, index])
  const previewIds = useMemo(() => (relatedIds?.length ? new Set(relatedIds.flatMap((id) => [...membersOf(index, id)])) : null), [relatedIds, index])

  const toggleSystem = useCallback((id) => setVisibility((v) => ({ ...v, [id]: v[id] === false })), [])
  const setAllSystems = useCallback(
    (on) => setVisibility((v) => Object.fromEntries(Object.keys(v).map((k) => [k, on]))),
    [],
  )

  const hideStructure = useCallback((id) => {
    setHidden((h) => new Set(h).add(id))
    setIsolatedId(null)
    setXray(false)
    setSelection((s) => (s?.id === id ? null : s))
  }, [])

  const resetView = useCallback(() => {
    setHidden(new Set())
    setIsolatedId(null)
    setFocus({ id: null, nonce: Math.random() })
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'Escape') {
        if (xray) setXray(false)
        else if (isolatedId) setIsolatedId(null)
        else closeSelection()
      } else if (e.key === 'f' && selection) focusOn(selection)
      else if (e.key === 'x' && selection) setXray((v) => !v)
      else if (e.key === 'h' && selection) hideStructure(selection.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, isolatedId, xray, hideStructure, focusOn, closeSelection])

  const tooltipTransform = () => `translate(${pointer.current.x + 14}px, ${pointer.current.y + 16}px)`
  const moveTooltip = (e) => {
    pointer.current.x = e.clientX
    pointer.current.y = e.clientY
    if (tooltipRef.current) tooltipRef.current.style.transform = tooltipTransform()
  }

  const panel = selection ? (isDesktop ? 'side' : 'bottom') : null
  const hoverEntry = hover && index?.byId.get(hover.id)
  const selectedEntry = selection && index?.byId.get(selection.id)
  const counts = api?.counts
  const hiddenCount = hidden.size + (isolatedId ? 1 : 0)

  const controlsEvents = useMemo(() => {
    let down = false
    let settle = null
    return {
      onStart: () => (down = true),
      onChange: () => {
        if (down) pickState.suspended = true
        setMoving(true)
        clearTimeout(settle)
        settle = setTimeout(() => setMoving(false), MOTION_SETTLE_MS)
      },
      onEnd: () => {
        down = false
        pickState.suspended = false
      },
    }
  }, [])

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 30%, #1d2c47 0%, #0d1424 55%, #060a13 100%)' }}
      onPointerMove={moveTooltip}
    >
      <Canvas
        frameloop="demand"
        dpr={moving ? MOTION_DPR : STILL_DPR}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.05 }}
        camera={{ position: [0, 1, 4], fov: 35, near: 0.005, far: 60 }}
        raycaster={{ firstHitOnly: true }}
      >
        <Lighting />
        <Suspense fallback={<Loader />}>
          <Model
            selection={selection}
            selectionIds={selectionIds}
            hover={hover}
            searchIds={searchIds}
            relatedIds={previewIds}
            visibility={visibility}
            hidden={hidden}
            isolatedId={isolatedId}
            xray={xray}
            onHover={setHover}
            onSelect={select}
            onFocus={selectAndFocus}
            onReady={handleReady}
          />
          {api && (
            <ContactShadows
              position={[api.bounds.getCenter(new THREE.Vector3()).x, api.bounds.min.y - 0.002, api.bounds.getCenter(new THREE.Vector3()).z]}
              scale={1.6}
              far={0.6}
              blur={2.6}
              opacity={0.55}
              resolution={512}
              frames={1}
              color="#000000"
            />
          )}
        </Suspense>
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.12}
          rotateSpeed={0.8}
          zoomSpeed={0.9}
          minDistance={0.04}
          maxDistance={9}
          zoomToCursor
          {...controlsEvents}
        />
        <CameraRig api={api} focus={focus} panel={panel} onOccluded={() => setXray(true)} />
        <ViewOffset panel={panel} />
      </Canvas>

      {hoverEntry && (
        <div
          ref={tooltipRef}
          style={{ transform: tooltipTransform() }}
          className="pointer-events-none fixed left-0 top-0 z-50 max-w-xs rounded-lg border border-white/10 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-100 shadow-xl backdrop-blur"
        >
          <span className="font-medium">{displayName(hoverEntry)}</span>
          {hover.side && <span className="text-slate-400"> · {SIDE_LABELS[hover.side].toLowerCase()}</span>}
          {hover.mk && (
            <span className="block text-[11px] text-amber-300">
              {hover.mk === 'o' ? 'przyczep początkowy' : 'przyczep końcowy'}
              {hover.on && index?.byId.get(hover.on) ? ` · ${displayName(index.byId.get(hover.on))}` : ''}
            </span>
          )}
          {!hover.mk && hoverEntry.s && (
            <span className="block text-[11px] text-slate-400">{SYSTEM_BY_ID[hoverEntry.s]?.label}</span>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute inset-0">
        <LayersPanel
          visibility={visibility}
          onToggle={toggleSystem}
          onSetAll={setAllSystems}
          counts={counts}
          hiddenCount={hiddenCount}
          onReset={resetView}
        />

        <SearchBar index={index} onPick={selectAndFocus} onHighlight={setSearchId} />

        <div className="pointer-events-auto absolute bottom-4 left-4 z-10 hidden rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-xs text-slate-300 backdrop-blur sm:block">
          <p className="font-semibold text-slate-100">Humaniek — Atlas anatomii 3D</p>
          <p className="mt-1 text-slate-400">
            Klik = wybór · 2× klik = przybliż · Przeciągnij = obrót · Scroll = zoom · Prawy = przesuń
          </p>
          <p className="mt-0.5 text-slate-500">Esc = odznacz · F = przybliż · X = prześwietl resztę · H = ukryj zaznaczone</p>
        </div>

        <button
          onClick={() => setLicenseOpen(true)}
          className="pointer-events-auto absolute bottom-4 right-4 z-10 rounded-full border border-white/10 bg-slate-900/70 px-4 py-2 text-xs font-medium text-slate-300 backdrop-blur transition hover:bg-slate-800/80 hover:text-white"
        >
          Źródła i licencje
        </button>

        {indexError && (
          <div className="pointer-events-auto absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-xl border border-red-500/40 bg-red-950/80 px-4 py-2 text-sm text-red-200">
            Nie udało się wczytać bazy anatomicznej ({String(indexError.message || indexError)}).
          </div>
        )}

        {selection && (
          <Sidebar
            index={index}
            entry={selectedEntry}
            selection={selection}
            isolated={isolatedId === selection.id}
            xray={xray}
            onXray={() => setXray((v) => !v)}
            onClose={closeSelection}
            onSelect={selectAndFocus}
            onFocus={() => focusOn(selection)}
            onIsolate={() => setIsolatedId((cur) => (cur === selection.id ? null : selection.id))}
            onHide={() => hideStructure(selection.id)}
            onPreview={setRelatedIds}
            inModel={api?.has}
          />
        )}
      </div>

      <LicenseModal open={licenseOpen} onClose={() => setLicenseOpen(false)} />
    </div>
  )
}
