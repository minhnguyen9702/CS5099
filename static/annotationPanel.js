// Side panel listing annotations and their outlines, with delete controls.
export function initAnnotationPanel({ getAnnotations, getCurrentId, onSelectAnnotation, onDeleteAnnotation, onDeleteOutline }) {
  const panel = document.getElementById('panel');

  function createDeleteButton(title, onClick) {
    const btn = document.createElement('button');
    btn.className = 'del';
    btn.textContent = 'x';
    btn.title = title;
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // don't also trigger the annotation's select handler
      onClick();
    });
    return btn;
  }

  function render() {
    const annotations = getAnnotations();
    const currentId = getCurrentId ? getCurrentId() : null;
    panel.innerHTML = '';
    panel.style.display = annotations.length ? 'block' : 'none';

    annotations.forEach((annotation, annotationIdx) => {
      const annotationElement = document.createElement('div');
      annotationElement.className = annotation.id === currentId ? 'annotation current' : 'annotation';

      const annotationHeader = document.createElement('div');
      annotationHeader.className = 'annotation-head';
      annotationHeader.title = 'Click to make this the current annotation';
      annotationHeader.addEventListener('click', () => onSelectAnnotation(annotation.id));
      const title = document.createElement('span');
      title.textContent = `Annotation ${annotationIdx + 1}`;
      annotationHeader.append(title, createDeleteButton('Delete annotation', () => onDeleteAnnotation(annotation.id)));
      annotationElement.append(annotationHeader);

      annotation.outlines.forEach((outline, outlineIdx) => {
        const row = document.createElement('div');
        row.className = 'outline-row';
        const label = document.createElement('span');
        label.textContent = `Outline ${outlineIdx + 1}`;
        row.append(label, createDeleteButton('Delete outline', () => onDeleteOutline(annotation.id, outline.id)));
        annotationElement.append(row);
      });

      panel.append(annotationElement);
    });
  }

  return { render };
}
