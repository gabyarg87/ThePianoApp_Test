// Synthesia-style falling notes — GPU-accelerated with PixiJS v7
import { useEffect, useRef, useMemo } from 'react'
import * as PIXI from 'pixi.js'

// ── constants ─────────────────────────────────────────────────────────────────
const NOTE_LABELS = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']

const COLOR_SCHEMES = {
  spectrum: ['#ff6b6b','#c93030','#ff9f43','#c97520','#ffd93d','#6bcb77','#2e8b3a','#4ecdc4','#1a8f86','#4d96ff','#1a5fc8','#c77dff'],
  neon:     ['#ff3366','#ff0033','#ff9900','#ff6600','#ffff00','#33ff66','#00cc44','#00ffee','#00ddcc','#3399ff','#0066ff','#cc44ff'],
  pastel:   ['#ffb3c1','#f4a0a0','#ffd8b1','#f8c080','#fff5b1','#c3f0c8','#a8d8a8','#c0eeeb','#9de0dc','#c0d8ff','#a0c0f0','#ddb8ff'],
  ice:      ['#60e0ff','#40b8e8','#80d0ff','#50c0f0','#a0e8ff','#20b8e0','#0090c0','#00d8f8','#00b0d0','#4080ff','#2060e0','#8090ff'],
  rh:       ['#ffe100','#ffe100','#ffe100','#ffe100','#ffe100','#ffe100','#ffe100','#ffe100','#ffe100','#ffe100','#ffe100','#ffe100'],
  lh:       ['#00d0ff','#00d0ff','#00d0ff','#00d0ff','#00d0ff','#00d0ff','#00d0ff','#00d0ff','#00d0ff','#00d0ff','#00d0ff','#00d0ff'],
}

const WHITE_PATTERN = [0, 2, 4, 5, 7, 9, 11]
const BLACK_PATTERN = [1, 3, 6, 8, 10]
const BLACK_OFFSETS = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 }

const HIT_FRAC   = 1.0
const FLASH_LIFE = 0.22
const PART_LIFE  = 0.50
const MAX_PARTS  = 400

// ── piano layout ──────────────────────────────────────────────────────────────
function buildLayout(baseMidi, numOctaves, W) {
  const whiteCount = numOctaves * 7
  const ww = W / whiteCount
  const bw = ww * 0.64
  const layout = {}
  for (let o = 0; o < numOctaves; o++) {
    WHITE_PATTERN.forEach((s, idx) => {
      const midi = baseMidi + o * 12 + s
      layout[midi] = { x: (o * 7 + idx) * ww, w: ww, isBlack: false }
    })
    BLACK_PATTERN.forEach(s => {
      const midi = baseMidi + o * 12 + s
      const left = ((o * 7 + BLACK_OFFSETS[s] + 1) / whiteCount) * W
      layout[midi] = { x: left - bw / 2, w: bw, isBlack: true }
    })
  }
  return { layout, ww, whiteCount }
}

// ── dot texture for particles ─────────────────────────────────────────────────
let _dotTex = null
function getDotTex() {
  if (_dotTex) return _dotTex
  const c = document.createElement('canvas')
  c.width = 16; c.height = 16
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(8, 8, 0.5, 8, 8, 8)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 16, 16)
  _dotTex = PIXI.Texture.from(c)
  return _dotTex
}


// hex string (#rrggbb) → PIXI integer color
function h2n(hex) { return parseInt(hex.replace('#', ''), 16) }

// HSL → PIXI integer color  (h: 0-360, s/l: 0-1)
function hslNum(h, s, l) {
  const a = s * Math.min(l, 1 - l)
  const f = n => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
  }
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255)
}

