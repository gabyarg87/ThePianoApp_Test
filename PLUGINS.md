# PianoApp — Plugins & Libraries

## Audio

| Library | Version | Description |
|---------|---------|-------------|
| **smplr** | ^0.20.0 | Provides `SplendidGrandPiano` for realistic piano sample playback. Powers the central `usePiano` hook with velocity, duration, and humanization controls, plus a Web Audio API effects chain (reverb, EQ). |

## Graphics & Visualization

| Library | Version | Description |
|---------|---------|-------------|
| **pixi.js** | ^7.4.3 | WebGL-based 2D graphics engine that drives the Synthesia-style falling notes piano roll. Handles GPU-accelerated note animations, particle effects on triggers, glow/bloom layers, and live keyboard key highlighting. |

## Music Notation & Scores

| Library | Version | Description |
|---------|---------|-------------|
| **opensheetmusicdisplay** | ^1.9.7 | Loads and renders MusicXML / MXL sheet music visually. Provides a cursor API used during playback to track position and extract note, dynamics, and tempo data. |

## MIDI

| Library | Version | Description |
|---------|---------|-------------|
| **@tonejs/midi** | ^2.0.28 | Parses `.mid` / `.midi` files. Extracts track data, note timing, and metadata for playback and piano roll visualization. |

## UI Framework

| Library | Version | Description |
|---------|---------|-------------|
| **react** | ^18.3.1 | Core UI library. Manages component state, rendering, and lifecycle for the whole app. |
| **react-dom** | ^18.3.1 | React's web renderer. Mounts the component tree to the DOM. |

## Build & Dev Tools

| Library | Version | Description |
|---------|---------|-------------|
| **vite** | ^5.4.10 | Fast bundler and dev server with hot module reload. |
| **@vitejs/plugin-react** | ^4.3.4 | Vite plugin that enables JSX transformation and React Fast Refresh during development. |
