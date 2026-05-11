import { useState } from 'react'
import { AudioProvider } from './audio/AudioContext.jsx'
import ChordChart from './modules/ChordChart/ChordChart.jsx'
import SightReading from './modules/SightReading/SightReading.jsx'
import Settings from './modules/Settings/Settings.jsx'
import SongWriter from './modules/SongWriter/SongWriter.jsx'
import './styles/app.css'

const MODULES = [
  { id: 'chords',   name: 'Chords & Scales', icon: '🎹', ready: true },
  { id: 'sight',    name: 'Sight Reading',   icon: '🎼', ready: true },
  { id: 'songs',    name: 'Song Writer',     icon: '🎵', ready: true },
  { id: 'settings', name: 'Settings',        icon: '⚙️',  ready: true },
]

export default function App() {
  const [active, setActive] = useState('chords')

  return (
    <AudioProvider>
      <div className="app">
        <nav className="module-tabs" role="tablist">
          {MODULES.map(m => (
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

        <main className="app-main">
          {active === 'chords'   && <ChordChart />}
          {active === 'sight'    && <SightReading />}
          {active === 'songs'    && <SongWriter />}
          {active === 'settings' && <Settings />}
        </main>
      </div>
    </AudioProvider>
  )
}
