import { useCallback, useEffect, useRef, useState } from 'react'

export function useMidiInput({ onNoteOn, onNoteOff, onControlChange } = {}) {
  const [supported,  setSupported]  = useState(null)   // null=unchecked, true, false
  const [inputs,     setInputs]     = useState([])     // [{ id, name }]
  const [activeId,   setActiveId]   = useState(null)
  const [error,      setError]      = useState(null)

  const accessRef = useRef(null)
  const cbRef     = useRef({})

  // Keep callbacks fresh without re-wiring the handler
  useEffect(() => { cbRef.current = { onNoteOn, onNoteOff, onControlChange } })

  const handleMessage = useCallback((e) => {
    const [status, data1, data2 = 0] = e.data
    const type = status & 0xf0
    const ch   = status & 0x0f
    if (type === 0x90 && data2 > 0) {
      cbRef.current.onNoteOn?.(data1, data2, ch)
    } else if (type === 0x80 || (type === 0x90 && data2 === 0)) {
      cbRef.current.onNoteOff?.(data1, ch)
    } else if (type === 0xb0) {
      cbRef.current.onControlChange?.(data1, data2, ch)
    }
  }, [])

  const refreshInputs = useCallback((access) => {
    const list = []
    access.inputs.forEach(inp => list.push({ id: inp.id, name: inp.name }))
    setInputs(list)
    return list
  }, [])

  const connect = useCallback(async () => {
    if (!navigator.requestMIDIAccess) {
      setSupported(false)
      setError('Web MIDI API is not supported in this browser.')
      return
    }
    try {
      const access = await navigator.requestMIDIAccess()
      accessRef.current = access
      setSupported(true)
      setError(null)

      const list = refreshInputs(access)

      access.onstatechange = () => {
        const newList = refreshInputs(access)
        // If currently selected device disconnected, clear selection
        setActiveId(prev => (prev && !newList.find(i => i.id === prev)) ? null : prev)
      }

      // Auto-select single device
      if (list.length === 1) setActiveId(list[0].id)
    } catch (err) {
      setSupported(true)   // API exists but permission denied
      setError('MIDI access denied. Check browser permissions.')
    }
  }, [refreshInputs])

  // Wire/unwire message listener when active device changes
  useEffect(() => {
    const access = accessRef.current
    if (!access) return
    access.inputs.forEach(inp => { inp.onmidimessage = null })
    if (activeId) {
      const inp = access.inputs.get(activeId)
      if (inp) inp.onmidimessage = handleMessage
    }
  }, [activeId, handleMessage])

  // Cleanup on unmount
  useEffect(() => () => {
    accessRef.current?.inputs.forEach(inp => { inp.onmidimessage = null })
  }, [])

  return { supported, inputs, activeId, setActiveId, error, connect }
}
