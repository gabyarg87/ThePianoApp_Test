import { useState } from 'react'
import { SCALES } from './scales.js'

// Shared scale picker: shows Major + Minor as primary pills,
// then an "Others" pill that expands to the remaining scales.
// Props:
//   value     — current scaleId string
//   onChange  — (scaleId) => void
//   pillClass — extra CSS class for each pill (e.g. 'sr-pill sr-pill-sm')
export default function ScalePicker({ value, onChange, pillClass = 'pill scale' }) {
  const [othersOpen, setOthersOpen] = useState(false)

  const primary = SCALES.filter(s => s.group === 'primary')
  const others  = SCALES.filter(s => s.group !== 'primary')

  const activeIsOther = others.some(s => s.id === value)
  const activeOther   = others.find(s => s.id === value)

  const handleOthersToggle = () => {
    // If an "other" is already selected, clicking the chip deselects back to Major
    if (activeIsOther && !othersOpen) {
      setOthersOpen(true)
    } else {
      setOthersOpen(o => !o)
    }
  }

  const selectOther = (id) => {
    onChange(id)
    setOthersOpen(false)
  }

  return (
    <div className="scale-picker">
      <div className="scale-picker-row">
        {primary.map(s => (
          <button
            key={s.id}
            className={`${pillClass} ${value === s.id ? 'active' : ''}`}
            onClick={() => { onChange(s.id); setOthersOpen(false) }}
          >
            {s.name}
          </button>
        ))}

        <button
          className={`${pillClass} ${activeIsOther ? 'active' : ''} scale-others-btn`}
          onClick={handleOthersToggle}
        >
          {activeIsOther ? `${activeOther.name} ▾` : `Others ▾`}
        </button>
      </div>

      {othersOpen && (
        <div className="scale-others-panel">
          {others.map(s => (
            <button
              key={s.id}
              className={`${pillClass} ${value === s.id ? 'active' : ''}`}
              onClick={() => selectOther(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
