export function initViewerPanel({
  getGroups, getCurrentGroup, onSelectGroup,
  getAnnotations, getCurrentAnnotation, onSelectAnnotation,
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
      annotationHeader.title = 'Click to cycle through this annotation’s saved views';
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

      panel.append(annotationElement);
    });
  }

  return { render };
}
