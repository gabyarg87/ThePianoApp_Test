import { useState, useEffect, useRef, useCallback } from 'react'
import './chord-game.css'

// ── Music theory ───────────────────────────────────────────────────────
const NOTE_NAMES    = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const SHARP_CLASSES = new Set([1, 3, 6, 8, 10])

const CHORD_INTERVALS = {
  maj:  [0, 4, 7],
  min:  [0, 3, 7],
  dim:  [0, 3, 6],
  maj7: [0, 4, 7, 11],
  m7:   [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  m7b5: [0, 3, 6, 10],
}
const CHORD_SUFFIX = {
  maj: '', min: 'm', dim: 'dim',
  maj7: 'maj7', m7: 'm7', dom7: '7', m7b5: 'm7b5',
}
const CHORD_LABEL = {
  maj: 'Major', min: 'Minor', dim: 'Diminished',
  maj7: 'Major 7', m7: 'Minor 7', dom7: 'Dominant 7', m7b5: 'Half-dim 7',
}

// Diatonic degrees: [semitone offset, triad quality, 7th quality]
const SCALE_DEGREES = {
  major: [
    [0,  'maj', 'maj7'],
    [2,  'min', 'm7'],
    [4,  'min', 'm7'],
    [5,  'maj', 'maj7'],
    [7,  'maj', 'dom7'],
    [9,  'min', 'm7'],
    [11, 'dim', 'm7b5'],
  ],
  minor: [
    [0,  'min', 'm7'],
    [2,  'dim', 'm7b5'],
    [3,  'maj', 'maj7'],
    [5,  'min', 'm7'],
    [7,  'min', 'm7'],
    [8,  'maj', 'maj7'],
    [10, 'maj', 'dom7'],
  ],
}

// Build chord pool from selected scale roots + scale types + chord kinds
function buildPool(scaleTypes, kinds, scaleRoots) {
  const seen = new Set()
  const pool = []
  for (const scaleRoot of scaleRoots) {
    for (const scaleType of scaleTypes) {
      for (const [offset, triadQ, seventhQ] of SCALE_DEGREES[scaleType]) {
        const chordRoot = (scaleRoot + offset) % 12
        const add = (quality) => {
          const key = `${chordRoot}-${quality}`
          if (seen.has(key)) return
          seen.add(key)
          pool.push({
            name:  `${NOTE_NAMES[chordRoot]}${CHORD_SUFFIX[quality]}`,
            notes: CHORD_INTERVALS[quality].map(i => 60 + chordRoot + i),
            root:  chordRoot,
            label: CHORD_LABEL[quality],
          })
        }
        if (kinds.includes('triad')) add(triadQ)
        if (kinds.includes('4note')) add(seventhQ)
      }
    }
  }
  return pool
}

// ── Staff notation ─────────────────────────────────────────────────────
const DIATONIC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
const LINE_GAP  = 14
const STAFF_TOP = 32
const NOTE_X    = 170
const SVG_W     = 290
const SVG_H     = 150

function midiToStaffPos(midi) {
  const oct = Math.floor(midi / 12) - 1
  return (oct - 4) * 7 + DIATONIC[midi % 12] - 2
}
const pY = pos => STAFF_TOP + (8 - pos) * (LINE_GAP / 2)

function StaffNotation({ notes, showNoteNames }) {
  if (!notes?.length) return null
  const staffNotes = notes
    .map(midi => ({ midi, pos: midiToStaffPos(midi), sharp: SHARP_CLASSES.has(midi % 12) }))
    .sort((a, b) => a.pos - b.pos)

  const ledgers = new Set()
  for (const { pos } of staffNotes) {
    if (pos <  0) for (let p = -2; p >= pos; p -= 2) ledgers.add(p)
    if (pos >  8) for (let p = 10; p <= pos; p += 2) ledgers.add(p)
  }

  const avgPos    = staffNotes.reduce((s, n) => s + n.pos, 0) / staffNotes.length
  const stemUp    = avgPos <= 4
  const outerNote = stemUp ? staffNotes[staffNotes.length - 1] : staffNotes[0]
  const stemX     = NOTE_X + (stemUp ? 5.5 : -5.5)
  const stemY1    = pY(outerNote.pos)
  const stemY2    = stemUp
    ? Math.min(stemY1 - LINE_GAP * 3.5, pY(8))
    : Math.max(stemY1 + LINE_GAP * 3.5, pY(0))

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet" className="cg-staff-svg">
      {[8,6,4,2,0].map(p => (
        <line key={p} x1={50} y1={pY(p)} x2={SVG_W-10} y2={pY(p)}
          stroke="rgba(255,255,255,0.65)" strokeWidth={1.2} />
      ))}
      <text x={12} y={pY(0)+8} fontSize={LINE_GAP*5.2}
        fill="rgba(255,255,255,0.8)" fontFamily="serif" dominantBaseline="bottom">𝄞</text>
      {[...ledgers].map(p => (
        <line key={p} x1={NOTE_X-12} y1={pY(p)} x2={NOTE_X+12} y2={pY(p)}
          stroke="rgba(255,255,255,0.65)" strokeWidth={1.2} />
      ))}
      <line x1={stemX} y1={stemY1} x2={stemX} y2={stemY2} stroke="white" strokeWidth={1.5} />
      {staffNotes.map(({ midi, pos, sharp }) => {
        const y = pY(pos)
        return (
          <g key={midi}>
            {sharp && (
              <text x={NOTE_X-17} y={y+5} fontSize={13} fill="#a78bfa" fontFamily="serif">♯</text>
            )}
            <ellipse cx={NOTE_X} cy={y} rx={6} ry={4.5}
              fill="white" transform={`rotate(-20,${NOTE_X},${y})`} />
            {showNoteNames && (
              <text x={NOTE_X+14} y={y+4} fontSize={10} fontWeight={700}
                fill="rgba(255,255,255,0.75)" fontFamily="sans-serif">
                {NOTE_NAMES[midi % 12]}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Piano keyboard ─────────────────────────────────────────────────────
const PIANO_LOW  = 48
const PIANO_HIGH = 79
const WW = 26, WH = 86, BW = 17, BH = 54

const PIANO_KEYS = (() => {
  const keys = []
  let wc = 0
  for (let midi = PIANO_LOW; midi <= PIANO_HIGH; midi++) {
    const isBlack = SHARP_CLASSES.has(midi % 12)
    if (isBlack) keys.push({ midi, isBlack: true,  x: (wc - 0.55) * WW })
    else       { keys.push({ midi, isBlack: false, x: wc * WW }); wc++ }
  }
  return { keys, totalW: wc * WW }
})()

function PianoRoll({ pressedNotes, chordNotes, showChordNotes, showNoteNames }) {
  const pressedClasses = new Set(pressedNotes.map(n => n % 12))
  const chordClasses   = new Set(chordNotes.map(n => n % 12))
  const fill = (midi, isBlack) => {
    const nc = midi % 12
    if (pressedClasses.has(nc) && chordClasses.has(nc))  return '#22c55e'
    if (pressedClasses.has(nc))                           return '#818cf8'
    if (showChordNotes && chordClasses.has(nc)) return isBlack ? '#312e81' : '#a5b4fc'
    return isBlack ? '#111827' : '#f1f5f9'
  }
  const labelColor = (midi, isBlack) => {
    const nc = midi % 12
    if (pressedClasses.has(nc) || (showChordNotes && chordClasses.has(nc))) return '#fff'
    return isBlack ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'
  }
  return (
    <div className="cg-piano-outer">
      <svg width={PIANO_KEYS.totalW} height={WH+4} className="cg-piano-svg">
        {PIANO_KEYS.keys.filter(k => !k.isBlack).map(({ midi, x }) => (
          <g key={midi}>
            <rect x={x+1} y={1} width={WW-2} height={WH}
              rx={4} fill={fill(midi,false)} stroke="#374151" strokeWidth={1} />
            {showNoteNames && (
              <text x={x + WW/2} y={WH - 6} textAnchor="middle"
                fontSize={11} fontWeight={700} fill={labelColor(midi, false)}
                style={{ pointerEvents: 'none', userSelect: 'none' }}>
                {NOTE_NAMES[midi % 12]}
              </text>
            )}
          </g>
        ))}
        {PIANO_KEYS.keys.filter(k => k.isBlack).map(({ midi, x }) => (
          <g key={midi}>
            <rect x={x} y={1} width={BW} height={BH}
              rx={3} fill={fill(midi,true)} stroke="#0f172a" strokeWidth={1} />
            {showNoteNames && (
              <text x={x + BW/2} y={BH - 4} textAnchor="middle"
                fontSize={9} fontWeight={700} fill={labelColor(midi, true)}
                style={{ pointerEvents: 'none', userSelect: 'none' }}>
                {NOTE_NAMES[midi % 12]}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────
const ALL_ROOTS = [0,1,2,3,4,5,6,7,8,9,10,11]

export default function ChordGame() {
  const [scaleTypes,     setScaleTypes]     = useState(['major', 'minor'])
  const [kinds,          setKinds]          = useState(['triad', '4note'])
  const [scaleRoots,     setScaleRoots]     = useState(ALL_ROOTS)
  const [showChordNotes, setShowChordNotes] = useState(false)
  const [showNoteNames,  setShowNoteNames]  = useState(false)

  const [phase,        setPhase]        = useState('idle')
  const [chord,        setChord]        = useState(null)
  const [points,       setPoints]       = useState(100)
  const [totalScore,   setTotalScore]   = useState(0)
  const [streak,       setStreak]       = useState(0)
  const [pressedNotes, setPressedNotes] = useState([])

  const phaseRef      = useRef('idle')
  const chordRef      = useRef(null)
  const pressedRef    = useRef(new Set())
  const pointsRef     = useRef(100)
  const timerRef      = useRef(null)
  const pendingRef    = useRef(null)
  const nextRef       = useRef(null)
  const startRef      = useRef(0)
  const scaleTypesRef = useRef(scaleTypes)
  const kindsRef      = useRef(kinds)
  const scaleRootsRef = useRef(scaleRoots)

  useEffect(() => { scaleTypesRef.current = scaleTypes }, [scaleTypes])
  useEffect(() => { kindsRef.current      = kinds      }, [kinds])
  useEffect(() => { scaleRootsRef.current = scaleRoots }, [scaleRoots])

  const clearTimers = () => {
    clearTimeout(pendingRef.current)
    clearTimeout(nextRef.current)
    clearInterval(timerRef.current)
  }

  const startNextChord = useCallback(() => {
    clearTimers()
    const pool = buildPool(scaleTypesRef.current, kindsRef.current, scaleRootsRef.current)
    if (!pool.length) return
    const c = pool[Math.floor(Math.random() * pool.length)]
    chordRef.current  = c
    pointsRef.current = 100
    setChord(c)
    setPoints(100)
    setPhase('playing')
    phaseRef.current = 'playing'
    startRef.current = Date.now()
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current
      // Hold at 100 for first second, then drain over 15 seconds
      const pts = elapsed < 1000 ? 100 : Math.max(0, Math.round(100 - (elapsed - 1000) / 150))
      pointsRef.current = pts
      setPoints(pts)
      if (pts === 0) clearInterval(timerRef.current) // freeze at 0, stay in 'playing'
    }, 50)
  }, [])

  const checkChord = useCallback(() => {
    if (phaseRef.current !== 'playing') return
    const c = chordRef.current
    if (!c) return
    const chordClasses   = new Set(c.notes.map(n => n % 12))
    const pressedClasses = new Set([...pressedRef.current].map(n => n % 12))
    const allChordPressed  = [...chordClasses].every(nc => pressedClasses.has(nc))
    const noExtraNotes     = [...pressedClasses].every(nc => chordClasses.has(nc))
    if (allChordPressed && noExtraNotes) {
      clearTimers()
      const earned = pointsRef.current
      setTotalScore(prev => prev + earned)
      setStreak(prev => prev + 1)
      setPhase('correct')
      phaseRef.current = 'correct'
      nextRef.current = setTimeout(startNextChord, 700) // auto-advance
    }
  }, [startNextChord])

  useEffect(() => {
    if (!navigator.requestMIDIAccess) return
    let midiAccess = null
    const onMsg = (e) => {
      const [status, note, vel] = e.data
      const type = status & 0xf0
      if (type === 0x90 && vel > 0) {
        pressedRef.current.add(note)
        setPressedNotes([...pressedRef.current])
        checkChord()
      } else if (type === 0x80 || (type === 0x90 && vel === 0)) {
        pressedRef.current.delete(note)
        setPressedNotes([...pressedRef.current])
      }
    }
    const wire = (access) => {
      midiAccess = access
      access.inputs.forEach(i => { i.onmidimessage = onMsg })
      access.onstatechange = () => access.inputs.forEach(i => { i.onmidimessage = onMsg })
    }
    navigator.requestMIDIAccess().then(wire).catch(() => {})
    return () => {
      clearTimers()
      if (midiAccess) midiAccess.inputs.forEach(i => { i.onmidimessage = null })
    }
  }, [checkChord])

  const toggleType = t => setScaleTypes(p => p.includes(t) ? (p.length > 1 ? p.filter(x => x !== t) : p) : [...p, t])
  const toggleKind = k => setKinds(p => p.includes(k) ? (p.length > 1 ? p.filter(x => x !== k) : p) : [...p, k])
  const toggleRoot = r => setScaleRoots(p => p.includes(r) ? (p.length > 1 ? p.filter(x => x !== r) : p) : [...p, r])
  const allRoots   = scaleRoots.length === 12
  const canStart   = scaleTypes.length > 0 && kinds.length > 0 && scaleRoots.length > 0
  const barColor   = points > 60 ? '#22c55e' : points > 30 ? '#f59e0b' : '#ef4444'

  return (
    <div className="cg-wrap">

      {/* ── Settings ─────────────────────────────────────────── */}
      <div className="cg-settings">
        <div className="cg-settings-row">

          <div className="cg-settings-group">
            <span className="cg-group-label">Scale</span>
            <button className={`cg-pill ${scaleTypes.includes('major') ? 'on' : ''}`}
              onClick={() => toggleType('major')}>Major</button>
            <button className={`cg-pill ${scaleTypes.includes('minor') ? 'on' : ''}`}
              onClick={() => toggleType('minor')}>Minor</button>
          </div>

          <div className="cg-settings-group">
            <span className="cg-group-label">Chords</span>
            <button className={`cg-pill ${kinds.includes('triad') ? 'on' : ''}`}
              onClick={() => toggleKind('triad')}>Triads</button>
            <button className={`cg-pill ${kinds.includes('4note') ? 'on' : ''}`}
              onClick={() => toggleKind('4note')}>4-note</button>
          </div>

          <div className="cg-settings-group">
            <button className={`cg-pill ${showChordNotes ? 'on' : ''}`}
              onClick={() => setShowChordNotes(v => !v)}>👁 Show notes</button>
            <button className={`cg-pill ${showNoteNames ? 'on' : ''}`}
              onClick={() => setShowNoteNames(v => !v)}>🏷 Note names</button>
          </div>

          <div className="cg-score-box">
            <span className="cg-score-num">{totalScore}</span>
            <span className="cg-score-lbl">pts</span>
            {streak > 1 && <span className="cg-streak">🔥 {streak}</span>}
          </div>
        </div>

        {/* Scale root selector */}
        <div className="cg-roots-row">
          <span className="cg-group-label">Scale root</span>
          <button className={`cg-pill cg-pill-sm ${allRoots ? 'on' : ''}`}
            onClick={() => setScaleRoots(allRoots ? [scaleRoots[0]] : ALL_ROOTS)}>All</button>
          {NOTE_NAMES.map((name, i) => (
            <button key={i}
              className={`cg-pill cg-pill-sm cg-root-pill ${scaleRoots.includes(i) ? 'on' : ''} ${SHARP_CLASSES.has(i) ? 'sharp' : ''}`}
              onClick={() => toggleRoot(i)}>
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Game area ────────────────────────────────────────── */}
      <div className="cg-game">
        {phase === 'idle' ? (
          <div className="cg-idle">
            <div className="cg-idle-emoji">🎹</div>
            <h2 className="cg-idle-title">Chord Game</h2>
            <p className="cg-idle-sub">
              A chord from your selected scales will appear.
              Play all its notes on your MIDI keyboard — faster means more points!
            </p>
            <button className="cg-btn-start" disabled={!canStart} onClick={startNextChord}>
              ▶&nbsp; Start
            </button>
          </div>
        ) : (
          <div className="cg-playing">
            <div className="cg-playing-main">
              <div className={`cg-chord-card ${phase}`}>
                <span className="cg-chord-name">{chord?.name}</span>
                <span className="cg-chord-type">{chord?.label}</span>
              </div>

              <div className="cg-notation">
                <StaffNotation notes={chord?.notes ?? []} showNoteNames={showNoteNames} />
              </div>
            </div>

            <div className="cg-timer-wrap">
              <div className="cg-bar-track">
                <div className="cg-bar-fill" style={{
                  height:     `${points}%`,
                  background: phase === 'correct' ? '#22c55e' : barColor,
                  transition: phase === 'pending' ? 'none' : 'height 0.05s linear, background 0.3s',
                }} />
              </div>
              <span className="cg-pts-label">{points}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Piano roll ───────────────────────────────────────── */}
      <div className="cg-piano-section">
        <span className="cg-piano-label">
          <span style={{ color: '#22c55e' }}>■</span> Correct &nbsp;
          <span style={{ color: '#818cf8' }}>■</span> Other &nbsp;
          {showChordNotes && <><span style={{ color: '#a5b4fc' }}>■</span> Chord notes</>}
        </span>
        <PianoRoll
          pressedNotes={pressedNotes}
          chordNotes={chord?.notes ?? []}
          showChordNotes={showChordNotes}
          showNoteNames={showNoteNames}
        />
      </div>
    </div>
  )
}
