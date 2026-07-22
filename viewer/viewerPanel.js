export function initViewerPanel({
  getGroups, getCurrentGroup, onSelectGroup,
  getAnnotations, getCurrentAnnotation, onSelectAnnotation,
  onShowOutline,
}) {
  const panel = document.getElementById('panel');

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

    bar.append(select);
    return bar;
  }

  function render() {
    const groups = getGroups();
    const currentGroup = getCurrentGroup();
    const currentAnnotation = getCurrentAnnotation();
    panel.innerHTML = '';
    panel.style.display = currentGroup ? 'block' : 'none';
    if (!currentGroup) return;

    if (groups.length > 1) panel.append(renderGroupBar(groups, currentGroup));

    getAnnotations().forEach((annotation) => {
      const annotationElement = document.createElement('div');
      annotationElement.className = annotation === currentAnnotation ? 'annotation current' : 'annotation';

      const annotationHeader = document.createElement('div');
      annotationHeader.className = 'annotation-head';
      annotationHeader.title = 'Click to focus this annotation';
      annotationHeader.addEventListener('click', () => onSelectAnnotation(annotation.id));

      const title = document.createElement('span');
      title.className = 'annotation-name';
      title.textContent = annotation.name;
      annotationHeader.append(title);
      annotationElement.append(annotationHeader);

      if (annotation.body) {
        const body = document.createElement('div');
        body.className = 'annotation-body';
        body.textContent = annotation.body;
        annotationElement.append(body);
      }

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
        row.append(label);
        annotationElement.append(row);
      });

      panel.append(annotationElement);
    });
  }

  return { render };
}
