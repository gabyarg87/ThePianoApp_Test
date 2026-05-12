import { useCallback, useEffect, useRef, useState } from 'react'
import { Midi } from '@tonejs/midi'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import { useAudio } from '../../audio/AudioContext.jsx'
import Keyboard from '../ChordChart/Keyboard.jsx'
import PianoRoll from './PianoRoll.jsx'
import OptionsPanel  from './OptionsPanel.jsx'
import HandPanel     from './HandPanel.jsx'
import MeasureScrubber from './MeasureScrubber.jsx'
import { saveFilesToCache, loadFilesFromCache, clearFilesCache } from './fileCache.js'
import './sight-reading.css'

// ── MIDI / note helpers ───────────────────────────────────────────────────────
const osmdToMidi = ht => ht + 12
const NOTE_NAMES  = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']

// Color schemes — kept in sync with PianoRoll.jsx
const COLOR_SCHEMES = {
  spectrum: ['#ff6b6b','#c93030','#ff9f43','#c97520','#ffd93d','#6bcb77','#2e8b3a','#4ecdc4','#1a8f86','#4d96ff','#1a5fc8','#c77dff'],
  neon:     ['#ff3366','#ff0033','#ff9900','#ff6600','#ffff00','#33ff66','#00cc44','#00ffee','#00ddcc','#3399ff','#0066ff','#cc44ff'],
  pastel:   ['#ffb3c1','#f4a0a0','#ffd8b1','#f8c080','#fff5b1','#c3f0c8','#a8d8a8','#c0eeeb','#9de0dc','#c0d8ff','#a0c0f0','#ddb8ff'],
  ice:      ['#60e0ff','#40b8e8','#80d0ff','#50c0f0','#a0e8ff','#20b8e0','#0090c0','#00d8f8','#00b0d0','#4080ff','#2060e0','#8090ff'],
  rh:       ['#ffe100','#ffe100','#ffe100','#ffe100','#ffe100','#ffe100','#ffe100','#ffe100','#ffe100','#ffe100','#ffe100','#ffe100'],
  lh:       ['#00d0ff','#00d0ff','#00d0ff','#00d0ff','#00d0ff','#00d0ff','#00d0ff','#00d0ff','#00d0ff','#00d0ff','#00d0ff','#00d0ff'],
}

// colors = { handColors: {rh, lh}, spectrumColors: [...12] } from visualOpts
const toHL = (midi, scheme = 'spectrum', trackIdx = -1, handOpts = null, colors = {}) => {
  const pc = ((midi % 12) + 12) % 12
  let color
  if (scheme === 'hands' && handOpts) {
    const { handSplit = 'pitch', handSplitMidi = 60 } = handOpts
    const hand = handSplit === 'track'
      ? (trackIdx === 0 ? 'rh' : 'lh')
      : (midi >= handSplitMidi ? 'rh' : 'lh')
    color = colors.handColors?.[hand] ?? COLOR_SCHEMES[hand]?.[pc] ?? '#ffffff'
  } else {
    const palette = colors.spectrumColors ?? COLOR_SCHEMES[scheme] ?? COLOR_SCHEMES.spectrum
    color = palette[pc]
  }
  return { midi, role: 'root', label: '', name: NOTE_NAMES[pc], color }
}
const midiHL = (midis, scheme, colors = {}) => midis.map(m => toHL(m, scheme, -1, null, colors))

