export function initViewerGenerator({ getModelFile, getExportData }) {
  const button = document.getElementById('generate-viewer');
  if (!button) return;

  async function writeFile(dir, name, data) {
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  async function createSubfolder(parent, name) {
    let exists = false;
    try {
      await parent.getDirectoryHandle(name);
      exists = true;
    } catch (err) {
      if (err.name !== 'NotFoundError') throw err;
    }
    if (exists && !confirm(`The folder "${name}" already exists. Replace its contents?`)) return null;
    return parent.getDirectoryHandle(name, { create: true });
  }

  async function writeToFolder(dir, file, annotations) {
    const assets = await fetch('/viewer-assets').then((r) => r.json());
    for (const [name, content] of Object.entries(assets)) await writeFile(dir, name, content);
    await writeFile(dir, 'model.glb', file);
    await writeFile(dir, 'annotations.json', annotations);
    alert(`Viewer created in "${dir.name}".`);
  }

  async function downloadZip(file, annotations) {
    const form = new FormData();
    form.append('model', file, 'model.glb');
    form.append('annotations', annotations);

    const res = await fetch('/generate-zip', { method: 'POST', body: form });
    if (!res.ok) throw new Error((await res.json()).error || 'Could not create viewer.');

    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = 'viewer.zip';
    link.click();
    URL.revokeObjectURL(url);
    alert('Viewer downloaded as "viewer.zip". Extract it and serve the folder over HTTP to open it.');
  }

  button.addEventListener('click', async () => {
    const file = getModelFile();
    if (!file) {
      alert('Open a .glb model before creating a viewer.');
      return;
    }
    const annotations = JSON.stringify(getExportData(), null, 2);

    let parent = null;
    let name = '';
    if (window.showDirectoryPicker) {
      try {
        parent = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Folder selection failed:', err);
        return;
      }
      name = (prompt('Folder name:', 'Viewer') || '').trim();
      if (!name) return;
    }

    button.disabled = true;
    try {
      if (parent) {
        const target = await createSubfolder(parent, name);
        if (target) await writeToFolder(target, file, annotations);
      } else {
        await downloadZip(file, annotations);
      }
    } catch (err) {
      console.error('Could not create viewer:', err);
      alert(`Could not create viewer: ${err.message}`);
    } finally {
      button.disabled = false;
    }
  });
}
