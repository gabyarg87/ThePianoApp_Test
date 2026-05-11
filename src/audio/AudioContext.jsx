import { createContext, useCallback, useContext, useRef } from 'react'
import { usePiano } from './usePiano.js'
import { useMidiInput } from './useMidiInput.js'

const AudioCtx = createContext(null)

export function AudioProvider({ children }) {
  const piano = usePiano()

  // Modules register note callbacks here for visual feedback (audio is handled centrally)
  const noteOnHandlers  = useRef(new Set())
  const noteOffHandlers = useRef(new Set())

  const registerMidiCallbacks = useCallback(({ onNoteOn, onNoteOff } = {}) => {
    if (onNoteOn)  noteOnHandlers.current.add(onNoteOn)
    if (onNoteOff) noteOffHandlers.current.add(onNoteOff)
    return () => {
      if (onNoteOn)  noteOnHandlers.current.delete(onNoteOn)
      if (onNoteOff) noteOffHandlers.current.delete(onNoteOff)
    }
  }, [])

  const midiIn = useMidiInput({
    onNoteOn: (midi, vel, ch) => {
      piano.playNoteHeld(midi, vel)
      noteOnHandlers.current.forEach(h => h(midi, vel, ch))
    },
    onNoteOff: (midi, ch) => {
      piano.stopNote(midi)
      noteOffHandlers.current.forEach(h => h(midi, ch))
    },
  })

  return (
    <AudioCtx.Provider value={{ ...piano, ...midiIn, registerMidiCallbacks }}>
      {children}
    </AudioCtx.Provider>
  )
}

export const useAudio = () => useContext(AudioCtx)
