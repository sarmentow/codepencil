# codepencil

![ScreenRecording_12-27-2025 14-18-34_1](https://github.com/user-attachments/assets/a11a597a-03c8-403d-b55e-63990e97adf4)

Handwrite code. Execute it. That's it.

A local-first PWA for handwriting Python on iPad (or anywhere). Scribble with Apple Pencil, let an LLM transcribe it, run it with Pyodide. No accounts, no cloud sync, no telemetry.

## How it works
1. Draw Python code on a canvas
2. Hit "Convert" - sends image to Groq (Llama 4 Scout)
3. Hit "Run" - executes in-browser via Pyodide WebAssembly
4. See output. Repeat.

## Why

- **No keyboard needed** - code from the couch, in bed, on a plane
- **Local-first** - your notebooks stay on your device
- **Portable format** - projects are just folders of SVGs
- **Zero infrastructure** - runs entirely in your browser

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js, React, Tailwind |
| Drawing | Canvas API |
| AI | Groq API (Llama 4 Scout 17B) |
| Execution | Pyodide + Web Workers |
| Storage | localStorage + File System Access API |

## Run locally

```bash
npm install
npm run dev
```

Open `localhost:3000`. Add your Groq API key in Settings.

## Project format

Projects save as folders:

```
my-notebook/
├── cell-001.svg
├── cell-002.svg
└── manifest.json
```

Each SVG is a cell's strokes. 

## Features

- [x] Cell-based notebook
- [x] Palm rejection (pen/mouse only)
- [x] Adjustable stroke size
- [x] Eraser tool
- [x] Resizable cells
- [x] numpy + micropip pre-loaded
- [x] PWA (installable on iPad)
- [x] Save/load projects (File System Access API or ZIP fallback)

## Limitations

- Needs network for LLM calls (no offline transcription)
- Only Groq API supported (bring your own key)
- Python only (for now)

## License

MIT
