// Chord definitions: intervals in semitones from the root
// quality drives the accent color: 'major' = blue, 'minor' = red, 'other' = yellow
export const CHORD_TYPES = [
  { id: 'maj',    name: 'Major',          short: '',     intervals: [0, 4, 7],      quality: 'major' },
  { id: 'min',    name: 'Minor',          short: 'm',    intervals: [0, 3, 7],      quality: 'minor' },
  { id: 'dim',    name: 'Diminished',     short: 'dim',  intervals: [0, 3, 6],      quality: 'other' },
  { id: 'aug',    name: 'Augmented',      short: 'aug',  intervals: [0, 4, 8],      quality: 'other' },
  { id: 'sus2',   name: 'Suspended 2nd',  short: 'sus2', intervals: [0, 2, 7],      quality: 'other' },
  { id: 'sus4',   name: 'Suspended 4th',  short: 'sus4', intervals: [0, 5, 7],      quality: 'other' },
  { id: 'maj7',   name: 'Major 7th',      short: 'maj7', intervals: [0, 4, 7, 11],  quality: 'major' },
  { id: 'min7',   name: 'Minor 7th',      short: 'm7',   intervals: [0, 3, 7, 10],  quality: 'minor' },
  { id: 'dom7',   name: 'Dominant 7th',   short: '7',    intervals: [0, 4, 7, 10],  quality: 'other' },
  { id: 'dim7',   name: 'Diminished 7th', short: 'dim7', intervals: [0, 3, 6, 9],   quality: 'other' },
  { id: 'm7b5',   name: 'Half-Diminished',short: 'm7♭5', intervals: [0, 3, 6, 10],  quality: 'other' },
  { id: 'add9',   name: 'Add 9',          short: 'add9', intervals: [0, 4, 7, 14],  quality: 'major' },
]

export const ROOTS = [
  { id: 'C',  name: 'C',  pc: 0  },
  { id: 'Db', name: 'D♭', pc: 1  },
  { id: 'D',  name: 'D',  pc: 2  },
  { id: 'Eb', name: 'E♭', pc: 3  },
  { id: 'E',  name: 'E',  pc: 4  },
  { id: 'F',  name: 'F',  pc: 5  },
  { id: 'Gb', name: 'G♭', pc: 6  },
  { id: 'G',  name: 'G',  pc: 7  },
  { id: 'Ab', name: 'A♭', pc: 8  },
  { id: 'A',  name: 'A',  pc: 9  },
  { id: 'Bb', name: 'B♭', pc: 10 },
  { id: 'B',  name: 'B',  pc: 11 },
]

const NOTE_NAMES_SHARP = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']
const NOTE_NAMES_FLAT  = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B']

export function chordNotes(rootPc, intervals, preferFlats = false) {
  const names = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP
  return intervals.map(i => ({
    pc: (rootPc + i) % 12,
    midi: rootPc + i, // from root, 0..24ish
    name: names[(rootPc + i) % 12],
  }))
}

export function chordLabel(rootName, short) {
  return `${rootName}${short}`
}
