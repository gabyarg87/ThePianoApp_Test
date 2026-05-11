import { useState, useEffect, useRef } from 'react'

const SCHEME_SWATCHES = {
  spectrum: ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c77dff'],
  neon:     ['#ff3366','#ffff00','#33ff66','#3399ff','#cc44ff'],
  pastel:   ['#ffb3c1','#fff5b1','#c3f0c8','#c0d8ff','#ddb8ff'],
  ice:      ['#60e0ff','#a0e8ff','#00d8f8','#4080ff','#8090ff'],
}

const HIT_LINE_COLORS = [
  { id: 'purple',  label: '● Purple' },
  { id: 'white',   label: '● White'  },
  { id: 'note',    label: '◈ Note'   },
  { id: 'rainbow', label: '◈ Rainbow'},
]

export default function VisualOptions({ opts, onChange }) {
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

  const innerGlow  = opts.innerGlow     ?? opts.glowIntensity ?? 1
  const outerGlow  = opts.outerGlow     ?? opts.glowIntensity ?? 1
  const noteStyle  = opts.noteStyle     ?? 'solid'
  const partCount  = opts.particleCount ?? 18
  const lookAhead  = opts.lookAhead     ?? 4.0
  const hlStyle    = opts.hitLineStyle  ?? 'line'
  const hlColor    = opts.hitLineColor  ?? 'purple'
  const showParts  = opts.particles     !== false
  const showKeyGlow = opts.keyGlow      !== false

  return (
    <div ref={wrapRef} className="vopt-anchor">
      <button
        className={`vopt-toggle-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Visual options"
      >
        ✦ Visual
      </button>

      {open && (
        <div className="vopt-panel vopt-panel-wide">

          {/* ── Labels ──────────────────────────────────────────────── */}
          <div className="vopt-section-title">Labels</div>

          <label className="vopt-row vopt-check-row">
            <input type="checkbox" checked={!!opts.showNoteLabels}
              onChange={e => set('showNoteLabels', e.target.checked)} />
            <span>Note names in roll</span>
          </label>

          <label className="vopt-row vopt-check-row">
            <input type="checkbox" checked={!!opts.showKeyLabels}
              onChange={e => set('showKeyLabels', e.target.checked)} />
            <span>Note names on keys</span>
          </label>

          {/* ── Glow ────────────────────────────────────────────────── */}
          <div className="vopt-section-title">Glow</div>

          <div className="vopt-row vopt-slider-row">
            <div className="vopt-fx-label">
              <span>Inner — tight halo</span>
              <span className="vopt-slider-val">
                {innerGlow === 0 ? 'Off' : innerGlow.toFixed(1)}
              </span>
            </div>
            <input type="range" min={0} max={4} step={0.5}
              value={innerGlow}
              onChange={e => set('innerGlow', Number(e.target.value))} />
          </div>

          <div className="vopt-row vopt-slider-row">
            <div className="vopt-fx-label">
              <span>Outer — soft aura</span>
              <span className="vopt-slider-val">
                {outerGlow === 0 ? 'Off' : outerGlow.toFixed(1)}
              </span>
            </div>
            <input type="range" min={0} max={4} step={0.5}
              value={outerGlow}
              onChange={e => set('outerGlow', Number(e.target.value))} />
          </div>

          <label className="vopt-row vopt-check-row">
            <input type="checkbox" checked={showKeyGlow}
              onChange={e => set('keyGlow', e.target.checked)} />
            <span>Key glow when playing</span>
          </label>

          {/* ── Note Style ──────────────────────────────────────────── */}
          <div className="vopt-section-title">Note Style</div>

          <div className="vopt-row vopt-chip-row">
            <button
              className={`vopt-chip ${noteStyle === 'solid' ? 'active' : ''}`}
              onClick={() => set('noteStyle', 'solid')}>
              ▬ Solid
            </button>
            <button
              className={`vopt-chip ${noteStyle === 'twinkle' ? 'active' : ''}`}
              onClick={() => set('noteStyle', 'twinkle')}>
              ✦ Twinkle
            </button>
            <button
              className={`vopt-chip ${noteStyle === 'wave' ? 'active' : ''}`}
              onClick={() => set('noteStyle', 'wave')}>
              ∿ Wave
            </button>
          </div>

          {/* ── Hit Line ────────────────────────────────────────────── */}
          <div className="vopt-section-title">Hit Line</div>

          <div className="vopt-row" style={{ gap: 4, flexWrap: 'wrap' }}>
            <span className="vopt-row-label">Style</span>
            {['line', 'wave', 'pulse'].map(s => (
              <button key={s}
                className={`vopt-chip ${hlStyle === s ? 'active' : ''}`}
                onClick={() => set('hitLineStyle', s)}>
                {s}
              </button>
            ))}
          </div>

          <div className="vopt-row" style={{ gap: 4, flexWrap: 'wrap' }}>
            <span className="vopt-row-label">Color</span>
            {HIT_LINE_COLORS.map(({ id, label }) => (
              <button key={id}
                className={`vopt-chip vopt-hitcolor-chip ${hlColor === id ? 'active' : ''} vopt-hitcolor-${id}`}
                onClick={() => set('hitLineColor', id)}>
                {label}
              </button>
            ))}
          </div>

          {/* ── Particles ───────────────────────────────────────────── */}
          <div className="vopt-section-title">Particles</div>

          <label className="vopt-row vopt-check-row">
            <input type="checkbox" checked={showParts}
              onChange={e => set('particles', e.target.checked)} />
            <span>Sparks on note hit</span>
          </label>

          {showParts && (
            <div className="vopt-row vopt-slider-row">
              <div className="vopt-fx-label">
                <span>Amount per hit</span>
                <span className="vopt-slider-val">{partCount}</span>
              </div>
              <input type="range" min={4} max={40} step={2}
                value={partCount}
                onChange={e => set('particleCount', Number(e.target.value))} />
            </div>
          )}

          {/* ── Note Speed ──────────────────────────────────────────── */}
          <div className="vopt-section-title">Note Speed</div>

          <div className="vopt-row vopt-slider-row">
            <div className="vopt-fx-label">
              <span>Preview window</span>
              <span className="vopt-slider-val">{lookAhead.toFixed(1)} s</span>
            </div>
            <input type="range" min={1.5} max={8} step={0.5}
              value={lookAhead}
              onChange={e => set('lookAhead', Number(e.target.value))} />
          </div>

          {/* ── Color Scheme ────────────────────────────────────────── */}
          <div className="vopt-section-title">Color Scheme</div>

          <div className="vopt-row vopt-chip-row">
            {Object.keys(SCHEME_SWATCHES).map(scheme => (
              <button key={scheme}
                className={`vopt-chip vopt-scheme-chip ${(opts.colorScheme ?? 'spectrum') === scheme ? 'active' : ''}`}
                onClick={() => set('colorScheme', scheme)}
                title={scheme}>
                <span className="vopt-swatches">
                  {SCHEME_SWATCHES[scheme].map((c, i) => (
                    <span key={i} className="vopt-swatch" style={{ background: c }} />
                  ))}
                </span>
                <span className="vopt-scheme-name">{scheme}</span>
              </button>
            ))}
          </div>

        </div>
      )}
    </div>
  )
}
