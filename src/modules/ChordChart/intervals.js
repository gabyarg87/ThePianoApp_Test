// Map interval (semitones from root, can exceed 12) to a role id and short label.
// Roles drive both the color palette and UI labels.
export function intervalRole(semi) {
  const s = ((semi % 12) + 12) % 12
  switch (s) {
    case 0:  return { role: 'root',  label: 'R' }
    case 1:  return { role: 'second',label: '♭2' }
    case 2:  return { role: 'second',label: semi >= 12 ? '9' : '2' }
    case 3:  return { role: 'third', label: '♭3' }
    case 4:  return { role: 'third', label: '3' }
    case 5:  return { role: 'fourth',label: '4' }
    case 6:  return { role: 'fifth', label: '♭5' }
    case 7:  return { role: 'fifth', label: '5' }
    case 8:  return { role: 'fifth', label: '♯5' }
    case 9:  return { role: 'sixth', label: '6' }
    case 10: return { role: 'seventh', label: '♭7' }
    case 11: return { role: 'seventh', label: '7' }
  }
}

// Display order for badges/chips (keeps R first, then scale order).
export const ROLE_ORDER = ['root', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh']

export const ROLE_NAMES = {
  root:    'Root',
  second:  '2nd / 9th',
  third:   '3rd',
  fourth:  '4th',
  fifth:   '5th',
  sixth:   '6th',
  seventh: '7th',
}
