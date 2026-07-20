import * as THREE from 'three';
import { createAnnotationStore } from './annotationStore.js';
import { initOutlineRenderer } from './outlineRenderer.js';
import { initAnnotationLoader } from './annotationLoader.js';
import { initAnnotationPanel } from './annotationPanel.js';

const CLOSE_LOOP_PIXELS = 15;

const toRecord = (v) => ({ x: v.x, y: v.y, z: v.z });
const toVectors = (list) => (list || []).map((p) => new THREE.Vector3(p.x, p.y, p.z));

export function initAnnotation({ scene, camera, renderer, controls, getModel, getView, setView }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const newGroupButton = document.getElementById('new-group');
  const newAnnotationButton = document.getElementById('new-annotation');
  const outlineButton = document.getElementById('outline');
  const hint = document.getElementById('hint');

  const store = createAnnotationStore();
  const outlines = initOutlineRenderer({ scene, getModel });

  let outlining = false;

  let points = [];
  let normals = [];
  let segs = [];
  let active = null;

  function raycastModel(event) {
    const model = getModel();
    if (!model) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(model, true);
    return hits[0] || null;
  }

  function worldNormal(hit) {
    if (!hit.face) return new THREE.Vector3(0, 1, 0);
    return hit.face.normal.clone()
      .transformDirection(hit.object.matrixWorld).normalize();
  }


  const outlinesOf = (annotations) => annotations.flatMap((a) => a.outlines);


  function syncOutlineVisibility() {
    const current = store.getCurrentGroup();
    for (const group of store.getGroups()) {
      for (const outline of outlinesOf(group.annotations)) {
        outlines.setGroupVisible(outline.group, group === current);
      }
    }
  }

  // DRAWING

  function startOutline() {
    points = [];
    normals = [];
    segs = [];
    active = outlines.createEditGroup();
  }

  function refreshOutline() {
    active.segments.geometry.setFromPoints(segs);
  }

  function updatePreview(hover) {
    const verts = (hover && points.length) ? [points[points.length - 1], hover] : [];
    active.preview.geometry.setFromPoints(verts);
  }

  function sliceBetween(i, j) {
    return outlines.sliceEdge(points[i], points[j], normals[i], normals[j]);
  }

  function addPoint(hit) {
    points.push(hit.point.clone());
    normals.push(worldNormal(hit));
    outlines.addEditMarker(active.group, points[points.length - 1]);
    if (points.length >= 2) {
      segs.push(...sliceBetween(points.length - 2, points.length - 1));
      refreshOutline();
    }
    updatePreview(null);
  }

  function closeOutline() {
    if (points.length < 3) return;
    segs.push(...sliceBetween(points.length - 1, 0));
    refreshOutline();
    outlines.commitEditGroup(active);

    store.addOutline(store.ensureCurrent().id, {
      id: crypto.randomUUID(),
      points: points.map(toRecord),
      normals: normals.map(toRecord),
      view: JSON.parse(getView()),
      group: active.group,
    });
    refreshPanel();

    startOutline();
  }

  function cancelOutline() {
    if (active) outlines.disposeGroup(active.group);
    startOutline();
  }

  // GROUP ACTIONS

  function startNewGroup() {
    if (!getModel()) return;
    store.setCurrentGroup(store.createGroup().id);
    refreshPanel();
  }

  function selectGroup(groupId) {
    if (store.setCurrentGroup(groupId)) refreshPanel();
  }


  function deleteGroup(groupId) {
    const removed = store.removeGroup(groupId);
    if (removed) discardOutlines(outlinesOf(removed.annotations));
  }

  // ANNOTATION ACTIONS

  function selectAnnotation(annotationId) {
    if (store.setCurrent(annotationId)) refreshPanel();
  }

  function deleteAnnotation(annotationId) {
    const removed = store.removeAnnotation(annotationId);
    if (removed) discardOutlines(removed.outlines);
  }

  function deleteOutline(annotationId, outlineId) {
    const removed = store.removeOutline(annotationId, outlineId);
    if (removed) discardOutlines([removed]);
  }


  function discardOutlines(removed) {
    for (const outline of removed) outlines.disposeGroup(outline.group);
    refreshPanel();
  }

  function showOutline(annotationId, outlineId) {
    const outline = store.findOutline(annotationId, outlineId);
    if (outline && outline.view) setView(JSON.stringify(outline.view));
  }

  function setOutlineView(annotationId, outlineId) {
    store.setOutlineView(annotationId, outlineId, JSON.parse(getView()));
    refreshPanel();
  }

  // IMPORT/EXPORT

  // Fewer than 3 points can't close a loop, so such an outline is dropped.
  const isDrawable = (outline) => (outline.points || []).length >= 3;

  function buildOutline(record) {
    return {
      id: record.id || crypto.randomUUID(),
      points: record.points,
      normals: record.normals || [],
      view: record.view || null,
      group: outlines.buildGroup(toVectors(record.points), toVectors(record.normals)),
    };
  }

  function importAnnotation(record, groupId) {
    // An annotation with nothing drawable left is dropped rather than imported
    // invisible, so the outlines are built before the annotation is created.
    const built = (record.outlines || []).filter(isDrawable).map(buildOutline);
    if (!built.length) return;

    const annotation = store.create({ id: record.id, name: record.name, body: record.body, groupId });
    for (const outline of built) store.addOutline(annotation.id, outline);
  }

  function importGroup(record) {
    const group = store.createGroup({ id: record.id, name: record.name });
    for (const annotation of record.annotations || []) importAnnotation(annotation, group.id);
  }

  function importAnnotations(data) {
    if (!getModel()) return;
    outlines.updateModelRadius();
    for (const record of data.groups || []) importGroup(record);
    const [first] = store.getGroups();
    if (first && !store.getCurrentGroup()) store.setCurrentGroup(first.id);
    refreshPanel();
  }

  // MODES

  function startNewAnnotation() {
    if (!getModel()) return;
    store.setCurrent(store.create().id);
    refreshPanel();
  }

  function setOutlining(on) {
    if (on && !getModel()) return;
    if (on) store.ensureCurrent();

    outlining = on;
    controls.enabled = !on;
    outlineButton.classList.toggle('active', on);
    hint.style.display = on ? 'block' : 'none';
    renderer.domElement.style.cursor = on ? 'crosshair' : '';

    if (on) {
      outlines.updateModelRadius();
      startOutline();
    } else if (active) {
      outlines.disposeGroup(active.group);
      active = null;
    }
    refreshPanel();
  }

  // WIRING

  newGroupButton.addEventListener('click', startNewGroup);
  newAnnotationButton.addEventListener('click', startNewAnnotation);
  outlineButton.addEventListener('click', () => setOutlining(!outlining));

  initAnnotationLoader({ getExportData: store.getExportData, onImport: importAnnotations });

  const panel = initAnnotationPanel({
    getGroups: store.getGroups,
    getCurrentGroup: store.getCurrentGroup,
    onSelectGroup: selectGroup,
    onRenameGroup: store.setGroupName,
    onDeleteGroup: deleteGroup,

    getAnnotations: store.getVisibleAnnotations,
    getCurrentAnnotation: store.getCurrent,
    onSelectAnnotation: selectAnnotation,
    onDeleteAnnotation: deleteAnnotation,
    onRenameAnnotation: store.setName,
    onEditBody: store.setBody,

    onDeleteOutline: deleteOutline,
    onShowOutline: showOutline,
    onSetOutlineView: setOutlineView,
  });

  function refreshPanel() {
    syncOutlineVisibility();
    panel.render();
  }

  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!outlining || points.length === 0) return;
    const hit = raycastModel(e);
    updatePreview(hit ? hit.point.clone() : null);
  });

  renderer.domElement.addEventListener('click', (e) => {
    if (!outlining) return;
    const hit = raycastModel(e);
    if (!hit) return;

    // Click near the first marker closes the loop.
    if (points.length >= 3) {
      const first = points[0].clone().project(camera);
      const cur = hit.point.clone().project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      const dx = (first.x - cur.x) * 0.5 * rect.width;
      const dy = (first.y - cur.y) * 0.5 * rect.height;
      if (Math.hypot(dx, dy) < CLOSE_LOOP_PIXELS) {
        closeOutline();
        return;
      }
    }
    addPoint(hit);
  });

  window.addEventListener('keydown', (e) => {
    if (!outlining) return;
    if (e.key === 'Enter') closeOutline();
    else if (e.key === 'Escape') cancelOutline();
  });
}
