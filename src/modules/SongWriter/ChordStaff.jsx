import { useEffect, useRef, useState, useCallback } from 'react'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'

// ── Pitch class → MusicXML step + alter ─────────────────────────────────────
const PC_NOTE = [
  { step:'C', alter: 0 }, { step:'D', alter:-1 }, { step:'D', alter: 0 },
  { step:'E', alter:-1 }, { step:'E', alter: 0 }, { step:'F', alter: 0 },
  { step:'G', alter:-1 }, { step:'G', alter: 0 }, { step:'A', alter:-1 },
  { step:'A', alter: 0 }, { step:'B', alter:-1 }, { step:'B', alter: 0 },
]

const ROOT_STEP = {
  C:  { s:'C', a: 0 }, Db: { s:'D', a:-1 }, D:  { s:'D', a: 0 },
  Eb: { s:'E', a:-1 }, E:  { s:'E', a: 0 }, F:  { s:'F', a: 0 },
  Gb: { s:'G', a:-1 }, G:  { s:'G', a: 0 }, Ab: { s:'A', a:-1 },
  A:  { s:'A', a: 0 }, Bb: { s:'B', a:-1 }, B:  { s:'B', a: 0 },
}

const ROOT_MIDI = { C:60, Db:61, D:62, Eb:63, E:64, F:65, Gb:66, G:67, Ab:68, A:69, Bb:70, B:71 }

const INTERVALS = {
  maj:[0,4,7], min:[0,3,7], '7':[0,4,7,10], maj7:[0,4,7,11], min7:[0,3,7,10],
  dim:[0,3,6], aug:[0,4,8], sus4:[0,5,7], sus2:[0,2,7],
}

const QUALITY_KIND = {
  maj:  { k:'major',            t:''     },
  min:  { k:'minor',            t:'m'    },
  '7':  { k:'dominant',         t:'7'    },
  maj7: { k:'major-seventh',    t:'maj7' },
  min7: { k:'minor-seventh',    t:'m7'   },
  dim:  { k:'diminished',       t:'°'    },
  aug:  { k:'augmented',        t:'+'    },
  sus4: { k:'suspended-fourth', t:'sus4' },
  sus2: { k:'suspended-second', t:'sus2' },
}

const DIV = 4

// ── Key signature helpers ────────────────────────────────────────────────────
// Fifths value for each root in major context (circle of fifths)
const MAJOR_FIFTHS = {
  C: 0, Db:-5, D: 2, Eb:-3, E: 4, F:-1, Gb: 6, G: 1, Ab:-4, A: 3, Bb:-2, B: 5,
}

// Offset to add to the major fifths based on mode
// (each mode is a rotation of the parent major scale)
const MODE_FIFTHS_OFFSET = {
  major:      0,
  minor:     -3,   // natural minor  = Aeolian (3 flats relative to major)
  harmonic:  -3,   // harmonic minor — same key sig as natural minor
  dorian:    -2,   // Dorian = 2nd mode  (2 less sharps than major)
  mixolydian:-1,   // Mixolydian = 5th mode (1 less sharp than major)
  phrygian:  -4,   // Phrygian = 3rd mode (4 less sharps than major)
}

// MusicXML <mode> string for each scale type
const MODE_LABEL = {
  major:      'major',
  minor:      'minor',
  harmonic:   'minor',
  dorian:     'dorian',
  mixolydian: 'mixolydian',
  phrygian:   'phrygian',
}

function keySignatureXml(scaleKey, scaleType) {
  const base   = MAJOR_FIFTHS[scaleKey] ?? 0
  const offset = MODE_FIFTHS_OFFSET[scaleType] ?? 0
  const fifths = Math.max(-7, Math.min(7, base + offset))
  const mode   = MODE_LABEL[scaleType] ?? 'major'
  return `<key><fifths>${fifths}</fifths><mode>${mode}</mode></key>`
}

// ── XML generation ───────────────────────────────────────────────────────────
function harmonyXml(chord) {
  if (!chord) return ''
  const rs = ROOT_STEP[chord.root] ?? { s:'C', a:0 }
  const qk = QUALITY_KIND[chord.quality] ?? { k:'major', t:'' }
  return `
    <harmony>
      <root>
        <root-step>${rs.s}</root-step>
        ${rs.a !== 0 ? `<root-alter>${rs.a}</root-alter>` : ''}
      </root>
      <kind text="${qk.t}">${qk.k}</kind>
    </harmony>`
}

