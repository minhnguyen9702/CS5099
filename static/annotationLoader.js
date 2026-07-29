// Module responsible for exporting annotations to a JSON file and importing them back.
export function initAnnotationLoader({ getExportData, onImport }) {
  const exportButton = document.getElementById('export');
  const importButton = document.getElementById('import');
  const importInput = document.getElementById('annotationFile');

  async function exportAnnotations() {
    const json = JSON.stringify(getExportData(), null, 2);

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'annotations.json',
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Failed to export annotations:', err);
      }
      return;
    }

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'annotations.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  exportButton.addEventListener('click', exportAnnotations);
  importButton.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      onImport(JSON.parse(await file.text()));
    } catch (err) {
      console.error('Failed to import annotations:', err);
    }
    importInput.value = '';
  });
}
