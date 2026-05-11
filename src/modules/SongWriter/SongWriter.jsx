import { useState, useCallback, useRef, useEffect } from 'react'
import ChordWheel from './ChordWheel'
import ChordStaff from './ChordStaff'
import { useAudio } from '../../audio/AudioContext.jsx'
import './songwriter.css'

/* ── Chord → MIDI ───────────────────────────────────────────────── */
const ROOT_MIDI = { C:60, Db:61, D:62, Eb:63, E:64, F:65, Gb:66, G:67, Ab:68, A:69, Bb:70, B:71 }
const INTERVALS = {
  maj:  [0,4,7],
  min:  [0,3,7],
  '7':  [0,4,7,10],
  maj7: [0,4,7,11],
  min7: [0,3,7,10],
  dim:  [0,3,6],
  aug:  [0,4,8],
  sus4: [0,5,7],
  sus2: [0,2,7],
}
function chordToMidi(chord) {
  const root = ROOT_MIDI[chord.root] ?? 60
  const intervals = INTERVALS[chord.quality] ?? [0,4,7]
  return intervals.map(i => root + i)
}

/* ── Scale theory ───────────────────────────────────────────────── */
const CHROMATIC = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
const ROOT_PC   = { C:0, Db:1, D:2, Eb:3, E:4, F:5, Gb:6, G:7, Ab:8, A:9, Bb:10, B:11 }

const SCALE_DEFS = {
  major:       { name:'Major',          intervals:[0,2,4,5,7,9,11], qualities:['maj','min','min','maj','maj','min','dim'] },
  minor:       { name:'Natural Minor',  intervals:[0,2,3,5,7,8,10], qualities:['min','dim','maj','min','min','maj','maj'] },
  harmonic:    { name:'Harmonic Minor', intervals:[0,2,3,5,7,8,11], qualities:['min','dim','aug','min','maj','maj','dim'] },
  dorian:      { name:'Dorian',         intervals:[0,2,3,5,7,9,10], qualities:['min','min','maj','maj','min','dim','maj'] },
  mixolydian:  { name:'Mixolydian',     intervals:[0,2,4,5,7,9,10], qualities:['maj','min','dim','maj','min','min','maj'] },
  phrygian:    { name:'Phrygian',       intervals:[0,1,3,5,7,8,10], qualities:['min','maj','maj','min','dim','maj','min'] },
}

/** Returns [{ root, quality }] for a given key + scale */
function getDiatonicChords(key, scaleType) {
  const def  = SCALE_DEFS[scaleType]
  const base = ROOT_PC[key] ?? 0
  return def.intervals.map((interval, i) => ({
    root:    CHROMATIC[(base + interval) % 12],
    quality: def.qualities[i],
  }))
}

function uid() { return Math.random().toString(36).slice(2, 9) }

function emptyBar() {
  return { id: uid(), chords: [null] }   // start with 1 slot; user can add a 2nd
}

const QUALITY_SHORT = {
  maj: '', min: 'm', '7': '7', maj7: 'M7', min7: 'm7',
  dim: '°', aug: '+', sus4: 'sus4', sus2: 'sus2',
}

const QUALITY_COLOR = {
  maj:  '#4d96ff',   // blue
  maj7: '#4d96ff',   // blue
  min:  '#ff5f5f',   // red
  min7: '#ff5f5f',   // red
  '7':  '#ffd166',   // yellow
  dim:  '#ffd166',   // yellow
  aug:  '#ffd166',   // yellow
  sus4: '#ffd166',   // yellow
  sus2: '#ffd166',   // yellow
}

const NOTE_DISPLAY = {
  Gb: 'F♯', Db: 'D♭', Ab: 'A♭', Eb: 'E♭', Bb: 'B♭',
}

function chordLabel(chord) {
  if (!chord) return null
  const root = NOTE_DISPLAY[chord.root] ?? chord.root
  const q    = QUALITY_SHORT[chord.quality] ?? chord.quality
  return { full: `${root}${q}`, quality: chord.quality }
}

