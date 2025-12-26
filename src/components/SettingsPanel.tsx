"use client";

import { useEffect, useState } from "react";
import { clearSettings, DEFAULT_MODEL, loadSettings, saveSettings } from "@/lib/settings";

type Props = {
  onClose: () => void;
  onChange?: () => void;
};

export function SettingsPanel({ onClose, onChange }: Props) {
  const [key, setKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const s = loadSettings();
    setKey(s.groqKey);
    setModel(s.model || DEFAULT_MODEL);
  }, []);

  const save = () => {
    saveSettings({ version: 1, groqKey: key.trim(), model: model.trim() || DEFAULT_MODEL });
    setSaved(true);
    onChange?.();
    window.setTimeout(() => setSaved(false), 800);
  };

  const clear = () => {
    clearSettings();
    setKey("");
    setModel(DEFAULT_MODEL);
    onChange?.();
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-5">
      <div className="flex items-center justify-between mb-6">
        <div className="text-base font-semibold">Settings</div>
        <button 
          className="text-neutral-400 hover:text-neutral-600 transition-colors"
          onClick={onClose}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-neutral-400 mb-2">Groq API key</label>
          <input
            className="w-full bg-neutral-50 rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200 transition-shadow"
            type="password"
            value={key}
            placeholder="gsk_…"
            onChange={(e) => setKey(e.target.value)}
          />
          <div className="mt-1.5 text-[11px] text-neutral-400">Stored locally in this browser.</div>
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wide text-neutral-400 mb-2">Model</label>
          <input
            className="w-full bg-neutral-50 rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200 transition-shadow"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <button 
            className="text-xs text-neutral-400 hover:text-red-500 transition-colors"
            onClick={clear}
          >
            Clear all
          </button>
          <div className="flex items-center gap-3">
            {saved ? <span className="text-xs text-green-600">Saved ✓</span> : null}
            <button 
              className="bg-neutral-900 text-white rounded px-4 py-2 text-sm font-medium hover:bg-neutral-800 transition-colors"
              onClick={save}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
