// Area annotation by outlining points on the model surface.
import { buildTriangleSoup, sliceLineOnSurface } from './surfaceline.js';

export function initAnnotation({ scene, camera, renderer, controls, getModel }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const annotateButton = document.getElementById('annotate');
  const clearButton = document.getElementById('clear');
  const hint = document.getElementById('hint');

  let annotating = false;
  let modelRadius = 1;
  const annotations = [];

  let soup = null;
  let soupModel = null;

  // in-progress outline
  let points = [];
  let normals = [];
  let committedSegs = [];
  let activeGroup = null;
  let outlineSegs = null;
  let previewLine = null;

  const markerGeom = new THREE.SphereGeometry(1, 16, 12);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0x2563eb, depthTest: false });
  const outlineMat = new THREE.LineBasicMaterial({ color: 0x2563eb, depthTest: false });

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

  function drapePoint(hit, n) {
    return hit.point.clone().addScaledVector(n, modelRadius * 0.004);
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

  function sliceEdge(i, j) {
    const from = points[i], to = points[j];
    const avgN = normals[i].clone().add(normals[j]);
    if (avgN.lengthSq() < 1e-20) avgN.copy(normals[i]);
    avgN.normalize();
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const viewpoint = mid.addScaledVector(avgN, from.distanceTo(to) || modelRadius * 0.1);
    return sliceLineOnSurface(ensureSoup(), from, to, viewpoint);
  }

  function startOutline() {
    points = [];
    normals = [];
    committedSegs = [];
    activeGroup = new THREE.Group();
    activeGroup.renderOrder = 999;
    outlineSegs = new THREE.LineSegments(new THREE.BufferGeometry(), outlineMat);
    previewLine = new THREE.Line(new THREE.BufferGeometry(), outlineMat);
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
    const m = new THREE.Mesh(markerGeom, markerMat);
    m.position.copy(dp);
    m.scale.setScalar(modelRadius * 0.005);
    m.renderOrder = 1000;
    activeGroup.add(m);
  }

  function addPoint(hit) {
    const n = worldNormal(hit);
    points.push(hit.point.clone());
    normals.push(n);
    addMarker(drapePoint(hit, n));
    if (points.length >= 2) {
      committedSegs.push(...sliceEdge(points.length - 2, points.length - 1));
      refreshOutline();
    }
    updatePreview(null);
  }

  function closeOutline() {
    if (points.length < 3) return;
    committedSegs.push(...sliceEdge(points.length - 1, 0));
    refreshOutline();
    updatePreview(null);

    annotations.push(activeGroup);
    activeGroup = null;
    startOutline(); // ready for the next annotation
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

  function clearAnnotations() {
    for (const g of annotations) disposeGroup(g);
    annotations.length = 0;
    cancelOutline();
  }

  function setAnnotating(on) {
    if (on && !getModel()) return;
    annotating = on;
    controls.enabled = !on;
    annotateButton.classList.toggle('active', on);
    hint.style.display = on ? 'block' : 'none';
    renderer.domElement.style.cursor = on ? 'crosshair' : '';

    if (on) {
      modelRadius = computeModelRadius();
      startOutline();
    } else if (activeGroup) {
      disposeGroup(activeGroup);
      activeGroup = null;
    }
  }

  annotateButton.addEventListener('click', () => setAnnotating(!annotating));
  clearButton.addEventListener('click', clearAnnotations);

  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!annotating || points.length === 0) return;
    const hit = raycastModel(e);
    updatePreview(hit ? hit.point.clone() : null);
  });

  renderer.domElement.addEventListener('click', (e) => {
    if (!annotating) return;
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
    if (!annotating) return;
    if (e.key === 'Enter') closeOutline();
    else if (e.key === 'Escape') cancelOutline();
  });

  return { setAnnotating, clear: clearAnnotations };
}
