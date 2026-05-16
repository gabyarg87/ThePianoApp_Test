import { useState } from 'react'
import { AudioProvider } from './audio/AudioContext.jsx'
import ChordChart from './modules/ChordChart/ChordChart.jsx'
import ChordGame from './modules/ChordGame/ChordGame.jsx'
import SightReading from './modules/SightReading/SightReading.jsx'
import Settings from './modules/Settings/Settings.jsx'
import SongWriter from './modules/SongWriter/SongWriter.jsx'
import './styles/app.css'

// Tabs always visible in the nav bar
const TABS = [
  { id: 'settings', name: 'Settings', icon: '⚙️', ready: true },
]

// Modes selectable via the MODES modal
const MODES = [
  { id: 'chords',     name: 'Chords & Scales', icon: '🎹', desc: 'Practice chords, scales and intervals' },
  { id: 'sight',      name: 'Sight Reading',   icon: '🎼', desc: 'Read and play sheet music scores'      },
  { id: 'songs',      name: 'Song Writer',     icon: '🎵', desc: 'Compose and arrange your own songs'    },
  { id: 'chordgame',  name: 'Chord Game',      icon: '🎯', desc: 'Learn and practice chords'             },
]

export default function App() {
  const [active, setActive]       = useState('chords')
  const [modesOpen, setModesOpen] = useState(false)

  const activeMode = MODES.find(m => m.id === active)
  const pickMode   = (id) => { setActive(id); setModesOpen(false) }

  return (
    <AudioProvider>
      <div className="app">

        {/* ── Nav bar ───────────────────────────────────────────── */}
        <nav className="module-tabs" role="tablist">

          {/* MODES button + active-mode pill */}
          <button
            className="module-tab modes-btn"
            onClick={() => setModesOpen(true)}
            aria-haspopup="dialog"
          >
            <span className="tab-icon">🎛️</span>
            <span className="tab-label">MODES</span>
          </button>

          {/* Active mode indicator — shown next to MODES when a mode is selected */}
          {activeMode && (
            <div className="active-mode-pill">
              <span className="active-mode-icon">{activeMode.icon}</span>
              <span className="active-mode-name">{activeMode.name}</span>
            </div>
          )}

          <div className="module-tabs-spacer" />

          {/* Fixed tabs (Settings, etc.) */}
          {TABS.map(m => (
            <button
              key={m.id}
              role="tab"
              aria-selected={active === m.id}
              disabled={!m.ready}
              className={`module-tab ${active === m.id ? 'active' : ''}`}
              onClick={() => m.ready && setActive(m.id)}
            >
              <span className="tab-icon">{m.icon}</span>
              <span className="tab-label">{m.name}</span>
              {!m.ready && <span className="tab-soon">soon</span>}
            </button>
          ))}
        </nav>

        {/* ── Modes modal ───────────────────────────────────────── */}
        {modesOpen && (
          <div className="modes-overlay" onClick={() => setModesOpen(false)} role="dialog" aria-modal="true" aria-label="Select mode">
            <div className="modes-modal" onClick={e => e.stopPropagation()}>
              <p className="modes-modal-title">Select a Mode</p>
              <div className="modes-modal-grid">
                {MODES.map(m => (
                  <button
                    key={m.id}
                    className={`modes-card ${active === m.id ? 'active' : ''}`}
                    onClick={() => pickMode(m.id)}
                  >
                    <span className="modes-card-icon">{m.icon}</span>
                    <span className="modes-card-name">{m.name}</span>
                    <span className="modes-card-desc">{m.desc}</span>
                    {active === m.id && <span className="modes-card-check">✓</span>}
                  </button>
                ))}
              </div>
              <button className="modes-modal-close" onClick={() => setModesOpen(false)}>✕ Close</button>
            </div>
          </div>
        )}

        {/* ── Content ───────────────────────────────────────────── */}
        <main className="app-main">
          {active === 'chords'    && <ChordChart />}
          {active === 'sight'     && <SightReading />}
          {active === 'songs'     && <SongWriter />}
          {active === 'chordgame' && <ChordGame />}
          {active === 'settings'  && <Settings />}
        </main>

      </div>
    </AudioProvider>
  )
}
