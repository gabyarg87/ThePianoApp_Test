// Visual piano keyboard highlighting chord notes, colored per interval role.
// Keys are tappable — calls onKeyPress(midi) when pressed.

const WHITE_PATTERN = [0, 2, 4, 5, 7, 9, 11]
const BLACK_PATTERN = [1, 3, 6, 8, 10]
const NOTE_NAMES_SHORT = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']

export default function Keyboard({ rootPc, highlights = [], octaves = 2, baseMidi: baseMidiProp, scalePcs = null, onKeyPress, showNoteNames = false, noteColors = null, noteLabelColor = null }) {
  const inScale = scalePcs ? new Set(scalePcs) : null
  // highlights: [{ midi, role, label, name }]
  // baseMidi defaults to middle-C-aligned: 60 + rootPc (so for C root, first key = C4=60).
  const roleByMidi = new Map(highlights.map(h => [h.midi, h]))
  const baseMidi = baseMidiProp ?? (60 + rootPc)
  const whiteKeys = []
  const blackKeys = []

  for (let o = 0; o < octaves; o++) {
    for (const s of WHITE_PATTERN) {
      const offset = o * 12 + s
      whiteKeys.push({ offset, midi: baseMidi + offset, pc: (rootPc + offset) % 12 })
    }
    for (const s of BLACK_PATTERN) {
      const offset = o * 12 + s
      blackKeys.push({ offset, midi: baseMidi + offset, pc: (rootPc + offset) % 12, slot: s })
    }
  }

  const whiteCount = whiteKeys.length
  const blackOffsets = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 }

  const handlePress = (midi) => (e) => {
    e.preventDefault()
    onKeyPress?.(midi)
  }

  return (
    <div className={`kbd ${inScale ? 'scale-on' : ''}`} style={{ '--white-count': whiteCount }}>
      <div className="kbd-whites">
        {whiteKeys.map(k => {
          const h = roleByMidi.get(k.midi)
          return (
            <button
              key={`w${k.midi}`}
              className={`key white ${h ? 'active' : ''} ${h?.color ? 'note-colored' : ''} ${inScale && !inScale.has(k.pc) && !h ? 'out-of-scale' : ''}`}
              data-role={h?.role}
              style={h?.color ? { '--nc': h.color } : undefined}
              onPointerDown={handlePress(k.midi)}
              aria-label={`Play ${h?.name ?? 'key'}`}
            >
              {h ? (
                <span className="key-label" style={{ color: h.color }}>
                  <span className="key-name">{h.name}</span>
                  <span className="key-interval">{h.label}</span>
                </span>
              ) : showNoteNames ? (
                <span className="key-label key-label-passive"
                  style={{ color: noteLabelColor ?? (noteColors ? noteColors[((k.midi % 12) + 12) % 12] : undefined) }}>
                  <span className="key-name">{NOTE_NAMES_SHORT[k.midi % 12]}</span>
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <div className="kbd-blacks">
        {blackKeys.map(k => {
          const octaveIndex = Math.floor(k.offset / 12)
          const left = ((octaveIndex * 7 + blackOffsets[k.slot] + 1) / whiteCount) * 100
          const h = roleByMidi.get(k.midi)
          return (
            <button
              key={`b${k.midi}`}
              className={`key black ${h ? 'active' : ''} ${h?.color ? 'note-colored' : ''} ${inScale && !inScale.has(k.pc) && !h ? 'out-of-scale' : ''}`}
              data-role={h?.role}
              style={{ left: `calc(${left}% - (100% / var(--white-count) * 0.32))`, ...(h?.color ? { '--nc': h.color } : {}) }}
              onPointerDown={handlePress(k.midi)}
              aria-label={`Play ${h?.name ?? 'key'}`}
            >
              {h ? (
                <span className="key-label" style={{ color: h.color }}>
                  <span className="key-name">{h.name}</span>
                  <span className="key-interval">{h.label}</span>
                </span>
              ) : showNoteNames ? (
                <span className="key-label key-label-passive"
                  style={{ color: noteLabelColor ?? (noteColors ? noteColors[((k.midi % 12) + 12) % 12] : undefined) }}>
                  <span className="key-name">{NOTE_NAMES_SHORT[k.midi % 12]}</span>
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