// Blend a PIXI integer color toward white by factor 0–1
function lighten(colorN, f) {
  const r = (colorN >> 16) & 0xff
  const g = (colorN >>  8) & 0xff
  const b =  colorN        & 0xff
  return ((r + Math.round((255 - r) * f)) << 16) |
         ((g + Math.round((255 - g) * f)) <<  8) |
          (b + Math.round((255 - b) * f))
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PianoRoll({
  midi,
  selectedTracks,
  origBpm,
  userBpm,
  startMeasure,
  endMeasure,
  isPlaying,
  playStartRef,
  baseMidi   = 48,
  numOctaves = 3,
  opts       = {},
}) {
  const wrapRef = useRef(null)

  const isPlayingRef = useRef(isPlaying)
  const origBpmRef   = useRef(origBpm)
  const userBpmRef   = useRef(userBpm)
  const baseMidiRef  = useRef(baseMidi)
  const numOctRef    = useRef(numOctaves)
  const optsRef      = useRef(opts)
  const notesRef     = useRef([])

  useEffect(() => { isPlayingRef.current = isPlaying  }, [isPlaying])
  useEffect(() => { origBpmRef.current   = origBpm    }, [origBpm])
  useEffect(() => { userBpmRef.current   = userBpm    }, [userBpm])
  useEffect(() => { baseMidiRef.current  = baseMidi   }, [baseMidi])
  useEffect(() => { numOctRef.current    = numOctaves }, [numOctaves])
  useEffect(() => { optsRef.current      = opts       }, [opts])

  const effectsRef      = useRef({ triggered: new Set(), flashes: [] })
  const hitLineColorRef = useRef(null)
  const drawStaticsRef  = useRef(null)
  const noteBoostMap    = useRef(new Map()) // noteKey → boost (surges on hit, decays to 1.0)
  const noteShakeMap    = useRef(new Map()) // noteKey → shake amplitude (surges on hit, decays to 0)
  const prevElapsedRef  = useRef(0)

  useEffect(() => {
    effectsRef.current.triggered.clear()
    effectsRef.current.flashes = []
  }, [isPlaying])

  // ── note preprocessing ────────────────────────────────────────────────────
  const notes = useMemo(() => {
    if (!midi) return []
    const timeSig  = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]
    const barSec   = timeSig[0] * (60 / origBpm)
    const winStart = startMeasure * barSec
    const winEnd   = endMeasure   * barSec
    const selSet   = new Set(selectedTracks)
    const out      = []
    midi.tracks.forEach((track, i) => {
      if (!selSet.has(i)) return
      track.notes.forEach(note => {
        const nEnd = note.time + note.duration
        if (note.time < winStart || note.time >= winEnd) return
        out.push({
          midi:     note.midi,
          onSec:    note.time - winStart,
          offSec:   Math.min(nEnd, winEnd) - winStart,
          trackIdx: i,
        })
      })
    })
    return out
  }, [midi, selectedTracks, origBpm, startMeasure, endMeasure])

  useEffect(() => {
    notesRef.current = notes
    effectsRef.current.triggered.clear()
  }, [notes])

  useEffect(() => { drawStaticsRef.current?.() }, [baseMidi, numOctaves])  // eslint-disable-line

  // ── PixiJS application ────────────────────────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const app = new PIXI.Application({
      resizeTo:    wrap,
      background:  0x000000,
      antialias:   true,
      resolution:  Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    })
    Object.assign(app.view.style, {
      position: 'absolute', top: '0', left: '0',
      width: '100%', height: '100%', display: 'block',
    })
    wrap.appendChild(app.view)

    // ── scene layers (bottom → top) ────────────────────────────────────────
    // bgGfx        — static background columns + dividers
    // flashGfx     — one-shot column flashes on note hit
    // trailGfx     — motion trail ghosts above each falling note  (ADD blend)
    // outerGlowGfx — wide soft bloom aura                         (BlurFilter 28, ADD)
    // innerGlowGfx — tight bright halo + twinkle crosses          (BlurFilter 5,  ADD)
    // noteBodyGfx  — rounded-rect note bodies + simulated gradient (normal blend)
    // noteShineGfx — center vertical shine per note               (BlurFilter 4,  ADD)
    // borderGfx    — twinkle outline / wave edges                  (normal blend)
    // rimGfx       — top/side/bottom rim highlights                (normal blend)
    // lblCt        — optional note-name labels
    // partCt       — spark particles (ParticleContainer)
    // hitGfx       — animated trigger line
    // octaveCt     — C-octave text labels (static)

    const bgGfx    = new PIXI.Graphics()
    const flashGfx = new PIXI.Graphics()

    const trailGfx = new PIXI.Graphics()
    trailGfx.blendMode = PIXI.BLEND_MODES.ADD

    const outerGlowGfx = new PIXI.Graphics()
    outerGlowGfx.filters   = [new PIXI.BlurFilter(42, 4)]   // wider spread for neon bloom
    outerGlowGfx.blendMode = PIXI.BLEND_MODES.ADD

    const innerGlowGfx = new PIXI.Graphics()
    innerGlowGfx.filters   = [new PIXI.BlurFilter(8, 3)]    // tighter but stronger halo
    innerGlowGfx.blendMode = PIXI.BLEND_MODES.ADD

    const noteBodyGfx = new PIXI.Graphics()

    const noteShineGfx = new PIXI.Graphics()
    noteShineGfx.filters   = [new PIXI.BlurFilter(4, 2)]
    noteShineGfx.blendMode = PIXI.BLEND_MODES.ADD

    const borderGfx = new PIXI.Graphics()
    const rimGfx    = new PIXI.Graphics()


    // Label pool
    const lblPool = []
    let   lblN    = 0
    const lblCt   = new PIXI.Container()

    function borrowLbl(text, size, fill) {
      let t
      if (lblN < lblPool.length) {
        t = lblPool[lblN]; t.visible = true
      } else {
        t = new PIXI.Text('', new PIXI.TextStyle({
          fontWeight: '800', fontFamily: 'system-ui,sans-serif',
          stroke: 0x000000, strokeThickness: 3,
        }))
        lblPool.push(t); lblCt.addChild(t)
      }
      t.text = text; t.style.fontSize = size; t.style.fill = fill
      t.style.strokeThickness = 3
      lblN++; return t
    }

    // Particles — pre-allocated ring buffer
    const partCt = new PIXI.ParticleContainer(MAX_PARTS, {
      position: true, tint: true, alpha: true, scale: true,
    })
    const partSprites = []
    const partData    = []
    for (let i = 0; i < MAX_PARTS; i++) {
      const s = new PIXI.Sprite(getDotTex())
      s.anchor.set(0.5); s.alpha = 0
      partCt.addChild(s)
      partSprites.push(s)
      partData.push({ alive: false, vx: 0, vy: 0, born: 0 })
    }
    let partNext = 0

    const hitGfx   = new PIXI.Graphics()
    const octaveCt = new PIXI.Container()

    app.stage.addChild(
      bgGfx, flashGfx,
      trailGfx, outerGlowGfx, innerGlowGfx,
      noteBodyGfx, noteShineGfx,
      borderGfx, rimGfx,
      lblCt, partCt, hitGfx, octaveCt,
    )


    // ── particle spawner ──────────────────────────────────────────────────
    function spawnParticles(x, y, colorN, count, elapsed) {
      for (let p = 0; p < count; p++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5
        const spd   = 45 + Math.random() * 140
        const i     = partNext % MAX_PARTS
        partNext++
        partData[i].alive = true
        partData[i].vx    = Math.cos(angle) * spd
        partData[i].vy    = Math.sin(angle) * spd
        partData[i].born  = elapsed
        const s = partSprites[i]
        s.x = x; s.y = y
        s.tint = colorN; s.alpha = 1
        s.scale.set(0.5 + Math.random() * 0.6)
      }
    }

    // ── static background (columns + dividers) ─────────────────────────────
    function drawStatics() {
      const W    = app.screen.width
      const H    = app.screen.height
      const hitY = H * HIT_FRAC
      const { layout, ww, whiteCount } = buildLayout(
        baseMidiRef.current, numOctRef.current, W
      )

      bgGfx.clear()
      bgGfx.beginFill(0x000000).drawRect(0, 0, W, H).endFill()

      for (let o = 0; o < numOctRef.current; o++) {
        WHITE_PATTERN.forEach((s, idx) => {
          bgGfx.beginFill(0x080808)
            .drawRect((o * 7 + idx) * ww, 0, ww - 1, hitY).endFill()
        })
        BLACK_PATTERN.forEach(s => {
          const key = layout[baseMidiRef.current + o * 12 + s]
          if (key) bgGfx.beginFill(0x040404).drawRect(key.x, 0, key.w, hitY).endFill()
        })
      }

      bgGfx.lineStyle(1, 0x141414, 1)
      for (let i = 0; i <= whiteCount; i++) bgGfx.moveTo(i * ww, 0).lineTo(i * ww, hitY)

      bgGfx.lineStyle(1, 0x1e1e1e, 1)
      for (let o = 0; o <= numOctRef.current; o++) {
        const x = o * 7 * ww
        bgGfx.moveTo(x, 0).lineTo(x, hitY)
      }

      octaveCt.children.slice().forEach(c => c.destroy())
      octaveCt.removeChildren()
      for (let o = 0; o < numOctRef.current; o++) {
        const midi = baseMidiRef.current + o * 12
        const key  = layout[midi]
        if (!key) continue
        const oct = Math.floor(midi / 12) - 1
        const t   = new PIXI.Text(`C${oct}`, new PIXI.TextStyle({
          fontSize: 9, fontWeight: '600', fontFamily: 'system-ui,sans-serif', fill: 0x6496c8,
        }))
        t.alpha = 0.45; t.x = key.x + 2; t.y = hitY - 22
        octaveCt.addChild(t)
      }
    }

    drawStatics()
    drawStaticsRef.current = drawStatics
    app.renderer.on('resize', drawStatics)

    // ── per-frame render ──────────────────────────────────────────────────
    function renderFrame() {
      const W = app.screen.width
      const H = app.screen.height
      if (W < 4 || H < 4) return

      // Scale blur radii with canvas size so glow never overwhelms small screens
      outerGlowGfx.filters[0].blur = Math.min(42, W * 0.04)
      innerGlowGfx.filters[0].blur = Math.min(8,  W * 0.008)

      const elapsed = isPlayingRef.current
        ? (Date.now() - (playStartRef.current ?? Date.now())) / 1000
        : 0

      // Loop restart: elapsed crosses negative → zero; clear triggered so hit
      // effects fire again for the same notes in the new iteration.
      if (elapsed >= 0 && prevElapsedRef.current < 0) {
        effectsRef.current.triggered.clear()
        effectsRef.current.flashes = []
        noteBoostMap.current.clear()
        noteShakeMap.current.clear()
      }
      prevElapsedRef.current = elapsed

      const dt = Math.min(app.ticker.deltaMS / 1000, 0.05)

      const hitY           = H * HIT_FRAC
      const opts           = optsRef.current
      const colors         = opts.spectrumColors ?? COLOR_SCHEMES[opts.colorScheme] ?? COLOR_SCHEMES.spectrum
      const innerGlowBase = opts.innerGlow ?? opts.glowIntensity ?? 1
      const outerGlowBase = opts.outerGlow ?? opts.glowIntensity ?? 1

      const noteStyle      = opts.noteStyle ?? 'solid'
      const handMode       = opts.handMode      ?? 'both'
      const handSplit      = opts.handSplit      ?? 'pitch'
      const splitMidi      = opts.handSplitMidi  ?? 60
      const useHandColors  = opts.colorScheme === 'hands'
      const getNoteHand    = (note) =>
        handSplit === 'track'
          ? (note.trackIdx === 0 ? 'rh' : 'lh')
          : (note.midi >= splitMidi ? 'rh' : 'lh')
      const isLight        = opts.colorScheme === 'pastel'
      const lookAhead      = opts.lookAhead ?? 4.0
      const { layout }     = buildLayout(baseMidiRef.current, numOctRef.current, W)
      const speedMult      = (userBpmRef.current || origBpmRef.current) / (origBpmRef.current || 1)

      lblN = 0

      // ── column flashes ─────────────────────────────────────────────────
      flashGfx.clear()
      effectsRef.current.flashes = effectsRef.current.flashes.filter(f => {
        const age = elapsed - f.startSec
        if (age > FLASH_LIFE || age < 0) return false
        if (f.hand && handMode !== 'both') {
          if (handMode === 'left'  && f.hand !== 'lh') return false
          if (handMode === 'right' && f.hand !== 'rh') return false
        }
        if (opts.hitLineFlash !== false) {
          flashGfx.beginFill(h2n(f.color), (1 - age / FLASH_LIFE) * 0.28)
            .drawRect(f.x, 0, f.w, hitY).endFill()
        }
        return true
      })


      // ── reset per-frame layers ─────────────────────────────────────────
      trailGfx.clear()
      outerGlowGfx.clear()
      innerGlowGfx.clear()
      noteBodyGfx.clear()
      noteShineGfx.clear()
      borderGfx.clear()
      rimGfx.clear()

      // ── key glow — full-height lane tint for sounding notes ───────────
      if (opts.hitLineFlash !== false && opts.keyGlow !== false && (outerGlowBase > 0 || innerGlowBase > 0)) {
        notesRef.current.forEach(note => {
          const scaledOn  = note.onSec  / speedMult
          const scaledOff = note.offSec / speedMult
          if (scaledOn > elapsed || scaledOff <= elapsed) return
          const key = layout[note.midi]
          if (!key) return
          if (handMode === 'left'  && getNoteHand(note) !== 'lh') return
          if (handMode === 'right' && getNoteHand(note) !== 'rh') return
          const _pc    = ((note.midi % 12) + 12) % 12
          const _hand  = getNoteHand(note)
          const colorN = h2n(useHandColors
            ? (opts.handColors?.[_hand] ?? (_hand === 'rh' ? '#ffe100' : '#00d0ff'))
            : colors[_pc])
          if (outerGlowBase > 0) {
            outerGlowGfx.beginFill(colorN, Math.min(0.22 * outerGlowBase, 0.40))
              .drawRect(key.x,     0, key.w,     hitY).endFill()
          }
          if (innerGlowBase > 0) {
            innerGlowGfx.beginFill(colorN, Math.min(0.18 * innerGlowBase, 0.30))
              .drawRect(key.x + 1, 0, key.w - 2, hitY).endFill()
          }
        })
      }

      // ── notes: white keys first, black keys on top ─────────────────────
      ;[false, true].forEach(drawBlack => {
        notesRef.current.forEach(note => {
          const key = layout[note.midi]
          if (!key || key.isBlack !== drawBlack) return

          const scaledOn  = note.onSec  / speedMult
          const scaledOff = note.offSec / speedMult
          const yBottom = hitY - (scaledOn  - elapsed) / lookAhead * hitY
          const yTop    = hitY - (scaledOff - elapsed) / lookAhead * hitY

          if (yBottom < -40 || yTop > hitY + 4) return

          // ── hand filter ──────────────────────────────────────────────
          const noteHand = getNoteHand(note)
          if (handMode === 'left'  && noteHand !== 'lh') return
          if (handMode === 'right' && noteHand !== 'rh') return

          const cTop  = Math.max(-2, yTop)
          const cBot  = Math.min(hitY + 2, yBottom)
          const noteH = cBot - cTop
          if (noteH < 1) return

          const { x, w } = key
          const innerX    = x + 1
          const innerW    = w - 2
          const pc        = ((note.midi % 12) + 12) % 12
          const color     = useHandColors
            ? (opts.handColors?.[noteHand] ?? (noteHand === 'rh' ? '#ffe100' : '#00d0ff'))
            : colors[pc]
          const colorN    = h2n(color)
          const radius    = Math.min(innerW * 0.28, noteH * 0.4, 5)
          const bodyAlpha = 1.0

          // Proximity factor: notes near the hit line bloom brighter
          const prox = Math.max(0.25, 1 - Math.max(0, scaledOn - elapsed) / lookAhead)

          // ── per-note hit boost (decays independently) ────────────────
          const noteKey = `${note.midi}-${note.onSec}`
          let boost = noteBoostMap.current.get(noteKey) ?? 1.0
          if (boost > 1.0) {
            boost = Math.max(1.0, boost - dt * 4.5)
            if (boost <= 1.0) noteBoostMap.current.delete(noteKey)
            else              noteBoostMap.current.set(noteKey, boost)
          }
          const innerGlowLevel = innerGlowBase * boost
          const outerGlowLevel = outerGlowBase * boost

          // ── per-note shake (decays quickly after hit) ─────────────────
          let shakeAmp = noteShakeMap.current.get(noteKey) ?? 0
          if (shakeAmp > 0) {
            shakeAmp = Math.max(0, shakeAmp - dt * 28)
            if (shakeAmp <= 0) noteShakeMap.current.delete(noteKey)
            else               noteShakeMap.current.set(noteKey, shakeAmp)
          }
          const shakeX = shakeAmp > 0
            ? Math.sin(elapsed * 160 + note.midi * 2.3) * shakeAmp
            : 0

          // ── hit trigger: flash + sparks ─────────────────────────────
          if (
            elapsed > 0.001 &&
            !effectsRef.current.triggered.has(noteKey) &&
            scaledOn <= elapsed &&
            scaledOn > elapsed - 0.06
          ) {
            effectsRef.current.triggered.add(noteKey)
            if (opts.hitLineFlash !== false) {
              effectsRef.current.flashes.push({ color, x: key.x, w: key.w, startSec: elapsed, hand: noteHand })
            }
            hitLineColorRef.current = { colorN, time: elapsed }
            const hitBoostVal = opts.hitBoost ?? 3
            if (hitBoostVal > 0) {
              noteBoostMap.current.set(noteKey, 1 + hitBoostVal)  // 1→2, 2→3, 3→4, 4→5
            }
            const hitShakeVal = opts.hitShake ?? 2
            if (hitShakeVal > 0) {
              noteShakeMap.current.set(noteKey, hitShakeVal)  // 1→1px, 2→2px, 3→3px, 4→4px
            }
          }

          // ── motion trail — ghost layers fading above note ────────────
          const trailH = Math.min(noteH * 0.55, 30)
          if (trailH > 3 && outerGlowLevel > 0) {
            const steps = 4
            for (let ti = 0; ti < steps; ti++) {
              const frac   = (ti + 1) / steps
              const tAlpha = 0.13 * (1 - frac) * outerGlowLevel * prox
              const ty     = cTop - frac * trailH
              const th     = trailH / steps + 1
              trailGfx.beginFill(colorN, tAlpha)
                .drawRoundedRect(innerX + 1, ty, innerW - 2, th, radius * 0.4)
                .endFill()
            }
          }

          // ── outer + inner bloom halos ────────────────────────────────
          if (outerGlowLevel > 0) {
            const outerExp = outerGlowBase * 4   // fixed size — no prox scaling
            outerGlowGfx.beginFill(colorN, Math.min(0.38 * outerGlowLevel * prox, 0.80))
              .drawRect(innerX - outerExp + shakeX, cTop - outerExp * 0.5,
                        innerW + outerExp * 2, noteH + outerExp).endFill()
          }
          if (innerGlowLevel > 0) {
            // Base alpha lowered to 0.40 so the boost has visible headroom (was 0.85, near cap).
            // innerExp scales slightly with boost for a crisp tighter flash on hit.
            const innerExp = innerGlowBase * Math.min(boost, 2.5) * 0.8
            innerGlowGfx.beginFill(colorN, Math.min(0.40 * innerGlowLevel * prox, 1.00))
              .drawRect(innerX - innerExp + shakeX, cTop,
                        innerW + innerExp * 2, noteH).endFill()
          }

          // ── note body — fully solid rounded rect ─────────────────────
          noteBodyGfx.beginFill(colorN, bodyAlpha)
            .drawRoundedRect(innerX + shakeX, cTop, innerW, noteH, radius)
            .endFill()

          // ── border style (twinkle / wave) ────────────────────────────
          if (noteStyle !== 'solid' && noteH > 3) {
            const seed = note.midi * 0.7139

            if (noteStyle === 'twinkle') {
              const flicker = 0.25 + 0.75 * Math.abs(Math.sin(elapsed * 7.3 + seed))
              borderGfx.lineStyle(1, colorN, flicker)
                .drawRoundedRect(innerX - 0.5, cTop - 0.5, innerW + 1, noteH + 1, radius)

              const sparkPts = [
                [innerX,              cTop,              seed + 0.0],
                [innerX + innerW,     cTop,              seed + 1.1],
                [innerX + innerW / 2, cTop,              seed + 2.3],
                [innerX,              cTop + noteH / 2,  seed + 3.5],
                [innerX + innerW,     cTop + noteH / 2,  seed + 4.7],
                [innerX + innerW / 2, cBot,              seed + 5.9],
              ]
              sparkPts.forEach(([sx, sy, phase]) => {
                const p = Math.abs(Math.sin(elapsed * 9.1 + phase))
                if (p < 0.72) return
                const a = (p - 0.72) / 0.28
                const r = 2.5 + a * 1.5
                innerGlowGfx.lineStyle(1.5, 0xffffff, a * 0.95)
                innerGlowGfx.moveTo(sx - r, sy).lineTo(sx + r, sy)
                innerGlowGfx.moveTo(sx, sy - r).lineTo(sx, sy + r)
              })
            }

            if (noteStyle === 'wave') {
              const amp   = Math.min(innerW * 0.13, 4.0)
              const steps = Math.max(6, Math.floor(noteH / 7))
              const speed = 3.8
              const freq  = Math.PI * 2.4

              borderGfx.lineStyle(1.5, colorN, 0.85)
              borderGfx.moveTo(innerX + Math.sin(elapsed * speed) * amp, cTop)
              for (let st = 1; st <= steps; st++) {
                const t = st / steps
                borderGfx.lineTo(
                  innerX + Math.sin(t * freq + elapsed * speed) * amp,
                  cTop + noteH * t
                )
              }
              borderGfx.moveTo(innerX + innerW + Math.sin(elapsed * speed + Math.PI) * amp, cTop)
              for (let st = 1; st <= steps; st++) {
                const t = st / steps
                borderGfx.lineTo(
                  innerX + innerW + Math.sin(t * freq + elapsed * speed + Math.PI) * amp,
                  cTop + noteH * t
                )
              }
              borderGfx.lineStyle(1, colorN, 0.5)
              borderGfx.moveTo(innerX, cTop).lineTo(innerX + innerW, cTop)
            }
          }

          // ── rim highlights ────────────────────────────────────────────
          // Top bright rim — the strongest highlight, like a lit top edge
          const rimH = Math.min(3, noteH * 0.22)
          rimGfx.beginFill(0xffffff, 0.50)
            .drawRoundedRect(innerX + 1, cTop, innerW - 2, rimH, radius * 0.5)
            .endFill()
          // Left edge — subtle bright strip
          rimGfx.beginFill(0xffffff, 0.10)
            .drawRoundedRect(innerX, cTop + rimH, 1.5, noteH - rimH, radius * 0.3)
            .endFill()
          // Right edge — even subtler
          rimGfx.beginFill(0xffffff, 0.06)
            .drawRoundedRect(innerX + innerW - 1.5, cTop + rimH, 1.5, noteH - rimH, radius * 0.3)
            .endFill()
          // Bottom dark rim — shadow under the note
          if (noteH > 6) {
            rimGfx.beginFill(0x000000, 0.22)
              .drawRoundedRect(innerX + 1, cBot - 2, innerW - 2, 2, 1)
              .endFill()
          }

          // ── note label ───────────────────────────────────────────────
          if (opts.showNoteLabels && noteH > 14 && scaledOn > elapsed) {
            const lbl = borrowLbl(
              NOTE_LABELS[((note.midi % 12) + 12) % 12],
              Math.min(16, Math.max(10, innerW * 0.75)),
              isLight ? 0x141428 : 0xffffff,
            )
            lbl.anchor.set(0.5, 1)
            lbl.x = innerX + innerW / 2
            lbl.y = cBot - 5
          }
        })
      })

      for (let i = lblN; i < lblPool.length; i++) lblPool[i].visible = false

      hitGfx.clear()
    }

    app.ticker.add(renderFrame)

    return () => {
      drawStaticsRef.current = null
      app.ticker.remove(renderFrame)
      app.renderer.off('resize', drawStatics)
      app.destroy(true, { children: true, texture: false, baseTexture: false })
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={wrapRef}
      className="sr-synthesia-wrap"
      style={{ position: 'relative', overflow: 'hidden' }}
    />
  )
}
