"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Notebook } from "@/lib/notebookTypes";
import { id } from "@/lib/id";
import { InkCanvas, type InkCanvasHandle, type Tool } from "@/components/InkCanvas";
import { SettingsPanel } from "@/components/SettingsPanel";
import { loadSettings } from "@/lib/settings";
import { convertHandwritingToPython } from "@/lib/groq";
import { runPython } from "@/lib/py";
import {
  hasFileSystemAccess,
  saveProject,
  loadProject,
  exportProjectAsZip,
  importProjectFromZip,
} from "@/lib/project";

const STORAGE_KEY = "codepencil:notebook:v1";
const DEFAULT_CELL_HEIGHT = 320;

type Action =
  | { type: "load"; notebook: Notebook }
  | { type: "addCell"; afterId?: string }
  | { type: "deleteCell"; id: string }
  | { type: "setStrokes"; id: string; strokes: Notebook["cells"][number]["strokes"] }
  | { type: "clearCell"; id: string }
  | { type: "setRecognized"; id: string; code: string }
  | { type: "setStatus"; id: string; status: Notebook["cells"][number]["status"]; error?: string }
  | { type: "setRunStatus"; id: string; runStatus: Notebook["cells"][number]["runStatus"] }
  | { type: "setOutput"; id: string; stdout: string; stderr: string }
  | { type: "setCellHeight"; id: string; height: number };

const emptyNotebook: Notebook = { version: 1, cells: [{ id: id(), strokes: [], height: DEFAULT_CELL_HEIGHT }] };

function reducer(state: Notebook, a: Action): Notebook {
  switch (a.type) {
    case "load":
      return a.notebook;
    case "addCell": {
      const newCell = { id: id(), strokes: [], height: DEFAULT_CELL_HEIGHT };
      if (!a.afterId) return { ...state, cells: [...state.cells, newCell] };
      const idx = state.cells.findIndex((c) => c.id === a.afterId);
      if (idx === -1) return { ...state, cells: [...state.cells, newCell] };
      const cells = [...state.cells];
      cells.splice(idx + 1, 0, newCell);
      return { ...state, cells };
    }
    case "deleteCell":
      return { ...state, cells: state.cells.filter((c) => c.id !== a.id) };
    case "setStrokes":
      return {
        ...state,
        cells: state.cells.map((c) =>
          c.id === a.id ? { ...c, strokes: a.strokes, status: "idle", error: undefined } : c,
        ),
      };
    case "clearCell":
      return {
        ...state,
        cells: state.cells.map((c) =>
          c.id === a.id ? { ...c, strokes: [], status: "idle", error: undefined, recognizedCode: undefined, stdout: undefined, stderr: undefined } : c,
        ),
      };
    case "setRecognized":
      return {
        ...state,
        cells: state.cells.map((c) => (c.id === a.id ? { ...c, recognizedCode: a.code } : c)),
      };
    case "setStatus":
      return {
        ...state,
        cells: state.cells.map((c) =>
          c.id === a.id ? { ...c, status: a.status, error: a.error } : c,
        ),
      };
    case "setRunStatus":
      return {
        ...state,
        cells: state.cells.map((c) =>
          c.id === a.id ? { ...c, runStatus: a.runStatus } : c,
        ),
      };
    case "setOutput":
      return {
        ...state,
        cells: state.cells.map((c) =>
          c.id === a.id ? { ...c, stdout: a.stdout, stderr: a.stderr, runStatus: "done" } : c,
        ),
      };
    case "setCellHeight":
      return {
        ...state,
        cells: state.cells.map((c) =>
          c.id === a.id ? { ...c, height: a.height } : c,
        ),
      };
  }
}

function safeParseNotebook(raw: string | null): Notebook | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Notebook>;
    if (v?.version !== 1) return null;
    if (!Array.isArray(v.cells)) return null;
    return { version: 1, cells: v.cells as Notebook["cells"] };
  } catch {
    return null;
  }
}

function AddCellButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="mx-auto flex h-6 w-6 items-center justify-center rounded-full text-neutral-300 hover:bg-neutral-100 hover:text-neutral-500 transition-colors"
      onClick={onClick}
      title="Add cell"
    >
      <span className="text-lg leading-none">+</span>
    </button>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function EraserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
      <path d="M22 21H7" />
      <path d="m5 11 9 9" />
    </svg>
  );
}

