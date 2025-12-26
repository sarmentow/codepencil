type Pending = { resolve: (v: { stdout: string; stderr: string }) => void };

let worker: Worker | null = null;
const pending = new Map<string, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/py.worker.ts", import.meta.url));
  worker.onmessage = (e: MessageEvent<{ id: string; stdout: string; stderr: string }>) => {
    const p = pending.get(e.data.id);
    if (p) {
      pending.delete(e.data.id);
      p.resolve({ stdout: e.data.stdout, stderr: e.data.stderr });
    }
  };
  return worker;
}

let reqId = 0;
export function runPython(code: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const id = String(++reqId);
    pending.set(id, { resolve });
    getWorker().postMessage({ id, code });
  });
}