const fmtTime = (sec) => {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

const rafWait = (n = 2) => new Promise(resolve => {
  let count = 0
  const tick = () => { if (++count >= n) resolve(); else requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
})

// ── File-tree helpers ─────────────────────────────────────────────────────────
// Build a nested tree from flat { name, type, folder, fileObj } entries.
// `folder` is a slash-separated path, e.g. "Music/Chopin/Etudes".
function buildFileTree (files) {
  // node shape: { name, path, children: { [name]: node }, files: [] }
  const root = { name: '', path: '', children: {}, files: [] }
  for (const file of files) {
    const segments = (file.folder || 'My Files').split('/')
    let node = root
    let cur  = ''
    for (const seg of segments) {
      cur = cur ? `${cur}/${seg}` : seg
      if (!node.children[seg])
        node.children[seg] = { name: seg, path: cur, children: {}, files: [] }
      node = node.children[seg]
    }
    node.files.push(file)
  }
  return root
}

function countFilesInNode (node) {
  let n = node.files.length
  for (const child of Object.values(node.children)) n += countFilesInNode(child)
  return n
}

// Collect every folder path present in a list of entries (all ancestor segments)
function allFolderPaths (entries) {
  const paths = new Set()
  for (const e of entries) {
    const parts = (e.folder || 'My Files').split('/')
    parts.forEach((_, i) => paths.add(parts.slice(0, i + 1).join('/')))
  }
  return paths
}

// ── Step extraction (MusicXML / OSMD) ────────────────────────────────────────
// ── Dynamic marking → velocity map ───────────────────────────────────────────
// Fallback when OSMD's soundDynamic is absent: map dynamicEnum integer → velocity.
// OSMD DynamicEnum: 0=none,1=pppp,2=ppp,3=pp,4=p,5=mp,6=mf,7=f,8=ff,9=fff,10=ffff,
//                  11=sf,12=sfz,13=sfp,14=sffz,15=fz,16=rf,17=rfz,18=fp
const DYNAMIC_ENUM_VEL = {
  0: 75,  1: 10,  2: 20,  3: 35,  4: 50,
  5: 65,  6: 80,  7: 95,  8: 108, 9: 118, 10: 127,
  11: 100, 12: 105, 13: 55, 14: 110, 15: 92, 16: 88, 17: 92, 18: 55,
}

// Walks the OSMD sheet after loading and returns { map, count }.
// Logs the full probe to the console so you can diagnose missing dynamics.
function buildMeasureVelocityMap(osmd) {
  const map = {}
  try {
    const measures = osmd.Sheet.SourceMeasures
    console.group(`[dynamics] scanning ${measures.length} measures`)

    measures.forEach((measure, mIdx) => {
      const sle = measure.staffLinkedExpressions
      if (!sle) return

      sle.forEach((staffExprs, staffIdx) => {
        if (!staffExprs) return
        staffExprs.forEach((multiExpr, exprIdx) => {
          // actual key is lowercase 'instantaneousDynamic' in minified OSMD
          const dyn = multiExpr.instantaneousDynamic
          if (!dyn) return

          // Prefer OSMD's own soundDynamic (already 0-127),
          // fall back to our enum map if it's absent or zero.
          const vel = (typeof dyn.soundDynamic === 'number' && dyn.soundDynamic > 0)
            ? dyn.soundDynamic
            : (DYNAMIC_ENUM_VEL[dyn.dynamicEnum] ?? 75)

          console.log(`  ✓ dynamic at m${mIdx} staff${staffIdx} expr${exprIdx}:`,
            `dynamicEnum=${dyn.dynamicEnum} soundDynamic=${dyn.soundDynamic} → vel=${vel}`)

          if (map[mIdx] === undefined) map[mIdx] = vel
        })
      })
    })

    console.log('[dynamics] final map:', map, `(${Object.keys(map).length} markings found)`)
    console.groupEnd()
  } catch (e) {
    console.error('[dynamics] error while scanning:', e)
    console.groupEnd()
  }
  return { map, count: Object.keys(map).length }
}

// ── Auto keyboard layout from MIDI note range ─────────────────────────────
const OCTAVE_TO_KEYS = { 3: 36, 4: 49, 5: 61, 6: 76, 7: 88 }

function autoKeyboardLayout(midiData) {
  let minNote = 127, maxNote = 0
  midiData.tracks.forEach(track =>
    track.notes.forEach(note => {
      if (note.midi < minNote) minNote = note.midi
      if (note.midi > maxNote) maxNote = note.midi
    })
  )
  if (minNote > maxNote) return { keyCount: 36, baseOctave: 3 }

  // Snap start to the C at or below the lowest note
  const startMidi  = Math.floor(minNote / 12) * 12
  const baseOctave = Math.max(1, Math.min(5, startMidi / 12 - 1))

  // Octaves needed to reach the highest note from startMidi
  const neededOcts = Math.ceil((maxNote - startMidi + 1) / 12)
  const numOctaves = Math.max(3, Math.min(7, neededOcts))
  const keyCount   = OCTAVE_TO_KEYS[numOctaves] ?? 88

  return { keyCount, baseOctave }
}


// dynamicVelMap: { measureIndex: velocity } — built once after OSMD load.
// Tempo comes from SourceMeasure.TempoInBPM which reads <sound tempo="X"/> directly.
// This is the only reliable quarter-note-normalized BPM source in OSMD 1.9.7:
//   - cursor.Iterator.CurrentBpm is broken (OSMD synthetic defaults overwrite real marks)
//   - InstantaneousTempoExpression.TempoInBpm is not normalized for non-quarter beat units
// For text-only scores (no <sound> element), SourceMeasure.TempoExpressions is used as fallback.
function extractSteps(osmd, selPartIndices, fromMeasure, toMeasure, dynamicVelMap = {}) {
  const cursor    = osmd.cursor
  const allParts  = osmd.Sheet.Parts
  const measures  = osmd.Sheet.SourceMeasures
  const useAll    = selPartIndices.length === allParts.length
  const selSet    = new Set(selPartIndices)

  // ── Pre-scan: collect carry-forward tempo & dynamics from measures BEFORE fromMeasure.
  // The cursor skips those measures, so without this the first steps would have no tempo.
  let lastKnownBpm    = 0
  let currentVelocity = 75
  for (let m = 0; m < fromMeasure && m < measures.length; m++) {
    if (dynamicVelMap[m] !== undefined) currentVelocity = dynamicVelMap[m]
    const soundBpm = measures[m]?.TempoInBPM ?? 0
    if (soundBpm > 0) {
      lastKnownBpm = soundBpm
    } else {
      const exprBpm = measures[m]?.TempoExpressions?.[0]?.InstantaneousTempo?.TempoInBpm ?? 0
      if (exprBpm > 0) lastKnownBpm = exprBpm
    }
  }

  cursor.reset()
  const steps = []
  let ci = 0
  let lastMeasureIdx  = -1   // carry-forward: last processed measure

  while (!cursor.Iterator.EndReached) {
    const mIdx = cursor.Iterator.CurrentMeasureIndex
    if (mIdx < fromMeasure) { cursor.next(); ci++; continue }
    if (mIdx >= toMeasure)  break

    if (dynamicVelMap[mIdx] !== undefined) currentVelocity = dynamicVelMap[mIdx]

    // Update BPM once per measure boundary.
    if (mIdx !== lastMeasureIdx) {
      // Primary: <sound tempo="X"/> — always quarter-note normalized.
      const soundBpm = measures[mIdx]?.TempoInBPM ?? 0
      if (soundBpm > 0) {
        lastKnownBpm = soundBpm
      } else {
        // Fallback for text-only scores (no <sound> element): read from TempoExpressions.
        const exprBpm = measures[mIdx]?.TempoExpressions?.[0]?.InstantaneousTempo?.TempoInBpm ?? 0
        if (exprBpm > 0) lastKnownBpm = exprBpm
      }
      lastMeasureIdx = mIdx
    }

    const currentTempo = lastKnownBpm > 0 ? Math.round(lastKnownBpm) : null

    // noteEvents: per-note { midi, dur } so each note plays for its own duration.
    const noteEvents = []

    cursor.VoicesUnderCursor().forEach(ve => {
      // OSMD API: VoiceEntry.IsGrace / Note.IsGraceNote (PascalCase).
      // Grace entries can appear alongside normal ones, guard at both levels.
      if (ve.IsGrace) return

      const instr   = ve.ParentSourceStaffEntry?.ParentStaff?.ParentInstrument
      const idx     = instr ? allParts.findIndex(p => p === instr) : 0
      const fromSel = useAll || selSet.has(idx)

      ve.Notes.forEach(note => {
        if (note.IsGraceNote) return

        const realValue = note.Length?.RealValue ?? 0.25
        const beats     = realValue * 4

        // note.Pitch can be non-null for display-positioned rests
        if (!note.Pitch || note.isRest()) return
        if (!fromSel) return

        // Skip tied-note continuations — only attack the first note of a tie
        const tie = note.NoteTie
        if (tie && tie.Notes.length > 0 && tie.Notes[0] !== note) return

        const midi = osmdToMidi(note.halfTone)
        const existing = noteEvents.find(n => n.midi === midi)
        if (!existing) {
          noteEvents.push({ midi, dur: Math.max(0.125, beats) })
        } else {
          // Same pitch from two voices — keep the longer duration
          existing.dur = Math.max(existing.dur, beats)
        }
      })
    })

    // Compute the actual cursor step duration from OSMD's timestamp — this is
    // always correct even when only one staff has a note at this position and
    // the other has a note onset partway through (e.g. bass quarter at beat 3
    // while treble has a 16th starting at beat 3.25 — the cursor advances only
    // 0.25 beats, not 1, but VoicesUnderCursor() only shows the bass here).
    const tsBefore  = cursor.Iterator.currentTimeStamp?.RealValue ?? 0
    const cursorIdx = ci
    cursor.next()
    ci++
    const tsAfter   = cursor.Iterator.EndReached
      ? tsBefore
      : (cursor.Iterator.currentTimeStamp?.RealValue ?? tsBefore)
    const advance   = Math.max(0.125, (tsAfter - tsBefore) * 4)

    steps.push({ noteEvents, beats: advance, velocity: currentVelocity, tempo: currentTempo, measureIndex: mIdx, cursorIdx })
  }

  cursor.reset()
  return steps
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SightReading() {
  // ── Refs ───────────────────────────────────────────────────────────────────
  const sectionRef        = useRef(null)
  const scoreContainerRef = useRef(null)
  const osmdRef           = useRef(null)
  const metroCtxRef       = useRef(null)
  const metroTimers       = useRef([])
  const metroActiveRef    = useRef(false)
  const metroVolRef       = useRef(1.0)
  const playTimers        = useRef([])
  const playingRef        = useRef(false)
  const loopRef           = useRef(false)
  const loopGapRef        = useRef(1)    // rest measures between loop iterations (fixed at 1)
  const bpmRef            = useRef(80)
  const userBpmRef        = useRef(80)   // user's intended BPM — never overwritten by in-score tempo changes
  const stepsRef          = useRef([])
  const playFromStepRef   = useRef(0)    // step index to start XML playback from (set by score click)
  // MIDI-specific
  const midiDataRef       = useRef(null)   // parsed Midi object
  const midiOrigBpmRef    = useRef(120)    // original file BPM (for speed scaling)
  const isMidiRef         = useRef(false)  // mirror of isMidiFile for use in callbacks
  const playStartRef      = useRef(null)   // Date.now() when MIDI playback began (for piano roll cursor)
  const playDurMsRef      = useRef(0)      // total scheduled playback duration ms (BPM-scaled)
  const startMeasureRef   = useRef(0)      // mirrors startMeasure state for use in stopPlayback
  const colorSchemeRef    = useRef('spectrum') // mirrors visualOpts.colorScheme for use in callbacks
  const scoreOptsRef      = useRef({ dynamicMarks: true, humanize: true, humanizeAmt: 5, humanizeDawAmt: 0, showVelDebug: true })
  const midiOptsRef       = useRef({ humanize: true, humanizeAmt: 5, humanizeDawAmt: 0, showVelDebug: true })
  const dynamicVelMapRef  = useRef({})         // { measureIndex: velocity } built after OSMD load
  const scoreOrigBpmRef   = useRef(80)         // BPM read from score at load time (for user-scale calc)
  const coloredNotesRef   = useRef([])         // GraphicalNote[] currently painted green; reset on next step or stop

  // ── Practice mode refs ─────────────────────────────────────────────────────
  const practiceActiveRef   = useRef(false)
  const practiceStepIdxRef  = useRef(0)
  const practiceExpectedRef = useRef(new Set())  // midi notes expected at current step
  const practiceHeldRef     = useRef(new Set())  // midi notes pressed since last advance
  const practiceExpHLRef    = useRef([])          // HL objects for expected notes (for restore on noteOff)
  const practiceAdvanceFnRef = useRef(null)       // stable ref to advancePractice

  // ── State ──────────────────────────────────────────────────────────────────
  const [mode,          setMode]          = useState('score') // 'score' | 'midi' | 'folder'
  const [loaded,        setLoaded]        = useState(false)
  const [rendering,     setRendering]     = useState(false)
  const [isMidiFile,    setIsMidiFile]    = useState(false)
  const [midiMeta,      setMidiMeta]      = useState(null)  // { name, duration, timeSig }
  const [parts,         setParts]         = useState([])
  const [selectedParts, setSelectedParts] = useState([])
  const [measureCount,  setMeasureCount]  = useState(0)
  const [startMeasure,  setStartMeasure]  = useState(0)
  // keep ref in sync so stopPlayback (useCallback) can read it without a stale closure
  const _setStartMeasure = (v) => { startMeasureRef.current = v; setStartMeasure(v) }
  const [endMeasure,    setEndMeasure]    = useState(0)
  const [bpm,           setBpm]           = useState(80)
  const [baseBpm,       setBaseBpm]       = useState(80)   // song's original BPM — never changes after load
  const [bpmDelta,      setBpmDelta]      = useState(0)    // user offset in BPM steps of 5
  const [loop,          setLoop]          = useState(false)
  const [metronome,     setMetronome]     = useState(false)
  const [isPlaying,     setIsPlaying]     = useState(false)
  const [liveHL,        setLiveHL]        = useState([])
  const [practiceActive,  setPracticeActive]  = useState(false)
  const [practiceStep,    setPracticeStep]    = useState(0)
  const [practiceTotal,   setPracticeTotal]   = useState(0)
  const [practiceDone,    setPracticeDone]    = useState(false)
  const [scoreOverlays,   setScoreOverlays]   = useState([])   // hit-zones over each measure
  const [hoveredMeasure,  setHoveredMeasure]  = useState(null)
  const [error,         setError]         = useState(null)
  const [dragOver,      setDragOver]      = useState(false)
  const [folderFiles,     setFolderFiles]     = useState([])    // [{ name, fileObj, type, folder }]
  const [folderSelIdx,    setFolderSelIdx]    = useState(null)  // index of currently loaded file
  const [folderFilter,    setFolderFilter]    = useState('all') // 'all' | 'midi' | 'score'
  const [folderSearch,    setFolderSearch]    = useState('')
  const [expandedFolders, setExpandedFolders] = useState(() => new Set())
  const [isFullscreen,    setIsFullscreen]    = useState(false)
  const [tracksOpen,      setTracksOpen]      = useState(false)
  const [optPanel,        setOptPanel]        = useState(null)  // null | 'keys' | 'sound' | 'visual' | 'mode'
  const [lessonMode,      setLessonMode]      = useState('playback')  // 'playback' | 'practice'
  const [keyCount,      setKeyCount]      = useState(36)   // 36 | 49 | 61 | 76 | 88
  const [baseOctave,    setBaseOctave]    = useState(3)    // 1‑5  →  baseMidi = oct*12+12
  const [usedPcs,       setUsedPcs]       = useState(null)   // null = off; array = used pitch classes
  const [audioFx,       setAudioFx]       = useState({
    reverbAmt:   0.22,   // wetGain  0–1
    reverbDecay: 2.5,    // IR decay 0.5–6
    eqGain:      2.0,    // dB       -12–+12
    eqFreq:      3500,   // Hz       500–12000
  })
  // Draft values for the score measure-range inputs — committed on blur/Enter only
  const [draftFrom,     setDraftFrom]     = useState('1')
  const [draftTo,       setDraftTo]       = useState('1')
  const folderInputRef    = useRef(null)   // webkitdirectory — scan whole folder
  const folderFilesRef    = useRef(null)   // multi-file — pick individual files
  const tracksRef         = useRef(null)
  const optGroupRef       = useRef(null)
  const soundAnchorRef    = useRef(null)
  const modeAnchorRef     = useRef(null)
  const hitLineRef        = useRef(null)
  const [pianoVol,      setPianoVol]      = useState(88)
  const [metroVol,      setMetroVol]      = useState(80)
  const [scoreOpts,     setScoreOpts]     = useState({
    dynamicMarks:       true,
    humanize:           true,
    humanizeAmt:        5,
    humanizeDawAmt:     0,
    showVelDebug:       true,
  })
  const [midiOpts,      setMidiOpts]      = useState({
    humanize:           true,
    humanizeAmt:        5,
    humanizeDawAmt:     0,
    showVelDebug:       true,
  })
  const [lastVel,       setLastVel]       = useState(null)
  const [dynMarkCount,  setDynMarkCount]  = useState(0)    // how many dynamic markings found in score
  const [visualOpts,    setVisualOpts]    = useState({
    showNoteLabels: true,
    showKeyLabels:  true,
    innerGlow:      2,          // tight halo (BlurFilter small)
    outerGlow:      0.5,        // soft aura  (BlurFilter large)
    hitLineFlash:   true,       // column flash when note hits
    hitBoost:       4,          // glow multiplier on hit: 0=Off, 1–4 → 2×–5×
    hitShake:       4,          // shake amplitude on hit: 0=Off, 1–4 → 1–4 px
    noteStyle:      'solid',    // 'solid' | 'twinkle' | 'wave'
    colorScheme:    'hands',
    handColors:     { rh: '#ffe100', lh: '#00d0ff' },
    spectrumColors: ['#ff6b6b','#c93030','#ff9f43','#c97520','#ffd93d','#6bcb77','#2e8b3a','#4ecdc4','#1a8f86','#4d96ff','#1a5fc8','#c77dff'],
    // hit line above keyboard
    hitLineVisible: true,
    hitLineColor:   '#a078ff',
    hitLineColor2:  '#ff78c4',  // second gradient stop (same as hitLineColor = solid)
    hitLineGlow:    2,          // 0=Off, 1–4 intensity
    hitLineBoost:   true,       // flash on note hit
    // glow extras
    keyGlow:        true,
    // particles
    particles:      true,
    particleCount:  18,
    // note speed
    lookAhead:      5.0,        // seconds of preview window
    // hand mode
    handMode:       'both',     // 'both' | 'left' | 'right'
    handSplit:      'pitch',    // 'pitch' | 'track'
    handSplitMidi:  60,         // split point (Middle C)
  })
  const visualOptsRef = useRef(visualOpts)
  useEffect(() => { visualOptsRef.current = visualOpts }, [visualOpts])

  const handOptsRef = useRef({})
  useEffect(() => {
    handOptsRef.current = {
      handSplit:     visualOpts.handSplit,
      handSplitMidi: visualOpts.handSplitMidi,
    }
  }, [visualOpts.handSplit, visualOpts.handSplitMidi])

  // Keep refs in sync so stale useCallback closures always read current values
  useEffect(() => { colorSchemeRef.current = visualOpts.colorScheme }, [visualOpts.colorScheme])
  useEffect(() => { scoreOptsRef.current   = scoreOpts              }, [scoreOpts])
  useEffect(() => { midiOptsRef.current    = midiOpts               }, [midiOpts])

  // Sync measure draft inputs when range is set externally (file load, etc.)
  useEffect(() => { setDraftFrom(String(startMeasure + 1)) }, [startMeasure])
  useEffect(() => { setDraftTo(String(endMeasure))         }, [endMeasure])

  // ── Restore file list from IndexedDB on mount ─────────────────────────────
  useEffect(() => {
    loadFilesFromCache().then(cached => {
      if (cached) {
        setFolderFiles(cached.entries)
        setExpandedFolders(allFolderPaths(cached.entries))
      }
    })
  }, [])

  const {
    playNote, ensureLoaded, setVolume,
    setReverbAmount, setReverbDecay, setEqGain, setEqFreq,
    loading, registerMidiCallbacks,
  } = useAudio()

  // ── Register MIDI input visual callbacks ───────────────────────────────────
  useEffect(() => {
    return registerMidiCallbacks({
      onNoteOn: (midi, velocity) => {
        setLastVel(velocity)

        // ── Practice mode: check against expected notes ────────────────────
        if (practiceActiveRef.current) {
          const expected = practiceExpectedRef.current
          const isExpected = expected.has(midi)
          const color = isExpected ? '#00c853' : '#ff6b6b'
          setLiveHL(prev => [
            ...prev.filter(h => h.midi !== midi),
            { midi, role: 'root', label: '', name: NOTE_NAMES[((midi % 12) + 12) % 12], color },
          ])
          if (isExpected) {
            practiceHeldRef.current.add(midi)
            if ([...expected].every(m => practiceHeldRef.current.has(m))) {
              practiceAdvanceFnRef.current?.()
            }
          }
          return
        }

        // ── Normal visual highlight ────────────────────────────────────────
        const hl = toHL(midi, visualOptsRef.current.colorScheme, -1, {
          handSplit:     visualOptsRef.current.handSplit     ?? 'pitch',
          handSplitMidi: visualOptsRef.current.handSplitMidi ?? 60,
        }, visualOptsRef.current)
        setLiveHL(prev => [...prev.filter(h => h.midi !== midi), hl])
        if (visualOptsRef.current.hitLineBoost && hitLineRef.current) {
          const el = hitLineRef.current
          el.classList.remove('sr-hit-line--pulse')
          void el.offsetWidth
          el.classList.add('sr-hit-line--pulse')
        }
      },
      onNoteOff: (midi) => {
        if (practiceActiveRef.current) {
          // Remove from held set — all expected notes must be held simultaneously
          practiceHeldRef.current.delete(midi)
          // Restore the purple highlight for expected notes that are no longer held
          setLiveHL(prev => {
            const next = prev.filter(h => h.midi !== midi)
            if (practiceExpectedRef.current.has(midi)) {
              const exp = practiceExpHLRef.current.find(h => h.midi === midi)
              if (exp) return [...next, exp]
            }
            return next
          })
          return
        }
        setLiveHL(prev => prev.filter(h => h.midi !== midi))
      },
    })
  }, [registerMidiCallbacks])

  // ── Practice mode helpers ───────────────────────────────────────────────────
  // Set the expected notes for a given step, update keyboard + score highlights
  const setStepExpected = useCallback((stepIdx) => {
    const steps = stepsRef.current
    const step  = steps[stepIdx]
    if (!step) return
    const midis = step.noteEvents.map(n => n.midi)

    practiceExpectedRef.current = new Set(midis)
    practiceHeldRef.current     = new Set()

    const expHL = midis.map(m => ({
      midi: m, role: 'root', label: '',
      name: NOTE_NAMES[((m % 12) + 12) % 12],
      color: '#a78bfa',   // purple = "play this"
    }))
    practiceExpHLRef.current = expHL
    setLiveHL(expHL)

    // Colour expected notes on the score (purple)
    coloredNotesRef.current.forEach(gn => {
      try { gn.setColor('#000000', { applyToNoteheads: true, applyToStem: true }) } catch (_) {}
    })
    coloredNotesRef.current = []
    try {
      const gnotes = osmdRef.current?.cursor.GNotesUnderCursor() ?? []
      gnotes.forEach(gn => {
        try { gn.setColor('#a78bfa', { applyToNoteheads: true, applyToStem: true }) } catch (_) {}
      })
      coloredNotesRef.current = gnotes
    } catch (_) {}
  }, [])

  // Advance to the next step — called when all expected notes have been played
  const advancePractice = useCallback(() => {
    const steps  = stepsRef.current
    const curIdx = practiceStepIdxRef.current

    // Immediately clear expected set so that key-bounces or re-presses during
    // the green-flash window cannot re-trigger another advance (causing a skip).
    practiceExpectedRef.current = new Set()
    practiceHeldRef.current     = new Set()

    // Flash current notes green (correct!)
    coloredNotesRef.current.forEach(gn => {
      try { gn.setColor('#00c853', { applyToNoteheads: true, applyToStem: true }) } catch (_) {}
    })

    // Find next step that has actual notes (skip rests / empty steps)
    let nextIdx = curIdx + 1
    while (nextIdx < steps.length && steps[nextIdx].noteEvents.length === 0) nextIdx++

    if (nextIdx >= steps.length) {
      // Finished the piece!
      setTimeout(() => {
        practiceActiveRef.current = false
        setPracticeActive(false)
        setPracticeDone(true)
        setLiveHL([])
        coloredNotesRef.current.forEach(gn => {
          try { gn.setColor('#000000', { applyToNoteheads: true, applyToStem: true }) } catch (_) {}
        })
        coloredNotesRef.current = []
      }, 400)
      return
    }

    const curStep  = steps[curIdx]
    const nextStep = steps[nextIdx]
    const cursorDiff = nextStep.cursorIdx - (curStep?.cursorIdx ?? 0)

    practiceStepIdxRef.current = nextIdx
    setPracticeStep(nextIdx + 1)

    // Short green-flash delay, then advance cursor + set new expected notes
    setTimeout(() => {
      if (!practiceActiveRef.current) return
      for (let i = 0; i < cursorDiff; i++) {
        try { osmdRef.current?.cursor.next() } catch (_) {}
      }
      setStepExpected(nextIdx)
    }, 200)
  }, [setStepExpected])

  // Keep stable ref in sync so the MIDI callback (registered once) can call it
  useEffect(() => { practiceAdvanceFnRef.current = advancePractice }, [advancePractice])

  // ── Compute overlay hit-zones over each score measure ───────────────────
  const computeScoreOverlays = useCallback(() => {
    const osmd     = osmdRef.current
    const div      = scoreContainerRef.current   // sr-score-container (OSMD host)
    if (!osmd || !div) return

    const ml = osmd.GraphicSheet?.MeasureList
    if (!ml?.length) return

    const svg = div.querySelector('svg')
    if (!svg) return

    // sr-score-canvas is now the scroll container (overflow-y:auto).
    // getBoundingClientRect() gives viewport-relative positions; adding scrollTop/Left
    // converts the difference to content-origin-relative coordinates so the overlay
    // top/left values stay locked to their measure even after scrolling.
    const canvasEl   = div.parentElement            // sr-score-canvas
    const canvasRect = canvasEl.getBoundingClientRect()
    const svgRect    = svg.getBoundingClientRect()
    const svgOffX    = svgRect.left - canvasRect.left + canvasEl.scrollLeft
    const svgOffY    = svgRect.top  - canvasRect.top  + canvasEl.scrollTop

    let uip = osmd.EngravingRules?.UnitInPixels
    if (!uip || uip <= 0) {
      const pageW = osmd.GraphicSheet?.MusicPages?.[0]?.PositionAndShape?.Size?.width
      uip = (pageW && svgRect.width) ? svgRect.width / pageW : 10
    }

    const raw = []
    ml.forEach((staffArr, idx) => {
      const gm = staffArr?.[0]
      if (!gm) return
      const abs  = gm.PositionAndShape.AbsolutePosition
      const size = gm.PositionAndShape.Size
      raw.push({
        measureIdx: idx,
        x: abs.x * uip + svgOffX,
        y: abs.y * uip + svgOffY,
        w: size.width  * uip,
        h: size.height * uip,
      })
    })

    // Normalise heights per row so rest-only bars are as easy to click as note bars
    const rows = []
    raw.forEach(m => {
      const row = rows.find(r => Math.abs(r.y - m.y) < 4)
      if (row) row.items.push(m); else rows.push({ y: m.y, items: [m] })
    })
    rows.forEach(row => {
      const maxH = Math.max(...row.items.map(m => m.h))
      row.items.forEach(m => { m.h = maxH })
    })

    setScoreOverlays(raw)
  }, [])

  // ── Jump cursor to a specific measure ────────────────────────────────────
  const jumpToMeasure = useCallback((measureIdx) => {
    const osmd = osmdRef.current
    if (!osmd || isMidiRef.current) return

    const steps = stepsRef.current
    let stepIdx = steps.findIndex(s => s.measureIndex >= measureIdx)
    if (stepIdx < 0) return
    const noteStep = steps.findIndex(
      (s, i) => i >= stepIdx && s.measureIndex === measureIdx && s.noteEvents.length > 0
    )
    if (noteStep >= 0) stepIdx = noteStep

    // Apply the effective tempo at this measure
    let tempoAtStep = null
    for (let i = stepIdx; i >= 0; i--) {
      if (steps[i]?.tempo != null) { tempoAtStep = steps[i].tempo; break }
    }
    const newBpm = tempoAtStep ?? scoreOrigBpmRef.current
    if (newBpm > 0) {
      userBpmRef.current = newBpm
      bpmRef.current     = newBpm
      setBpm(newBpm)
    }

    playFromStepRef.current = stepIdx

    // Move OSMD cursor
    const targetCursorIdx = steps[stepIdx].cursorIdx
    osmd.cursor.reset()
    osmd.cursor.show()
    for (let i = 0; i < targetCursorIdx; i++) {
      try { osmd.cursor.next() } catch (_) {}
    }

    // If practice is active, restart from this step
    if (practiceActiveRef.current) {
      practiceExpectedRef.current = new Set()
      practiceHeldRef.current     = new Set()
      practiceStepIdxRef.current  = stepIdx
      setPracticeStep(stepIdx + 1)
      setStepExpected(stepIdx)
    }
  }, [setStepExpected])

  const startPractice = useCallback(() => {
    const steps = stepsRef.current
    if (!osmdRef.current || !steps.length) return
    stopPlayback()

    // Find first step with actual notes
    let startIdx = 0
    while (startIdx < steps.length && steps[startIdx].noteEvents.length === 0) startIdx++
    if (startIdx >= steps.length) return

    const total = steps.filter(s => s.noteEvents.length > 0).length
    setPracticeTotal(total)
    setPracticeStep(1)
    setPracticeDone(false)
    practiceHeldRef.current     = new Set()
    practiceStepIdxRef.current  = startIdx

    // Position OSMD cursor at the first note
    osmdRef.current.cursor.reset()
    osmdRef.current.cursor.show()
    const firstCursorIdx = steps[startIdx].cursorIdx
    for (let i = 0; i < firstCursorIdx; i++) {
      try { osmdRef.current.cursor.next() } catch (_) {}
    }

    practiceActiveRef.current = true
    setPracticeActive(true)
    setStepExpected(startIdx)
  }, [setStepExpected])

  const stopPractice = useCallback(() => {
    practiceActiveRef.current    = false
    setPracticeActive(false)
    setPracticeDone(false)
    practiceHeldRef.current      = new Set()
    practiceExpectedRef.current  = new Set()
    practiceExpHLRef.current     = []
    coloredNotesRef.current.forEach(gn => {
      try { gn.setColor('#000000', { applyToNoteheads: true, applyToStem: true }) } catch (_) {}
    })
    coloredNotesRef.current = []
    setLiveHL([])
    try { osmdRef.current?.cursor.reset(); osmdRef.current?.cursor.show() } catch (_) {}
  }, [])

  // Auto-start / stop practice when mode or file changes
  useEffect(() => {
    if (lessonMode === 'practice' && loaded && !isMidiFile) {
      startPractice()
    } else {
      stopPractice()
    }
  }, [lessonMode, loaded, isMidiFile, startPractice, stopPractice])

  // ── OSMD init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scoreContainerRef.current) return
    osmdRef.current = new OpenSheetMusicDisplay(scoreContainerRef.current, {
      autoResize: true,
      drawTitle: true,
      followCursor: true,
      cursorsOptions: [{ type: 0, color: '#64b5f6', alpha: 0.45, follow: true }],
    })
    const rules = osmdRef.current.EngravingRules
    rules.TitleHeight         = 2.0
    rules.TitleTopDistance    = 3.0
    rules.SubtitleHeight      = 1.8
    rules.DefaultColorCursor  = '#64b5f6'

    // Recompute overlays after OSMD auto-resizes the SVG
    const ro = new ResizeObserver(() => requestAnimationFrame(computeScoreOverlays))
    ro.observe(scoreContainerRef.current)
    return () => ro.disconnect()
  }, [computeScoreOverlays])

  // ── Metronome ──────────────────────────────────────────────────────────────
  const getMetroCtx = () => {
    if (!metroCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      metroCtxRef.current = new Ctx()
    }
    if (metroCtxRef.current.state === 'suspended') metroCtxRef.current.resume()
    return metroCtxRef.current
  }

  const stopMetronome = useCallback(() => {
    metroActiveRef.current = false
    metroTimers.current.forEach(clearTimeout)
    metroTimers.current = []
  }, [])

  const startMetronome = useCallback(() => {
    stopMetronome()
    metroActiveRef.current = true

    const ctx = getMetroCtx()

    // Schedule a single click at a precise AudioContext time (no drift).
    const scheduleClick = (time, accent) => {
      const vol  = metroVolRef.current
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = accent ? 1200 : 900
      osc.connect(gain)
      gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0, time)
      gain.gain.linearRampToValueAtTime((accent ? 0.22 : 0.14) * vol, time + 0.002)
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04)
      osc.start(time); osc.stop(time + 0.05)
    }

    // Web-Audio scheduler: setTimeout wakes us up roughly every INTERVAL ms, but
    // all actual click times are anchored to ctx.currentTime — no accumulated drift.
    const LOOKAHEAD = 0.12  // seconds ahead to schedule
    const INTERVAL  = 33    // scheduler wake-up interval (ms)
    let nextBeatTime = ctx.currentTime
    let beat = 0

    const scheduler = () => {
      if (!metroActiveRef.current) return
      while (nextBeatTime < ctx.currentTime + LOOKAHEAD) {
        scheduleClick(nextBeatTime, beat % 4 === 0)
        nextBeatTime += 60 / bpmRef.current
        beat++
      }
      metroTimers.current.push(setTimeout(scheduler, INTERVAL))
    }
    scheduler()
  }, [stopMetronome])

  const handleBpmChange = (v) => {
    setBpm(v); bpmRef.current = v; userBpmRef.current = v
    if (metroActiveRef.current) startMetronome()
    if (playingRef.current && isMidiRef.current) {
      startMidiPlayback(selectedParts, startMeasure, endMeasure)
    }
  }

  const handleBpmDelta = (dir) => {
    const newDelta  = bpmDelta + dir * 5
    const newBpm    = Math.max(20, Math.min(300, baseBpm + newDelta))
    setBpmDelta(newDelta)
    handleBpmChange(newBpm)
  }

  const toggleMetronome = (on) => {
    setMetronome(on)
    if (on) startMetronome(); else stopMetronome()
  }

  const handlePianoVol = (v) => { setPianoVol(v); setVolume(v / 100) }
  const handleMetroVol = (v) => { setMetroVol(v); metroVolRef.current = v / 100 }

  const handleAudioFx = (key, val) => {
    setAudioFx(prev => ({ ...prev, [key]: val }))
    if (key === 'reverbAmt')   setReverbAmount(val)
    if (key === 'reverbDecay') setReverbDecay(val)
    if (key === 'eqGain')      setEqGain(val)
    if (key === 'eqFreq')      setEqFreq(val)
  }

  // ── Playback — stop ────────────────────────────────────────────────────────
  const stopPlayback = useCallback((snapToCurrentPos = false) => {
    // Snap scrubber to the compass where playback stopped.
    // Only do this on explicit user Stop — not on internal seek/restart calls.
    if (snapToCurrentPos && playStartRef.current && isMidiRef.current && !loopRef.current) {
      const midi = midiDataRef.current
      const ts   = midi?.header.timeSignatures[0]?.timeSignature ?? [4, 4]
      const barSec = ts[0] * (60 / bpmRef.current)
      const elapsed = (Date.now() - playStartRef.current) / 1000
      const stoppedMeasure = Math.floor(startMeasureRef.current + elapsed / barSec)
      _setStartMeasure(stoppedMeasure)
    }
    playTimers.current.forEach(clearTimeout)
    playTimers.current = []
    playingRef.current = false
    playStartRef.current = null
    setIsPlaying(false)
    setLiveHL([])
    setLastVel(null)
    if (!isMidiRef.current) {
      // Restore user-intended BPM so in-score tempo changes don't persist after stop
      bpmRef.current = userBpmRef.current
      setBpm(userBpmRef.current)
      // Reset any notes still painted green
      coloredNotesRef.current.forEach(gn => {
        try { gn.setColor('#000000', { applyToNoteheads: true, applyToStem: true }) } catch (_) {}
      })
      coloredNotesRef.current = []
      // Reposition cursor to the selected start measure (not always measure 1)
      try {
        const fromIdx         = playFromStepRef.current
        const targetCursorIdx = fromIdx > 0 && stepsRef.current[fromIdx]
          ? stepsRef.current[fromIdx].cursorIdx
          : 0
        osmdRef.current?.cursor.reset()
        for (let i = 0; i < targetCursorIdx; i++) {
          osmdRef.current.cursor.next()
        }
        osmdRef.current?.cursor.show()
      } catch (_) {}
    }
  }, [])

  // ── Playback — MusicXML ────────────────────────────────────────────────────
  const startXmlPlayback = useCallback((steps) => {
    const seq = steps ?? stepsRef.current
    if (!osmdRef.current || !seq.length) return
    stopPlayback()
    playingRef.current = true; setIsPlaying(true)
    if (metroActiveRef.current) startMetronome()

    // Pre-calculate per-step offsets and beatMs values, honouring in-score
    // tempo changes. User BPM is applied as a proportional scale so that
    // "slow down / speed up" still works across tempo changes.
    // userScale = 1.0 when the user hasn't touched the slider.
    const origBpm   = scoreOrigBpmRef.current || bpmRef.current
    const userScale = bpmRef.current / origBpm
    let currentBeatMs = (60 / bpmRef.current) * 1000

    // stepTiming[i] = { offset, beatMs, scaledTempo } pre-computed for every step
    const stepTiming = []
    let accOffset = 0
    seq.forEach(step => {
      if (step.tempo != null) {
        // Score has an explicit tempo here — apply user's speed scale on top
        currentBeatMs = (60 / Math.max(10, step.tempo * userScale)) * 1000
      }
      const scaledTempo = Math.round(60000 / currentBeatMs)
      stepTiming.push({ offset: accOffset, beatMs: currentBeatMs, scaledTempo })
      accOffset += step.beats * currentBeatMs
    })

    // Restore user's intended BPM before computing scale — in-score tempo changes
    // from a previous playback may have dirtied bpmRef without resetting it.
    bpmRef.current = userBpmRef.current
    setBpm(userBpmRef.current)

    const fromIdx  = playFromStepRef.current
    const timeBase = fromIdx > 0 ? (stepTiming[fromIdx]?.offset ?? 0) : 0

    osmdRef.current.cursor.reset(); osmdRef.current.cursor.show()
    let cursorPos = 0
    // Pre-advance cursor to the chosen start step
    if (fromIdx > 0 && seq[fromIdx]) {
      const startCursorIdx = seq[fromIdx].cursorIdx
      while (cursorPos < startCursorIdx) {
        try { osmdRef.current.cursor.next(); cursorPos++ } catch (_) {}
      }
    }
    let activeStepTempo = seq[fromIdx]?.tempo ?? seq[0]?.tempo ?? null
    let activeMeasure   = -1   // for bar-restart metronome sync

    seq.forEach((step, i) => {
      if (i < fromIdx) return   // skip steps before the chosen start position
      const { offset, beatMs, scaledTempo } = stepTiming[i]
      const t = setTimeout(() => {
        if (!playingRef.current) return
        while (cursorPos < step.cursorIdx) { osmdRef.current.cursor.next(); cursorPos++ }

        // Reset previously green notes, then paint current notes green
        coloredNotesRef.current.forEach(gn => {
          try { gn.setColor('#000000', { applyToNoteheads: true, applyToStem: true }) } catch (_) {}
        })
        coloredNotesRef.current = []
        if (step.noteEvents.length > 0) {
          try {
            const gnotes = osmdRef.current.cursor.GNotesUnderCursor() ?? []
            gnotes.forEach(gn => {
              try { gn.setColor('#00c853', { applyToNoteheads: true, applyToStem: true }) } catch (_) {}
            })
            coloredNotesRef.current = gnotes
          } catch (_) {}
        }

        // Update BPM first so the bar-restart below uses the correct value.
        if (step.tempo != null && step.tempo !== activeStepTempo) {
          activeStepTempo = step.tempo
          bpmRef.current = scaledTempo
          setBpm(scaledTempo)
        }

        // Restart metronome at every bar boundary — re-anchors it to the playback
        // clock so drift never accumulates beyond one bar. Tempo changes are picked
        // up automatically because the scheduler reads bpmRef.current each iteration.
        if (metroActiveRef.current && step.measureIndex !== activeMeasure) {
          activeMeasure = step.measureIndex
          startMetronome()
        }

        if (step.noteEvents.length > 0) {
          setLiveHL(midiHL(step.noteEvents.map(n => n.midi), colorSchemeRef.current, visualOptsRef.current))
          if (visualOptsRef.current.hitLineBoost && hitLineRef.current) {
            const el = hitLineRef.current
            el.classList.remove('sr-hit-line--pulse')
            void el.offsetWidth
            el.classList.add('sr-hit-line--pulse')
          }

          const sopts   = scoreOptsRef.current
          const baseVel = sopts.dynamicMarks ? (step.velocity ?? 75) : 75
          let stepVel = baseVel
          step.noteEvents.forEach(({ midi, dur }) => {
            const audioDur = Math.min((dur * beatMs / 1000) * 1.17, 8.0)
            const scatter = (sopts.humanizeAmt ?? 0) > 0
              ? Math.round((Math.random() * 2 - 1) * sopts.humanizeAmt)
              : 0
            const vel = Math.max(10, Math.min(127, baseVel + scatter))
            stepVel = vel
            // Note length variance: ±% of the note's own duration
            const noteDurMs = dur * beatMs
            const dawScatter = (sopts.humanizeDawAmt ?? 0) > 0
              ? (Math.random() * 2 - 1) * (sopts.humanizeDawAmt / 100) * noteDurMs
              : 0
            if (dawScatter !== 0) {
              setTimeout(() => playNote(midi, { duration: audioDur, velocity: vel }), Math.max(0, dawScatter))
            } else {
              playNote(midi, { duration: audioDur, velocity: vel })
            }
          })
          setLastVel(stepVel)
        }

        if (i === seq.length - 1) {
          playTimers.current.push(setTimeout(() => {
            if (!playingRef.current) return
            if (!loopRef.current) { stopPlayback(); return }
            const gapMs = loopGapRef.current * 4 * (60000 / bpmRef.current)
            if (gapMs > 0) {
              setLiveHL([])
              playTimers.current.push(setTimeout(() => {
                if (!playingRef.current) return
                startXmlPlayback(stepsRef.current)
              }, gapMs))
            } else {
              startXmlPlayback(stepsRef.current)
            }
          }, step.beats * beatMs))
        }
      }, offset - timeBase)

      playTimers.current.push(t)
    })
  }, [stopPlayback, startMetronome, playNote])

  // ── Playback — MIDI ────────────────────────────────────────────────────────
  // timeOffsetMs: delay audio by this many ms while the visual starts immediately.
  // Used for the loop gap: notes start falling before they sound.
  const startMidiPlayback = useCallback((selParts, from, to, timeOffsetMs = 0, keepMetro = false) => {
    const midi = midiDataRef.current
    if (!midi) return
    stopPlayback()
    playingRef.current = true; setIsPlaying(true)
    if (metroActiveRef.current && !keepMetro) startMetronome()

    const origBpm   = midiOrigBpmRef.current
    const speedMult = bpmRef.current / origBpm
    const timeSig   = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]
    const barSec    = timeSig[0] * (60 / origBpm)
    const winStart  = from * barSec
    const winEnd    = to   * barSec
    const selSet    = new Set(selParts)

    const events = []
    midi.tracks.forEach((track, i) => {
      if (!selSet.has(i)) return
      track.notes.forEach(note => {
        if (note.time < winStart || note.time >= winEnd) return
        const onMs  = (note.time               - winStart) / speedMult * 1000
        const offMs = (note.time + note.duration - winStart) / speedMult * 1000
        events.push({ onMs, offMs, midi: note.midi, velocity: Math.round(note.velocity * 127), trackIdx: i })
      })
    })

    if (!events.length) { stopPlayback(); return }

    const endMs = Math.max(...events.map(e => e.offMs))

    // Visual starts now; when timeOffsetMs > 0 the timestamp is in the future
    // so elapsed begins negative — notes fall from above before audio fires.
    playStartRef.current = Date.now() + timeOffsetMs
    playDurMsRef.current = endMs + timeOffsetMs

    events.forEach(ev => {
      const mopts = midiOptsRef.current
      // Note length variance: ±% of the note's own duration
      const noteDurMs = ev.offMs - ev.onMs
      const dawScatter = (mopts.humanizeDawAmt ?? 0) > 0
        ? (Math.random() * 2 - 1) * (mopts.humanizeDawAmt / 100) * noteDurMs
        : 0
      const scheduledOnMs = ev.onMs + timeOffsetMs + dawScatter

      playTimers.current.push(setTimeout(() => {
        if (!playingRef.current) return

        // Hand filter — checked at fire time so changes take effect immediately
        const { handMode = 'both', handSplit = 'pitch', handSplitMidi = 60 } = visualOptsRef.current
        if (handMode !== 'both') {
          const hand = handSplit === 'track'
            ? (ev.trackIdx === 0 ? 'rh' : 'lh')
            : (ev.midi >= handSplitMidi ? 'rh' : 'lh')
          if (handMode === 'left'  && hand !== 'lh') return
          if (handMode === 'right' && hand !== 'rh') return
        }

        setLiveHL(prev => [...prev.filter(h => h.midi !== ev.midi),
          toHL(ev.midi, colorSchemeRef.current, ev.trackIdx, handOptsRef.current, visualOptsRef.current)])

        if (visualOptsRef.current.hitLineBoost && hitLineRef.current) {
          const el = hitLineRef.current
          el.classList.remove('sr-hit-line--pulse')
          void el.offsetWidth
          el.classList.add('sr-hit-line--pulse')
        }

        // Velocity humanizer
        const scatter = (mopts.humanizeAmt ?? 0) > 0
          ? Math.round((Math.random() * 2 - 1) * mopts.humanizeAmt)
          : 0
        const finalVel = Math.max(10, Math.min(127, ev.velocity + scatter))
        setLastVel(finalVel)

        playNote(ev.midi, {
          duration: (ev.offMs - ev.onMs) / 1000,
          velocity: finalVel,
        })
      }, Math.max(0, scheduledOnMs)))

      playTimers.current.push(setTimeout(() => {
        if (!playingRef.current) return
        setLiveHL(prev => prev.filter(h => h.midi !== ev.midi))
      }, ev.offMs + timeOffsetMs))
    })

    // End / loop: restart immediately with 4-beat pre-roll so notes fall before audio fires.
    playTimers.current.push(setTimeout(() => {
      if (!playingRef.current) return
      if (!loopRef.current) { stopPlayback(); return }
      const prerollMs = 4 * (60000 / bpmRef.current)
      startMidiPlayback(selParts, from, to, prerollMs)
    }, endMs + timeOffsetMs + 80))
  }, [stopPlayback, startMetronome, playNote])

  useEffect(() => () => { stopPlayback(); stopMetronome() }, [stopPlayback, stopMetronome])

  // ── File reading ───────────────────────────────────────────────────────────
  const readFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => resolve(e.target.result)
    reader.onerror = () => reject(new Error('Could not read file'))
    if (/\.midi?$/i.test(file.name))          reader.readAsArrayBuffer(file)
    else if (file.name.toLowerCase().endsWith('.mxl')) reader.readAsBinaryString(file)
    else                                       reader.readAsText(file)
  })

  // ── Score loading (MusicXML) ───────────────────────────────────────────────
  const loadScore = async (file) => {
    if (!file || !osmdRef.current) return
    stopPlayback()
    setError(null); setLoaded(false); setRendering(true); setUsedPcs(null)
    isMidiRef.current = false; setIsMidiFile(false); setMidiMeta(null)

    try {
      const content = await readFile(file)
      await osmdRef.current.load(content)

      const sheet    = osmdRef.current.Sheet
      const partList = sheet.Parts.map((p, i) => ({
        id: i, name: p.PartName?.trim() || `Part ${i + 1}`,
      }))
      const allIds  = partList.map(p => p.id)
      const mCount  = sheet.SourceMeasures.length

      setParts(partList); setSelectedParts(allIds)
      setMeasureCount(mCount); _setStartMeasure(0); setEndMeasure(mCount)
      setLoaded(true)
      setRendering(false)  // make container visible BEFORE render() so OSMD gets correct clientWidth

      await rafWait(2)
      osmdRef.current.setOptions({ drawFromMeasureNumber: 1, drawUpToMeasureNumber: mCount })
      osmdRef.current.render()
      requestAnimationFrame(computeScoreOverlays)
      const { map: dynMap, count: dynCount } = buildMeasureVelocityMap(osmdRef.current)
      dynamicVelMapRef.current = dynMap
      setDynMarkCount(dynCount)

      // BPM: read directly from the sheet (no cursor walk needed).
      // The cursor-based fallback runs after deferred step extraction below.
      const musicSheet = osmdRef.current.Sheet
      const sheetBpm = Math.round(
        musicSheet.DefaultStartTempoInBpm ||
        musicSheet.getExpressionsStartTempoInBPM?.() ||
        0
      )
      if (sheetBpm > 0) {
        setBpm(sheetBpm); bpmRef.current = sheetBpm; userBpmRef.current = sheetBpm
        setBaseBpm(sheetBpm); setBpmDelta(0)
        scoreOrigBpmRef.current = sheetBpm
      } else {
        userBpmRef.current = bpmRef.current
        setBaseBpm(bpmRef.current); setBpmDelta(0)
        scoreOrigBpmRef.current = bpmRef.current
      }

      // cursor.show() internally calls scrollIntoView({behavior:'smooth'}) when
      // followCursor:true — that async animation would override any synchronous
      // scrollTop reset.  Suppress it by blanking scrollIntoView on the prototype
      // for just this call, then force the canvas to y=0.
      const _siv = Element.prototype.scrollIntoView
      Element.prototype.scrollIntoView = function() {}
      osmdRef.current.cursor.reset(); osmdRef.current.cursor.show()
      Element.prototype.scrollIntoView = _siv
      const _canvas = scoreContainerRef.current?.parentElement
      if (_canvas) { _canvas.scrollTop = 0 }
      // Belt-and-suspenders: reset again after browser settles (catches any
      // deferred scroll from DOM-insertion or OSMD's autoResize re-render).
      requestAnimationFrame(() => {
        if (scoreContainerRef.current?.parentElement)
          scoreContainerRef.current.parentElement.scrollTop = 0
      })

      // Defer the heavy cursor walk (extractSteps) to after the first paint so
      // the score appears immediately. Steps are needed for playback & practice
      // but not for the initial render.
      const osmdSnap   = osmdRef.current
      const allIdsSnap = allIds
      const dynMapSnap = dynamicVelMapRef.current
      setTimeout(() => {
        const extracted = extractSteps(osmdSnap, allIdsSnap, 0, mCount, dynMapSnap)
        stepsRef.current    = extracted
        playFromStepRef.current = 0   // reset start position for newly loaded score
        // If sheet-level BPM was missing, refine from the first tempo step
        if (sheetBpm === 0) {
          const stepTempo = extracted.find(s => s.tempo != null)?.tempo ?? 0
          if (stepTempo > 0) {
            setBpm(stepTempo); bpmRef.current = stepTempo; userBpmRef.current = stepTempo
            setBaseBpm(stepTempo); setBpmDelta(0)
            scoreOrigBpmRef.current = stepTempo
          }
        }
      }, 0)
    } catch (e) {
      console.error('Score load error:', e)
      setError(`Could not load score: ${e.message}`)
      setRendering(false)
    }
  }

  // ── MIDI loading ───────────────────────────────────────────────────────────
  const loadMidi = async (file) => {
    stopPlayback()
    setError(null); setLoaded(false); setRendering(true); setUsedPcs(null)
    isMidiRef.current = true; setIsMidiFile(true)

    try {
      const buffer = await file.arrayBuffer()
      const midi   = new Midi(buffer)

      midiDataRef.current = midi

      // Tempo
      const origBpm  = midi.header.tempos[0]?.bpm ?? 120
      midiOrigBpmRef.current = origBpm
      const roundBpm = Math.round(origBpm)
      setBpm(roundBpm); bpmRef.current = roundBpm
      setBaseBpm(roundBpm); setBpmDelta(0)

      // Time signature
      const timeSig      = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]
      const beatsPerBar  = timeSig[0]
      const totalBeats   = midi.duration / (60 / origBpm)
      const mCount       = Math.max(1, Math.ceil(totalBeats / beatsPerBar))

      // Tracks (skip empty)
      const tracks = midi.tracks
        .map((t, i) => ({ id: i, name: t.name?.trim() || `Track ${i + 1}`, count: t.notes.length }))
        .filter(t => t.count > 0)

      const hasPedal = midi.tracks.some(t => (t.controlChanges[64]?.length ?? 0) > 0)

      setMidiMeta({
        name:     file.name.replace(/\.[^.]+$/, ''),
        duration: midi.duration,
        timeSig:  `${timeSig[0]}/${timeSig[1]}`,
        hasPedal,
      })
      midiDataRef.current = midi

      // Auto-select keyboard size and start octave from the song's note range
      const { keyCount: autoKeys, baseOctave: autoOct } = autoKeyboardLayout(midi)
      setKeyCount(autoKeys)
      setBaseOctave(autoOct)

      setParts(tracks); setSelectedParts(tracks.map(t => t.id))
      setMeasureCount(mCount); _setStartMeasure(0); setEndMeasure(mCount)

      // Auto-select hand split method based on track count
      setVisualOpts(prev => ({
        ...prev,
        handSplit: tracks.length === 2 ? 'track' : 'pitch',
      }))

      setLoaded(true)
    } catch (e) {
      console.error('MIDI load error:', e)
      setError(`Could not load MIDI: ${e.message}`)
      isMidiRef.current = false; setIsMidiFile(false)
    } finally {
      setRendering(false)
    }
  }

  // ── Folder scanning ────────────────────────────────────────────────────────
  // Uses a webkitdirectory input — shows all files in the native picker dialog
  // so the user can browse folder contents while selecting.
  const openFolder    = () => folderInputRef.current?.click()   // whole folder scan
  const openFilesPick = () => folderFilesRef.current?.click()   // individual file pick

  // ── Built-in library ("Out of the box songs") ────────────────────────────
  const [builtinLoading, setBuiltinLoading] = useState(false)
  const loadBuiltinLibrary = async () => {
    if (builtinLoading) return
    setBuiltinLoading(true)
    try {
      const res   = await fetch('/midi-library/index.json')
      const names = await res.json()
      const FOLDER = 'Out of the Box Songs'
      const newEntries = []
      await Promise.all(
        names.map(async (name) => {
          try {
            const r    = await fetch(`/midi-library/${encodeURIComponent(name)}`)
            const buf  = await r.arrayBuffer()
            const type = /\.(mid|midi)$/i.test(name) ? 'midi' : 'score'
            const mime = type === 'midi' ? 'audio/midi' : 'application/octet-stream'
            const file = new File([buf], name, { type: mime })
            newEntries.push({ name, fileObj: file, type, folder: FOLDER })
          } catch { /* skip broken file */ }
        })
      )
      newEntries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
      setFolderFiles(prev => {
        // Replace any existing "Out of the Box Songs" entries, keep user files
        const kept   = prev.filter(e => e.folder !== FOLDER)
        const merged = [...kept, ...newEntries]
        merged.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name))
        saveFilesToCache(merged)
        return merged
      })
      setExpandedFolders(prev => new Set([...prev, FOLDER]))
      setFolderSelIdx(null)
    } catch (e) {
      console.error('[builtin library] load failed:', e)
    } finally {
      setBuiltinLoading(false)
    }
  }

  // Merges new files into the existing list preserving full subfolder structure.
  // `folder` stores the full directory path, e.g. "Music/Chopin/Etudes".
  const collectEntries = (files, fallbackFolder = 'My Files') => {
    const newEntries = []
    for (const file of files) {
      const { name } = file
      // webkitRelativePath = "Music/Chopin/Etudes/file.mid"
      // Strip the filename → keep "Music/Chopin/Etudes" as the folder path
      const folder = file.webkitRelativePath
        ? file.webkitRelativePath.split('/').slice(0, -1).join('/')
        : fallbackFolder
      if      (/\.(mid|midi)$/i.test(name))          newEntries.push({ name, fileObj: file, type: 'midi',  folder })
      else if (/\.(mxl|musicxml|xml)$/i.test(name)) newEntries.push({ name, fileObj: file, type: 'score', folder })
    }
    setFolderFiles(prev => {
      const merged = [...prev]
      for (const e of newEntries) {
        if (!merged.some(x => x.folder === e.folder && x.name === e.name))
          merged.push(e)
      }
      merged.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name))
      saveFilesToCache(merged)
      return merged
    })
    // Auto-expand every folder path that came in (including ancestors)
    setExpandedFolders(prev => {
      const next = new Set(prev)
      allFolderPaths(newEntries).forEach(p => next.add(p))
      return next
    })
    setFolderSelIdx(null)
  }

  const handleClearCache = () => {
    stopPlayback()
    clearFilesCache()
    setFolderFiles([])
    setFolderSelIdx(null)
    setExpandedFolders(new Set())
    setLoaded(false)
    setRendering(false)
    setError(null)
  }

  const handleFolderInput = (e) => {
    collectEntries(Array.from(e.target.files))
    e.target.value = ''
  }

  const handleFilesInput = (e) => {
    collectEntries(Array.from(e.target.files), 'My Files')
    e.target.value = ''
  }

  const handleFolderFileClick = (item, idx) => {
    setFolderSelIdx(idx)
    handleFile(item.fileObj)
  }

  // ── File dispatch ──────────────────────────────────────────────────────────
  const handleFile = (file) => {
    if (!file) return
    stopPlayback()
    if (/\.midi?$/i.test(file.name)) {
      setMode('midi')
      loadMidi(file)
      return
    }
    if (!/\.(xml|musicxml|mxl)$/i.test(file.name)) {
      setError('Please upload a .musicxml, .xml, .mxl, or .mid file.')
      return
    }
    setMode('score')
    loadScore(file)
  }

  // ── Range / part controls ──────────────────────────────────────────────────
  const rerender = useCallback((from, to, selParts) => {
    if (!osmdRef.current || isMidiRef.current) return
    osmdRef.current.setOptions({ drawFromMeasureNumber: from + 1, drawUpToMeasureNumber: to })
    osmdRef.current.render()
    requestAnimationFrame(computeScoreOverlays)
    stepsRef.current = extractSteps(osmdRef.current, selParts, from, to, dynamicVelMapRef.current)
    playFromStepRef.current = 0
    // Suppress OSMD's smooth scrollIntoView during cursor placement (same as load)
    const _siv = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function() {}
    osmdRef.current.cursor.reset(); osmdRef.current.cursor.show()
    Element.prototype.scrollIntoView = _siv
    const _canvas = scoreContainerRef.current?.parentElement
    if (_canvas) { _canvas.scrollTop = 0 }
    requestAnimationFrame(() => {
      if (scoreContainerRef.current?.parentElement)
        scoreContainerRef.current.parentElement.scrollTop = 0
    })
  }, [computeScoreOverlays])

  const togglePart = (id) => {
    const next = selectedParts.includes(id)
      ? selectedParts.filter(p => p !== id) : [...selectedParts, id]
    if (!next.length) return
    setSelectedParts(next)
    if (!isMidiRef.current) rerender(startMeasure, endMeasure, next)
    else if (playingRef.current) startMidiPlayback(next, startMeasure, endMeasure)
  }

  const updateRange = (from, to) => {
    _setStartMeasure(from); setEndMeasure(to)
    if (!isMidiRef.current) { rerender(from, to, selectedParts); return }
    // Seeking while playing (no loop): restart from new position so playStartRef resets
    if (playingRef.current && !loopRef.current) {
      startMidiPlayback(selectedParts, from, to)
    }
  }

  // Loop-mode callbacks from MeasureScrubber
  const handleLoopStart = (anchor) => {
    if (playingRef.current) startMidiPlayback(selectedParts, anchor, measureCount)
  }
  const handleLoopCommit = (from, to) => {
    if (playingRef.current) startMidiPlayback(selectedParts, from, to)
  }

  // Commit draft measure inputs (called on blur or Enter)
  const commitFrom = () => {
    const v = Math.max(1, Math.min(endMeasure, parseInt(draftFrom, 10) || 1))
    setDraftFrom(String(v))
    if (v - 1 !== startMeasure) updateRange(v - 1, endMeasure)
  }
  const commitTo = () => {
    const v = Math.max(startMeasure + 1, Math.min(measureCount, parseInt(draftTo, 10) || measureCount))
    setDraftTo(String(v))
    if (v !== endMeasure) updateRange(startMeasure, v)
  }

  // ── Unused-note highlight toggle ──────────────────────────────────────────
  const toggleUnused = () => {
    if (usedPcs) { setUsedPcs(null); return }
    const pcs = new Set()
    if (isMidiRef.current && midiDataRef.current) {
      midiDataRef.current.tracks.forEach(track =>
        track.notes.forEach(note => pcs.add(((note.midi % 12) + 12) % 12))
      )
    } else {
      stepsRef.current.forEach(step =>
        step.noteEvents.forEach(({ midi }) => pcs.add(((midi % 12) + 12) % 12))
      )
    }
    setUsedPcs([...pcs])
  }

  // ── Manual key press (keyboard click) ────────────────────────────────────
  const handleKeyPress = (midi) => {
    playNote(midi)
    const hl = toHL(midi, visualOpts.colorScheme, -1, {
      handSplit: 'pitch',
      handSplitMidi: visualOpts.handSplitMidi ?? 60,
    }, visualOpts)
    setLiveHL(prev => [...prev.filter(h => h.midi !== midi), hl])
    setTimeout(() => setLiveHL(prev => prev.filter(h => h.midi !== midi)), 700)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const handlePlay = async () => {
    // In practice mode (score only): play button restarts practice
    if (lessonMode === 'practice' && !isMidiFile) {
      if (practiceActive) stopPractice()
      else startPractice()
      return
    }
    if (isPlaying) { stopPlayback(true); return }
    await ensureLoaded()
    if (mode === 'midi') startMidiPlayback(selectedParts, startMeasure, endMeasure)
    else                 startXmlPlayback()
  }

  // isFolder is true whenever there's a loaded file list (no tab needed)
  const isFolder = folderFiles.length > 0
  // isMidi is always auto-detected from the loaded file
  const isMidi   = isMidiFile

  // ── Keyboard layout derived values ────────────────────────────────────────
  const KEY_SIZES  = { 36: 3, 49: 4, 61: 5, 76: 6, 88: 7 }
  const numOctaves = KEY_SIZES[keyCount] ?? 3
  const baseMidi   = baseOctave * 12 + 12   // C1=24, C2=36, C3=48, C4=60, C5=72

  // Seconds per measure at current playback BPM (used by MeasureScrubber)
  const scaledBarSec = (() => {
    if (isMidi && midiDataRef.current) {
      const ts = midiDataRef.current.header.timeSignatures[0]?.timeSignature ?? [4, 4]
      return ts[0] * (60 / bpm)
    }
    return (4 * 60) / bpm   // fallback: assume 4/4
  })()

  // Fullscreen — keep isFullscreen in sync with browser state (Esc key, etc.)
  // Also fire a window resize event after the transition so PixiJS (resizeTo)
  // re-measures the canvas wrapper and redraws at the correct pixel size.
  useEffect(() => {
    const handler = () => setIsFullscreen(
      !!(document.fullscreenElement || document.webkitFullscreenElement)
    )
    document.addEventListener('fullscreenchange', handler)
    document.addEventListener('webkitfullscreenchange', handler)
    return () => {
      document.removeEventListener('fullscreenchange', handler)
      document.removeEventListener('webkitfullscreenchange', handler)
    }
  }, [])

  useEffect(() => {
    if (!tracksOpen) return
    const handler = (e) => {
      if (tracksRef.current && !tracksRef.current.contains(e.target)) setTracksOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [tracksOpen])

  useEffect(() => {
    if (!optPanel) return
    const handler = (e) => {
      const inGroup = optGroupRef.current?.contains(e.target)
      const inSound = soundAnchorRef.current?.contains(e.target)
      const inMode  = modeAnchorRef.current?.contains(e.target)
      if (!inGroup && !inSound && !inMode) setOptPanel(null)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [optPanel])

  const toggleFullscreen = () => {
    const el = sectionRef.current
    const inFs = document.fullscreenElement || document.webkitFullscreenElement
    if (!inFs) {
      // iOS Safari exposes only webkit-prefixed APIs
      if      (el?.requestFullscreen)       el.requestFullscreen()
      else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen()
    } else {
      if      (document.exitFullscreen)       document.exitFullscreen()
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
    }
  }

  return (
    <section ref={sectionRef} className="sight-reading">

      {/* Hidden file inputs — always mounted so refs work from both dropzone and folder header */}
      <input ref={folderInputRef} type="file" webkitdirectory="" multiple
        style={{ display: 'none' }} onChange={handleFolderInput} />
      <input ref={folderFilesRef} type="file" multiple
        accept=".mid,.midi,.mxl,.musicxml,.xml"
        style={{ display: 'none' }} onChange={handleFilesInput} />

      {/* Folder file list — hidden in fullscreen */}
      {isFolder && !isFullscreen && (() => {
        const midiCount  = folderFiles.filter(f => f.type === 'midi').length
        const scoreCount = folderFiles.filter(f => f.type === 'score').length
        const typeFiltered = folderFilter === 'all'  ? folderFiles
                           : folderFilter === 'midi' ? folderFiles.filter(f => f.type === 'midi')
                           :                           folderFiles.filter(f => f.type === 'score')
        const query   = folderSearch.trim().toLowerCase()
        const visible = query
          ? typeFiltered.filter(f => f.name.toLowerCase().replace(/\.[^.]+$/, '').includes(query))
          : typeFiltered
        const tree    = buildFileTree(visible)

        // Header label: show root folder name if everything shares one root, else summary
        const roots     = [...new Set(folderFiles.map(f => f.folder.split('/')[0]))]
        const headerTxt = roots.length === 1 ? `📁 ${roots[0]}` : `📁 ${roots.length} folders · ${folderFiles.length} files`

        const toggleFolder = (path) =>
          setExpandedFolders(prev => {
            const next = new Set(prev)
            next.has(path) ? next.delete(path) : next.add(path)
            return next
          })

        // Recursive tree renderer
        const renderNode = (node, depth) => (
          <>
            {Object.values(node.children).map(child => {
              const expanded  = expandedFolders.has(child.path)
              const fileCount = countFilesInNode(child)
              return (
                <div key={child.path}>
                  <button
                    className="sr-tree-folder-row"
                    style={{ paddingLeft: `${10 + depth * 16}px` }}
                    onClick={() => toggleFolder(child.path)}
                  >
                    <span className="sr-tree-chevron">{expanded ? '▾' : '▸'}</span>
                    <span className="sr-tree-folder-icon">📁</span>
                    <span className="sr-tree-folder-name">{child.name}</span>
                    <span className="sr-tree-count">{fileCount}</span>
                  </button>
                  {expanded && (
                    <div className="sr-tree-children">
                      {renderNode(child, depth + 1)}
                      {child.files.map(item => (
                        <button
                          key={item.folder + '/' + item.name}
                          className={`sr-folder-item ${folderSelIdx === folderFiles.indexOf(item) ? 'active' : ''}`}
                          style={{ paddingLeft: `${10 + (depth + 1) * 16}px` }}
                          onClick={() => handleFolderFileClick(item, folderFiles.indexOf(item))}
                        >
                          <span className={`sr-folder-item-badge ${item.type}`}>
                            {item.type === 'midi' ? '🎵 MIDI' : '𝄞 Score'}
                          </span>
                          <span className="sr-folder-item-name">
                            {item.name.replace(/\.[^.]+$/, '')}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )

        return (
          <div className="sr-folder-panel">
            <div className="sr-folder-header">
              <span className="sr-folder-header-name">{headerTxt}</span>
              <span className="sr-folder-sep" />
              <div className="sr-folder-search">
                <svg className="sr-folder-search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <circle cx="6.5" cy="6.5" r="4.5"/>
                  <line x1="10" y1="10" x2="14" y2="14"/>
                </svg>
                <input
                  className="sr-folder-search-input"
                  type="text"
                  placeholder="Search…"
                  value={folderSearch}
                  onChange={e => setFolderSearch(e.target.value)}
                />
                {folderSearch && (
                  <button className="sr-folder-search-clear" onClick={() => setFolderSearch('')}>✕</button>
                )}
              </div>
              <span className="sr-folder-sep" />
              <div className="sr-folder-filters">
                {[
                  { key: 'all',   label: 'All',     count: folderFiles.length },
                  { key: 'midi',  label: '🎵 MIDI', count: midiCount },
                  { key: 'score', label: '𝄞 Score', count: scoreCount },
                ].map(({ key, label, count }) => (
                  <button
                    key={key}
                    className={`sr-folder-filter-pill ${folderFilter === key ? 'active' : ''}`}
                    onClick={() => {
                      const filtered = key === 'all'  ? folderFiles
                                     : key === 'midi' ? folderFiles.filter(f => f.type === 'midi')
                                     :                  folderFiles.filter(f => f.type === 'score')
                      setFolderFilter(key)
                      setExpandedFolders(allFolderPaths(filtered))
                    }}
                  >
                    {label}
                    <span className="sr-folder-filter-count">{count}</span>
                  </button>
                ))}
              </div>
              <span className="sr-folder-sep" />
              <button className="sr-folder-change-btn sr-folder-change-btn--builtin" onClick={loadBuiltinLibrary} disabled={builtinLoading} title="Load built-in song library">
                {builtinLoading ? '⏳' : '🎹'} {builtinLoading ? 'Loading…' : 'Out of the Box'}
              </button>
              <button className="sr-folder-change-btn" onClick={openFolder}>📁 Scan Folder</button>
              <button className="sr-folder-change-btn" onClick={openFilesPick}>🎵 Pick Files</button>
              <button className="sr-folder-clear-btn" onClick={handleClearCache} title="Clear list">✕</button>
            </div>

            <div className="sr-folder-list">
              {visible.length === 0 ? (
                <p className="sr-folder-empty-filter">
                  {query ? `No results for "${folderSearch}"` : `No ${folderFilter} files in this list`}
                </p>
              ) : query ? (
                /* Flat search results — no tree structure needed */
                visible.map(item => (
                  <button
                    key={item.folder + '/' + item.name}
                    className={`sr-folder-item ${folderSelIdx === folderFiles.indexOf(item) ? 'active' : ''}`}
                    onClick={() => handleFolderFileClick(item, folderFiles.indexOf(item))}
                  >
                    <span className={`sr-folder-item-badge ${item.type}`}>
                      {item.type === 'midi' ? '🎵 MIDI' : '𝄞 Score'}
                    </span>
                    <span className="sr-folder-item-name">
                      {item.name.replace(/\.[^.]+$/, '')}
                    </span>
                    <span className="sr-folder-item-path">{item.folder}</span>
                  </button>
                ))
              ) : (
                renderNode(tree, 0)
              )}
            </div>
          </div>
        )
      })()}

      {/* Drop zone — shown when nothing is loaded yet and no file list exists */}
      {!loaded && !rendering && !isFolder && (
        <div
          className={`sr-dropzone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
        >
          <p className="sr-drop-title">Open a file to get started</p>
          <p className="sr-drop-sub">Drag &amp; drop any file here, or choose an option below</p>

          <div className="sr-drop-options">
            <button className="sr-drop-option sr-drop-option--builtin" onClick={loadBuiltinLibrary} disabled={builtinLoading}>
              <span className="sr-drop-option-icon">🎹</span>
              <span className="sr-drop-option-label">{builtinLoading ? 'Loading…' : 'Out of the Box Songs'}</span>
              <span className="sr-drop-option-hint">361 MIDI · 4 scores ready to play</span>
            </button>
            <button className="sr-drop-option" onClick={openFilesPick}>
              <span className="sr-drop-option-icon">𝄞</span>
              <span className="sr-drop-option-label">Upload MusicXML / Midi files</span>
              <span className="sr-drop-option-hint">.musicxml · .mxl · .mid · .midi</span>
            </button>
            <button className="sr-drop-option" onClick={openFolder}>
              <span className="sr-drop-option-icon">📁</span>
              <span className="sr-drop-option-label">Scan entire folder</span>
              <span className="sr-drop-option-hint">Browse all compatible files in a folder</span>
            </button>
          </div>

          {error && <p className="sr-error">{error}</p>}
        </div>
      )}

      {rendering && (
        <div className="sr-loading">
          <span className="spinner" /><span>{isMidi ? 'Loading MIDI…' : 'Rendering score…'}</span>
        </div>
      )}

      {/* Control bar */}
      {loaded && !rendering && (
        <div className="sr-bar">

          {/* Row 1: left controls | center play+tracks | right options */}
          <div className="sr-bar-row sr-bar-row-main">

            {/* Left: mode selector + measure range (score only) */}
            <div className="sr-bar-left">
              <div ref={modeAnchorRef} className="sr-mode-anchor">
                <button
                  className={`sr-mode-btn${optPanel === 'mode' ? ' active' : ''}`}
                  onClick={() => setOptPanel(v => v === 'mode' ? null : 'mode')}
                  title="Mode">
                  MODE
                </button>
                {optPanel === 'mode' && (
                  <div className="sr-mode-panel">
                    <span className="sr-tracks-popup-title">Mode</span>
                    {[
                      { key: 'playback', label: 'Playback' },
                      { key: 'practice', label: 'Practice' },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        className={`sr-pill sr-pill-sm${lessonMode === key ? ' active' : ''}`}
                        onClick={() => { setLessonMode(key); setOptPanel(null) }}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!isMidi && measureCount > 0 && (
                <div className="sr-measure-inputs">
                  <span className="sr-mini-lbl">Measures</span>
                  <input
                    type="number" className="sr-measure-box"
                    min={1} max={measureCount}
                    value={draftFrom}
                    onChange={e => setDraftFrom(e.target.value)}
                    onBlur={commitFrom}
                    onKeyDown={e => e.key === 'Enter' && commitFrom()}
                  />
                  <span className="sr-measure-sep">–</span>
                  <input
                    type="number" className="sr-measure-box"
                    min={1} max={measureCount}
                    value={draftTo}
                    onChange={e => setDraftTo(e.target.value)}
                    onBlur={commitTo}
                    onKeyDown={e => e.key === 'Enter' && commitTo()}
                  />
                  <span className="sr-mini-lbl">of {measureCount}</span>
                </div>
              )}
              {isMidi && (
                <HandPanel opts={visualOpts} onChange={setVisualOpts} />
              )}
            </div>

            {/* Center: sound | fullscreen | play | loop | metro | tracks */}
            <div className="sr-bar-center">
              {/* Sound icon button with inline panel anchor */}
              <div ref={soundAnchorRef} className="sr-opts-group">
                <button
                  className={`sr-icon-btn${optPanel === 'sound' ? ' active' : ''}`}
                  onClick={() => setOptPanel(v => v === 'sound' ? null : 'sound')}
                  title="Sound options">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>
                  </svg>
                </button>
                <OptionsPanel
                  open={optPanel === 'sound'}
                  activeTab="sound"
                  isMidi={isMidi}
                  keyCount={keyCount}     onKeyCount={setKeyCount}
                  baseOctave={baseOctave} onBaseOctave={setBaseOctave}
                  visualOpts={visualOpts} onVisualOpts={setVisualOpts}
                  usedPcs={usedPcs}       onToggleUnused={toggleUnused}
                  scoreOpts={scoreOpts}   onScoreOpts={setScoreOpts}
                  midiOpts={midiOpts}     onMidiOpts={setMidiOpts}
                  audioFx={audioFx}       onAudioFx={handleAudioFx}
                  pianoVol={pianoVol}     onPianoVol={handlePianoVol}
                  metroVol={metroVol}     onMetroVol={handleMetroVol}
                  lastVel={lastVel}
                  dynMarkCount={dynMarkCount}
                />
              </div>

              <button className="sr-fullscreen-btn" onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                  {isFullscreen
                    ? <><path d="M7 2H5v3H2v2h5V2zm6 0h2v3h3v2h-5V2zM2 13h3v3h2v-5H2v2zm11 3v-3h3v-2h-5v5h2z"/></>
                    : <><path d="M2 2h5v2H4v3H2V2zm11 0h5v5h-2V4h-3V2zM2 13h2v3h3v2H2v-5zm13 2h-3v2h5v-5h-2v3z"/></>}
                </svg>
              </button>

              <button className={`sr-play-circle${(isPlaying || practiceActive) ? ' playing' : ''}`} onClick={handlePlay} disabled={loading}
                title={(isPlaying || practiceActive) ? 'Stop' : 'Play'}>
                {loading
                  ? <span className="spinner" />
                  : <span className="play-icon">{(isPlaying || practiceActive) ? '■' : '▶'}</span>}
              </button>

              <button
                className={`sr-icon-btn${loop ? ' active' : ''}`}
                onClick={() => {
                  const v = !loop
                  setLoop(v)
                  loopRef.current = v
                  loopGapRef.current = 1
                  // Turning loop OFF while MIDI is playing: seek to the current measure
                  // and continue to song end — exactly like clicking the scrubber while
                  // playing. updateRange handles startMeasure, endMeasure and restarts
                  // startMidiPlayback so the PianoRoll props all stay in sync.
                  if (!v && playingRef.current && isMidiRef.current) {
                    const ts = midiDataRef.current?.header.timeSignatures[0]?.timeSignature ?? [4, 4]
                    const barSec = ts[0] * (60 / bpmRef.current)
                    const rawElapsed = (Date.now() - (playStartRef.current ?? Date.now())) / 1000
                    const curMeasure = Math.max(0, Math.min(
                      measureCount - 1,
                      Math.floor(startMeasureRef.current + Math.max(0, rawElapsed) / barSec)
                    ))
                    updateRange(curMeasure, measureCount)
                  }
                }}
                title="Loop">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                  <polyline points="17 1 21 5 17 9"/>
                  <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                  <polyline points="7 23 3 19 7 15"/>
                  <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>
              </button>

              {/* Metronome icon button */}
              <button
                className={`sr-icon-btn${metronome ? ' active' : ''}`}
                onClick={() => toggleMetronome(!metronome)}
                title="Metronome">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                  <polygon points="12,3 3,21 21,21"/>
                  <line x1="12" y1="21" x2="17" y2="9"/>
                </svg>
              </button>

              {parts.length > 0 && (
                <div ref={tracksRef} className="sr-tracks-anchor">
                  <button
                    className={`sr-tracks-btn${tracksOpen ? ' active' : ''}`}
                    onClick={() => setTracksOpen(v => !v)}
                    title={isMidi ? 'Tracks' : 'Parts'}>
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                      <path d="M2 5h16v2H2zm0 4h16v2H2zm0 4h16v2H2z"/>
                    </svg>
                  </button>
                  {tracksOpen && (
                    <div className="sr-tracks-popup">
                      <span className="sr-tracks-popup-title">{isMidi ? 'Tracks' : 'Parts'}</span>
                      {parts.map(p => (
                        <button key={p.id}
                          className={`sr-pill sr-pill-sm ${selectedParts.includes(p.id) ? 'active' : ''}`}
                          onClick={() => togglePart(p.id)}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: options + info */}
            <div className="sr-bar-right">

              {/* Keys + FX option buttons + panel */}
              <div ref={optGroupRef} className="sr-opts-group">
                {/* Key */}
                <button
                  className={`sr-icon-btn${optPanel === 'keys' ? ' active' : ''}`}
                  onClick={() => setOptPanel(v => v === 'keys' ? null : 'keys')}
                  title="Key options">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width="15" height="15">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="M7 4v10M12 4v16M17 4v10"/>
                  </svg>
                </button>
                {/* FX / Visual */}
                {isMidi && (
                  <button
                    className={`sr-icon-btn${optPanel === 'visual' ? ' active' : ''}`}
                    onClick={() => setOptPanel(v => v === 'visual' ? null : 'visual')}
                    title="Visual FX"
                    style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', width: 32, height: 32 }}>
                    FX
                  </button>
                )}

                <OptionsPanel
                  open={optPanel === 'keys' || optPanel === 'visual'}
                  activeTab={optPanel}
                  isMidi={isMidi}
                  keyCount={keyCount}     onKeyCount={setKeyCount}
                  baseOctave={baseOctave} onBaseOctave={setBaseOctave}
                  visualOpts={visualOpts} onVisualOpts={setVisualOpts}
                  usedPcs={usedPcs}       onToggleUnused={toggleUnused}
                  scoreOpts={scoreOpts}   onScoreOpts={setScoreOpts}
                  midiOpts={midiOpts}     onMidiOpts={setMidiOpts}
                  audioFx={audioFx}       onAudioFx={handleAudioFx}
                  pianoVol={pianoVol}     onPianoVol={handlePianoVol}
                  metroVol={metroVol}     onMetroVol={handleMetroVol}
                  lastVel={lastVel}
                  dynMarkCount={dynMarkCount}
                />
              </div>


              {isMidi && midiMeta && (
                <span className="sr-midi-inline">
                  {midiMeta.name} &nbsp;
                  <span className="sr-midi-inline-meta">({fmtTime(midiMeta.duration)} · {midiMeta.timeSig})</span>
                </span>
              )}

            </div>
          </div>

          {/* Row 3: MIDI scrubber only */}
          {measureCount > 0 && isMidi && (
            <div className="sr-bar-row sr-bar-row-scrubber">
              <MeasureScrubber
                measureCount={measureCount}
                startMeasure={startMeasure}
                endMeasure={endMeasure}
                onRangeChange={updateRange}
                isPlaying={isPlaying}
                playStartRef={playStartRef}
                scaledBarSec={scaledBarSec}
                loop={loop}
                onLoopStart={handleLoopStart}
                onLoopCommit={handleLoopCommit}
              />
            </div>
          )}

        </div>
      )}

      {/* MIDI piano roll */}
      {loaded && !rendering && isMidi && (
        <div className="sr-roll-container">
          <div className="sr-bpm-overlay">
            <div className="sr-bpm-control">
              <button className="sr-bpm-btn" onClick={() => handleBpmDelta(-1)}>−</button>
              <span className="sr-bpm-val">
                <span className="sr-bpm-label">bpm</span>
                {bpm}
                {bpmDelta !== 0 && (
                  <span className="sr-bpm-delta">{bpmDelta > 0 ? `+${bpmDelta}` : bpmDelta}</span>
                )}
              </span>
              <button className="sr-bpm-btn" onClick={() => handleBpmDelta(1)}>+</button>
            </div>
          </div>
          <div className="sr-top-right-overlays">
            <span className="sr-vel-overlay">
              vel <strong>{lastVel ?? '—'}</strong>
              <span className="sr-vel-debug-dyn">MIDI</span>
            </span>
            {midiMeta && (
              <span
                className={`sr-pedal-overlay ${midiMeta.hasPedal ? 'sr-pedal-badge--on' : 'sr-pedal-badge--off'}`}
                title={midiMeta.hasPedal ? 'Sustain pedal data present' : 'No sustain pedal data'}>
                ⬛ pedal
              </span>
            )}
          </div>
          <PianoRoll
            midi={midiDataRef.current}
            selectedTracks={selectedParts}
            origBpm={midiOrigBpmRef.current}
            userBpm={bpm}
            startMeasure={startMeasure}
            endMeasure={endMeasure}
            isPlaying={isPlaying}
            playStartRef={playStartRef}
            baseMidi={baseMidi}
            numOctaves={numOctaves}
            opts={visualOpts}
          />
        </div>
      )}

      {/* OSMD score — always in DOM for stable ref, hidden in MIDI mode */}
      <div className="sr-score-wrap" style={isMidi ? { display: 'none' } : undefined}>
        {loaded && !rendering && !isMidi && (
          <>
            <div className="sr-bpm-overlay">
              <div className="sr-bpm-control">
                <button className="sr-bpm-btn" onClick={() => handleBpmDelta(-1)}>−</button>
                <span className="sr-bpm-val">
                  <span className="sr-bpm-label">bpm</span>
                  {bpm}
                  {bpmDelta !== 0 && (
                    <span className="sr-bpm-delta">{bpmDelta > 0 ? `+${bpmDelta}` : bpmDelta}</span>
                  )}
                </span>
                <button className="sr-bpm-btn" onClick={() => handleBpmDelta(1)}>+</button>
              </div>
              {lessonMode === 'practice' && loaded && !isMidiFile && (
                <div className="sr-practice-info">
                  {practiceDone ? (
                    <span className="sr-practice-done">🎉 Complete!</span>
                  ) : practiceActive ? (
                    <>
                      <span className="sr-practice-label">🎹 Practice</span>
                      <span className="sr-practice-progress">{practiceStep} / {practiceTotal}</span>
                      <span className="sr-practice-hint">Play the purple notes</span>
                    </>
                  ) : null}
                </div>
              )}
            </div>
            <div className="sr-top-right-overlays">
              <span className="sr-vel-overlay">
                vel <strong>{lastVel ?? '—'}</strong>
                <span className="sr-vel-debug-dyn">
                  {dynMarkCount > 0 ? `${dynMarkCount} dyn` : 'no dyn'}
                </span>
              </span>
            </div>
          </>
        )}
        {/* Wrapper keeps overlays in the exact same coordinate space as the SVG */}
        <div className="sr-score-canvas">
          <div
            ref={scoreContainerRef}
            className={`sr-score-container${(!loaded || rendering || isMidi) ? ' sr-score-hidden' : ''}`}
          />
          {loaded && !isMidi && scoreOverlays.length > 0 && (
            <div className="sr-score-overlays">
              {scoreOverlays.map(ov => (
                <div
                  key={ov.measureIdx}
                  className={`sr-score-ov${hoveredMeasure === ov.measureIdx ? ' sr-score-ov--hovered' : ''}`}
                  style={{ left: ov.x, top: ov.y, width: ov.w, height: ov.h }}
                  onClick={() => jumpToMeasure(ov.measureIdx)}
                  onMouseEnter={() => setHoveredMeasure(ov.measureIdx)}
                  onMouseLeave={() => setHoveredMeasure(null)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Keyboard — flush below Synthesia grid in MIDI mode, standalone in Score mode */}
      {loaded && !rendering && (
        <div className={`sr-sight-keyboard${isMidi ? ' sr-synthesia-keyboard' : ''}`}>
          {isMidi && visualOpts.hitLineVisible !== false && (() => {
            const col1  = visualOpts.hitLineColor  ?? '#a078ff'
            const col2  = visualOpts.hitLineColor2 ?? col1
            const glow  = visualOpts.hitLineGlow   ?? 2
            const spread= [0, 4, 10, 20, 36][glow]
            const bg    = col1 !== col2
              ? `linear-gradient(to right, ${col1}, ${col2})`
              : col1
            // blend both colours for a neutral glow that matches the whole line
            const blendHex = (a, b) => {
              const p = s => parseInt(s, 16)
              const r = Math.round((p(a.slice(1,3)) + p(b.slice(1,3))) / 2).toString(16).padStart(2,'0')
              const g = Math.round((p(a.slice(3,5)) + p(b.slice(3,5))) / 2).toString(16).padStart(2,'0')
              const bl= Math.round((p(a.slice(5,7)) + p(b.slice(5,7))) / 2).toString(16).padStart(2,'0')
              return `#${r}${g}${bl}`
            }
            const glowCol = blendHex(col1, col2)
            return (
              <div ref={hitLineRef} className="sr-hit-line" style={{
                background: bg,
                boxShadow: glow > 0
                  ? `0 0 ${spread}px ${spread * 0.4}px ${glowCol}99`
                  : 'none',
              }} />
            )
          })()}
          <Keyboard
            rootPc={0}
            baseMidi={baseMidi}
            noteColors={
              visualOpts.colorScheme === 'hands'
                ? COLOR_SCHEMES.rh
                : (COLOR_SCHEMES[visualOpts.colorScheme] ?? COLOR_SCHEMES.spectrum)
            }
            octaves={numOctaves}
            highlights={liveHL}
            onKeyPress={handleKeyPress}
            showNoteNames={visualOpts.showKeyLabels}
            noteLabelColor={visualOpts.colorScheme === 'hands' ? '#ffffff' : null}
            scalePcs={usedPcs}
          />
        </div>
      )}
    </section>
  )
}
