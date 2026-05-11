import { useEffect, useRef, useState, useCallback } from 'react'
import { SplendidGrandPiano } from 'smplr'

// ── Audio effects chain ────────────────────────────────────────────────────────
//
// Generates a synthetic reverb impulse response: exponential white-noise decay
// that approximates the acoustic signature of a small concert hall.
function buildReverbIR(ctx, { duration = 2.2, decay = 2.5 } = {}) {
  const len = Math.floor(ctx.sampleRate * duration)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
    }
  }
  return buf
}

// Wires the effects chain.
// Signal flow:
//   piano → input ──┬── EQ ──── dryGain ──────────────┐
//                   └── EQ ── convolver ── wetGain ──── master → ctx.destination
//
// Returns all controllable nodes so callers can adjust them live.
function buildEffectsChain(ctx, {
  reverbAmt   = 0.22,
  reverbDecay = 2.5,
  eqGain      = 2.0,
  eqFreq      = 3500,
} = {}) {
  const master = ctx.createGain()
  master.gain.value = 0.88
  master.connect(ctx.destination)

  // High-shelf EQ for presence / air
  const eq = ctx.createBiquadFilter()
  eq.type           = 'highshelf'
  eq.frequency.value = eqFreq
  eq.gain.value      = eqGain

  // Reverb — convolution with synthetic IR
  const convolver = ctx.createConvolver()
  convolver.buffer = buildReverbIR(ctx, { duration: reverbDecay * 0.9, decay: reverbDecay })

  // Dry path
  const dryGain = ctx.createGain()
  dryGain.gain.value = 0.78
  eq.connect(dryGain)
  dryGain.connect(master)

  // Wet path
  const wetGain = ctx.createGain()
  wetGain.gain.value = reverbAmt
  eq.connect(convolver)
  convolver.connect(wetGain)
  wetGain.connect(master)

  // Input node
  const input = ctx.createGain()
  input.connect(eq)

  return { input, master, eq, wetGain, convolver }
}

// ── usePiano hook ──────────────────────────────────────────────────────────────
export function usePiano() {
  const ctxRef       = useRef(null)
  const pianoRef     = useRef(null)
  const masterRef    = useRef(null)
  const eqRef        = useRef(null)
  const wetGainRef   = useRef(null)
  const convolverRef = useRef(null)
  const loadingRef   = useRef(null)

  // Pending values — applied immediately if loaded, remembered for pre-load calls
  const pendingVolRef     = useRef(0.88)
  const pendingReverbRef  = useRef(0.22)
  const pendingDecayRef   = useRef(2.5)
  const pendingEqGainRef  = useRef(2.0)
  const pendingEqFreqRef  = useRef(3500)

  const [ready,   setReady]   = useState(false)
  const [loading, setLoading] = useState(false)

  const ensureLoaded = useCallback(async () => {
    if (pianoRef.current) return pianoRef.current
    if (loadingRef.current) return loadingRef.current

    const promise = (async () => {
      setLoading(true)
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const ctx = new AudioCtx()
      if (ctx.state === 'suspended') await ctx.resume()
      ctxRef.current = ctx

      const { input: destination, master, eq, wetGain, convolver } = buildEffectsChain(ctx, {
        reverbAmt:   pendingReverbRef.current,
        reverbDecay: pendingDecayRef.current,
        eqGain:      pendingEqGainRef.current,
        eqFreq:      pendingEqFreqRef.current,
      })
      masterRef.current    = master
      eqRef.current        = eq
      wetGainRef.current   = wetGain
      convolverRef.current = convolver
      master.gain.value    = pendingVolRef.current

      const piano = new SplendidGrandPiano(ctx, {
        destination,
        decayTime: 0.8,
      })
      await piano.load
      pianoRef.current = piano
      setReady(true)
      setLoading(false)
      return piano
    })()
    loadingRef.current = promise
    return promise
  }, [])

  // ── Live parameter setters ────────────────────────────────────────────────

  const setVolume = useCallback((v) => {
    const c = Math.max(0, Math.min(1, v))
    pendingVolRef.current = c
    if (masterRef.current) masterRef.current.gain.value = c
  }, [])

  // reverbAmt: 0–1  (maps directly to wetGain)
  const setReverbAmount = useCallback((v) => {
    const c = Math.max(0, Math.min(1, v))
    pendingReverbRef.current = c
    if (wetGainRef.current) wetGainRef.current.gain.value = c
  }, [])

  // reverbDecay: 0.5–6  (rebuilds IR — fast, no audible glitch)
  const setReverbDecay = useCallback((v) => {
    const c = Math.max(0.5, Math.min(6, v))
    pendingDecayRef.current = c
    if (convolverRef.current && ctxRef.current) {
      convolverRef.current.buffer = buildReverbIR(ctxRef.current, {
        duration: c * 0.9,
        decay:    c,
      })
    }
  }, [])

  // eqGain: –12 to +12 dB  (highshelf presence/air)
  const setEqGain = useCallback((db) => {
    const c = Math.max(-12, Math.min(12, db))
    pendingEqGainRef.current = c
    if (eqRef.current) eqRef.current.gain.value = c
  }, [])

  // eqFreq: 500–12000 Hz  (highshelf corner frequency)
  const setEqFreq = useCallback((hz) => {
    const c = Math.max(500, Math.min(12000, hz))
    pendingEqFreqRef.current = c
    if (eqRef.current) eqRef.current.frequency.value = c
  }, [])

  // ── Note playback ─────────────────────────────────────────────────────────

  const playNote = useCallback(async (midi, { duration = 1.2, velocity = 80 } = {}) => {
    const piano = await ensureLoaded()
    const ctx = ctxRef.current
    if (ctx.state === 'suspended') await ctx.resume()
    piano.start({ note: midi, time: ctx.currentTime, duration, velocity })
  }, [ensureLoaded])

  // For real-time MIDI input — hold until stopNote is called
  const playNoteHeld = useCallback(async (midi, velocity = 80) => {
    const piano = await ensureLoaded()
    const ctx = ctxRef.current
    if (ctx.state === 'suspended') await ctx.resume()
    piano.start({ note: midi, time: ctx.currentTime, duration: 30, velocity })
  }, [ensureLoaded])

  const stopNote = useCallback((midi) => {
    if (pianoRef.current) pianoRef.current.stop(midi)
  }, [])

  const playChord = useCallback(async (midiNotes, { duration = 1.6, strum = 0, velocity = 75, humanize = 0 } = {}) => {
    const piano = await ensureLoaded()
    const ctx = ctxRef.current
    if (ctx.state === 'suspended') await ctx.resume()
    const now = ctx.currentTime
    midiNotes.forEach((midi, i) => {
      const v = humanize > 0
        ? Math.max(20, Math.min(127, Math.round(velocity + (Math.random() * 2 - 1) * humanize)))
        : velocity
      piano.start({ note: midi, time: now + i * strum, duration, velocity: v })
    })
  }, [ensureLoaded])

  const stopAll = useCallback(() => {
    if (pianoRef.current) pianoRef.current.stop()
  }, [])

  useEffect(() => () => { stopAll() }, [stopAll])

  return {
    playChord, playNote, playNoteHeld, stopNote, stopAll, ensureLoaded,
    setVolume, setReverbAmount, setReverbDecay, setEqGain, setEqFreq,
    ready, loading,
  }
}
