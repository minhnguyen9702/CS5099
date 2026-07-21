import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { buildTriangleSoup, sliceLineOnSurface } from './surfaceline.js';

// While drawing an annotation, materials ignore depth so the outline stays
// visible through the model. On close they are swapped for depth-tested
// materials so that the model can occlude the finished annotation.
const EDIT_MARKER_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x2563eb, depthTest: false });
const EDIT_OUTLINE_MATERIAL = new THREE.LineBasicMaterial({ color: 0x2563eb, depthTest: false });
const MARKER_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x2563eb });

const OUTLINE_MATERIAL = new LineMaterial({ color: 0x2563eb, linewidth: 1 });
const SELECTED_OUTLINE_MATERIAL = new LineMaterial({ color: 0x2563eb, linewidth: 3 });

// All outline and marker materials share one color, driven by the toolbar picker.
const COLORED_MATERIALS = [
  EDIT_MARKER_MATERIAL,
  EDIT_OUTLINE_MATERIAL,
  MARKER_MATERIAL,
  OUTLINE_MATERIAL,
  SELECTED_OUTLINE_MATERIAL,
];

export function setOutlineColor(hex) {
  for (const material of COLORED_MATERIALS) material.color.set(hex);
}

function updateOutlineResolution() {
  for (const material of [OUTLINE_MATERIAL, SELECTED_OUTLINE_MATERIAL]) {
    material.resolution.set(window.innerWidth, window.innerHeight);
  }
}

updateOutlineResolution();
window.addEventListener('resize', updateOutlineResolution);

const MARKER_GEOM = new THREE.SphereGeometry(1, 16, 12);

const OUTLINE_RENDER_ORDER = 999;
const MARKER_RENDER_ORDER = 1000;

// Both as a fraction of the model radius.
const MARKER_SCALE = 0.0005;
const SURFACE_LIFT = 0.0005;

export function initOutlineRenderer({ scene, getModel }) {
  let soup = null;
  let soupModel = null;
  let modelRadius = 1;

  function updateModelRadius() {
    const box = new THREE.Box3().setFromObject(getModel());
    modelRadius = box.isEmpty() ? 1 : box.getSize(new THREE.Vector3()).length() / 2 || 1;
    return modelRadius;
  }

  function ensureSoup() {
    const model = getModel();
    if (!soup || soupModel !== model) {
      soup = buildTriangleSoup(model);
      soupModel = model;
    }
    return soup;
  }

  function sliceEdge(from, to, nFrom, nTo) {
    const avgN = nFrom.clone().add(nTo);
    if (avgN.lengthSq() < 1e-20) avgN.copy(nFrom);
    avgN.normalize();
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const viewpoint = mid.addScaledVector(avgN, from.distanceTo(to) || modelRadius * 0.1);
    const segs = sliceLineOnSurface(ensureSoup(), from, to, viewpoint);

    for (const seg of segs) seg.addScaledVector(avgN, modelRadius * SURFACE_LIFT);
    return segs;
  }


  function sliceOutline(pts, nrms) {
  // Re-slice a full closed outline from its clicked points (used on import).
    const segs = [];
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      segs.push(...sliceEdge(pts[i], pts[j], nrms[i], nrms[j]));
    }
    return segs;
  }

  function makeMarker(position, material) {
    const marker = new THREE.Mesh(MARKER_GEOM, material);
    marker.position.copy(position);
    marker.scale.setScalar(modelRadius * MARKER_SCALE);
    marker.renderOrder = MARKER_RENDER_ORDER;
    return marker;
  }

  function makeLine(Ctor, material) {
    const line = new Ctor(new THREE.BufferGeometry(), material);
    line.renderOrder = OUTLINE_RENDER_ORDER;
    line.frustumCulled = false;
    return line;
  }

  function createEditGroup() {
    const group = new THREE.Group();
    group.renderOrder = OUTLINE_RENDER_ORDER;
    const segments = makeLine(THREE.LineSegments, EDIT_OUTLINE_MATERIAL);
    const preview = makeLine(THREE.Line, EDIT_OUTLINE_MATERIAL);
    group.add(segments, preview);
    scene.add(group);
    return { group, segments, preview };
  }

  function addEditMarker(group, position) {
    group.add(makeMarker(position, EDIT_MARKER_MATERIAL));
  }

  function makeFatLine(segs) {
  // The thick line of a finished outline. LineSegmentsGeometry wants the
  // segment endpoints flattened, and has no setFromPoints of its own.
    const geometry = new LineSegmentsGeometry();
    if (segs.length) geometry.setPositions(segs.flatMap((p) => [p.x, p.y, p.z]));

    const line = new LineSegments2(geometry, OUTLINE_MATERIAL);
    line.renderOrder = OUTLINE_RENDER_ORDER;
    line.frustumCulled = false;
    return line;
  }

  function commitEditGroup({ group, segments, preview }) {
  // The thin line drawn while editing is swapped for a thick one. Markers are
  // re-materialised first because LineSegments2 is itself a Mesh, and would
  // otherwise be caught by that traverse.
    group.remove(preview, segments);
    preview.geometry.dispose();

    group.traverse((o) => {
      if (o.isMesh) o.material = MARKER_MATERIAL;
    });

    const position = segments.geometry.getAttribute('position');
    const segs = position
      ? Array.from({ length: position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(position, i))
      : [];
    group.add(makeFatLine(segs));
    segments.geometry.dispose();
  }

  function buildGroup(pts, nrms) {
  // A finished outline built in one shot, for imported annotations.
    const group = new THREE.Group();
    group.renderOrder = OUTLINE_RENDER_ORDER;
    for (const p of pts) group.add(makeMarker(p, MARKER_MATERIAL));

    group.add(makeFatLine(sliceOutline(pts, nrms)));

    scene.add(group);
    return group;
  }

  function setGroupVisible(group, visible) {
  // Outlines belonging to a group other than the selected one stay in the scene
  // but hidden, so switching groups doesn't rebuild their geometry.
    group.visible = visible;
  }

  function setGroupSelected(group, selected) {
  // The outlines of the current annotation are drawn thicker than the rest.
    group.traverse((o) => {
      if (o.isLineSegments2) o.material = selected ? SELECTED_OUTLINE_MATERIAL : OUTLINE_MATERIAL;
    });
  }

  function disposeGroup(group) {
    scene.remove(group);
    group.traverse((o) => {
      if (o.geometry && o.geometry !== MARKER_GEOM) o.geometry.dispose();
    });
  }

  return {
    updateModelRadius,
    sliceEdge,
    createEditGroup,
    addEditMarker,
    commitEditGroup,
    buildGroup,
    setGroupVisible,
    setGroupSelected,
    disposeGroup,
  };
}
