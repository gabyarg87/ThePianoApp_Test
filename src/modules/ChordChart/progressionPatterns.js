// Rhythm patterns for chord progression playback.
//
// Each pattern defines how one measure is broken into steps.
// buildMeasureSteps(patternId, voicing, bassRootMidi) → Step[]
//
// Step shape:
//   { midis: number[], beats: number, isChord: boolean }
//   midis    — MIDI notes to play simultaneously
//   beats    — duration in quarter-note beats (0.5 = eighth, 1/3 = triplet, 1 = quarter, 2 = half)
//   isChord  — true = playChord (sustain + strum), false = single note hit
//
// Every pattern must sum to exactly 4 beats (one 4/4 measure).
// Not every pattern needs a sub-octave bass — use voicing[0] for the chord's
// own lowest note, or bassRootMidi - 12 only when a deep anchor is part of the feel.
//
// To add a new pattern:
//   1. Add an entry to PROGRESSION_PATTERNS
//   2. Add a case in buildMeasureSteps

// ── Helpers ──────────────────────────────────────────────────────────────────
// Shortcuts for extracting chord tones from the sorted voicing array.
const lo  = v => v[0]
const mid = v => v[Math.floor(v.length / 2)]
const hi  = v => v[v.length - 1]
const bass = n => n - 12   // one octave below any MIDI note

export const PROGRESSION_PATTERNS = [
  // ── Foundation ──────────────────────────────────────────────────
  { id: 'block',       name: 'Block Chord'       },
  { id: 'bass-chord',  name: 'Bass + Chord'      },
  { id: 'blues',       name: 'Blues Walk'        },
  // ── Pop / Rock ──────────────────────────────────────────────────
  { id: 'pop',         name: 'Pop Rhythm'        },
  { id: 'pop-offbeat', name: 'Pop Offbeat'       },
  { id: 'pop-arp',     name: 'Pop Arp'           },
  // ── Emotional / Cinematic ───────────────────────────────────────
  { id: 'nocturne',    name: 'Nocturne'          },
  { id: 'ballad',      name: 'Ballad'            },
  // ── Song Patterns ───────────────────────────────────────────────
  { id: 'swbl',        name: 'She Will Be Loved' },
  { id: 'perfect',     name: 'Perfect'           },
  { id: 'clocks',      name: 'Clocks'            },
  { id: 'someone',     name: 'Someone Like You'  },
  { id: 'thousand',    name: 'A Thousand Miles'  },
  { id: 'piano-man',   name: 'Piano Man'         },
  { id: 'all-of-me',   name: 'All Of Me'         },
  { id: 'scientist',   name: 'The Scientist'     },
  { id: 'dont-stop',   name: "Don't Stop"        },
  { id: 'your-song',   name: 'Your Song'         },
  { id: 'imagine',     name: 'Imagine'           },
  { id: 'river',       name: 'River Flows'       },
]

