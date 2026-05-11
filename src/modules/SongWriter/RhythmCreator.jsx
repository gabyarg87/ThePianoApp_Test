import { useState, useRef, useEffect, useCallback } from 'react'

/* ── Note durations (in 16th-note units) ─────────────────────────── */
const DURATIONS = [
  { id: 16, label: 'Whole',   sym: '○',  sub: '4 beats' },
  { id: 8,  label: 'Half',    sym: '◑',  sub: '2 beats' },
  { id: 4,  label: 'Quarter', sym: '♩',  sub: '1 beat'  },
  { id: 2,  label: '8th',     sym: '♪',  sub: '½ beat'  },
  { id: 1,  label: '16th',    sym: '·',  sub: '¼ beat'  },
]

/* ── Triad voices ─────────────────────────────────────────────────── */
const VOICE_DEFS = [
  { index: 0, label: '1', name: 'Root',  color: '#4d96ff' },
  { index: 1, label: '3', name: 'Third', color: '#ff5f5f' },
  { index: 2, label: '5', name: 'Fifth', color: '#ffd166' },
]
const ALL_VOICES = [0, 1, 2]

const STEPS = 16

function uid() { return Math.random().toString(36).slice(2, 9) }

function makeDefault() {
  return [
    { id: uid(), pos: 0,  dur: 4, voices: [0, 1, 2] },
    { id: uid(), pos: 4,  dur: 4, voices: [0, 1, 2] },
    { id: uid(), pos: 8,  dur: 4, voices: [0, 1, 2] },
    { id: uid(), pos: 12, dur: 4, voices: [0, 1, 2] },
  ]
}