export default function SongWriter() {
  const { playChord, stopAll } = useAudio()

  const [bars,        setBars]        = useState(() => [{ id: uid(), chords: [{ root: 'C', quality: 'maj' }] }])
  const [wheel,       setWheel]       = useState(null)
  const [bpm,         setBpm]         = useState(120)
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [metroOn,     setMetroOn]     = useState(false)
  const [metroVol,    setMetroVol]    = useState(80)
  const [activeSlot,    setActiveSlot]    = useState(null)
  const [scaleKey,      setScaleKey]      = useState('C')
  const [scaleType,     setScaleType]     = useState('major')
  const [copySource,    setCopySource]    = useState(null)  // barIdx being copied, or null

  const diatonicChords = getDiatonicChords(scaleKey, scaleType)

  const timersRef      = useRef([])
  const metroCtxRef    = useRef(null)
  const metroTimers    = useRef([])
  const metroActiveRef = useRef(false)
  const metroVolRef    = useRef(0.8)
  const bpmRef         = useRef(120)
  const timelineRef    = useRef(null)

  /* ── Metronome ──────────────────────────────────────────────────── */
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

    const LOOKAHEAD = 0.12, INTERVAL = 33
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

  const toggleMetro = useCallback((on) => {
    setMetroOn(on)
    if (on) startMetronome(); else stopMetronome()
  }, [startMetronome, stopMetronome])

  const handleMetroVol = useCallback((v) => {
    setMetroVol(v)
    metroVolRef.current = v / 100
  }, [])

  /* ── Transport ──────────────────────────────────────────────────── */
  const stopPlayback = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    stopAll?.()
    setIsPlaying(false)
    setActiveSlot(null)
  }, [stopAll])

  const startPlayback = useCallback(() => {
    const beatMs  = (60 / bpm) * 1000
    const barMs   = beatMs * 4
    const slotMs  = beatMs * 2   // each chord slot = 2 beats

    const anyChord = bars.some(b => b.chords.some(Boolean))
    if (!anyChord) return

    if (metroActiveRef.current) startMetronome()
    setIsPlaying(true)

    const timers = []

    bars.forEach((bar, bi) => {
      const barStart = bi * barMs
      bar.chords.forEach((chord, si) => {
        if (!chord) return
        const notes      = chordToMidi(chord)
        const slotStart  = barStart + si * slotMs
        timers.push(setTimeout(() => setActiveSlot({ barIdx: bi, slotIdx: si }), slotStart))
        timers.push(setTimeout(() =>
          playChord?.(notes, { duration: slotMs * 0.92 / 1000, strum: 0.022, velocity: 72, humanize: 6 }),
          slotStart
        ))
      })
    })

    const totalMs = bars.length * barMs
    timers.push(setTimeout(() => { setIsPlaying(false); setActiveSlot(null) }, totalMs))

    timersRef.current = timers
  }, [bars, bpm, playChord, startMetronome])

  const handlePlay = useCallback(() => {
    if (isPlaying) stopPlayback()
    else           startPlayback()
  }, [isPlaying, stopPlayback, startPlayback])

  const handleBpm = useCallback((delta) => {
    setBpm(prev => {
      const next = Math.max(40, Math.min(220, prev + delta))
      bpmRef.current = next
      if (metroActiveRef.current) startMetronome()
      return next
    })
  }, [startMetronome])

  /* ── Wheel open / close ─────────────────────────────── */
  const openWheelByIdx = useCallback((barIdx, x, y) => {
    setWheel({ barIdx, x, y })
  }, [])

  const closeWheel = useCallback(() => setWheel(null), [])

  // chord: { root, quality }, slotIdx: 0 or 1 (from ChordWheel's activeChord)
  // Wheel stays open after selection so the user can keep tweaking
  const selectChord = useCallback((chord, slotIdx) => {
    if (!wheel) return
    setBars(prev => prev.map((b, i) =>
      i === wheel.barIdx
        ? { ...b, chords: b.chords.map((c, ci) => ci === slotIdx ? chord : c) }
        : b
    ))
  }, [wheel])

  // Called when ChordWheel's Single/Multiple toggle changes
  const setWheelBarMode = useCallback((mode) => {
    if (wheel === null) return
    setBars(prev => prev.map((b, i) => {
      if (i !== wheel.barIdx) return b
      if (mode === 'single') {
        return { ...b, chords: [b.chords[0] ?? null] }
      } else {
        // multiple — ensure 2 slots
        if (b.chords.length >= 2) return b
        return { ...b, chords: [b.chords[0] ?? null, null] }
      }
    }))
  }, [wheel])

  /* ── Bar management ─────────────────────────────────── */
  const addBar = useCallback(() => setBars(prev => [...prev, emptyBar()]), [])

  // Index-based helpers for ChordStaff callbacks
  const removeBarByIdx = useCallback((i) => {
    setBars(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)
    setWheel(null)
  }, [])

  const duplicateBarByIdx = useCallback((i) => {
    setBars(prev => {
      const bar = prev[i]
      if (!bar) return prev
      const copy = { ...bar, id: uid(), chords: bar.chords.map(c => c ? { ...c } : null) }
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)]
    })
  }, [])

  // Copy flow: clicking ⧉ enters "pick destination" mode
  const startCopyByIdx = useCallback((i) => { setCopySource(i); setWheel(null) }, [])
  const cancelCopy     = useCallback(() => { setCopySource(null); setWheel(null) }, [])
  const handleCopyToBar = useCallback((destIdx) => {
    if (destIdx === copySource || destIdx < 0) return   // clicking source does nothing
    // Paste chords — stay in copy mode so the user can paste to more bars
    setBars(prev => {
      const src = prev[copySource]
      if (!src) return prev
      return prev.map((bar, i) =>
        i === destIdx ? { ...bar, chords: src.chords.map(c => c ? { ...c } : null) } : bar
      )
    })
  }, [copySource])

  // Escape cancels copy mode
  useEffect(() => {
    if (copySource === null) return
    const onKey = e => { if (e.key === 'Escape') cancelCopy() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [copySource, cancelCopy])


  /* ── Render ─────────────────────────────────────────── */
  return (
    <div className="sw-root" onClick={closeWheel}>

      {/* Header */}
      <div className="sw-header">
        {/* Scale selector */}
        <div className="sw-scale-picker" onClick={e => e.stopPropagation()}>
          <label className="sw-select-group">
            <span className="sw-select-label">Key</span>
            <select className="sw-select" value={scaleKey} onChange={e => setScaleKey(e.target.value)}>
              {CHROMATIC.map(k => (
                <option key={k} value={k}>{NOTE_DISPLAY[k] ?? k}</option>
              ))}
            </select>
          </label>
          <label className="sw-select-group">
            <span className="sw-select-label">Scale</span>
            <select className="sw-select" value={scaleType} onChange={e => setScaleType(e.target.value)}>
              {Object.entries(SCALE_DEFS).map(([id, def]) => (
                <option key={id} value={id}>{def.name}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Play */}
        <div className="sw-center-group" onClick={e => e.stopPropagation()}>
          <button
            className={`sw-play-btn ${isPlaying ? 'sw-play-btn--stop' : ''}`}
            onClick={e => { e.stopPropagation(); handlePlay() }}
          >
            {isPlaying ? '■' : '▶'}
          </button>
        </div>

        {/* Transport — BPM + Metronome only */}
        <div className="sw-transport">
          {/* BPM */}
          <div className="sw-bpm">
            <button className="sw-bpm-btn" onClick={e => { e.stopPropagation(); handleBpm(-5) }}>−</button>
            <div className="sw-bpm-display">
              <span className="sw-bpm-val">{bpm}</span>
              <span className="sw-bpm-label">BPM</span>
            </div>
            <button className="sw-bpm-btn" onClick={e => { e.stopPropagation(); handleBpm(+5) }}>+</button>
          </div>

          {/* Metronome */}
          <div className={`sw-metro ${metroOn ? 'sw-metro--on' : ''}`}>
            <button
              className="sw-metro-btn"
              title={metroOn ? 'Metronome on' : 'Metronome off'}
              onClick={e => { e.stopPropagation(); toggleMetro(!metroOn) }}
            >
              <svg viewBox="0 0 22 26" width="16" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 24 L17 24 L14 2 L8 2 Z" />
                <line x1="11" y1="24" x2="15.5" y2="7" />
                <rect x="13.2" y="9" width="5" height="3" rx="1" strokeWidth="1.5" />
                <line x1="4" y1="24" x2="18" y2="24" strokeWidth="2" />
              </svg>
            </button>
            {metroOn && (
              <input
                type="range" min={0} max={100} step={1}
                value={metroVol}
                className="sw-metro-vol"
                onClick={e => e.stopPropagation()}
                onChange={e => handleMetroVol(Number(e.target.value))}
              />
            )}
          </div>
        </div>

        <button className="sw-add-btn" onClick={e => { e.stopPropagation(); addBar() }}>
          + Add Bar
        </button>
      </div>

      {/* Staff — full interactive view */}
      <ChordStaff
        bars={bars}
        bpm={bpm}
        scaleKey={scaleKey}
        scaleType={scaleType}
        activeSlot={activeSlot}
        wheelOpen={wheel ? { barIdx: wheel.barIdx } : null}
        copySource={copySource}
        onBarClick={openWheelByIdx}
        onRemoveBar={removeBarByIdx}
        onDuplicateBar={duplicateBarByIdx}
        onCopyStart={startCopyByIdx}
        onCopyTo={handleCopyToBar}
        onCancelCopy={cancelCopy}
      />

      {/* Chord Wheel */}
      {wheel && (
        <ChordWheel
          x={wheel.x}
          y={wheel.y}
          barChords={bars[wheel.barIdx]?.chords ?? []}
          barMode={bars[wheel.barIdx]?.chords?.length === 2 ? 'multiple' : 'single'}
          scaleChords={diatonicChords}
          onSelect={selectChord}
          onSetMode={setWheelBarMode}
          onClose={closeWheel}
        />
      )}
    </div>
  )
}