export function buildMeasureSteps(patternId, voicing, bassRootMidi) {
  switch (patternId) {

    // ════════════════════════════════════════════════════════════════
    //  FOUNDATION
    // ════════════════════════════════════════════════════════════════

    // ── Bass + Chord ──────────────────────────────────────────────
    // Deep bass anchor on beat 1, chord stabs on beats 2–4.
    case 'bass-chord':
      return [
        { midis: [bass(bassRootMidi)], beats: 1, isChord: false },
        { midis: voicing,              beats: 1, isChord: true  },
        { midis: voicing,              beats: 1, isChord: true  },
        { midis: voicing,              beats: 1, isChord: true  },
      ]

    // ── Blues Walk ────────────────────────────────────────────────
    // Root → fifth alternating bass (boogie feel), chord on 3 & 4.
    case 'blues': {
      const b = bass(bassRootMidi)
      return [
        { midis: [b],     beats: 1, isChord: false },
        { midis: [b + 7], beats: 1, isChord: false },
        { midis: voicing, beats: 1, isChord: true  },
        { midis: voicing, beats: 1, isChord: true  },
      ]
    }

    // ════════════════════════════════════════════════════════════════
    //  POP / ROCK
    // ════════════════════════════════════════════════════════════════

    // ── Pop Rhythm ────────────────────────────────────────────────
    // Chord stab → inner-note fill → chord sustain. No deep bass —
    // the inner chord tone acts as a lighter rhythmic pocket.
    case 'pop':
      return [
        { midis: voicing,       beats: 1,   isChord: true  }, // downbeat chord
        { midis: [lo(voicing)], beats: 0.5, isChord: false }, // inner fill
        { midis: voicing,       beats: 0.5, isChord: true  }, // bounce back
        { midis: voicing,       beats: 2,   isChord: true  }, // sustain
      ]

    // ── Pop Offbeat ───────────────────────────────────────────────
    // Lowest chord tone on downbeat eighths, full chord on upbeats.
    // Driving syncopated groove without a heavy sub-bass.
    case 'pop-offbeat':
      return [
        { midis: [lo(voicing)], beats: 0.5, isChord: false },
        { midis: voicing,       beats: 0.5, isChord: true  },
        { midis: [lo(voicing)], beats: 0.5, isChord: false },
        { midis: voicing,       beats: 0.5, isChord: true  },
        { midis: [lo(voicing)], beats: 0.5, isChord: false },
        { midis: voicing,       beats: 0.5, isChord: true  },
        { midis: [lo(voicing)], beats: 0.5, isChord: false },
        { midis: voicing,       beats: 0.5, isChord: true  },
      ]

    // ── Pop Arp ───────────────────────────────────────────────────
    // Deep bass pickup → ascending arpeggio → sustained chord.
    // Sounds like a pianist rolling into the chord.
    case 'pop-arp':
      return [
        { midis: [bass(bassRootMidi)], beats: 0.5, isChord: false },
        { midis: [lo(voicing)],        beats: 0.5, isChord: false },
        { midis: [mid(voicing)],       beats: 0.5, isChord: false },
        { midis: [hi(voicing)],        beats: 0.5, isChord: false },
        { midis: voicing,              beats: 2,   isChord: true  },
      ]

    // ════════════════════════════════════════════════════════════════
    //  EMOTIONAL / CINEMATIC
    // ════════════════════════════════════════════════════════════════

    // ── Nocturne ──────────────────────────────────────────────────
    // Deep bass anchor → arc up through chord tones → back down →
    // chord resolution. Chopin / Yiruma flowing feel.
    case 'nocturne':
      return [
        { midis: [bass(bassRootMidi)], beats: 0.5, isChord: false },
        { midis: [lo(voicing)],        beats: 0.5, isChord: false },
        { midis: [mid(voicing)],       beats: 0.5, isChord: false },
        { midis: [hi(voicing)],        beats: 0.5, isChord: false },
        { midis: [mid(voicing)],       beats: 0.5, isChord: false },
        { midis: [lo(voicing)],        beats: 0.5, isChord: false },
        { midis: [bass(bassRootMidi)], beats: 0.5, isChord: false },
        { midis: voicing,              beats: 0.5, isChord: true  },
      ]

    // ── Ballad ────────────────────────────────────────────────────
    // Half-note chord sustain (breathing space) → deep bass step →
    // low → high → chord resolve. Cinematic exhale shape.
    case 'ballad':
      return [
        { midis: voicing,              beats: 2,   isChord: true  },
        { midis: [bass(bassRootMidi)], beats: 0.5, isChord: false },
        { midis: [lo(voicing)],        beats: 0.5, isChord: false },
        { midis: [hi(voicing)],        beats: 0.5, isChord: false },
        { midis: voicing,              beats: 0.5, isChord: true  },
      ]

    // ════════════════════════════════════════════════════════════════
    //  SONG PATTERNS
    // ════════════════════════════════════════════════════════════════

    // ── She Will Be Loved — Maroon 5 ─────────────────────────────
    // Deep bass anchor (quarter) → lo → hi melodic figure → syncopated
    // chord stab on the "and" (×2). That off-beat stab is the signature.
    case 'swbl':
      return [
        { midis: [bass(bassRootMidi)], beats: 1,   isChord: false }, // beat 1  — bass
        { midis: [lo(voicing)],        beats: 0.5, isChord: false }, // and-1   — low
        { midis: [hi(voicing)],        beats: 0.5, isChord: false }, // beat 2  — lift
        { midis: voicing,              beats: 0.5, isChord: true  }, // and-2   — stab ✦
        { midis: [bass(bassRootMidi)], beats: 0.5, isChord: false }, // beat 3  — bass
        { midis: [lo(voicing)],        beats: 0.5, isChord: false }, // and-3   — low
        { midis: voicing,              beats: 0.5, isChord: true  }, // beat 4  — drive
      ]

    // ── Perfect — Ed Sheeran ─────────────────────────────────────
    // 12/8 compound time: 4 groups of 3 triplet eighths (t = 1/3 beat).
    // bass → lo → hi per group. Final triplet resolves to full chord.
    // Best at 60–75 BPM.
    case 'perfect': {
      const t = 1 / 3
      return [
        { midis: [bass(bassRootMidi)], beats: t, isChord: false },
        { midis: [lo(voicing)],        beats: t, isChord: false },
        { midis: [hi(voicing)],        beats: t, isChord: false },
        { midis: [bass(bassRootMidi)], beats: t, isChord: false },
        { midis: [lo(voicing)],        beats: t, isChord: false },
        { midis: [hi(voicing)],        beats: t, isChord: false },
        { midis: [bass(bassRootMidi)], beats: t, isChord: false },
        { midis: [lo(voicing)],        beats: t, isChord: false },
        { midis: [hi(voicing)],        beats: t, isChord: false },
        { midis: [bass(bassRootMidi)], beats: t, isChord: false },
        { midis: [lo(voicing)],        beats: t, isChord: false },
        { midis: voicing,              beats: t, isChord: true  },
      ]
    }

    // ── Clocks — Coldplay ────────────────────────────────────────
    // 3+3+2 polyrhythm: three groups of eighth notes (3, 3, 2) played
    // entirely within the chord voicing — no sub-octave bass at all.
    // The unequal grouping creates the hypnotic, propulsive feel.
    case 'clocks':
      return [
        { midis: [lo(voicing)],  beats: 0.5, isChord: false }, // ─┐ group 3
        { midis: [mid(voicing)], beats: 0.5, isChord: false }, //  │
        { midis: [hi(voicing)],  beats: 0.5, isChord: false }, // ─┘
        { midis: [lo(voicing)],  beats: 0.5, isChord: false }, // ─┐ group 3
        { midis: [mid(voicing)], beats: 0.5, isChord: false }, //  │
        { midis: [hi(voicing)],  beats: 0.5, isChord: false }, // ─┘
        { midis: [lo(voicing)],  beats: 0.5, isChord: false }, // ─┐ group 2
        { midis: [mid(voicing)], beats: 0.5, isChord: false }, // ─┘
      ]

    // ── Someone Like You — Adele ─────────────────────────────────
    // Left hand: bass on beats 1 & 3.
    // Right hand: hi → lo alternation on the upbeats.
    // The constant eighth-note motion + bass anchor = emotional signature.
    case 'someone':
      return [
        { midis: [bass(bassRootMidi)], beats: 0.5, isChord: false }, // beat 1
        { midis: [hi(voicing)],        beats: 0.5, isChord: false }, // and-1
        { midis: [lo(voicing)],        beats: 0.5, isChord: false }, // beat 2
        { midis: [hi(voicing)],        beats: 0.5, isChord: false }, // and-2
        { midis: [bass(bassRootMidi)], beats: 0.5, isChord: false }, // beat 3
        { midis: [hi(voicing)],        beats: 0.5, isChord: false }, // and-3
        { midis: [lo(voicing)],        beats: 0.5, isChord: false }, // beat 4
        { midis: [hi(voicing)],        beats: 0.5, isChord: false }, // and-4
      ]

    // ── A Thousand Miles — Vanessa Carlton ───────────────────────
    // Continuous running arpeggio — no deep bass. The chord tones flow
    // lo → mid → hi → mid in a constant eighth-note stream, resolving
    // on a full chord. Fast and energetic at 100–130 BPM.
    case 'thousand':
      return [
        { midis: [lo(voicing)],  beats: 0.5, isChord: false },
        { midis: [mid(voicing)], beats: 0.5, isChord: false },
        { midis: [hi(voicing)],  beats: 0.5, isChord: false },
        { midis: [mid(voicing)], beats: 0.5, isChord: false },
        { midis: [lo(voicing)],  beats: 0.5, isChord: false },
        { midis: [mid(voicing)], beats: 0.5, isChord: false },
        { midis: [hi(voicing)],  beats: 0.5, isChord: false },
        { midis: voicing,        beats: 0.5, isChord: true  },
      ]

    // ── Piano Man — Billy Joel ───────────────────────────────────
    // Waltz bass-chord feel adapted to 4/4: deep bass on beat 1 (quarter),
    // chord stab, then a lighter bass-chord-chord to fill beats 3–4.
    case 'piano-man':
      return [
        { midis: [bass(bassRootMidi)], beats: 1,   isChord: false }, // strong 1
        { midis: voicing,              beats: 1,   isChord: true  }, // chord 2
        { midis: [bass(bassRootMidi)], beats: 0.5, isChord: false }, // bass 3
        { midis: voicing,              beats: 0.5, isChord: true  }, // chord &3
        { midis: voicing,              beats: 1,   isChord: true  }, // chord 4
      ]

    // ── All Of Me — John Legend ──────────────────────────────────
    // Soulful R&B: long chord hold (1.5 beats) gives emotional weight,
    // then a bass + inner-voice + top-note figure walks into a chord hit.
    case 'all-of-me':
      return [
        { midis: voicing,              beats: 1.5, isChord: true  }, // hold
        { midis: [bass(bassRootMidi)], beats: 0.5, isChord: false }, // bass
        { midis: [lo(voicing)],        beats: 0.5, isChord: false }, // inner
        { midis: [hi(voicing)],        beats: 0.5, isChord: false }, // top
        { midis: voicing,              beats: 1,   isChord: true  }, // resolve
      ]

    // ── The Scientist — Coldplay ─────────────────────────────────
    // Contemplative alternating low/high pairs — no sub-octave bass.
    // lo ↔ hi traded every eighth note, ending on a chord stab.
    // Meditative and introspective. Best at 65–80 BPM.
    case 'scientist':
      return [
        { midis: [lo(voicing)],  beats: 0.5, isChord: false },
        { midis: [hi(voicing)],  beats: 0.5, isChord: false },
        { midis: [lo(voicing)],  beats: 0.5, isChord: false },
        { midis: [hi(voicing)],  beats: 0.5, isChord: false },
        { midis: [lo(voicing)],  beats: 0.5, isChord: false },
        { midis: [hi(voicing)],  beats: 0.5, isChord: false },
        { midis: [lo(voicing)],  beats: 0.5, isChord: false },
        { midis: voicing,        beats: 0.5, isChord: true  },
      ]

    // ── Don't Stop Believin' — Journey ───────────────────────────
    // Deep bass pickup → ascending arpeggio to the peak → descend back
    // → bass again → chord close. The ascending shape mirrors the
    // famous opening piano run.
    case 'dont-stop':
      return [
        { midis: [bass(bassRootMidi)], beats: 0.5, isChord: false },
        { midis: [lo(voicing)],        beats: 0.5, isChord: false },
        { midis: [mid(voicing)],       beats: 0.5, isChord: false },
        { midis: [hi(voicing)],        beats: 0.5, isChord: false },
        { midis: [mid(voicing)],       beats: 0.5, isChord: false },
        { midis: [lo(voicing)],        beats: 0.5, isChord: false },
        { midis: [bass(bassRootMidi)], beats: 0.5, isChord: false },
        { midis: voicing,              beats: 0.5, isChord: true  },
      ]

    // ── Your Song — Elton John ───────────────────────────────────
    // Flowing ballad arpeggio: bass quarter-note anchor → lo/hi pairs
    // trading on eighth notes → gentle low ending. Warm and lyrical.
    case 'your-song':
      return [
        { midis: [bass(bassRootMidi)], beats: 1,   isChord: false }, // beat 1
        { midis: [lo(voicing)],        beats: 0.5, isChord: false }, // and-1
        { midis: [hi(voicing)],        beats: 0.5, isChord: false }, // beat 2
        { midis: [lo(voicing)],        beats: 0.5, isChord: false }, // and-2
        { midis: [hi(voicing)],        beats: 0.5, isChord: false }, // beat 3
        { midis: [lo(voicing)],        beats: 0.5, isChord: false }, // and-3
        { midis: voicing,              beats: 0.5, isChord: true  }, // beat 4
      ]

    // ── Imagine — John Lennon ────────────────────────────────────
    // Sparse and meditative — no deep bass. Long chord sustain creates
    // space, then a gentle lo → mid → hi figure rolls into a chord hit.
    // Very slow and intentional. Best at 55–70 BPM.
    case 'imagine':
      return [
        { midis: voicing,        beats: 2,   isChord: true  }, // breathe
        { midis: [lo(voicing)],  beats: 0.5, isChord: false }, // gentle roll
        { midis: [mid(voicing)], beats: 0.5, isChord: false },
        { midis: [hi(voicing)],  beats: 0.5, isChord: false },
        { midis: voicing,        beats: 0.5, isChord: true  }, // arrive
      ]

    // ── River Flows In You — Yiruma ──────────────────────────────
    // Pure melodic arpeggio — no bass. lo → mid → hi → hi → mid → lo
    // mirrors the lyrical right-hand melody of the original. The note
    // sustain overlap creates the signature piano wash.
    case 'river':
      return [
        { midis: [lo(voicing)],  beats: 0.5, isChord: false },
        { midis: [mid(voicing)], beats: 0.5, isChord: false },
        { midis: [hi(voicing)],  beats: 0.5, isChord: false },
        { midis: [hi(voicing)],  beats: 0.5, isChord: false },
        { midis: [mid(voicing)], beats: 0.5, isChord: false },
        { midis: [lo(voicing)],  beats: 0.5, isChord: false },
        { midis: [mid(voicing)], beats: 0.5, isChord: false },
        { midis: voicing,        beats: 0.5, isChord: true  },
      ]

    // ── Block Chord (default) ─────────────────────────────────────
    case 'block':
    default:
      return [{ midis: voicing, beats: 4, isChord: true }]
  }
}