export function NotebookClient() {
  const [nb, dispatch] = useReducer(reducer, emptyNotebook);
  const loadedRef = useRef(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [tool, setTool] = useState<Tool>("pen");
  const [strokeSize, setStrokeSize] = useState(4);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const canvasById = useRef(new Map<string, InkCanvasHandle | null>());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasWidthRef = useRef(800);

  useEffect(() => {
    const updateWidth = () => {
      const canvas = document.querySelector("canvas");
      if (canvas) {
        canvasWidthRef.current = canvas.getBoundingClientRect().width;
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  useEffect(() => {
    const saved = safeParseNotebook(localStorage.getItem(STORAGE_KEY));
    if (saved) dispatch({ type: "load", notebook: saved });
    loadedRef.current = true;
    setHasKey(!!loadSettings().groqKey);
  }, []);

  const savePayload = useMemo(() => JSON.stringify(nb), [nb]);
  useEffect(() => {
    if (!loadedRef.current) return;
    const t = window.setTimeout(() => localStorage.setItem(STORAGE_KEY, savePayload), 300);
    return () => window.clearTimeout(t);
  }, [savePayload]);

  const convertCell = async (cellId: string) => {
    const s = loadSettings();
    if (!s.groqKey) {
      dispatch({ type: "setStatus", id: cellId, status: "error", error: "Missing Groq API key" });
      return;
    }
    const handle = canvasById.current.get(cellId);
    const imageDataUrl = handle?.toDataURL() ?? "";
    if (!imageDataUrl) {
      dispatch({ type: "setStatus", id: cellId, status: "error", error: "Canvas not ready" });
      return;
    }
    dispatch({ type: "setStatus", id: cellId, status: "converting", error: undefined });
    try {
      const code = await convertHandwritingToPython({
        apiKey: s.groqKey,
        model: s.model,
        imageDataUrl,
      });
      dispatch({ type: "setRecognized", id: cellId, code });
      dispatch({ type: "setStatus", id: cellId, status: "idle", error: undefined });
    } catch (e) {
      dispatch({
        type: "setStatus",
        id: cellId,
        status: "error",
        error: e instanceof Error ? e.message : "Convert failed",
      });
    }
  };

  const runCell = async (cellId: string) => {
    const cell = nb.cells.find((c) => c.id === cellId);
    if (!cell?.recognizedCode) return;
    dispatch({ type: "setRunStatus", id: cellId, runStatus: "running" });
    try {
      const { stdout, stderr } = await runPython(cell.recognizedCode);
      dispatch({ type: "setOutput", id: cellId, stdout, stderr });
    } catch (e) {
      dispatch({ type: "setOutput", id: cellId, stdout: "", stderr: String(e) });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (hasFileSystemAccess()) {
        const result = await saveProject(nb.cells, strokeSize, canvasWidthRef.current);
        if (!result.success && result.error !== "Cancelled") {
          alert(`Save failed: ${result.error}`);
        }
      } else {
        const result = await exportProjectAsZip(nb.cells, strokeSize, canvasWidthRef.current);
        if (!result.success) {
          alert(`Export failed: ${result.error}`);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleOpen = async () => {
    if (hasFileSystemAccess()) {
      setLoading(true);
      try {
        const result = await loadProject();
        if (result.success && result.notebook) {
          dispatch({ type: "load", notebook: result.notebook });
          if (result.strokeWidth) setStrokeSize(result.strokeWidth);
        } else if (result.error !== "Cancelled") {
          alert(`Open failed: ${result.error}`);
        }
      } finally {
        setLoading(false);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const result = await importProjectFromZip(file);
      if (result.success && result.notebook) {
        dispatch({ type: "load", notebook: result.notebook });
        if (result.strokeWidth) setStrokeSize(result.strokeWidth);
      } else {
        alert(`Import failed: ${result.error}`);
      }
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  return (
    <main className="tablet-mode min-h-screen bg-neutral-50 pb-20">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-white/80 backdrop-blur px-4 py-3 border-b border-neutral-200" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <div className="text-lg font-semibold">codepencil</div>
        <div className="flex items-center gap-3">
          {/* Open button */}
          <button
            className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 transition-colors disabled:opacity-40"
            onClick={handleOpen}
            disabled={loading}
            title="Open project"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          
          {/* Save button */}
          <button
            className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 transition-colors disabled:opacity-40"
            onClick={handleSave}
            disabled={saving}
            title={hasFileSystemAccess() ? "Save project" : "Export as ZIP"}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
          </button>

          {/* Settings button */}
          <button
            className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
            onClick={() => setShowSettings((v) => !v)}
            title="Settings"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            {hasKey ? null : <span className="text-amber-500">!</span>}
          </button>
        </div>
        
        {/* Hidden file input for ZIP import fallback */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleFileImport}
        />
      </header>

      {showSettings ? (
        <div className="mx-auto max-w-md p-4">
          <SettingsPanel
            onClose={() => setShowSettings(false)}
            onChange={() => setHasKey(!!loadSettings().groqKey)}
          />
        </div>
      ) : null}

      <div className="flex flex-col">
        {/* Add cell at top */}
        <div className="py-2">
          <AddCellButton onClick={() => dispatch({ type: "addCell", afterId: undefined })} />
        </div>

        {nb.cells.map((cell) => (
          <div key={cell.id}>
            <section>
              {/* Canvas - full width */}
              
              <InkCanvas
                ref={(h) => {
                  canvasById.current.set(cell.id, h);
                }}
                strokes={cell.strokes}
                onChange={(strokes) => dispatch({ type: "setStrokes", id: cell.id, strokes })}
                height={cell.height ?? DEFAULT_CELL_HEIGHT}
                tool={tool}
                strokeSize={strokeSize}
              />

              {/* Resize handle - touch-friendly */}
              <div
                className="h-10 cursor-ns-resize flex items-center justify-center group touch-none"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  const startY = e.clientY;
                  const startH = cell.height ?? DEFAULT_CELL_HEIGHT;
                  const onMove = (ev: PointerEvent) => {
                    const delta = ev.clientY - startY;
                    dispatch({ type: "setCellHeight", id: cell.id, height: Math.max(120, startH + delta) });
                  };
                  const onUp = () => {
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onUp);
                  };
                  window.addEventListener("pointermove", onMove);
                  window.addEventListener("pointerup", onUp);
                }}
              >
                <div className="w-16 h-1.5 rounded-full bg-neutral-300 group-hover:bg-neutral-400 group-active:bg-neutral-500 transition-colors" />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between py-2 px-4">
                <div className="flex gap-3">
                  <button
                    className="text-xs text-neutral-400 hover:text-neutral-600"
                    onClick={() => dispatch({ type: "clearCell", id: cell.id })}
                  >
                    Clear
                  </button>
                  {nb.cells.length > 1 ? (
                    <button
                      className="text-xs text-neutral-400 hover:text-red-500"
                      onClick={() => dispatch({ type: "deleteCell", id: cell.id })}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded px-3 py-1.5 text-sm border border-neutral-200 bg-white disabled:opacity-40"
                    disabled={!hasKey || cell.status === "converting" || cell.strokes.length === 0}
                    onClick={() => convertCell(cell.id)}
                  >
                    {cell.status === "converting" ? "Converting…" : "Convert"}
                  </button>
                  <button
                    className="rounded px-3 py-1.5 text-sm bg-green-600 text-white disabled:opacity-40"
                    disabled={!cell.recognizedCode || cell.runStatus === "running"}
                    onClick={() => runCell(cell.id)}
                  >
                    {cell.runStatus === "running" ? "Running…" : "Run"}
                  </button>
                </div>
              </div>

              {cell.error ? <div className="text-xs text-red-600 pb-2 px-4">{cell.error}</div> : null}

              {/* Understood code */}
              {cell.recognizedCode ? (
                <div className="pb-2 px-4">
                  <div className="text-[11px] text-neutral-400 mb-1">Understood code</div>
                  <pre className="text-xs font-mono bg-white border border-neutral-200 rounded p-2 overflow-x-auto whitespace-pre-wrap">{cell.recognizedCode}</pre>
                </div>
              ) : null}

              {/* Output */}
              {(cell.stdout || cell.stderr) ? (
                <div className="pb-2 px-4 grid gap-2">
                  {cell.stdout ? (
                    <div>
                      <div className="text-[11px] text-neutral-400 mb-1">stdout</div>
                      <pre className="text-xs font-mono bg-white border border-neutral-200 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">{cell.stdout}</pre>
                    </div>
                  ) : null}
                  {cell.stderr ? (
                    <div>
                      <div className="text-[11px] text-red-500 mb-1">stderr</div>
                      <pre className="text-xs font-mono bg-red-50 border border-red-200 text-red-700 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">{cell.stderr}</pre>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            {/* Add cell button between cells */}
            <div className="py-2">
              <AddCellButton onClick={() => dispatch({ type: "addCell", afterId: cell.id })} />
            </div>
          </div>
        ))}
      </div>

      {/* Fixed bottom toolbar */}
      <div className="fixed left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-white rounded-full shadow-lg border border-neutral-200 px-2 py-1" style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <button
          className={`flex items-center justify-center w-11 h-11 rounded-full transition-colors ${
            tool === "pen" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
          }`}
          onClick={() => setTool("pen")}
          title="Pencil"
        >
          <PencilIcon className="w-5 h-5" />
        </button>
        <button
          className={`flex items-center justify-center w-11 h-11 rounded-full transition-colors ${
            tool === "eraser" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
          }`}
          onClick={() => setTool("eraser")}
          title="Eraser"
        >
          <EraserIcon className="w-5 h-5" />
        </button>
        
        <div className="w-px h-8 bg-neutral-200" />
        
        <div className="flex items-center gap-2 px-2">
          <div 
            className="rounded-full bg-neutral-900"
            style={{ width: Math.max(4, strokeSize), height: Math.max(4, strokeSize) }}
          />
          <input
            type="range"
            min="1"
            max="16"
            value={strokeSize}
            onChange={(e) => setStrokeSize(Number(e.target.value))}
            className="w-20 h-1 bg-neutral-200 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-neutral-900 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
            title="Stroke size"
          />
        </div>
      </div>
    </main>
  );
}
