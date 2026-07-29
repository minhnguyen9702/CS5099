export function createAnnotationStore() {
  const groups = [];
  let currentGroupId = null;
  let currentAnnotationId = null;

  const settings = {
    // scene-level state that belongs to the whole document, not to any group.
    homeView: null,
    outlineColor: '#2563eb',
    bgColor: '#000000',
  };

  const getSettings = () => settings;
  const setSetting = (key, value) => { settings[key] = value; };

  const getGroups = () => groups;
  const findGroup = (groupId) => groups.find((g) => g.id === groupId) || null;
  const getCurrentGroup = () => findGroup(currentGroupId);

  function groupOf(annotationId) {
    return groups.find((g) => g.annotations.some((a) => a.id === annotationId)) || null;
  }

  function find(annotationId) {
    const group = groupOf(annotationId);
    return group ? group.annotations.find((a) => a.id === annotationId) : null;
  }

  function findOutline(annotationId, outlineId) {
    const annotation = find(annotationId);
    return annotation ? annotation.outlines.find((o) => o.id === outlineId) || null : null;
  }

  const getCurrent = () => find(currentAnnotationId);

  const getVisibleAnnotations = () => (getCurrentGroup() || { annotations: [] }).annotations;

  // GROUPS

  function createGroup({ id, name } = {}) {
    const group = {
      id: id || crypto.randomUUID(),
      name: name || `Group ${groups.length + 1}`,
      annotations: [],
    };
    groups.push(group);
    return group;
  }

  function setCurrentGroup(groupId) {
    const group = findGroup(groupId);
    if (!group) return null;
    currentGroupId = group.id;
    if (groupOf(currentAnnotationId) !== group) currentAnnotationId = null;
    return group;
  }

  const ensureCurrentGroup = () => getCurrentGroup() || setCurrentGroup(createGroup().id);

  function setGroupName(groupId, name) {
    const group = findGroup(groupId);
    if (group) group.name = name;
  }


  function removeGroup(groupId) {
    const idx = groups.findIndex((g) => g.id === groupId);
    if (idx < 0) return null;
    const [removed] = groups.splice(idx, 1);
    if (currentGroupId === groupId) {
      currentAnnotationId = null;
      currentGroupId = groups.length ? groups[Math.min(idx, groups.length - 1)].id : null;
    }
    return removed;
  }

  // ANNOTATIONS

  function setCurrent(annotationId) {
    const group = groupOf(annotationId);
    if (!group) return null;
    currentGroupId = group.id;
    currentAnnotationId = annotationId;
    return find(annotationId);
  }

  function create({ id, name, body, groupId } = {}) {
    const group = groupId ? findGroup(groupId) : ensureCurrentGroup();
    const annotation = {
      id: id || crypto.randomUUID(),
      name: name || `Annotation ${group.annotations.length + 1}`,
      body: body || '',
      outlines: [],
    };
    group.annotations.push(annotation);
    return annotation;
  }

  const ensureCurrent = () => getCurrent() || setCurrent(create().id);

  function setName(annotationId, name) {
    const annotation = find(annotationId);
    if (annotation) annotation.name = name;
  }

  function setBody(annotationId, body) {
    const annotation = find(annotationId);
    if (annotation) annotation.body = body;
  }

  function removeAnnotation(annotationId) {
    const group = groupOf(annotationId);
    if (!group) return null;
    const idx = group.annotations.findIndex((a) => a.id === annotationId);
    if (currentAnnotationId === annotationId) currentAnnotationId = null;
    return group.annotations.splice(idx, 1)[0];
  }

  // OUTLINES

  function addOutline(annotationId, outline) {
    const annotation = find(annotationId);
    if (annotation) annotation.outlines.push(outline);
    return outline;
  }

  function setOutlineView(annotationId, outlineId, view) {
    const outline = findOutline(annotationId, outlineId);
    if (outline) outline.view = view;
  }

  function removeOutline(annotationId, outlineId) {
    const annotation = find(annotationId);
    if (!annotation) return null;
    const idx = annotation.outlines.findIndex((o) => o.id === outlineId);
    return idx < 0 ? null : annotation.outlines.splice(idx, 1)[0];
  }

  // Outline records carry the three.js group drawing them; strip it so only
  // the persistable fields are written out.
  const getExportData = () => ({
    settings: { ...settings },
    groups: groups.map((group) => ({
      ...group,
      annotations: group.annotations.map((annotation) => ({
        ...annotation,
        outlines: annotation.outlines.map(({ group: _drawing, ...outline }) => outline),
      })),
    })),
  });

  return {
    getSettings,
    setSetting,
    getGroups,
    getCurrentGroup,
    setCurrentGroup,
    createGroup,
    setGroupName,
    removeGroup,
    getVisibleAnnotations,
    getCurrent,
    setCurrent,
    ensureCurrent,
    create,
    setName,
    setBody,
    removeAnnotation,
    findOutline,
    addOutline,
    setOutlineView,
    removeOutline,
    getExportData,
  };
}
