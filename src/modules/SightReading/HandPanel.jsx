import { useState, useEffect, useRef } from 'react'

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
function midiName(midi) {
  const oct = Math.floor(midi / 12) - 1
  return NOTE_NAMES[midi % 12] + oct
}

export default function HandPanel({ opts, onChange }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  const set = (key, val) => onChange({ ...opts, [key]: val })

  const handMode      = opts.handMode      ?? 'both'
  const handSplit     = opts.handSplit      ?? 'pitch'
  const handSplitMidi = opts.handSplitMidi  ?? 60

  return (
    <div ref={wrapRef} className="hand-anchor">
      <button
        className={`sr-icon-btn${open ? ' active' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Hand mode">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
             strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
          <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v1M14 7V5a2 2 0 0 0-2-2 2 2 0 0 0-2 2v3M10 8V5a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8l-2-3a1.5 1.5 0 0 0-2.5 1.5l3.5 6A6 6 0 0 0 12 22h2a6 6 0 0 0 6-6v-5a2 2 0 0 0-2-2 2 2 0 0 0-2 2Z"/>
        </svg>
      </button>

      {open && (
        <div className="hand-panel vopt-panel">

          <div className="vopt-section-title">Active Hand</div>
          <div className="vopt-row vopt-chip-row">
            <button
              className={`vopt-chip hand-chip-lh ${handMode === 'left' ? 'active' : ''}`}
              onClick={() => set('handMode', 'left')}>
              ← Left
            </button>
            <button
              className={`vopt-chip ${handMode === 'both' ? 'active' : ''}`}
              onClick={() => set('handMode', 'both')}>
              Both
            </button>
            <button
              className={`vopt-chip hand-chip-rh ${handMode === 'right' ? 'active' : ''}`}
              onClick={() => set('handMode', 'right')}>
              Right →
            </button>
          </div>

          <div className="vopt-section-title" style={{ marginTop: 8 }}>Detection</div>
          <label className="vopt-row vopt-check-row">
            <input type="checkbox"
              checked={handSplit === 'track'}
              onChange={e => set('handSplit', e.target.checked ? 'track' : 'pitch')} />
            <span>Split by MIDI track</span>
          </label>
          <span className="hand-split-hint">
            {handSplit === 'track'
              ? 'Track 0 = Right hand, Track 1 = Left hand'
              : `Split at ${midiName(handSplitMidi)} (MIDI ${handSplitMidi})`}
          </span>

          {handSplit === 'pitch' && (
            <div className="vopt-row vopt-slider-row" style={{ marginTop: 4 }}>
              <div className="vopt-fx-label">
                <span>Split point</span>
                <span className="vopt-slider-val">{midiName(handSplitMidi)}</span>
              </div>
              <input type="range" min={36} max={84} step={1}
                value={handSplitMidi}
                onChange={e => set('handSplitMidi', Number(e.target.value))} />
            </div>
          )}

        </div>
      )}
    </div>
  )
}
