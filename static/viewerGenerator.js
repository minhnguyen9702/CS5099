export function initViewerGenerator({ getModelFile, getExportData }) {
  const button = document.getElementById('generate-viewer');
  if (!button) return;

  async function writeFile(dir, name, data) {
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  async function writeToFolder(dir, file, annotations) {
    const assets = await fetch('/viewer-assets').then((r) => r.json());
    for (const [name, content] of Object.entries(assets)) await writeFile(dir, name, content);
    await writeFile(dir, 'model.glb', file);
    await writeFile(dir, 'annotations.json', annotations);
    alert(`Viewer written to “${dir.name}”.`);
  }

  async function downloadZip(file, annotations) {
    const form = new FormData();
    form.append('model', file, 'model.glb');
    form.append('annotations', annotations);

    const res = await fetch('/generate-zip', { method: 'POST', body: form });
    if (!res.ok) throw new Error((await res.json()).error || 'Generation failed');

    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = 'viewer.zip';
    link.click();
    URL.revokeObjectURL(url);
    alert('Viewer downloaded as viewer.zip. Unzip it and serve the folder over HTTP to open it.');
  }

  button.addEventListener('click', async () => {
    const file = getModelFile();
    if (!file) {
      alert('Open a .glb model before generating a viewer.');
      return;
    }
    const annotations = JSON.stringify(getExportData(), null, 2);

    let dir = null;
    if (window.showDirectoryPicker) {
      try {
        dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Folder selection failed:', err);
        return;
      }
    }

    button.disabled = true;
    try {
      if (dir) await writeToFolder(dir, file, annotations);
      else await downloadZip(file, annotations);
    } catch (err) {
      console.error('Failed to generate viewer:', err);
      alert(`Failed to generate viewer: ${err.message}`);
    } finally {
      button.disabled = false;
    }
  });
}