function chordNotesXml(chord, durType) {
  const dur = durType === 'whole' ? DIV * 4 : DIV * 2
  if (!chord) {
    return `\n    <note><rest/><duration>${dur}</duration><type>${durType}</type></note>`
  }
  const root  = ROOT_MIDI[chord.root] ?? 60
  const midis = (INTERVALS[chord.quality] ?? [0,4,7]).map(i => root + i).sort((a, b) => a - b)
  return midis.map((midi, idx) => {
    const pc  = ((midi % 12) + 12) % 12
    const oct = Math.floor(midi / 12) - 1
    const { step, alter } = PC_NOTE[pc]
    return `
    <note>
      ${idx > 0 ? '<chord/>' : ''}
      <pitch>
        <step>${step}</step>
        ${alter !== 0 ? `<alter>${alter}</alter>` : ''}
        <octave>${oct}</octave>
      </pitch>
      <duration>${dur}</duration>
      <type>${durType}</type>
    </note>`
  }).join('')
}

function barsToMusicXML(bars, bpm = 120, scaleKey = 'C', scaleType = 'major') {
  const measures = bars.map((bar, bi) => {
    const numSlots = bar.chords.length
    const durType  = numSlots === 2 ? 'half' : 'whole'
    const attrs    = bi === 0 ? `
    <attributes>
      <divisions>${DIV}</divisions>
      ${keySignatureXml(scaleKey, scaleType)}
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <clef><sign>G</sign><line>2</line></clef>
    </attributes>
    <direction placement="above">
      <direction-type>
        <metronome parentheses="no">
          <beat-unit>quarter</beat-unit>
          <per-minute>${bpm}</per-minute>
        </metronome>
      </direction-type>
      <sound tempo="${bpm}"/>
    </direction>` : ''

    let content = attrs
    if (numSlots === 2) {
      bar.chords.forEach(chord => {
        content += harmonyXml(chord)
        content += chordNotesXml(chord, 'half')
      })
    } else {
      content += harmonyXml(bar.chords[0])
      content += chordNotesXml(bar.chords[0], 'whole')
    }
    return `  <measure number="${bi + 1}">\n${content}\n  </measure>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN"
  "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Chords</part-name></score-part>
  </part-list>
  <part id="P1">
${measures}
  </part>
</score-partwise>`
}

// ── Component ────────────────────────────────────────────────────────────────
export default function ChordStaff({
  bars,
  bpm        = 120,
  scaleKey   = 'C',
  scaleType  = 'major',
  activeSlot,          // { barIdx, slotIdx } — currently playing
  wheelOpen,           // { barIdx } — chord wheel is open here
  copySource = null,   // barIdx being copied (null = not in copy mode)
  onBarClick,          // (barIdx, clientX, clientY) — open chord wheel for this bar
  onRemoveBar,         // (barIdx)
  onDuplicateBar,      // (barIdx)
  onCopyStart,         // (barIdx) — enter copy mode
  onCopyTo,            // (destIdx) — paste to destination
  onCancelCopy,        // () — cancel copy mode
}) {
  const containerRef = useRef(null)   // outer wrapper (position:relative for overlays)
  const osmdDivRef   = useRef(null)   // inner div passed to OSMD
  const osmdRef      = useRef(null)
  const [overlays,   setOverlays]   = useState([])
  const [hovered,    setHovered]    = useState(null)  // barIdx

  // ── Re-compute overlay hit-zones after each OSMD render ──────────────────
  const computeOverlays = useCallback(() => {
    const osmd = osmdRef.current
    const div  = osmdDivRef.current
    if (!osmd || !div) return

    const ml = osmd.GraphicSheet?.MeasureList
    if (!ml?.length) return

    // Unit → pixel scale factor
    let uip = osmd.EngravingRules?.UnitInPixels
    if (!uip || uip <= 0) {
      const svg  = div.querySelector('svg')
      const svgW = svg?.getBoundingClientRect().width || div.clientWidth
      const pageW = osmd.GraphicSheet?.MusicPages?.[0]?.PositionAndShape?.Size?.width
      uip = (pageW && svgW) ? svgW / pageW : 10
    }

    const next = []
    ml.forEach((staffArr, idx) => {
      const gm = staffArr?.[0]
      if (!gm || idx >= bars.length) return
      const abs  = gm.PositionAndShape.AbsolutePosition
      const size = gm.PositionAndShape.Size
      next.push({
        barIdx: idx,
        x: abs.x  * uip,
        y: abs.y  * uip,
        w: size.width  * uip,
        h: size.height * uip,
      })
    })

    // Normalize all overlay heights to the tallest one so that empty-chord
    // bars (which OSMD renders with a rest and a smaller bounding box) are
    // just as easy to click as bars with full chord voicings.
    if (next.length > 0) {
      const maxH = Math.max(...next.map(o => o.h))
      next.forEach(o => { o.h = maxH })
    }

    setOverlays(next)
  }, [bars.length])

  // ── Load + render OSMD whenever bars change ───────────────────────────────
  useEffect(() => {
    const div = osmdDivRef.current
    if (!div) return
    const xml = barsToMusicXML(bars, bpm, scaleKey, scaleType)

    const run = async () => {
      if (!osmdRef.current) {
        osmdRef.current = new OpenSheetMusicDisplay(div, {
          autoResize:         true,
          backend:            'svg',
          drawTitle:          false,
          drawSubtitle:       false,
          drawComposer:       false,
          drawCredits:        false,
          drawPartNames:      false,
          drawMeasureNumbers: true,
          drawTimeSignatures: true,
          drawKeySignatures:  true,
        })
      }
      try {
        await osmdRef.current.load(xml)
        osmdRef.current.render()
        // Wait one frame so the SVG has been laid out before measuring
        requestAnimationFrame(computeOverlays)
      } catch (err) {
        console.error('[ChordStaff] render error:', err)
      }
    }
    run()
  }, [bars, bpm, scaleKey, scaleType, computeOverlays])

  // ── Click handler ─────────────────────────────────────────────────────────
  const handleOverlayClick = (e, barIdx) => {
    e.stopPropagation()

    // ── Copy mode: this click selects the destination ──────────────────────
    if (copySource !== null) {
      onCopyTo?.(barIdx, e.clientX, e.clientY)
      return
    }

    // ── Normal mode: open chord wheel anchored to the bottom of the bar ───
    const rect = e.currentTarget.getBoundingClientRect()
    onBarClick?.(barIdx, rect.left + rect.width / 2, rect.bottom + 8)
  }

  const isCopyMode = copySource !== null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="sw-staff-wrap">
      <div className="sw-staff-header">
        <span className="sw-staff-icon">𝄞</span>
        <span className="sw-staff-title">Staff</span>
        {!isCopyMode && (
          <span className="sw-staff-hint">click a bar to set chords</span>
        )}
        {isCopyMode && (
          <span className="sw-staff-copy-banner">
            Copying bar {copySource + 1} — click any bar to paste &nbsp;
            <button className="sw-staff-copy-cancel" onClick={onCancelCopy}>✕ Cancel</button>
          </span>
        )}
      </div>

      <div className={`sw-staff-sheet${isCopyMode ? ' sw-staff-sheet--copy-mode' : ''}`}>
        {/* OSMD renders here */}
        <div ref={osmdDivRef} className="sw-staff-osmd" />

        {/* Interactive overlays */}
        <div ref={containerRef} className="sw-staff-overlays">
          {overlays.map(ov => {
            const isPlaying   = activeSlot?.barIdx === ov.barIdx
            const isOpen      = wheelOpen?.barIdx  === ov.barIdx
            const isHov       = hovered === ov.barIdx
            const isCopySrc   = ov.barIdx === copySource
            const isCopyDest  = isCopyMode && !isCopySrc

            const cls = [
              'sw-staff-ov',
              isPlaying  ? 'sw-staff-ov--playing'   : '',
              isOpen     ? 'sw-staff-ov--open'       : '',
              isHov && !isCopyMode ? 'sw-staff-ov--hovered'  : '',
              isCopySrc  ? 'sw-staff-ov--copy-src'   : '',
              isCopyDest && isHov ? 'sw-staff-ov--copy-dest' : '',
            ].filter(Boolean).join(' ')

            return (
              <div
                key={ov.barIdx}
                className={cls}
                style={{ left: ov.x, top: ov.y, width: ov.w, height: ov.h }}
                onClick={e => handleOverlayClick(e, ov.barIdx)}
                onMouseEnter={() => setHovered(ov.barIdx)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Normal hover hint — only when not open and not in copy mode */}
                {isHov && !isOpen && !isCopyMode && (
                  <div className="sw-staff-ov-hint sw-staff-ov-hint--left">♩</div>
                )}

                {/* Copy mode hints */}
                {isCopySrc && (
                  <div className="sw-staff-ov-hint sw-staff-ov-hint--left">copying…</div>
                )}
                {isCopyDest && isHov && (
                  <div className="sw-staff-ov-hint sw-staff-ov-hint--left">paste here</div>
                )}

                {/* Action toolbar — visible when wheel is open for this bar */}
                {isOpen && !isCopyMode && (
                  <div className="sw-staff-ov-actions"
                    onClick={e => e.stopPropagation()}
                    onMouseDown={e => e.stopPropagation()}
                  >
                    <button
                      className="sw-staff-act"
                      onClick={() => onCopyStart?.(ov.barIdx)}
                    >Copy</button>
                    <button
                      className="sw-staff-act sw-staff-act--del"
                      onClick={() => onRemoveBar?.(ov.barIdx)}
                    >Delete</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
