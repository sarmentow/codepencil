export type Settings = {
  version: 1;
  groqKey: string;
  model: string;
};

const STORAGE_KEY = "codepencil:settings:v2";
export const DEFAULT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export function loadSettings(): Settings {
  if (typeof window === "undefined") {
    return { version: 1, groqKey: "", model: DEFAULT_MODEL };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, groqKey: "", model: DEFAULT_MODEL };
    const v = JSON.parse(raw) as Partial<Settings>;
    if (v.version !== 1) return { version: 1, groqKey: "", model: DEFAULT_MODEL };
    return {
      version: 1,
      groqKey: typeof v.groqKey === "string" ? v.groqKey : "",
      model: typeof v.model === "string" && v.model ? v.model : DEFAULT_MODEL,
    };
  } catch {
    return { version: 1, groqKey: "", model: DEFAULT_MODEL };
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function clearSettings() {
  localStorage.removeItem(STORAGE_KEY);
}


