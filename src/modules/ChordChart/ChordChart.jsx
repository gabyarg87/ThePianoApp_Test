import { useEffect, useMemo, useRef, useState } from 'react'
import { CHORD_TYPES, ROOTS, chordNotes, chordLabel } from './chords.js'
import { intervalRole, ROLE_NAMES } from './intervals.js'
import { SCALES } from './scales.js'
import { PROGRESSIONS } from './progressions.js'
import { PROGRESSION_PATTERNS, buildMeasureSteps } from './progressionPatterns.js'
import ScalePicker from './ScalePicker.jsx'
import ProgressionPicker from './ProgressionPicker.jsx'
import Keyboard from './Keyboard.jsx'
import { useAudio } from '../../audio/AudioContext.jsx'
import './chord-chart.css'

const NOTE_NAMES_SHARP = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']
const NOTE_NAMES_FLAT  = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B']

// Find the ROOTS entry that matches a pitch class, preferring flats or sharps.
function rootIdForPc(pc, preferFlats) {
  const target = (preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[pc]
  // ROOTS uses ids like 'C', 'Db', 'F', etc. Map display names to ids.
  const match = ROOTS.find(r => r.pc === pc && (preferFlats ? r.id.includes('b') || !isAccidental(pc) : !r.id.includes('b')))
  return match ? match.id : ROOTS.find(r => r.pc === pc).id
}
function isAccidental(pc) { return [1,3,6,8,10].includes(pc) }

const MOD_BUTTONS = [
  { id: '7th',  label: '7'  },
  { id: 'sus2', label: 's2' },
  { id: 'sus4', label: 's4' },
]

function DiatonicCard({ d, noteCount, activeRootId, activeTypeId, activeInversion, activeOctave = 0, activeMod = 'triad', onSelect, onOctaveToggle, onModChange }) {
  const isActiveChord = d.rootId === activeRootId && d.typeId === activeTypeId
  const quality = CHORD_TYPES.find(t => t.id === d.typeId)?.quality ?? 'other'
  const invs = [0, ...Array.from({ length: noteCount - 1 }, (_, i) => i + 1)]
  return (
    <div className={`diatonic-card ${isActiveChord ? 'active' : ''}`} data-quality={quality}>
      <div className="inv-picker" onClick={(e) => e.stopPropagation()}>
        {invs.map(n => (
          <button
            key={n}
            className={`inv-btn ${activeInversion === n ? 'on' : ''}`}
            onClick={() => onSelect(d, n)}
            aria-label={n === 0 ? 'Root position' : `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : 'rd'} inversion`}
          >
            {n === 0 ? 'R' : n}
          </button>
        ))}
      </div>
      <div className="diatonic-right">
        <button className="diatonic-body" onClick={() => onSelect(d, activeInversion)}>
          <span className="roman">{d.roman}</span>
          <span className="diatonic-label">{d.label}</span>
        </button>
        <button
          className={`oct-btn ${activeOctave < 0 ? 'on' : ''}`}
          onClick={(e) => { e.stopPropagation(); onOctaveToggle?.(d) }}
          aria-label="Lower one octave"
        >
          -8
        </button>
      </div>
      <div className="mod-picker" onClick={(e) => e.stopPropagation()}>
        {MOD_BUTTONS.map(m => (
          <button
            key={m.id}
            className={`inv-btn ${activeMod === m.id ? 'on' : ''}`}
            onClick={() => onModChange?.(activeMod === m.id ? 'triad' : m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ChordChart() {
  // keyRootId = the scale's tonic (changes only via top Root pills).
  // rootId/typeId = the chord currently displayed on the keyboard.
  // Top Root pills update both so a new key also resets the displayed chord.
  const [keyRootId, setKeyRootId] = useState('C')
  const [rootId, setRootId] = useState('C')
  const [typeId, setTypeId] = useState('maj')
  const [scaleId, setScaleId] = useState('major')
  const [inversion, setInversion] = useState(0)
  const [strum, setStrum] = useState(false)
  const [showScale, setShowScale] = useState(false)
  const [showChord, setShowChord] = useState(true)
  const [selectedProg, setSelectedProg] = useState(null)
  const [progPlayingIdx, setProgPlayingIdx] = useState(-1)
  const [liveHighlights, setLiveHighlights] = useState(null)
  const [progLoop, setProgLoop] = useState(false)
  const [progPatternId, setProgPatternId] = useState('block')
  const [progBpm, setProgBpm] = useState(80)
  const [chordInversions, setChordInversions]   = useState({}) // { rootId: inversionIndex }
  const [chordOctaves, setChordOctaves]         = useState({}) // { rootId: -1|0 }
  const [chordMeasures, setChordMeasures]       = useState({}) // { rootId: 1|2|3|4 }
  const [degreeModifiers, setDegreeModifiers]   = useState({}) // { 0: '7th', 3: 'sus4', … }
  const { playChord, playNote, ready, loading } = useAudio()
  const firstRenderRef = useRef(true)
  const skipAutoRef = useRef(false)
  const progTimers = useRef([])
  const progPlayingRef = useRef(false)
  const progLoopRef = useRef(false)
  // Live refs — updated every render so loop restarts always read the latest values
  const diatonicChordsRef  = useRef([])
  const chordInversionsRef = useRef({})
  const chordOctavesRef    = useRef({})
  const chordMeasuresRef   = useRef({})
  const progPatternIdRef   = useRef('block')
  const progBpmRef         = useRef(80)

  const keyRoot = ROOTS.find(r => r.id === keyRootId)
  const root = ROOTS.find(r => r.id === rootId)
  const type = CHORD_TYPES.find(t => t.id === typeId)
  const scale = SCALES.find(s => s.id === scaleId)
  const preferFlats = keyRootId.includes('b')

  const selectKeyRoot = (id) => {
    setKeyRootId(id)
    const firstDegreeType = scale.degrees[0].triad[0]
    setRootId(id)
    setTypeId(firstDegreeType)
    setInversion(0)
  }

  const selectScale = (id) => {
    skipAutoRef.current = true
    setScaleId(id)
    // Snap displayed chord to the tonic chord of the new scale.
    const next = SCALES.find(s => s.id === id)
    if (next) {
      setRootId(keyRootId)
      setTypeId(next.degrees[0].triad[0])
      setInversion(0)
    }
  }

  // Clamp inversion if the chord's note count shrinks (e.g. switching 7th → triad).
  const maxInversion = Math.max(0, (type?.intervals.length ?? 3) - 1)
  const effInversion = Math.min(inversion, maxInversion)

  const notes = useMemo(
    () => chordNotes(root.pc, type.intervals, preferFlats),
    [root.pc, type.intervals, preferFlats]
  )

  const enrichedNotes = useMemo(() => notes.map((n, i) => {
    const semi = type.intervals[i]
    const { role, label } = intervalRole(semi)
    return { ...n, semi, role, label }
  }), [notes, type.intervals])

  // Build diatonic triads and 7th chords for the current scale from the key's tonic.
  const buildDegreeChord = (degreePc, typeId, roman) => {
    const degreeRootId = rootIdForPc(degreePc, preferFlats)
    const chordType = CHORD_TYPES.find(t => t.id === typeId)
    const degreeRoot = ROOTS.find(r => r.id === degreeRootId)
    return { roman, rootId: degreeRootId, typeId, label: chordLabel(degreeRoot.name, chordType.short) }
  }

  const diatonicChords = scale.degrees.map((deg, i) => {
    const pc = (keyRoot.pc + deg.semi) % 12
    const mod = degreeModifiers[i] ?? 'triad'
    const typeId = mod === '7th'  ? deg.seventh[0]
                 : mod === 'sus2' ? 'sus2'
                 : mod === 'sus4' ? 'sus4'
                 : deg.triad[0]
    const roman  = mod === '7th'  ? deg.seventh[1] : deg.triad[1]
    return buildDegreeChord(pc, typeId, roman)
  })

  // Keep live refs in sync — read by loop-restart callbacks to pick up mid-loop edits
  diatonicChordsRef.current  = diatonicChords
  chordInversionsRef.current = chordInversions
  chordOctavesRef.current    = chordOctaves
  chordMeasuresRef.current   = chordMeasures
  progPatternIdRef.current   = progPatternId
  progBpmRef.current         = progBpm

  // Key by root only — stays stable when modifier changes type
  const chordKey = (d) => d.rootId

  const toggleOctave = (d) => {
    const key = chordKey(d)
    const current = chordOctaves[key] ?? 0
    const next = current < 0 ? 0 : -1
    setChordOctaves(prev => ({ ...prev, [key]: next }))
    // Re-play the chord at the new octave
    const inv = chordInversions[key] ?? 0
    const chordType = CHORD_TYPES.find(t => t.id === d.typeId)
    const degreeRoot = ROOTS.find(r => r.id === d.rootId)
    if (chordType && degreeRoot) {
      const base = 60 + degreeRoot.pc + next * 12
      const midi = chordType.intervals.map(iv => base + iv)
      for (let i = 0; i < inv; i++) midi[i] += 12
      midi.sort((a, b) => a - b)
      skipAutoRef.current = true
      playChord(midi, { duration: 1.6, strum: strum ? 0.08 : 0 })
    }
  }

  // Change the modifier (7th/sus2/sus4/triad) for a degree, keep inversion +
  // octave memory, and immediately play the updated chord.
  const changeModifier = (degreeIdx, nextMod) => {
    const deg = scale.degrees[degreeIdx]
    const pc = (keyRoot.pc + deg.semi) % 12
    const newTypeId = nextMod === '7th'  ? deg.seventh[0]
                    : nextMod === 'sus2' ? 'sus2'
                    : nextMod === 'sus4' ? 'sus4'
                    : deg.triad[0]
    const roman = nextMod === '7th' ? deg.seventh[1] : deg.triad[1]
    const newD = buildDegreeChord(pc, newTypeId, roman)
    setDegreeModifiers(prev => ({ ...prev, [degreeIdx]: nextMod }))
    // rootId is stable across modifier changes → inversion/octave preserved
    const inv = chordInversions[newD.rootId] ?? 0
    selectDiatonic(newD, inv)
  }

  // Reset all diatonic modifiers, inversions, and octaves to defaults.
  const resetDiatonicChords = () => {
    skipAutoRef.current = true
    const diatonicRootIds = new Set(
      scale.degrees.map(deg => rootIdForPc((keyRoot.pc + deg.semi) % 12, preferFlats))
    )
    setDegreeModifiers({})
    setChordInversions(prev => {
      const next = { ...prev }
      diatonicRootIds.forEach(id => delete next[id])
      return next
    })
    setChordOctaves(prev => {
      const next = { ...prev }
      diatonicRootIds.forEach(id => delete next[id])
      return next
    })
    setChordMeasures(prev => {
      const next = { ...prev }
      diatonicRootIds.forEach(id => delete next[id])
      return next
    })
  }

  const selectDiatonic = (d, inv = 0) => {
    setRootId(d.rootId)
    setTypeId(d.typeId)
    setInversion(inv)
    setChordInversions(prev => ({ ...prev, [chordKey(d)]: inv }))
    // Play immediately so tapping an already-selected card/inversion still sounds.
    const chordType = CHORD_TYPES.find(t => t.id === d.typeId)
    const degreeRoot = ROOTS.find(r => r.id === d.rootId)
    if (chordType && degreeRoot) {
      const oct = chordOctaves[chordKey(d)] ?? 0
      const base = 60 + degreeRoot.pc + oct * 12
      const midi = chordType.intervals.map(iv => base + iv)
      for (let i = 0; i < inv; i++) midi[i] += 12
      midi.sort((a, b) => a - b)
      skipAutoRef.current = true // prevent the auto-play effect from double-firing
      playChord(midi, { duration: 1.6, strum: strum ? 0.08 : 0 })
    }
  }

  // Build MIDI notes for the current chord, rooted at C4=60 + root pitch class.
  // Applies inversion by lifting the lowest `inversion` notes up one octave.
  // Returns entries with midi + role info so the keyboard can highlight the
  // exact octave each note lands in (inversion visible on the keys).
  const effOctave = chordOctaves[rootId] ?? 0

  const chordVoicing = useMemo(() => {
    const base = 60 + root.pc + effOctave * 12
    const voicing = type.intervals.map((iv, i) => {
      const { role, label } = intervalRole(iv)
      return {
        midi: base + iv,
        name: enrichedNotes[i].name,
        role,
        label,
      }
    })
    for (let i = 0; i < effInversion; i++) voicing[i].midi += 12
    voicing.sort((a, b) => a.midi - b.midi)
    return voicing
  }, [root.pc, type.intervals, effInversion, effOctave, enrichedNotes])

  const chordMidi = useMemo(() => chordVoicing.map(v => v.midi), [chordVoicing])
  const highlights = chordVoicing.map(v => ({ midi: v.midi, role: v.role, label: v.label, name: v.name }))


  // Pitch classes that belong to the current scale (for the scale visualizer).
  const scalePcs = scale.degrees.map(d => (keyRoot.pc + d.semi) % 12)

  const handlePlay = () => {
    playChord(chordMidi, { duration: 1.8, strum: strum ? 0.08 : 0 })
  }

  const stopProgression = () => {
    progTimers.current.forEach(clearTimeout)
    progTimers.current = []
    progPlayingRef.current = false
    skipAutoRef.current = true
    setProgPlayingIdx(-1)
    setLiveHighlights(null)
  }

  const playProgression = (prog, triads = diatonicChords, invs = chordInversions, octs = chordOctaves, patId = progPatternId, meas = chordMeasures, bpm = progBpm) => {
    stopProgression()
    progPlayingRef.current = true
    const strumVal = strum ? 0.08 : 0
    const beatMs = (60 / bpm) * 1000
    const useFlats = keyRootId.includes('b')
    // ±8% velocity jitter — makes repeated chords feel like a real player
    const humanVel = (base) => Math.round(base * (0.92 + Math.random() * 0.16))

    // Build highlights for a set of MIDI notes relative to a chord root
    const buildHL = (midis, degreeRoot, oct) => {
      const base = 60 + degreeRoot.pc + oct * 12
      return midis.map(m => {
        const pc = ((m % 12) + 12) % 12
        const name = (useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[pc]
        const semi = ((m - base) % 12 + 12) % 12
        const { role, label } = intervalRole(semi)
        return { midi: m, role, label, name }
      })
    }

    let offset = 0

    prog.degrees.forEach((di, chordIdx) => {
      const d = triads[di]
      if (!d) return
      const chordType = CHORD_TYPES.find(t => t.id === d.typeId)
      const degreeRoot = ROOTS.find(r => r.id === d.rootId)
      if (!chordType || !degreeRoot) return

      const oct = octs[chordKey(d)] ?? 0
      const bassRootMidi = 60 + degreeRoot.pc + oct * 12
      const midiArr = chordType.intervals.map(iv => bassRootMidi + iv)
      const cardInv = invs[chordKey(d)] ?? 0
      for (let k = 0; k < cardInv; k++) midiArr[k] += 12
      midiArr.sort((a, b) => a - b)

      const steps = buildMeasureSteps(patId, midiArr, bassRootMidi)
      const measureCount = meas[chordKey(d)] ?? 1

      for (let rep = 0; rep < measureCount; rep++) {
        let stepOffset = offset

        steps.forEach((step, si) => {
          const t = setTimeout(() => {
            if (!progPlayingRef.current) return
            if (si === 0 && rep === 0) setProgPlayingIdx(chordIdx)
            // Update keyboard in real time for every step
            setLiveHighlights(buildHL(step.midis, degreeRoot, oct))
            const durSecs = (step.beats * beatMs / 1000) * 0.92
            if (step.isChord) {
              playChord(step.midis, {
                duration: durSecs,
                strum: strumVal,
                velocity: humanVel(72),
                humanize: 6,   // ±6 MIDI units scatter across chord notes
              })
            } else {
              // Give single notes a little natural decay beyond the step, but cap
              // so arpeggio notes don't blur into the next chord (min 0.15s, max 0.8s)
              const noteDur = Math.min(Math.max(durSecs * 1.4, 0.15), 0.8)
              step.midis.forEach(m => playNote(m, { duration: noteDur, velocity: humanVel(78) }))
            }
          }, stepOffset)
          progTimers.current.push(t)
          stepOffset += step.beats * beatMs
        })

        offset += steps.reduce((s, step) => s + step.beats, 0) * beatMs
      }
    })

    // After the last measure ends, loop or stop
    const end = setTimeout(() => {
      if (!progPlayingRef.current) return
      skipAutoRef.current = true   // prevent auto-play when state resets between loops
      if (progLoopRef.current) {
        // Read fresh refs so any edits made during playback take effect next iteration
        playProgression(
          prog,
          diatonicChordsRef.current,
          chordInversionsRef.current,
          chordOctavesRef.current,
          progPatternIdRef.current,
          chordMeasuresRef.current,
          progBpmRef.current,
        )
      } else {
        progPlayingRef.current = false
        setProgPlayingIdx(-1)
        setLiveHighlights(null)
      }
    }, offset)
    progTimers.current.push(end)
  }

  // Auto-play whenever the chord changes (skipped on initial mount and when a
  // click-handler already played the chord manually).
  useEffect(() => {
    if (firstRenderRef.current) { firstRenderRef.current = false; return }
    if (skipAutoRef.current) { skipAutoRef.current = false; return }
    if (progPlayingRef.current) return  // don't auto-play while a progression is running
    if (ready) {
      playChord(chordMidi, { duration: 1.6, strum: strum ? 0.08 : 0 })
    }
  }, [chordMidi, ready, strum, playChord])

  return (
    <section className="chord-chart">
      <div className="cc-controls">
        <div className="cc-group">
          <label className="cc-label">Root</label>
          <div className="cc-pills">
            {ROOTS.map(r => (
              <button
                key={r.id}
                className={`pill ${keyRootId === r.id ? 'active' : ''} ${r.id.includes('b') ? 'accidental' : ''}`}
                onClick={() => selectKeyRoot(r.id)}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>

        <div className="cc-group">
          <label className="cc-label">Chord Type</label>
          <div className="cc-pills types">
            {CHORD_TYPES.map(t => (
              <button
                key={t.id}
                className={`pill type ${typeId === t.id ? 'active' : ''}`}
                data-quality={t.quality}
                onClick={() => setTypeId(t.id)}
              >
                <span className="type-short">{t.short || 'maj'}</span>
                <span className="type-name">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="cc-display">
        <div className="cc-header">
          <div className="cc-chord-badge">
            <div className="scale-badge-text">
              <span className="scale-badge-label">Chord</span>
              <span className="scale-badge-value">{chordLabel(root.name, type.short)} <span className="chord-badge-type">· {type.name}</span></span>
            </div>
            <label className={`scale-check ${showChord ? 'on' : ''}`} title="Show chord tones on the keyboard">
              <input type="checkbox" checked={showChord} onChange={e => setShowChord(e.target.checked)} />
              <span className="scale-check-box" aria-hidden="true">✓</span>
            </label>
          </div>
          <div className="cc-scale-badge">
            <div className="scale-badge-text">
              <span className="scale-badge-label">Scale</span>
              <span className="scale-badge-value">{keyRoot.name} {scale.name}</span>
            </div>
            <label className={`scale-check ${showScale ? 'on' : ''}`} title="Grey out keys outside the scale">
              <input type="checkbox" checked={showScale} onChange={e => setShowScale(e.target.checked)} />
              <span className="scale-check-box" aria-hidden="true">✓</span>
            </label>
          </div>
          <div className="cc-play">
            <button
              className="play-btn"
              onClick={handlePlay}
              aria-label="Play chord"
              disabled={loading}
            >
              {loading ? <span className="spinner" /> : <span className="play-icon">▶</span>}
              <span>{loading ? 'Loading…' : 'Play'}</span>
            </button>
            <label className={`toggle ${strum ? 'on' : ''}`}>
              <input type="checkbox" checked={strum} onChange={e => setStrum(e.target.checked)} />
              <span>Strum</span>
            </label>
          </div>
          <div className="cc-notes">
            {enrichedNotes.map((n, i) => (
              <span key={i} className="note-chip" data-role={n.role}>
                <span className="chip-role">{n.label}</span>
                <span className="chip-name">{n.name}</span>
              </span>
            ))}
          </div>
        </div>

        <Keyboard
          rootPc={0}
          baseMidi={48}
          highlights={liveHighlights ?? (showChord ? highlights : [])}
          octaves={3}
          scalePcs={showScale ? scalePcs : null}
          onKeyPress={(midi) => playNote(midi)}
        />

        <div className="cc-legend">
          {enrichedNotes.map((n, i) => (
            <div key={i} className="legend-item" data-role={n.role}>
              <span className="legend-swatch" />
              <span className="legend-text">
                <strong>{n.label}</strong> · {ROLE_NAMES[n.role]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="cc-scales">
        <div className="scales-header">
          <label className="cc-label">Scale — chords in {keyRoot.name} {scale.name}</label>
          <ScalePicker value={scaleId} onChange={selectScale} pillClass="pill scale" />
        </div>

        <div className="diatonic-grid">
          {diatonicChords.map((d, i) => {
            const mod = degreeModifiers[i] ?? 'triad'
            const noteCount = CHORD_TYPES.find(t => t.id === d.typeId)?.intervals.length ?? 3
            return (
              <DiatonicCard
                key={i}
                d={d}
                noteCount={noteCount}
                activeRootId={rootId}
                activeTypeId={typeId}
                activeInversion={chordInversions[chordKey(d)] ?? 0}
                activeOctave={chordOctaves[chordKey(d)] ?? 0}
                activeMod={mod}
                onSelect={selectDiatonic}
                onOctaveToggle={toggleOctave}
                onModChange={(nextMod) => changeModifier(i, nextMod)}
              />
            )
          })}
        </div>
        <div className="diatonic-reset-row">
          <button className="diatonic-reset-btn" onClick={resetDiatonicChords}>
            Reset chords
          </button>
        </div>
      </div>

      {/* Chord Progressions */}
      <div className="cc-progressions">
        <label className="cc-label">Progressions</label>

        <ProgressionPicker
          value={selectedProg}
          onChange={(id) => { stopProgression(); skipAutoRef.current = true; setSelectedProg(id) }}
        />

        {selectedProg && (() => {
          const prog = PROGRESSIONS.find(p => p.id === selectedProg)
          const isPlaying = progPlayingIdx >= 0
          return (
            <div className="prog-detail">
              <div className="prog-chord-list">
                {prog.degrees.map((di, i) => {
                  const d = diatonicChords[di]
                  const mod = degreeModifiers[di] ?? 'triad'
                  const noteCount = CHORD_TYPES.find(t => t.id === d.typeId)?.intervals.length ?? 3
                  const measures = chordMeasures[chordKey(d)] ?? 1
                  return (
                    <div key={i} className={`prog-card-wrap ${progPlayingIdx === i ? 'prog-card-playing' : ''}`}>
                      <DiatonicCard
                        d={d}
                        noteCount={noteCount}
                        activeRootId={rootId}
                        activeTypeId={typeId}
                        activeInversion={chordInversions[chordKey(d)] ?? 0}
                        activeOctave={chordOctaves[chordKey(d)] ?? 0}
                        activeMod={mod}
                        onSelect={selectDiatonic}
                        onOctaveToggle={toggleOctave}
                        onModChange={(nextMod) => changeModifier(di, nextMod)}
                      />
                      <div className="measure-picker">
                        {[1, 2, 3, 4].map(n => (
                          <button
                            key={n}
                            className={`measure-btn ${measures === n ? 'on' : ''}`}
                            onClick={() => setChordMeasures(prev => ({ ...prev, [chordKey(d)]: n }))}
                          >×{n}</button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="prog-detail-actions">
                <select
                  className="prog-pattern-select"
                  value={progPatternId}
                  onChange={e => setProgPatternId(e.target.value)}
                >
                  {PROGRESSION_PATTERNS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  className="play-btn prog-play-btn"
                  onClick={() => isPlaying ? stopProgression() : playProgression(prog, diatonicChords, chordInversions, chordOctaves, progPatternId, chordMeasures, progBpm)}
                >
                  {isPlaying
                    ? <><span className="play-icon">■</span><span>Stop</span></>
                    : <><span className="play-icon">▶</span><span>Play</span></>}
                </button>
                <label className="prog-loop-label">
                  <input type="checkbox" className="prog-loop-check" checked={progLoop}
                    onChange={e => { setProgLoop(e.target.checked); progLoopRef.current = e.target.checked }} />
                  Loop
                </label>
                <div className="prog-bpm">
                  <input
                    type="range"
                    className="prog-bpm-slider"
                    min={40} max={200} step={1}
                    value={progBpm}
                    onChange={e => setProgBpm(Number(e.target.value))}
                  />
                  <span className="prog-bpm-value">{progBpm} BPM</span>
                </div>
                <button className="diatonic-reset-btn" onClick={resetDiatonicChords}>
                  Reset
                </button>
              </div>
            </div>
          )
        })()}
      </div>
    </section>
  )
}
