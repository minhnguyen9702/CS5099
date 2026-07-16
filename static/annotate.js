// Area annotation by outlining points on the model surface.
import * as THREE from 'three';
import { buildTriangleSoup, sliceLineOnSurface } from './surfaceline.js';
import { initAnnotationLoader } from './annotationLoader.js';
import { initAnnotationPanel } from './annotationPanel.js';

export function initAnnotation({ scene, camera, renderer, controls, getModel }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const newAnnotationButton = document.getElementById('new-annotation');
  const outlineButton = document.getElementById('outline');
  const hint = document.getElementById('hint');

  let outlining = false;
  let modelRadius = 1;

  const annotations = [];
  let currentAnnotation = null; // annotation new outlines are added to

  let soup = null;
  let soupModel = null;

  // functions tracking in-progress outline
  let points = [];
  let normals = [];
  let committedSegs = [];
  let activeGroup = null;
  let outlineSegs = null;
  let previewLine = null;

  const markerGeom = new THREE.SphereGeometry(1, 16, 12);

  // While drawing an annotation, materials ignore depth
  // on close materials are swapped to depth-tested materials 
  // so that the model can occlude the finished annotation.
  const editMarkerMaterials = new THREE.MeshBasicMaterial({ color: 0x2563eb, depthTest: false });
  const editOutlineMaterials = new THREE.LineBasicMaterial({ color: 0x2563eb, depthTest: false });
  const markerMaterials = new THREE.MeshBasicMaterial({ color: 0x2563eb });
  const outlineMaterials = new THREE.LineBasicMaterial({ color: 0x2563eb });

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


  function computeModelRadius() {
    const box = new THREE.Box3().setFromObject(getModel());
    if (box.isEmpty()) return 1;
    return box.getSize(new THREE.Vector3()).length() / 2 || 1;
  }

  function ensureSoup() {
    const model = getModel();
    if (!soup || soupModel !== model) {
      soup = buildTriangleSoup(model);
      soupModel = model;
    }
    return soup;
  }

  function sliceEdgeBetween(from, to, nFrom, nTo) {
    const avgN = nFrom.clone().add(nTo);
    if (avgN.lengthSq() < 1e-20) avgN.copy(nFrom);
    avgN.normalize();
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const viewpoint = mid.addScaledVector(avgN, from.distanceTo(to) || modelRadius * 0.1);
    const segs = sliceLineOnSurface(ensureSoup(), from, to, viewpoint);
    // Once complete lift the finished annotation off of model's surface so that its visible.
    for (const seg of segs) seg.addScaledVector(avgN, modelRadius * 0.0005);
    return segs;
  }

  function sliceEdge(i, j) {
    return sliceEdgeBetween(points[i], points[j], normals[i], normals[j]);
  }

  // Re-slice a full closed outline from its clicked points (used on import).
  function buildOutlineSegs(pts, nrms) {
    const segs = [];
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      segs.push(...sliceEdgeBetween(pts[i], pts[j], nrms[i], nrms[j]));
    }
    return segs;
  }

  function startOutline() {
    points = [];
    normals = [];
    committedSegs = [];
    activeGroup = new THREE.Group();
    activeGroup.renderOrder = 999;
    outlineSegs = new THREE.LineSegments(new THREE.BufferGeometry(), editOutlineMaterials);
    previewLine = new THREE.Line(new THREE.BufferGeometry(), editOutlineMaterials);
    outlineSegs.renderOrder = 999;
    previewLine.renderOrder = 999;
    outlineSegs.frustumCulled = false;
    previewLine.frustumCulled = false;
    activeGroup.add(outlineSegs, previewLine);
    scene.add(activeGroup);
  }

  function refreshOutline() {
    outlineSegs.geometry.setFromPoints(committedSegs);
  }

  function updatePreview(hover) {
    const verts = (hover && points.length) ? [points[points.length - 1], hover] : [];
    previewLine.geometry.setFromPoints(verts);
  }

  function addMarker(dp) {
    const m = new THREE.Mesh(markerGeom, editMarkerMaterials);
    m.position.copy(dp);
    m.scale.setScalar(modelRadius * 0.0005);
    m.renderOrder = 1000;
    activeGroup.add(m);
  }

  function addPoint(hit) {
    const n = worldNormal(hit);
    points.push(hit.point.clone());
    normals.push(n);
    addMarker(points[points.length - 1]);
    if (points.length >= 2) {
      committedSegs.push(...sliceEdge(points.length - 2, points.length - 1));
      refreshOutline();
    }
    updatePreview(null);
  }

  function commitMaterials(group) {
  // Swap a finished annotation to depth-tested materials so the model occludes it.
    group.traverse((o) => {
      if (o.isLineSegments) o.material = outlineMaterials;
      else if (o.isMesh) o.material = markerMaterials;
    });
  }

  function closeOutline() {
    if (points.length < 3) return;
    committedSegs.push(...sliceEdge(points.length - 1, 0));
    refreshOutline();

    // The preview line only matters while drawing; drop it once committed.
    activeGroup.remove(previewLine);
    previewLine.geometry.dispose();

    commitMaterials(activeGroup);

    // Add this closed loop as an outline of the current annotation. Store the
    // defining data (clicked points + surface normals) so it can be exported
    // and re-sliced later.
    if (!currentAnnotation) currentAnnotation = newAnnotation();
    currentAnnotation.outlines.push({
      id: crypto.randomUUID(),
      points: points.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      normals: normals.map((n) => ({ x: n.x, y: n.y, z: n.z })),
      group: activeGroup,
    });
    refreshPanel();

    activeGroup = null;
    startOutline(); // ready for the next outline
  }

  function newAnnotation() {
    const annotation = { id: crypto.randomUUID(), outlines: [] };
    annotations.push(annotation);
    return annotation;
  }

  function disposeGroup(group) {
    scene.remove(group);
    group.traverse((o) => {
      if (o.geometry && o.geometry !== markerGeom) o.geometry.dispose();
    });
  }

  function cancelOutline() {
    if (activeGroup) disposeGroup(activeGroup);
    startOutline();
  }

  function deleteOutline(annotationId, outlineId) {
    const annotation = annotations.find((a) => a.id === annotationId);
    if (!annotation) return;
    const idx = annotation.outlines.findIndex((o) => o.id === outlineId);
    if (idx < 0) return;
    disposeGroup(annotation.outlines[idx].group);
    annotation.outlines.splice(idx, 1);
    refreshPanel(); // keep the annotation even when it has no outlines left
  }

  function selectAnnotation(annotationId) {
    const annotation = annotations.find((a) => a.id === annotationId);
    if (!annotation) return;
    currentAnnotation = annotation; // new outlines will be added here
    refreshPanel();
  }

  function deleteAnnotation(annotationId) {
    const idx = annotations.findIndex((a) => a.id === annotationId);
    if (idx < 0) return;
    for (const o of annotations[idx].outlines) disposeGroup(o.group);
    if (annotations[idx] === currentAnnotation) currentAnnotation = null;
    annotations.splice(idx, 1);
    refreshPanel();
  }

  // ---- export / import -------------------------------------------------
  // Serializable view of the annotations, handed to annotationLoader on export.
  function getExportData() {
    return {
      annotations: annotations.map((a) => ({
        id: a.id,
        outlines: a.outlines.map((o) => ({
          id: o.id,
          points: o.points,
          normals: o.normals,
        })),
      })),
    };
  }

  // Rebuild one outline (markers + re-sliced line) from stored point/normal data.
  function buildOutlineGroup(record) {
    const pts = (record.points || []).map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const nrms = (record.normals || []).map((n) => new THREE.Vector3(n.x, n.y, n.z));
    if (pts.length < 3) return null;

    const group = new THREE.Group();
    group.renderOrder = 999;

    for (const p of pts) {
      const m = new THREE.Mesh(markerGeom, markerMaterials);
      m.position.copy(p);
      m.scale.setScalar(modelRadius * 0.0005);
      m.renderOrder = 1000;
      group.add(m);
    }

    const outline = new THREE.LineSegments(new THREE.BufferGeometry(), outlineMaterials);
    outline.renderOrder = 999;
    outline.frustumCulled = false;
    outline.geometry.setFromPoints(buildOutlineSegs(pts, nrms));
    group.add(outline);

    scene.add(group);
    return {
      id: record.id || crypto.randomUUID(),
      points: record.points || [],
      normals: record.normals || [],
      group,
    };
  }

  function addImportedAnnotation(record) {
    const annotation = { id: record.id || crypto.randomUUID(), outlines: [] };
    for (const o of record.outlines || []) {
      const outline = buildOutlineGroup(o);
      if (outline) annotation.outlines.push(outline);
    }
    if (annotation.outlines.length) annotations.push(annotation);
  }

  function importAnnotations(data) {
    if (!getModel()) return;
    modelRadius = computeModelRadius();
    for (const record of data.annotations || []) addImportedAnnotation(record);
    refreshPanel();
  }

  // Create a new annotation and make it the one outlines are added to.
  function startNewAnnotation() {
    if (!getModel()) return;
    currentAnnotation = newAnnotation();
    refreshPanel();
  }

  function setOutlining(on) {
    if (on && !getModel()) return;
    // Outlining needs an annotation to add to; create one if none is current.
    if (on && !currentAnnotation) currentAnnotation = newAnnotation();

    outlining = on;
    controls.enabled = !on;
    outlineButton.classList.toggle('active', on);
    hint.style.display = on ? 'block' : 'none';
    renderer.domElement.style.cursor = on ? 'crosshair' : '';

    if (on) {
      modelRadius = computeModelRadius();
      startOutline();
    } else if (activeGroup) {
      disposeGroup(activeGroup);
      activeGroup = null;
    }
    refreshPanel();
  }

  newAnnotationButton.addEventListener('click', startNewAnnotation);
  outlineButton.addEventListener('click', () => setOutlining(!outlining));

  // export / import file handling (see annotationLoader.js)
  initAnnotationLoader({ getExportData, onImport: importAnnotations });

  // annotation list side panel (see annotationPanel.js)
  const panel = initAnnotationPanel({
    getAnnotations: () => annotations,
    getCurrentId: () => (currentAnnotation ? currentAnnotation.id : null),
    onSelectAnnotation: selectAnnotation,
    onDeleteAnnotation: deleteAnnotation,
    onDeleteOutline: deleteOutline,
  });
  function refreshPanel() { panel.render(); }

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
      if (Math.hypot(dx, dy) < 15) {
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
