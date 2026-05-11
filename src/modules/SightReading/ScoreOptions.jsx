import { useState, useEffect, useRef } from 'react'

export default function ScoreOptions({ opts, onChange, audioFx, onAudioFx }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  // Close panel on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  const set    = (key, val) => onChange({ ...opts, [key]: val })
  const setFx  = (key, val) => onAudioFx(key, val)

  const fx = audioFx ?? {}

  return (
    <div ref={wrapRef} className="vopt-anchor vopt-inline">
      <button
        className={`vopt-toggle-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Score playback options"
      >
        ♪ Sound
      </button>

      {open && (
        <div className="vopt-panel">

          {/* ── Reverb ──────────────────────────────────────────────────── */}
          <div className="vopt-section-title">Reverb</div>

          <div className="vopt-row vopt-slider-row">
            <div className="vopt-fx-label">
              <span>Amount</span>
              <span className="vopt-slider-val">{Math.round((fx.reverbAmt ?? 0.22) * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.01}
              value={fx.reverbAmt ?? 0.22}
              onChange={e => setFx('reverbAmt', Number(e.target.value))}
            />
          </div>

          <div className="vopt-row vopt-slider-row">
            <div className="vopt-fx-label">
              <span>Decay</span>
              <span className="vopt-slider-val">{(fx.reverbDecay ?? 2.5).toFixed(1)}s</span>
            </div>
            <input
              type="range" min={0.5} max={6} step={0.1}
              value={fx.reverbDecay ?? 2.5}
              onChange={e => setFx('reverbDecay', Number(e.target.value))}
            />
          </div>

          {/* ── EQ ──────────────────────────────────────────────────────── */}
          <div className="vopt-section-title">EQ — High shelf</div>

          <div className="vopt-row vopt-slider-row">
            <div className="vopt-fx-label">
              <span>Presence</span>
              <span className="vopt-slider-val">
                {(fx.eqGain ?? 2) >= 0 ? '+' : ''}{(fx.eqGain ?? 2).toFixed(1)} dB
              </span>
            </div>
            <input
              type="range" min={-12} max={12} step={0.5}
              value={fx.eqGain ?? 2.0}
              onChange={e => setFx('eqGain', Number(e.target.value))}
            />
          </div>

          <div className="vopt-row vopt-slider-row">
            <div className="vopt-fx-label">
              <span>Frequency</span>
              <span className="vopt-slider-val">
                {(fx.eqFreq ?? 3500) >= 1000
                  ? `${((fx.eqFreq ?? 3500) / 1000).toFixed(1)}kHz`
                  : `${fx.eqFreq ?? 3500}Hz`}
              </span>
            </div>
            <input
              type="range" min={500} max={12000} step={100}
              value={fx.eqFreq ?? 3500}
              onChange={e => setFx('eqFreq', Number(e.target.value))}
            />
          </div>

          {/* ── Dynamic Markings ────────────────────────────────────────── */}
          <div className="vopt-section-title">Dynamic Markings</div>

          <label className="vopt-row vopt-check-row">
            <input
              type="checkbox"
              checked={!!opts.dynamicMarks}
              onChange={e => set('dynamicMarks', e.target.checked)}
            />
            <span>Use written dynamics (pp, mp, mf, f…)</span>
          </label>

          {/* ── Humanizer ───────────────────────────────────────────────── */}
          <div className="vopt-section-title">Humanizer</div>

          <label className="vopt-row vopt-check-row">
            <input
              type="checkbox"
              checked={!!opts.humanize}
              onChange={e => set('humanize', e.target.checked)}
            />
            <span>Random velocity variance</span>
          </label>

          {opts.humanize && (
            <div className="vopt-row vopt-slider-row">
              <div className="vopt-fx-label">
                <span>Amount</span>
                <span className="vopt-slider-val">±{opts.humanizeAmt ?? 12}</span>
              </div>
              <input
                type="range" min={1} max={25} step={1}
                value={opts.humanizeAmt ?? 12}
                onChange={e => set('humanizeAmt', Number(e.target.value))}
              />
            </div>
          )}

          {/* ── Debug ───────────────────────────────────────────────────── */}
          <div className="vopt-section-title">Debug</div>

          <label className="vopt-row vopt-check-row">
            <input
              type="checkbox"
              checked={!!opts.showVelDebug}
              onChange={e => set('showVelDebug', e.target.checked)}
            />
            <span>Show last velocity played</span>
          </label>

        </div>
      )}
    </div>
  )
}
