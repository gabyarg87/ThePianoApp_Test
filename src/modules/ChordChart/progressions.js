// Chord progressions.
// degrees: indices into the current scale's `degrees` array (0 = tonic).
// These map correctly regardless of key or scale selected.
//
// Degree index → scale degree
//   0 = I   1 = ii   2 = iii   3 = IV   4 = V   5 = vi   6 = vii°

export const PROGRESSIONS = [
  // ── Primary (always visible) ─────────────────────────────────────────────────
  {
    id: 'pop',
    group: 'primary',
    name: 'Pop',
    roman: 'I – V – vi – IV',
    degrees: [0, 4, 5, 3],
  },
  {
    id: 'fifties',
    group: 'primary',
    name: '50s',
    roman: 'I – vi – IV – V',
    degrees: [0, 5, 3, 4],
  },
  {
    id: 'classic',
    group: 'primary',
    name: 'Classical',
    roman: 'I – IV – V',
    degrees: [0, 3, 4],
  },
  {
    id: 'blues',
    group: 'primary',
    name: 'Blues',
    roman: 'I – IV – I – V – IV',
    degrees: [0, 3, 0, 4, 3],
  },

  // ── Pop / Rock ───────────────────────────────────────────────────────────────
  {
    id: 'popvar',
    group: 'other',
    name: 'Pop Var.',
    roman: 'I – iii – IV – V',
    degrees: [0, 2, 3, 4],
  },
  {
    id: 'emotional',
    group: 'other',
    name: 'Emotional',
    roman: 'I – iii – vi – IV',
    degrees: [0, 2, 5, 3],
  },
  {
    id: 'sensitive',
    group: 'other',
    name: 'Sensitive',
    roman: 'IV – I – V – vi',
    degrees: [3, 0, 4, 5],
  },
  {
    id: 'axis',
    group: 'other',
    name: 'Axis',
    roman: 'vi – IV – I – V',
    degrees: [5, 3, 0, 4],
  },

  // ── Classic / Oldies ─────────────────────────────────────────────────────────
  {
    id: 'doowop',
    group: 'other',
    name: 'Doo-Wop',
    roman: 'I – vi – ii – V',
    degrees: [0, 5, 1, 4],
  },
  {
    id: 'canon',
    group: 'other',
    name: 'Canon',
    roman: 'I – V – vi – iii – IV',
    degrees: [0, 4, 5, 2, 3],
  },

  // ── Ballad / Cinematic ───────────────────────────────────────────────────────
  {
    id: 'ballad',
    group: 'other',
    name: 'Ballad',
    roman: 'I – IV – vi – V',
    degrees: [0, 3, 5, 4],
  },
  {
    id: 'descending',
    group: 'other',
    name: 'Descending',
    roman: 'I – vii° – vi – V',
    degrees: [0, 6, 5, 4],
  },
  {
    id: 'minorfeel',
    group: 'other',
    name: 'Minor Feel',
    roman: 'vi – IV – I – V',
    degrees: [5, 3, 0, 4],
  },
  {
    id: 'sadpop',
    group: 'other',
    name: 'Sad Pop',
    roman: 'vi – V – IV – V',
    degrees: [5, 4, 3, 4],
  },

  // ── Jazz ─────────────────────────────────────────────────────────────────────
  {
    id: 'jazz',
    group: 'other',
    name: 'Jazz ii–V–I',
    roman: 'ii – V – I',
    degrees: [1, 4, 0],
  },
  {
    id: 'jazzturnaround',
    group: 'other',
    name: 'Jazz Turn.',
    roman: 'I – vi – ii – V',
    degrees: [0, 5, 1, 4],
  },
  {
    id: 'jazzturn2',
    group: 'other',
    name: 'Jazz ii–V–I–vi',
    roman: 'ii – V – I – vi',
    degrees: [1, 4, 0, 5],
  },
  {
    id: 'circleoffourths',
    group: 'other',
    name: 'Circle 4ths',
    roman: 'I – IV – vii° – iii – vi – ii – V',
    degrees: [0, 3, 6, 2, 5, 1, 4],
  },

  // ── Soul / R&B / Funk ────────────────────────────────────────────────────────
  {
    id: 'soul',
    group: 'other',
    name: 'Soul / R&B',
    roman: 'I – ii – IV – V',
    degrees: [0, 1, 3, 4],
  },
  {
    id: 'montgomery',
    group: 'other',
    name: 'Montgomery',
    roman: 'I – IV – ii – V',
    degrees: [0, 3, 1, 4],
  },

  // ── Anime / J-Pop ────────────────────────────────────────────────────────────
  {
    id: 'anime',
    group: 'other',
    name: 'Anime',
    roman: 'IV – V – iii – vi',
    degrees: [3, 4, 2, 5],
  },
  {
    id: 'animeb',
    group: 'other',
    name: 'Anime B',
    roman: 'I – V – vi – iii',
    degrees: [0, 4, 5, 2],
  },
]
