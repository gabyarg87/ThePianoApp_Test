import { useState, useEffect, useRef } from 'react'

/* Pitch-class lookup for scale-compatibility checks */
const ROOT_PC = { C:0, Db:1, D:2, Eb:3, E:4, F:5, Gb:6, G:7, Ab:8, A:9, Bb:10, B:11 }
const CHORD_INTERVALS = {
  maj:[0,4,7], min:[0,3,7], '7':[0,4,7,10], maj7:[0,4,7,11], min7:[0,3,7,10],
  dim:[0,3,6], aug:[0,4,8], sus4:[0,5,7], sus2:[0,2,7],
}

/* Circle-of-fifths order with display names */
const NOTES = [
  { id: 'C',  label: 'C'  },
  { id: 'G',  label: 'G'  },
  { id: 'D',  label: 'D'  },
  { id: 'A',  label: 'A'  },
  { id: 'E',  label: 'E'  },
  { id: 'B',  label: 'B'  },
  { id: 'Gb', label: 'F♯' },
  { id: 'Db', label: 'D♭' },
  { id: 'Ab', label: 'A♭' },
  { id: 'Eb', label: 'E♭' },
  { id: 'Bb', label: 'B♭' },
  { id: 'F',  label: 'F'  },
]

const QUALITY_COLORS = {
  maj: '#4d96ff', maj7: '#4d96ff',
  min: '#ff5f5f', min7: '#ff5f5f',
}
const DEFAULT_COLOR  = '#ffd166'   // yellow — 7, dim, aug, sus, etc.
const OFF_SCALE_COLOR= '#4a4458'   // muted — root not in scale

function qualityColor(quality) {
  return QUALITY_COLORS[quality] ?? DEFAULT_COLOR
}

const QUALITIES = [
  { id: 'maj',  label: 'Major',     short: ''     },
  { id: 'min',  label: 'Minor',     short: 'm'    },
  { id: '7',    label: 'Dom 7',     short: '7'    },
  { id: 'maj7', label: 'Maj 7',     short: 'M7'   },
  { id: 'min7', label: 'Min 7',     short: 'm7'   },
  { id: 'dim',  label: 'Dim',       short: '°'    },
  { id: 'aug',  label: 'Aug',       short: '+'    },
  { id: 'sus4', label: 'Sus4',      short: 'sus4' },
  { id: 'sus2', label: 'Sus2',      short: 'sus2' },
]

const CX = 195, CY = 195, R_OUT = 177, R_IN = 90, GAP_DEG = 1.5
const SEG = 360 / 12

