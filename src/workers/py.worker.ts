/* eslint-disable @typescript-eslint/no-explicit-any */
declare function importScripts(...urls: string[]): void;
declare function loadPyodide(): Promise<any>;

let pyodide: any = null;

async function init() {
  if (pyodide) return;
  importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.js");
  pyodide = await loadPyodide();
  await pyodide.loadPackage(["numpy", "micropip"]);
  pyodide.runPython(`
import sys
from io import StringIO
import numpy as np
import micropip
`);
}

async function run(code: string): Promise<{ stdout: string; stderr: string }> {
  await init();
  pyodide.runPython(`
_stdout = StringIO()
_stderr = StringIO()
sys.stdout = _stdout
sys.stderr = _stderr
`);
  try {
    await pyodide.runPythonAsync(code);
  } catch (e: any) {
    pyodide.runPython(`sys.stderr.write(${JSON.stringify(String(e))})`);
  }
  const stdout = pyodide.runPython("_stdout.getvalue()") as string;
  const stderr = pyodide.runPython("_stderr.getvalue()") as string;
  pyodide.runPython(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
`);
  return { stdout, stderr };
}

onmessage = async (e: MessageEvent<{ id: string; code: string }>) => {
  const { id, code } = e.data;
  try {
    const result = await run(code);
    postMessage({ id, ...result });
  } catch (err: any) {
    postMessage({ id, stdout: "", stderr: String(err) });
  }
};