export default function RhythmCreator({ bpm = 120, onClose, onApply, initialPattern }) {
  const [pattern,        setPattern]        = useState(() => initialPattern ?? makeDefault())
  const [selectedDur,    setSelectedDur]    = useState(4)
  const [selectedVoices, setSelectedVoices] = useState([0, 1, 2])
  const [previewing,     setPreviewing]     = useState(false)

  const audioCtxRef   = useRef(null)
  const previewTimers = useRef([])
  const previewActive = useRef(false)
  const patternRef    = useRef(pattern)
  const bpmRef        = useRef(bpm)

  useEffect(() => { patternRef.current = pattern }, [pattern])
  useEffect(() => { bpmRef.current = bpm },          [bpm])
  useEffect(() => () => stopPreview(), [])

  /* ── Preview audio ──────────────────────────────────────────────── */
  const getCtx = () => {
    if (!audioCtxRef.current) {
      const C = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new C()
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
    return audioCtxRef.current
  }

  const scheduleClick = (ctx, time, accent) => {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = accent ? 1400 : 1000
    osc.connect(gain); gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0, time)
    gain.gain.linearRampToValueAtTime(accent ? 0.25 : 0.18, time + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04)
    osc.start(time); osc.stop(time + 0.05)
  }

  const stopPreview = useCallback(() => {
    previewActive.current = false
    previewTimers.current.forEach(clearTimeout)
    previewTimers.current = []
    setPreviewing(false)
  }, [])

  const startPreview = useCallback(() => {
    if (patternRef.current.length === 0) return
    previewActive.current = true
    setPreviewing(true)
    const ctx = getCtx()
    const scheduleBar = (barStartSec) => {
      if (!previewActive.current) return
      const sixteenth = (60 / bpmRef.current) / 4
      const barDur    = sixteenth * 16
      patternRef.current.forEach(h => {
        scheduleClick(ctx, barStartSec + h.pos * sixteenth, h.pos % 4 === 0)
      })
      previewTimers.current.push(
        setTimeout(() => scheduleBar(barStartSec + barDur), barDur * 1000 - 50)
      )
    }
    scheduleBar(ctx.currentTime + 0.05)
  }, [])

  const togglePreview = useCallback(() => {
    if (previewing) stopPreview(); else startPreview()
  }, [previewing, stopPreview, startPreview])

  /* ── Voice toggle ───────────────────────────────────────────────── */
  const toggleVoice = (i) => {
    setSelectedVoices(prev => {
      if (prev.includes(i)) {
        if (prev.length === 1) return prev   // keep at least one active
        return prev.filter(v => v !== i)
      }
      return [...prev, i].sort((a, b) => a - b)
    })
  }

  /* ── Grid helpers ───────────────────────────────────────────────── */
  const noteStartAt = (pos) => pattern.find(n => n.pos === pos)

  const getAvailAt = (pos) => {
    let avail = 0
    for (let i = pos; i < STEPS; i++) {
      if (pattern.some(n => i >= n.pos && i < n.pos + n.dur)) break
      avail++
    }
    return avail
  }

  /* ── Cell click ─────────────────────────────────────────────────── */
  const handleCellClick = (pos) => {
    const note = noteStartAt(pos)
    if (note) {
      setPattern(prev => prev.filter(n => n.id !== note.id))
    } else {
      const dur = Math.min(selectedDur, getAvailAt(pos))
      if (dur < 1) return
      setPattern(prev =>
        [...prev, { id: uid(), pos, dur, voices: [...selectedVoices] }]
          .sort((a, b) => a.pos - b.pos)
      )
    }
  }

  /* ── Build grid cells ───────────────────────────────────────────── */
  const cells = []
  let pos = 0
  while (pos < STEPS) {
    const cellPos = pos
    const note    = noteStartAt(cellPos)
    if (note) {
      const durInfo = DURATIONS.find(d => d.id === note.dur) ?? DURATIONS[2]
      const voices  = note.voices ?? [0, 1, 2]
      cells.push(
        <div
          key={cellPos}
          className="rc-cell rc-cell--on"
          style={{ gridColumn: `span ${note.dur}` }}
          onClick={() => handleCellClick(cellPos)}
          title={`${durInfo.label} — click to remove`}
        >
          {note.dur > 1 && <span className="rc-cell-sym">{durInfo.sym}</span>}
          <div className="rc-cell-dots">
            {VOICE_DEFS.map(v => (
              <span
                key={v.index}
                className="rc-cell-dot"
                style={{ background: voices.includes(v.index) ? v.color : 'rgba(255,255,255,0.15)' }}
              />
            ))}
          </div>
        </div>
      )
      pos += note.dur
    } else {
      cells.push(
        <div
          key={cellPos}
          className={`rc-cell rc-cell--off${cellPos % 4 === 0 ? ' rc-cell--beat' : ''}`}
          onClick={() => handleCellClick(cellPos)}
          title={`Step ${cellPos + 1}`}
        />
      )
      pos++
    }
  }

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="rc-panel" onClick={e => e.stopPropagation()}>

      {/* Header */}
      <div className="rc-header">
        <div className="rc-header-left">
          <span className="rc-title">Rhythm Creator</span>
          <span className="rc-meta">4 / 4 · one bar</span>
        </div>
        <button className="rc-close" onClick={onClose}>×</button>
      </div>

      {/* Controls row: duration + voices */}
      <div className="rc-controls-row">

        {/* Duration selector */}
        <div className="rc-dur-row">
          <span className="rc-section-lbl">Note value</span>
          <div className="rc-dur-btns">
            {DURATIONS.map(d => (
              <button
                key={d.id}
                className={`rc-dur-btn${selectedDur === d.id ? ' rc-dur-btn--active' : ''}`}
                onClick={() => setSelectedDur(d.id)}
                title={d.sub}
              >
                <span className="rc-dur-sym">{d.sym}</span>
                <span className="rc-dur-name">{d.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Voice circles */}
        <div className="rc-voices-row">
          <span className="rc-section-lbl">Notes</span>
          <div className="rc-voices">
            {VOICE_DEFS.map(v => (
              <button
                key={v.index}
                className={`rc-voice-btn${selectedVoices.includes(v.index) ? ' rc-voice-btn--on' : ''}`}
                style={{ '--voice-color': v.color }}
                onClick={() => toggleVoice(v.index)}
                title={`${v.name}${selectedVoices.includes(v.index) ? ' (active)' : ''}`}
              >
                <span className="rc-voice-label">{v.label}</span>
                <span className="rc-voice-name">{v.name}</span>
              </button>
            ))}
            <button
              className={`rc-voice-btn rc-voice-btn--all${selectedVoices.length === ALL_VOICES.length ? ' rc-voice-btn--on' : ''}`}
              style={{ '--voice-color': '#b8a9ff' }}
              onClick={() => setSelectedVoices([...ALL_VOICES])}
              title="All notes (Root + Third + Fifth)"
            >
              <span className="rc-voice-label">All</span>
              <span className="rc-voice-name">Notes</span>
            </button>
          </div>
        </div>

      </div>

      {/* Grid */}
      <div className="rc-grid-wrap">
        <div className="rc-beat-row">
          {[1, 2, 3, 4].map(b => <div key={b} className="rc-beat-num">{b}</div>)}
        </div>
        <div className="rc-grid">{cells}</div>
        <div className="rc-ruler">
          {Array.from({ length: STEPS }, (_, i) => (
            <div key={i} className={`rc-ruler-tick${
              i % 4 === 0 ? ' rc-ruler-tick--beat' : i % 2 === 0 ? ' rc-ruler-tick--half' : ''
            }`} />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="rc-actions">
        <button className="rc-btn rc-btn--ghost" onClick={() => { stopPreview(); setPattern([]) }}>
          Clear
        </button>
        <button className="rc-btn rc-btn--ghost" onClick={() => { stopPreview(); setPattern(makeDefault()) }}>
          Reset
        </button>
        <button
          className={`rc-btn rc-btn--preview${previewing ? ' rc-btn--preview-on' : ''}`}
          onClick={togglePreview}
        >
          {previewing ? '■' : '▶'} Preview
        </button>
        <div className="rc-actions-spacer" />
        <button className="rc-btn rc-btn--apply" onClick={() => { stopPreview(); onApply(pattern) }}>
          ✓ Apply to Song
        </button>
      </div>

    </div>
  )
}
