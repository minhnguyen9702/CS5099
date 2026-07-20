export function initAnnotationPanel({
  getGroups, getCurrentGroup, onSelectGroup, onRenameGroup, onDeleteGroup,
  getAnnotations, getCurrentAnnotation, onSelectAnnotation, onDeleteAnnotation, onEditBody,
  onDeleteOutline, onShowOutline, onSetOutlineView,
}) {
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

  // The group picker: a dropdown to switch groups, a field to rename the
  // current one, and a delete control.
  function renderGroupBar(groups, current) {
    const bar = document.createElement('div');
    bar.className = 'group-bar';

    const select = document.createElement('select');
    select.className = 'group-select';
    select.title = 'Switch annotation group';
    for (const group of groups) {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name;
      option.selected = group === current;
      select.append(option);
    }
    select.addEventListener('change', () => onSelectGroup(select.value));

    const name = document.createElement('input');
    name.className = 'group-name';
    name.placeholder = 'Group name';
    name.title = 'Rename this group';
    name.value = current.name;
    name.addEventListener('input', () => onRenameGroup(current.id, name.value));

    bar.append(select, name, createDeleteButton('Delete group', () => onDeleteGroup(current.id)));
    return bar;
  }

  function render() {
    const groups = getGroups();
    const currentGroup = getCurrentGroup();
    const currentAnnotation = getCurrentAnnotation();
    panel.innerHTML = '';
    panel.style.display = currentGroup ? 'block' : 'none';
    if (!currentGroup) return;

    panel.append(renderGroupBar(groups, currentGroup));

    getAnnotations().forEach((annotation, annotationIdx) => {
      const annotationElement = document.createElement('div');
      annotationElement.className = annotation === currentAnnotation ? 'annotation current' : 'annotation';

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
