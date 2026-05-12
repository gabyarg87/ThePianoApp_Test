// ── Fingering Engine ─────────────────────────────────────────────────────────
// JavaScript port of the pianoplayer algorithm by Marco Musy
// https://github.com/marcomusy/pianoplayer
//
// Core idea: exhaustive search with biomechanical pruning over a sliding
// look-ahead window of notes.  Each candidate fingering sequence is scored
// by the average "finger velocity" (distance / time, weighted by finger
// strength and black-key bias).  Lower velocity = lower cost = better.
// ─────────────────────────────────────────────────────────────────────────────

// ── Keyboard geometry ─────────────────────────────────────────────────────────
const OCTAVE_WIDTH = 16.5   // cm per octave

// Position multiplier for each pitch class (0=C … 11=B) in fractional white-key units
const NOTE_STEPS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5]
const IS_BLACK   = [false, true, false, true, false, false, true, false, true, false, true, false]

export function midiToX(midi) {
  const pc     = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  return octave * OCTAVE_WIDTH + NOTE_STEPS[pc] * (OCTAVE_WIDTH / 7)
}

// ── Hand model constants ──────────────────────────────────────────────────────
// Finger strength — stronger fingers move "cheaper" (divide cost)
const WEIGHTS    = [0, 1.1, 1.0, 1.1, 0.9, 0.8]   // index 0 unused; 1=thumb…5=pinky

// Black-key comfort per finger — thumb dislikes black keys (0.3), middle likes them (1.1)
const BLACK_BIAS = [0, 0.3, 1.0, 1.1, 0.8, 0.7]

// Maximum semitone stretch between each finger pair in a chord (before hand-size scaling)
const CHORD_LIMITS = {
  '1,2': 12, '1,3': 14, '1,4': 16,
  '2,3':  6, '2,4':  7, '2,5': 11,
  '3,4':  5, '3,5':  8, '4,5':  5,
}

// ── Cost function ─────────────────────────────────────────────────────────────
// Returns the average "velocity" (hand speed) for a candidate fingering.
// Lower is better.
function aveCost(notes, fingers) {
  let sum = 0, n = 0
  for (let i = 1; i < notes.length; i++) {
    const dist = Math.abs(notes[i].x - notes[i - 1].x)
    const dt   = Math.max(0.1, notes[i].time - notes[i - 1].time)
    let v = dist / dt
    v /= WEIGHTS[fingers[i]]
    if (notes[i].isBlack) v /= BLACK_BIAS[fingers[i]]
    sum += v; n++
  }
  return n ? sum / n : 0
}

// ── Pruning rules ─────────────────────────────────────────────────────────────
// Returns true if the transition (prevNote, fa) → (currNote, fb) should be
// skipped entirely (biomechanically invalid or extremely costly).
function shouldSkip(a, b, fa, fb, side) {
  // Same finger on a short note (rapid repeated finger is hard)
  if (fa === fb && b.duration < 4) return true

  // Non-thumb ascending finger number while pitch descends (awkward crossing)
  if (fa !== 1 && fb > fa && b.midi < a.midi) return true

  // Thumb-under onto a black key while ascending (uncomfortable crossover)
  if (fb === 1 && b.isBlack && b.midi > a.midi) return true

  // Fast departure from black key with thumb going down
  if (fa === 1 && a.isBlack && b.midi < a.midi && b.duration < 2) return true

  // ── Chord-specific stretch limits ──────────────────────────────────────────
  if (a.chordId !== null && a.chordId === b.chordId) {
    // Chord notes are sorted ascending by pitch.
    // RH: fingers increase with pitch (thumb=1 on lowest)  → require fa < fb
    // LH: fingers decrease with pitch (pinky=5 on lowest)  → require fa > fb
    if (side === 'right' && fa >= fb) return true
    if (side === 'left'  && fa <= fb) return true

    // Physical stretch limit for this finger pair
    const key = `${Math.min(fa, fb)},${Math.max(fa, fb)}`
    const lim = CHORD_LIMITS[key]
    if (lim !== undefined && Math.abs(b.midi - a.midi) > lim) return true
  }

  return false
}

