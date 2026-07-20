// Side panel listing annotations and their outlines, with delete controls.
export function initAnnotationPanel({ getAnnotations, getCurrentId, onSelectAnnotation, onDeleteAnnotation, onDeleteOutline, onShowOutline, onSetOutlineView, onEditBody }) {
  const panel = document.getElementById('panel');

  function createButton(className, label, title, onClick) {
    const btn = document.createElement('button');
    btn.className = className;
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // don't also trigger the annotation's select handler
      onClick();
    });
    return btn;
  }

  function createDeleteButton(title, onClick) {
    return createButton('del', 'x', title, onClick);
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

      const body = document.createElement('textarea');
      body.className = 'annotation-body';
      body.placeholder = 'Add a description…';
      body.value = annotation.body || '';
      body.addEventListener('input', () => onEditBody(annotation.id, body.value));
      annotationElement.append(body);

      annotation.outlines.forEach((outline, outlineIdx) => {
        const row = document.createElement('div');
        row.className = 'outline-row';
        const label = document.createElement('span');
        label.textContent = `Outline ${outlineIdx + 1}`;
        if (outline.view) {
          // Clicking the label returns the camera to where the outline was drawn.
          label.className = 'outline-view';
          label.title = 'Click to return to the view this outline was drawn from';
          label.addEventListener('click', () => onShowOutline(annotation.id, outline.id));
        }
        const actions = document.createElement('span');
        actions.className = 'outline-actions';
        actions.append(
          createButton(
            'set-view',
            'Set View',
            'Save the current camera view for this outline',
            () => onSetOutlineView(annotation.id, outline.id),
          ),
          createDeleteButton('Delete outline', () => onDeleteOutline(annotation.id, outline.id)),
        );
        row.append(label, actions);
        annotationElement.append(row);
      });

      panel.append(annotationElement);
    });
  }

  return { render };
}
