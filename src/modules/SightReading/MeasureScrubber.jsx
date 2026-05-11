// Interactive measure / compass scrubber.
// Click to jump to a measure. Drag to select a range only when loop mode is active.

import { useEffect, useRef, useCallback } from 'react'

function formatTime(secs) {
  if (!isFinite(secs) || secs < 0) secs = 0
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function MeasureScrubber({
  measureCount,
  startMeasure,
  endMeasure,
  onRangeChange,
  isPlaying,
  playStartRef,
  scaledBarSec,   // seconds per measure at current playback speed
  loop,           // when true, drag selects a range; when false, click just seeks
  onLoopStart,    // (anchor) => void — called on initial loop click to restart playback
  onLoopCommit,   // (from, to) => void — called on release with the final loop region
}) {
  const barRef     = useRef(null)
  const headRef    = useRef(null)
  const curTimeRef = useRef(null)
  const rafRef     = useRef(null)
  const dragRef    = useRef(null)  // { anchor: measureIndex } — only used in loop mode

  // pointer-x → measure index (0-based, clamped)
  const xToMeasure = useCallback((clientX) => {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.min(measureCount - 1, Math.floor(frac * measureCount))
  }, [measureCount])

  const onPointerDown = useCallback((e) => {
    e.preventDefault()
    barRef.current?.setPointerCapture(e.pointerId)
    const m = xToMeasure(e.clientX)
    if (!loop) {
      onRangeChange(m, measureCount)
      return
    }
    // Loop mode: anchor is always the start; drag extends the end rightward
    dragRef.current = { anchor: m, lastTo: m + 1 }
    onLoopStart?.(m)
    onRangeChange(m, m + 1)
  }, [xToMeasure, measureCount, onRangeChange, onLoopStart, loop])

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current || !loop) return
    const m      = xToMeasure(e.clientX)
    const anchor = dragRef.current.anchor
    const to     = Math.min(measureCount, Math.max(anchor + 1, m + 1))
    dragRef.current.lastTo = to
    // Keep from = anchor so startMeasure (and the playhead) never moves during drag
    onRangeChange(anchor, to)
  }, [xToMeasure, measureCount, onRangeChange, loop])

  const onPointerUp = useCallback(() => {
    if (loop && dragRef.current) {
      const { anchor, lastTo } = dragRef.current
      onLoopCommit?.(anchor, lastTo ?? anchor + 1)
    }
    dragRef.current = null
  }, [loop, onLoopCommit])

  // Animated playhead + current time via RAF (direct DOM mutation, no React re-renders)
  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    const head     = headRef.current
    const curTimeEl = curTimeRef.current
    if (!head) return

    if (!isPlaying || !playStartRef?.current || !scaledBarSec) {
      head.style.opacity = '0.5'
      head.style.left = `${(startMeasure / measureCount) * 100}%`
      if (curTimeEl) curTimeEl.textContent = formatTime(startMeasure * scaledBarSec)
      return
    }

    head.style.opacity = '1'
    const tick = () => {
      const elapsed = (Date.now() - playStartRef.current) / 1000
      const absPos  = startMeasure + Math.max(0, elapsed) / scaledBarSec
      const frac    = Math.min(1, absPos / measureCount)
      head.style.left = `${frac * 100}%`
      if (curTimeEl) {
        const curSec = Math.max(0, Math.min(absPos * scaledBarSec, measureCount * scaledBarSec))
        curTimeEl.textContent = formatTime(curSec)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, playStartRef, scaledBarSec, startMeasure, measureCount])

  if (!measureCount) return null

  // Adaptive label density — tickStep >= 5 ensures at least 4 sub-markers between labels
  let tickStep = 1
  const approxBarW = 600
  while ((approxBarW / measureCount) * tickStep < 26) tickStep++
  if (measureCount >= 5) tickStep = Math.max(5, tickStep)

  const selLeft  = (startMeasure / measureCount) * 100
  const selWidth = ((endMeasure - startMeasure) / measureCount) * 100
  const totalTime = formatTime(measureCount * scaledBarSec)

  return (
    <div
      ref={barRef}
      className="sr-scrubber"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* Selected range fill — only visible in loop mode */}
      {loop && (
        <div
          className="sr-scrubber-range"
          style={{ left: `${selLeft}%`, width: `${selWidth}%` }}
        />
      )}

      {/* Sub-compass markers at every real compass between major labeled ticks */}
      {Array.from({ length: measureCount }, (_, m) => {
        if (m === 0 || m % tickStep === 0) return null
        return (
          <div
            key={`sub${m}`}
            className="sr-scrubber-tick sub"
            style={{ left: `${(m / measureCount) * 100}%` }}
          />
        )
      })}

      {/* Tick marks + measure labels */}
      {Array.from({ length: measureCount + 1 }, (_, m) => {
        const isMajor = m % tickStep === 0
        const isEdge  = m === 0 || m === measureCount
        if (!isMajor && !isEdge) return null
        const pct     = (m / measureCount) * 100
        const inRange = loop && m >= startMeasure && m < endMeasure
        return (
          <div
            key={m}
            className={`sr-scrubber-tick${isMajor ? ' major' : ''}`}
            style={{ left: `${pct}%` }}
          >
            {m < measureCount && (isMajor || isEdge) && (
              <span className={`sr-scrubber-lbl${inRange ? ' in-range' : ''}`}>
                {m + 1}
              </span>
            )}
          </div>
        )
      })}

      {/* Playhead */}
      <div ref={headRef} className="sr-scrubber-head" style={{ opacity: 0.5, left: `${(startMeasure / measureCount) * 100}%` }} />

      {/* Time display: current (bottom-left) and total (bottom-right) */}
      <span ref={curTimeRef} className="sr-scrubber-time sr-scrubber-time--current">
        {formatTime(startMeasure * scaledBarSec)}
      </span>
      <span className="sr-scrubber-time sr-scrubber-time--total">
        {totalTime}
      </span>
    </div>
  )
}
