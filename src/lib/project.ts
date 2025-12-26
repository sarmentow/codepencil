import type { Cell, Notebook } from "./notebookTypes";
import { strokesToSvg, svgToStrokes, createManifest, type ProjectManifest } from "./svg";
import { id } from "./id";

/**
 * Check if File System Access API is available
 */
export function hasFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/**
 * Save project to a directory using File System Access API
 */
export async function saveProject(
  cells: Cell[],
  strokeWidth: number,
  canvasWidth: number,
): Promise<{ success: boolean; error?: string }> {
  if (!hasFileSystemAccess()) {
    return { success: false, error: "File System Access API not supported" };
  }

  try {
    // @ts-expect-error - showDirectoryPicker is not in TypeScript's lib yet
    const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });

    // Write each cell as SVG
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const filename = `cell-${String(i + 1).padStart(3, "0")}.svg`;
      const svgContent = strokesToSvg(cell.strokes, canvasWidth, cell.height ?? 320, strokeWidth);

      const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(svgContent);
      await writable.close();
    }

    // Write manifest
    const manifest = createManifest(cells, strokeWidth);
    const manifestHandle = await dirHandle.getFileHandle("manifest.json", { create: true });
    const manifestWritable = await manifestHandle.createWritable();
    await manifestWritable.write(JSON.stringify(manifest, null, 2));
    await manifestWritable.close();

    return { success: true };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { success: false, error: "Cancelled" };
    }
    return { success: false, error: e instanceof Error ? e.message : "Save failed" };
  }
}

/**
 * Load project from a directory using File System Access API
 */
export async function loadProject(): Promise<{
  success: boolean;
  notebook?: Notebook;
  strokeWidth?: number;
  error?: string;
}> {
  if (!hasFileSystemAccess()) {
    return { success: false, error: "File System Access API not supported" };
  }

  try {
    // @ts-expect-error - showDirectoryPicker is not in TypeScript's lib yet
    const dirHandle = await window.showDirectoryPicker({ mode: "read" });

    // Try to read manifest first
    let manifest: ProjectManifest | null = null;
    try {
      const manifestHandle = await dirHandle.getFileHandle("manifest.json");
      const manifestFile = await manifestHandle.getFile();
      const manifestText = await manifestFile.text();
      manifest = JSON.parse(manifestText) as ProjectManifest;
    } catch {
      // No manifest, will scan for SVGs
    }

    const cells: Cell[] = [];

    if (manifest && manifest.cells) {
      // Load cells in manifest order
      for (const cellInfo of manifest.cells) {
        try {
          const fileHandle = await dirHandle.getFileHandle(cellInfo.file);
          const file = await fileHandle.getFile();
          const svgText = await file.text();
          const { strokes, height } = svgToStrokes(svgText);

          cells.push({
            id: id(),
            strokes,
            height: cellInfo.height ?? height,
            recognizedCode: cellInfo.recognizedCode,
          });
        } catch {
          // Skip missing files
          console.warn(`Could not load ${cellInfo.file}`);
        }
      }
    } else {
      // No manifest - scan for SVG files
      const svgFiles: { name: string; handle: FileSystemFileHandle }[] = [];

      for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === "file" && name.endsWith(".svg")) {
          svgFiles.push({ name, handle: handle as FileSystemFileHandle });
        }
      }

      // Sort by filename
      svgFiles.sort((a, b) => a.name.localeCompare(b.name));

      for (const { handle } of svgFiles) {
        const file = await handle.getFile();
        const svgText = await file.text();
        const { strokes, height } = svgToStrokes(svgText);

        cells.push({
          id: id(),
          strokes,
          height,
        });
      }
    }

    if (cells.length === 0) {
      return { success: false, error: "No cells found in project" };
    }

    return {
      success: true,
      notebook: { version: 1, cells },
      strokeWidth: manifest?.strokeWidth,
    };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { success: false, error: "Cancelled" };
    }
    return { success: false, error: e instanceof Error ? e.message : "Load failed" };
  }
}

/**
 * Export project as downloadable ZIP (fallback for browsers without File System Access API)
 */
export async function exportProjectAsZip(
  cells: Cell[],
  strokeWidth: number,
  canvasWidth: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Dynamically import JSZip
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    // Add each cell as SVG
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const filename = `cell-${String(i + 1).padStart(3, "0")}.svg`;
      const svgContent = strokesToSvg(cell.strokes, canvasWidth, cell.height ?? 320, strokeWidth);
      zip.file(filename, svgContent);
    }

    // Add manifest
    const manifest = createManifest(cells, strokeWidth);
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));

    // Generate and download
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "codepencil-project.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Export failed" };
  }
}

/**
 * Import project from ZIP file (fallback)
 */
export async function importProjectFromZip(file: File): Promise<{
  success: boolean;
  notebook?: Notebook;
  strokeWidth?: number;
  error?: string;
}> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(file);

    // Try to read manifest
    let manifest: ProjectManifest | null = null;
    const manifestFile = zip.file("manifest.json");
    if (manifestFile) {
      const manifestText = await manifestFile.async("string");
      manifest = JSON.parse(manifestText) as ProjectManifest;
    }

    const cells: Cell[] = [];

    if (manifest && manifest.cells) {
      for (const cellInfo of manifest.cells) {
        const svgFile = zip.file(cellInfo.file);
        if (svgFile) {
          const svgText = await svgFile.async("string");
          const { strokes, height } = svgToStrokes(svgText);

          cells.push({
            id: id(),
            strokes,
            height: cellInfo.height ?? height,
            recognizedCode: cellInfo.recognizedCode,
          });
        }
      }
    } else {
      // No manifest - find all SVG files
      const svgFiles = Object.keys(zip.files)
        .filter((name) => name.endsWith(".svg"))
        .sort();

      for (const name of svgFiles) {
        const svgFile = zip.file(name);
        if (svgFile) {
          const svgText = await svgFile.async("string");
          const { strokes, height } = svgToStrokes(svgText);

          cells.push({
            id: id(),
            strokes,
            height,
          });
        }
      }
    }

    if (cells.length === 0) {
      return { success: false, error: "No cells found in ZIP" };
    }

    return {
      success: true,
      notebook: { version: 1, cells },
      strokeWidth: manifest?.strokeWidth,
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Import failed" };
  }
}

