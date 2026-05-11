import { useState } from 'react'
import { PROGRESSIONS } from './progressions.js'

// Shows the 4 primary progressions as pills, then an "Others ▾" pill that
// expands to all remaining progressions — mirrors the ScalePicker pattern.
//
// Props:
//   value     — currently selected progression id (or null)
//   onChange  — (progId) => void  called when a pill is clicked
export default function ProgressionPicker({ value, onChange }) {
  const [othersOpen, setOthersOpen] = useState(false)

  const primary = PROGRESSIONS.filter(p => p.group === 'primary')
  const others  = PROGRESSIONS.filter(p => p.group !== 'primary')

  const activeIsOther = others.some(p => p.id === value)
  const activeOther   = others.find(p => p.id === value)

  const handleOthersToggle = () => {
    if (activeIsOther && !othersOpen) {
      setOthersOpen(true)
    } else {
      setOthersOpen(o => !o)
    }
  }

  const select = (id) => {
    onChange(id)
    setOthersOpen(false)
  }

  return (
    <div className="prog-picker">
      <div className="prog-picker-row">
        {primary.map(p => (
          <button
            key={p.id}
            className={`prog-pill ${value === p.id ? 'active' : ''}`}
            onClick={() => { select(p.id); setOthersOpen(false) }}
          >
            <span className="prog-pill-name">{p.name}</span>
            <span className="prog-pill-roman">{p.roman}</span>
          </button>
        ))}

        <button
          className={`prog-pill prog-pill-others ${activeIsOther ? 'active' : ''}`}
          onClick={handleOthersToggle}
        >
          <span className="prog-pill-name">
            {activeIsOther ? activeOther.name : 'Others'} ▾
          </span>
          {activeIsOther && (
            <span className="prog-pill-roman">{activeOther.roman}</span>
          )}
        </button>
      </div>

      {othersOpen && (
        <div className="prog-others-panel">
          {others.map(p => (
            <button
              key={p.id}
              className={`prog-pill ${value === p.id ? 'active' : ''}`}
              onClick={() => select(p.id)}
            >
              <span className="prog-pill-name">{p.name}</span>
              <span className="prog-pill-roman">{p.roman}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
