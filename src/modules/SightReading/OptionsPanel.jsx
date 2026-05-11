import { useState, useEffect } from 'react'

const NOTE_NAMES   = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']
const DEFAULT_SPECTRUM = ['#ff6b6b','#c93030','#ff9f43','#c97520','#ffd93d','#6bcb77','#2e8b3a','#4ecdc4','#1a8f86','#4d96ff','#1a5fc8','#c77dff']

// Controlled panel — open/activeTab driven by the parent's three icon buttons.
export default function OptionsPanel({
  open,
  activeTab,       // 'keys' | 'sound' | 'visual'
  isMidi,
  keyCount,    onKeyCount,
  baseOctave,  onBaseOctave,
  visualOpts,  onVisualOpts,
  usedPcs,     onToggleUnused,
  scoreOpts,   onScoreOpts,
  midiOpts,    onMidiOpts,
  audioFx,     onAudioFx,
  pianoVol,    onPianoVol,
  metroVol,    onMetroVol,
  lastVel,
  dynMarkCount,
}) {
  const [tab, setTab] = useState(activeTab ?? 'keys')
  useEffect(() => { if (activeTab) setTab(activeTab) }, [activeTab])

  const setV   = (key, val) => onVisualOpts({ ...visualOpts, [key]: val })
  const sOpts  = scoreOpts ?? {}
  const mOpts  = midiOpts  ?? {}
  const setS   = (k, v) => onScoreOpts?.({ ...sOpts, [k]: v })
  const setM   = (k, v) => onMidiOpts?.({ ...mOpts, [k]: v })
  const fx     = audioFx ?? {}
  const setFx  = (k, v) => onAudioFx?.(k, v)
  const soundO = isMidi ? mOpts : sOpts
  const setSnd = isMidi ? setM  : setS

  const innerGlow  = visualOpts.innerGlow  ?? 2
  const outerGlow  = visualOpts.outerGlow  ?? 1
  const lookAhead  = visualOpts.lookAhead  ?? 5.0
  const scheme     = visualOpts.colorScheme ?? 'hands'
  const handColors = visualOpts.handColors  ?? { rh: '#ffe100', lh: '#00d0ff' }
  const specColors = visualOpts.spectrumColors ?? DEFAULT_SPECTRUM

  const setHandColor = (hand, color) =>
    setV('handColors', { ...handColors, [hand]: color })

  const setSpecColor = (idx, color) => {
    const arr = [...specColors]
    arr[idx] = color
    setV('spectrumColors', arr)
  }

  if (!open) return null

  return (
    <div className="vopt-panel vopt-panel-wide sr-opts-panel">

      {/* ═════ KEYS ═════════════════════════════════════════════════════════ */}
      {tab === 'keys' && (<>
        <div className="vopt-section-title">Keys</div>
        <div className="vopt-row vopt-chip-row">
          {[36, 49, 61, 76, 88].map(k => (
            <button key={k}
              className={`vopt-chip ${keyCount === k ? 'active' : ''}`}
              onClick={() => onKeyCount(k)}>
              {k}
            </button>
          ))}
        </div>

        <div className="vopt-section-title">Start octave</div>
        <div className="vopt-row vopt-chip-row">
          {[1, 2, 3, 4, 5].map(oct => (
            <button key={oct}
              className={`vopt-chip ${baseOctave === oct ? 'active' : ''}`}
              onClick={() => onBaseOctave(oct)}>
              C{oct}
            </button>
          ))}
        </div>

        <div className="vopt-section-title">Labels</div>
        <label className="vopt-row vopt-check-row">
          <input type="checkbox" checked={!!visualOpts.showKeyLabels}
            onChange={e => setV('showKeyLabels', e.target.checked)} />
          <span>Note names on keys</span>
        </label>
        {isMidi && (
          <label className="vopt-row vopt-check-row">
            <input type="checkbox" checked={!!visualOpts.showNoteLabels}
              onChange={e => setV('showNoteLabels', e.target.checked)} />
            <span>Note names in roll</span>
          </label>
        )}

        {isMidi && (<>
          <div className="vopt-section-title">Note Speed</div>
          <div className="vopt-row vopt-slider-row">
            <div className="vopt-fx-label">
              <span>Preview window</span>
              <span className="vopt-slider-val">{lookAhead.toFixed(1)} s</span>
            </div>
            <input type="range" min={1.5} max={8} step={0.5}
              value={lookAhead}
              onChange={e => setV('lookAhead', Number(e.target.value))} />
          </div>
        </>)}

        <div className="vopt-section-title">Highlight</div>
        <label className="vopt-row vopt-check-row">
          <input type="checkbox" checked={!!usedPcs}
            onChange={() => onToggleUnused?.()} />
          <span>🔴 Paint unused notes red</span>
        </label>
      </>)}

      {/* ═════ SOUND ════════════════════════════════════════════════════════ */}
      {tab === 'sound' && (<>
        <div className="vopt-section-title">Volume</div>
        <div className="vopt-row vopt-slider-row">
          <div className="vopt-fx-label">
            <span>🎹 Piano</span>
            <span className="vopt-slider-val">{pianoVol ?? 88}</span>
          </div>
          <input type="range" min={0} max={100} step={1}
            value={pianoVol ?? 88}
            onChange={e => onPianoVol?.(Number(e.target.value))} />
        </div>
        <div className="vopt-row vopt-slider-row">
          <div className="vopt-fx-label">
            <span>♩ Metronome</span>
            <span className="vopt-slider-val">{metroVol ?? 80}</span>
          </div>
          <input type="range" min={0} max={100} step={1}
            value={metroVol ?? 80}
            onChange={e => onMetroVol?.(Number(e.target.value))} />
        </div>

        <div className="vopt-section-title">Reverb</div>
        <div className="vopt-row vopt-slider-row">
          <div className="vopt-fx-label">
            <span>Amount</span>
            <span className="vopt-slider-val">{Math.round((fx.reverbAmt ?? 0.22) * 100)}%</span>
          </div>
          <input type="range" min={0} max={1} step={0.01}
            value={fx.reverbAmt ?? 0.22}
            onChange={e => setFx('reverbAmt', Number(e.target.value))} />
        </div>
        <div className="vopt-row vopt-slider-row">
          <div className="vopt-fx-label">
            <span>Decay</span>
            <span className="vopt-slider-val">{(fx.reverbDecay ?? 2.5).toFixed(1)}s</span>
          </div>
          <input type="range" min={0.5} max={6} step={0.1}
            value={fx.reverbDecay ?? 2.5}
            onChange={e => setFx('reverbDecay', Number(e.target.value))} />
        </div>

        <div className="vopt-section-title">EQ — High shelf</div>
        <div className="vopt-row vopt-slider-row">
          <div className="vopt-fx-label">
            <span>Presence</span>
            <span className="vopt-slider-val">
              {(fx.eqGain ?? 2) >= 0 ? '+' : ''}{(fx.eqGain ?? 2).toFixed(1)} dB
            </span>
          </div>
          <input type="range" min={-12} max={12} step={0.5}
            value={fx.eqGain ?? 2.0}
            onChange={e => setFx('eqGain', Number(e.target.value))} />
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
          <input type="range" min={500} max={12000} step={100}
            value={fx.eqFreq ?? 3500}
            onChange={e => setFx('eqFreq', Number(e.target.value))} />
        </div>

        {!isMidi && (<>
          <div className="vopt-section-title">Dynamic Markings</div>
          <label className="vopt-row vopt-check-row">
            <input type="checkbox" checked={!!sOpts.dynamicMarks}
              onChange={e => setS('dynamicMarks', e.target.checked)} />
            <span>Use written dynamics (pp, mp, mf, f…)</span>
          </label>
        </>)}

        <div className="vopt-section-title">Humanizer</div>
        <div className="vopt-row vopt-slider-row">
          <div className="vopt-fx-label">
            <span>Velocity variance</span>
            <span className="vopt-slider-val">
              {(soundO.humanizeAmt ?? 0) === 0 ? 'Off' : `±${soundO.humanizeAmt}`}
            </span>
          </div>
          <input type="range" min={0} max={25} step={1}
            value={soundO.humanizeAmt ?? 0}
            onChange={e => setSnd('humanizeAmt', Number(e.target.value))} />
        </div>
        <div className="vopt-row vopt-slider-row">
          <div className="vopt-fx-label">
            <span>Note length variance</span>
            <span className="vopt-slider-val">
              {(soundO.humanizeDawAmt ?? 0) === 0 ? 'Off' : `±${soundO.humanizeDawAmt}%`}
            </span>
          </div>
          <input type="range" min={0} max={5} step={1}
            value={soundO.humanizeDawAmt ?? 0}
            onChange={e => setSnd('humanizeDawAmt', Number(e.target.value))} />
        </div>
      </>)}

      {/* ═════ VISUAL / FX (MIDI only) ══════════════════════════════════════ */}
      {tab === 'visual' && isMidi && (<>
        <div className="vopt-section-title">Hit Line</div>
        <label className="vopt-row vopt-check-row">
          <input type="checkbox" checked={visualOpts.hitLineVisible !== false}
            onChange={e => setV('hitLineVisible', e.target.checked)} />
          <span>Show line above keyboard</span>
        </label>
        {visualOpts.hitLineVisible !== false && (<>
          <div className="vopt-hitline-colors">
            <label className="vopt-hand-pick">
              <div className="vopt-hand-pick-swatch"
                style={{ background: visualOpts.hitLineColor ?? '#a078ff', width: 28, height: 20, borderRadius: 4 }}>
                <input type="color"
                  value={visualOpts.hitLineColor ?? '#a078ff'}
                  onChange={e => setV('hitLineColor', e.target.value)} />
              </div>
              <span className="vopt-hand-pick-label">Start</span>
            </label>
            <div className="vopt-hitline-gradient-preview" style={{
              background: `linear-gradient(to right, ${visualOpts.hitLineColor ?? '#a078ff'}, ${visualOpts.hitLineColor2 ?? '#ff78c4'})`,
            }} />
            <label className="vopt-hand-pick">
              <div className="vopt-hand-pick-swatch"
                style={{ background: visualOpts.hitLineColor2 ?? '#ff78c4', width: 28, height: 20, borderRadius: 4 }}>
                <input type="color"
                  value={visualOpts.hitLineColor2 ?? '#ff78c4'}
                  onChange={e => setV('hitLineColor2', e.target.value)} />
              </div>
              <span className="vopt-hand-pick-label">End</span>
            </label>
          </div>
          <div className="vopt-row vopt-slider-row">
            <div className="vopt-fx-label">
              <span>Glow intensity</span>
              <span className="vopt-slider-val">
                {(visualOpts.hitLineGlow ?? 2) === 0 ? 'Off' : visualOpts.hitLineGlow ?? 2}
              </span>
            </div>
            <input type="range" min={0} max={4} step={1}
              value={visualOpts.hitLineGlow ?? 2}
              onChange={e => setV('hitLineGlow', Number(e.target.value))} />
          </div>
          <label className="vopt-row vopt-check-row">
            <input type="checkbox" checked={!!visualOpts.hitLineBoost}
              onChange={e => setV('hitLineBoost', e.target.checked)} />
            <span>Boost on note hit</span>
          </label>
        </>)}

        <div className="vopt-section-title">Effects</div>
        <label className="vopt-row vopt-check-row">
          <input type="checkbox" checked={visualOpts.hitLineFlash !== false}
            onChange={e => setV('hitLineFlash', e.target.checked)} />
          <span>Column flash on note hit</span>
        </label>

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
            onChange={e => setV('innerGlow', Number(e.target.value))} />
        </div>
        <div className="vopt-row vopt-slider-row">
          <div className="vopt-fx-label">
            <span>Outer — soft aura</span>
            <span className="vopt-slider-val">
              {outerGlow === 0 ? 'Off' : outerGlow.toFixed(1)}
            </span>
          </div>
          <input type="range" min={0} max={1.5} step={0.5}
            value={outerGlow}
            onChange={e => setV('outerGlow', Number(e.target.value))} />
        </div>
        <div className="vopt-row vopt-slider-row">
          <div className="vopt-fx-label">
            <span>On Hit Boost</span>
            <span className="vopt-slider-val">
              {(visualOpts.hitBoost ?? 4) === 0 ? 'Off' : visualOpts.hitBoost ?? 4}
            </span>
          </div>
          <input type="range" min={0} max={4} step={1}
            value={visualOpts.hitBoost ?? 4}
            onChange={e => setV('hitBoost', Number(e.target.value))} />
        </div>
        <div className="vopt-row vopt-slider-row">
          <div className="vopt-fx-label">
            <span>On Hit Shake</span>
            <span className="vopt-slider-val">
              {(visualOpts.hitShake ?? 4) === 0 ? 'Off' : visualOpts.hitShake ?? 4}
            </span>
          </div>
          <input type="range" min={0} max={4} step={1}
            value={visualOpts.hitShake ?? 4}
            onChange={e => setV('hitShake', Number(e.target.value))} />
        </div>

        {/* ── Color Scheme ─────────────────────────────────────────────── */}
        <div className="vopt-section-title">Color Scheme</div>

        {/* Mode toggle */}
        <div className="vopt-row vopt-chip-row">
          {['hands', 'spectrum'].map(s => (
            <button key={s}
              className={`vopt-chip${scheme === s ? ' active' : ''}`}
              onClick={() => setV('colorScheme', s)}>
              {s === 'hands' ? 'Hands' : 'Spectrum'}
            </button>
          ))}
        </div>

        {/* Hands: one picker per hand */}
        {scheme === 'hands' && (
          <div className="vopt-hand-pickers">
            {[
              { key: 'lh', label: 'Left Hand'  },
              { key: 'rh', label: 'Right Hand' },
            ].map(({ key, label }) => (
              <label key={key} className="vopt-hand-pick">
                <div className="vopt-hand-pick-swatch" style={{ background: handColors[key] }}>
                  <input type="color" value={handColors[key]}
                    onChange={e => setHandColor(key, e.target.value)} />
                </div>
                <span className="vopt-hand-pick-label">{label}</span>
              </label>
            ))}
          </div>
        )}

        {/* Spectrum: one picker per pitch class */}
        {scheme === 'spectrum' && (
          <div className="vopt-spectrum-grid">
            {NOTE_NAMES.map((name, i) => (
              <label key={i} className="vopt-note-pick">
                <div className="vopt-note-pick-swatch" style={{ background: specColors[i] }}>
                  <input type="color" value={specColors[i]}
                    onChange={e => setSpecColor(i, e.target.value)} />
                </div>
                <span className="vopt-note-pick-label">{name}</span>
              </label>
            ))}
          </div>
        )}
      </>)}

    </div>
  )
}