// ── Window search ─────────────────────────────────────────────────────────────
// Exhaustive DFS over `win` notes with pruning.
// Returns the best finger array for these notes, or middle-finger fallback.
function searchWindow(notes, win, startFinger, side) {
  let best = null
  let bestCost = Infinity
  const cur = new Array(win)

  function dfs(level, prevFinger) {
    if (level === win) {
      const c = aveCost(notes, cur)
      if (c < bestCost) { bestCost = c; best = cur.slice() }
      return
    }
    // First note: if a carry-over finger is provided, try it first
    const candidates = (level === 0 && startFinger) ? [startFinger] : [1, 2, 3, 4, 5]
    for (const f of candidates) {
      if (level > 0 && shouldSkip(notes[level - 1], notes[level], prevFinger, f, side)) continue
      cur[level] = f
      dfs(level + 1, f)
    }
  }

  dfs(0, null)
  return best ?? new Array(win).fill(3)   // fallback: middle finger
}

// ── Main export: generate fingerings ─────────────────────────────────────────
// notes : array of { midi, x, duration, time, isBlack, chordId }
// side  : 'right' | 'left'
// Returns an array of finger numbers (1–5) parallel to `notes`.
export function generateFingering(notes, side = 'right') {
  if (!notes.length) return []

  // Mirror keyboard x-coordinates for left hand so we can reuse the RH algorithm
  const ns = side === 'left' ? notes.map(n => ({ ...n, x: -n.x })) : notes

  const result = []
  const WIN    = 7   // look-ahead window (7 balances quality vs speed)

  for (let i = 0; i < ns.length; ) {
    const win         = Math.min(WIN, ns.length - i)
    const startFinger = result.length ? result[result.length - 1] : null
    const fingers     = searchWindow(ns.slice(i, i + win), win, startFinger, side)
    result.push(...fingers)
    i += win
  }

  return result
}

// ── OSMD note extraction ──────────────────────────────────────────────────────
// Walks the OSMD cursor (hidden, no scrollIntoView) and returns two parallel
// note arrays — one per hand — ready for generateFingering().
//
// Each note object:
//   { midi, x, duration, time, isBlack, chordId, absPos: {x,y} | null }
//   absPos is in OSMD "units" (multiply by UnitInPixels for screen pixels)
export function extractFingeringNotes(osmd) {
  const cursor = osmd.cursor

  // Suppress all DOM side-effects during the walk
  const _siv = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = () => {}
  try { cursor.hide() } catch (_) {}

  cursor.reset()

  const rh = []   // treble staff / right hand
  const lh = []   // bass   staff / left hand
  let chordId  = 0
  let lastTs   = -1

  while (!cursor.Iterator.EndReached) {
    const ts = cursor.Iterator.currentTimeStamp?.RealValue ?? 0

    // Each new timestamp starts a new chord group
    if (Math.abs(ts - lastTs) > 1e-6) { chordId++; lastTs = ts }

    const time = ts * 4   // whole-note values → quarter-beat values

    // Collect graphical notes for position lookup
    let gnotes = []
    try { gnotes = cursor.GNotesUnderCursor() ?? [] } catch (_) {}

    const ves = cursor.VoicesUnderCursor()
    ves.forEach(ve => {
      if (ve.IsGrace) return

      // Determine which staff this voice belongs to (0-indexed within instrument)
      const staff      = ve.ParentSourceStaffEntry?.ParentStaff
      const instrument = staff?.ParentInstrument
      const staffIdx   = instrument?.Staves
        ? instrument.Staves.indexOf(staff)
        : ((staff?.Id ?? 1) - 1)
      // staffIdx 0 = treble (right hand), 1 = bass (left hand)

      ve.Notes.forEach(note => {
        if (note.IsGraceNote || !note.Pitch || note.isRest?.()) return

        // Skip tied continuations — only process the attack note
        const tie = note.NoteTie
        if (tie?.Notes?.length > 0 && tie.Notes[0] !== note) return

        const midi   = note.halfTone + 12
        const pc     = ((midi % 12) + 12) % 12
        const octave = Math.floor(midi / 12) - 1
        const x      = octave * OCTAVE_WIDTH + NOTE_STEPS[pc] * (OCTAVE_WIDTH / 7)
        const dur    = (note.Length?.RealValue ?? 0.25) * 4

        // Match to graphical note for screen position
        let absPos = null
        const gn = gnotes.find(g => {
          try { return g.sourceNote === note } catch (_) { return false }
        })
        if (gn) {
          try { absPos = gn.PositionAndShape?.AbsolutePosition ?? null } catch (_) {}
        }

        const noteObj = {
          midi, x, duration: dur, time,
          isBlack: IS_BLACK[pc],
          chordId,
          absPos,
        }

        if (staffIdx <= 0) rh.push(noteObj)
        else               lh.push(noteObj)
      })
    })

    cursor.next()
  }

  cursor.reset()
  Element.prototype.scrollIntoView = _siv

  return { rh, lh }
}
