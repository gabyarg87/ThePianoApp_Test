import { useAudio } from '../../audio/AudioContext.jsx'
import './settings.css'

export default function Settings() {
  const {
    supported, inputs, activeId, setActiveId, error, connect,
  } = useAudio()

  const activeDevice = inputs.find(i => i.id === activeId)

  return (
    <div className="settings-page">
      <div className="settings-content">

        {/* ── MIDI Input ──────────────────────────────────────────────────── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <rect x="2" y="8" width="20" height="10" rx="2"/>
              <path d="M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/>
              <circle cx="8" cy="13" r="1" fill="currentColor"/>
              <circle cx="12" cy="13" r="1" fill="currentColor"/>
              <circle cx="16" cy="13" r="1" fill="currentColor"/>
            </svg>
            <h2 className="settings-section-title">MIDI Input</h2>
          </div>
          <p className="settings-section-desc">
            Connect a MIDI piano or keyboard to play notes, chords, and sight-read with real hardware.
          </p>

          {/* Status bar */}
          <div className={`settings-midi-status ${activeDevice ? 'connected' : supported === null ? 'idle' : 'disconnected'}`}>
            <span className="settings-midi-status-dot" />
            <span className="settings-midi-status-text">
              {activeDevice
                ? <>Connected — <strong>{activeDevice.name}</strong></>
                : supported === null
                  ? 'Not connected'
                  : inputs.length === 0
                    ? 'No devices detected'
                    : 'No device selected'}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="settings-midi-error">{error}</div>
          )}

          {/* Device list */}
          {inputs.length > 0 && (
            <div className="settings-midi-devices">
              {inputs.map(inp => (
                <button
                  key={inp.id}
                  className={`settings-midi-device ${activeId === inp.id ? 'active' : ''}`}
                  onClick={() => setActiveId(activeId === inp.id ? null : inp.id)}
                >
                  <span className="settings-midi-device-dot" />
                  <span className="settings-midi-device-name">{inp.name}</span>
                  {activeId === inp.id && <span className="settings-midi-device-badge">Active</span>}
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="settings-midi-actions">
            <button
              className="settings-btn-primary"
              onClick={connect}>
              {supported === null ? 'Scan for MIDI Devices' : 'Refresh Devices'}
            </button>
            {activeDevice && (
              <button
                className="settings-btn-danger"
                onClick={() => setActiveId(null)}>
                Disconnect
              </button>
            )}
          </div>

          {supported === false && (
            <p className="settings-midi-note">
              Web MIDI API is not supported in this browser. Try Chrome or Edge.
            </p>
          )}
          {supported === true && inputs.length === 0 && !error && (
            <p className="settings-midi-note">
              No MIDI devices found. Make sure your piano is connected via USB and try refreshing.
            </p>
          )}
          {activeDevice && (
            <p className="settings-midi-note">
              Your piano is active and will sound in all modules — Sight Reading, Chords &amp; Scales.
            </p>
          )}
        </section>

      </div>
    </div>
  )
}