function polar(cx, cy, r, deg) {
  const rad = (deg - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function wedge(cx, cy, r1, r2, startDeg, endDeg) {
  const s = startDeg + GAP_DEG / 2
  const e = endDeg   - GAP_DEG / 2
  const o1 = polar(cx, cy, r2, s), o2 = polar(cx, cy, r2, e)
  const i1 = polar(cx, cy, r1, e), i2 = polar(cx, cy, r1, s)
  return `M${o1.x} ${o1.y} A${r2} ${r2} 0 0 1 ${o2.x} ${o2.y} L${i1.x} ${i1.y} A${r1} ${r1} 0 0 0 ${i2.x} ${i2.y}Z`
}

export default function ChordWheel({ x, y, barChords = [], barMode = 'single', scaleChords, onSelect, onSetMode, onClose }) {
  // barChords: array of chord objects (up to 2) for the bar being edited
  // barMode: 'single' | 'multiple'
  const [activeChord, setActiveChord] = useState(0)          // which chord slot is selected
  const [root, setRoot]               = useState(barChords[0]?.root ?? null)
  const ref  = useRef(null)

  const currentChord = barChords[activeChord] ?? null

  const switchChord = (idx) => {
    setActiveChord(idx)
    setRoot(barChords[idx]?.root ?? null)
  }

  const handleModeChange = (mode) => {
    onSetMode?.(mode)
    if (mode === 'single') { switchChord(0) }
  }

  // Build lookup: root → Set of allowed qualities (null = all allowed)
  const scaleMap = scaleChords
    ? scaleChords.reduce((acc, { root: r, quality: q }) => {
        if (!acc[r]) acc[r] = new Set()
        acc[r].add(q)
        return acc
      }, {})
    : null

  const ROMAN = ['I','II','III','IV','V','VI','VII']

  const inScale     = (r, q) => !scaleMap || (scaleMap[r]?.has(q) ?? false)
  const rootInScale = (r)    => !scaleMap || !!scaleMap[r]
  const getDegree   = (r)    => scaleChords ? scaleChords.findIndex(c => c.root === r) : -1

  // Scale pitch-class set (the 7 scale degree roots)
  const scalePCs = scaleChords
    ? new Set(scaleChords.map(c => ROOT_PC[c.root]))
    : null

  // True when ALL notes of the chord fall within the scale's pitch classes
  const isCompatible = (r, q) => {
    if (!scalePCs) return false
    const base = ROOT_PC[r] ?? 0
    return (CHORD_INTERVALS[q] ?? [0,4,7]).every(i => scalePCs.has((base + i) % 12))
  }
  const getRomanForQuality = (r, q) => {
    if (!scaleChords) return null
    const idx = scaleChords.findIndex(c => c.root === r && c.quality === q)
    return idx >= 0 ? ROMAN[idx] : null
  }

  /* close on outside click */
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [onClose])

  /* clamp to viewport */
  const W = 390, H_TOP = 44, H_WHEEL = 390, H_QUAL = root ? 160 : 0
  const vw = window.innerWidth, vh = window.innerHeight
  const left = Math.max(8, Math.min(vw - W - 8, x - W / 2))
  const top  = Math.max(8, Math.min(vh - H_TOP - H_WHEEL - H_QUAL - 16, y))

  const handleRootClick = (noteId) => {
    setRoot(prev => prev === noteId ? null : noteId)
  }

  const handleQuality = (q) => {
    onSelect({ root, quality: q.id }, activeChord)
  }

  const rootDiatonicQuality = root && scaleMap?.[root] ? [...scaleMap[root]][0] : null
  const rootColor = root
    ? (rootInScale(root) ? qualityColor(rootDiatonicQuality) : OFF_SCALE_COLOR)
    : '#7c5cfc'

  return (
    <div
      ref={ref}
      className="cw-popup"
      style={{ left, top, '--root-color': rootColor }}
      onClick={e => e.stopPropagation()}
    >
      {/* ── Single / Multiple toggle ──────────────────────── */}
      <div className="cw-mode-row">
        <button
          className={`cw-mode-btn${barMode === 'single' ? ' cw-mode-btn--active' : ''}`}
          onClick={() => handleModeChange('single')}
        >Single</button>
        <button
          className={`cw-mode-btn${barMode === 'multiple' ? ' cw-mode-btn--active' : ''}`}
          onClick={() => handleModeChange('multiple')}
        >Multiple</button>

        <button className="cw-close-btn" onClick={onClose} title="Close">✕</button>

        {/* Chord 1 / Chord 2 selector — visible in multiple mode */}
        {barMode === 'multiple' && (
          <div className="cw-chord-tabs">
            <button
              className={`cw-chord-tab${activeChord === 0 ? ' cw-chord-tab--active' : ''}`}
              onClick={() => switchChord(0)}
            >Chord 1</button>
            <button
              className={`cw-chord-tab${activeChord === 1 ? ' cw-chord-tab--active' : ''}`}
              onClick={() => switchChord(1)}
            >Chord 2</button>
          </div>
        )}
      </div>

      {/* ── Wheel ────────────────────────────────────────── */}
      <svg className="cw-svg" viewBox={`0 0 ${CX * 2} ${CY * 2}`} width={W} height={W}>
        {/* Background ring track */}
        <circle cx={CX} cy={CY} r={(R_OUT + R_IN) / 2} fill="none"
          stroke="rgba(255,255,255,0.04)" strokeWidth={R_OUT - R_IN} />

        {/* Note segments */}
        {NOTES.map((n, i) => {
          const start  = i * SEG
          const end    = start + SEG
          const mid    = start + SEG / 2
          const sel    = root === n.id
          const onKey  = rootInScale(n.id)
          const degree = getDegree(n.id)
          const roman  = degree >= 0 ? ROMAN[degree] : null
          const tp     = polar(CX, CY, (R_OUT + R_IN) / 2 + (roman ? -4 : 0), mid)
          const rp     = polar(CX, CY, (R_OUT + R_IN) / 2 + 7, mid)
          const diatonicQuality = scaleMap?.[n.id] ? [...scaleMap[n.id]][0] : null
          const color  = onKey ? qualityColor(diatonicQuality) : OFF_SCALE_COLOR
          const alpha  = onKey ? '99' : 'ff'
          const fAlpha = onKey ? (sel ? 1.0 : 0.65) : 0.25
          return (
            <g key={n.id} onClick={() => handleRootClick(n.id)} style={{ cursor: 'pointer' }}>
              <path
                d={wedge(CX, CY, R_IN + 2, R_OUT, start, end)}
                fill={sel ? color : `${color}${alpha}`}
                stroke={sel ? color : 'transparent'}
                strokeWidth={sel ? 1.5 : 0}
                style={{ transition: 'fill .15s, stroke .15s', filter: sel ? `drop-shadow(0 0 6px ${color}99)` : 'none' }}
              />
              <text
                x={tp.x} y={tp.y}
                textAnchor="middle" dominantBaseline="central"
                fontSize={sel ? 17 : 15}
                fontWeight={sel ? 700 : (onKey ? 500 : 400)}
                fill={`rgba(255,255,255,${fAlpha})`}
                style={{ pointerEvents: 'none', userSelect: 'none', transition: 'font-size .1s' }}
              >
                {n.label}
              </text>
              {roman && (
                <text
                  x={rp.x} y={rp.y}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={11}
                  fontWeight={500}
                  fill={`rgba(255,255,255,${fAlpha * 0.7})`}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {roman}
                </text>
              )}
            </g>
          )
        })}

        {/* Center circle */}
        <circle cx={CX} cy={CY} r={R_IN - 4}
          fill={root ? `${rootColor}22` : 'rgba(255,255,255,0.03)'}
          stroke={root ? `${rootColor}66` : 'rgba(255,255,255,0.08)'}
          strokeWidth={1.5}
          style={{ transition: 'fill .2s, stroke .2s' }}
        />
        {root ? (
          <>
            <text x={CX} y={CY - 10} textAnchor="middle" dominantBaseline="central"
              fontSize={32} fontWeight={800} fill="#fff" style={{ pointerEvents: 'none' }}>
              {NOTES.find(n => n.id === root)?.label ?? root}
            </text>
            <text x={CX} y={CY + 14} textAnchor="middle" dominantBaseline="central"
              fontSize={14} fill="rgba(255,255,255,0.45)" style={{ pointerEvents: 'none' }}>
              pick quality
            </text>
          </>
        ) : (
          <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central"
            fontSize={15} fill="rgba(255,255,255,0.3)" style={{ pointerEvents: 'none' }}>
            pick a root
          </text>
        )}
      </svg>

      {/* ── Quality grid ─────────────────────────────────── */}
      {root && (
        <div className="cw-qualities">
          {QUALITIES.map(q => {
            const isCurrent    = currentChord?.root === root && currentChord?.quality === q.id
            const isDiatonic   = inScale(root, q.id)
            const isCompat     = !isDiatonic && isCompatible(root, q.id)
            const roman        = getRomanForQuality(root, q.id)
            const cls = [
              'cw-q-btn',
              isCurrent  ? 'cw-q-btn--current'  : '',
              isDiatonic ? 'cw-q-btn--diatonic'  : '',
              isCompat   ? 'cw-q-btn--compat'    : '',
              !isDiatonic && !isCompat ? 'cw-q-btn--off' : '',
            ].filter(Boolean).join(' ')
            return (
              <button key={q.id} className={cls} onClick={() => handleQuality(q)}>
                {roman && <span className="cw-q-roman">{roman}</span>}
                <span className="cw-q-name">
                  {NOTES.find(n => n.id === root)?.label ?? root}{q.short}
                </span>
                <span className="cw-q-label">{q.label}</span>
                {isCompat && <span className="cw-q-check">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
