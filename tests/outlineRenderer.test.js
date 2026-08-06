import * as THREE from 'three';
import { initOutlineRenderer, setOutlineColor } from '../static/outlineRenderer.js';
import { suite, test, assert, assertEqual, assertClose } from './harness.js';

suite('outlineRenderer');

const DEFAULT_COLOR = '#2563eb';
const vec = (x, y, z) => new THREE.Vector3(x, y, z);


function quad(y = 0) {
  // a flat quad in the y = 0 plane spanning [-1, 1] on x and z, as two triangles.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -1, y, -1, 1, y, -1, 1, y, 1,
    -1, y, -1, 1, y, 1, -1, y, 1,
  ], 3));
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
}


function fixture(model = quad()) {
  // Scene plus renderer
  const scene = new THREE.Scene();
  const state = { model };
  return { scene, state, outlines: initOutlineRenderer({ scene, getModel: () => state.model }) };
}

const lineOf = (group) => {
  let found = null;
  group.traverse((o) => {
    if (o.isLineSegments2) found = o;
  });
  return found;
};

const markersOf = (group) => group.children.filter((o) => o.isMesh && !o.isLineSegments2);

test('updateModelRadius measures half the model diagonal', () => {
  const { outlines } = fixture(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)));
  assertClose(outlines.updateModelRadius(), Math.sqrt(12) / 2);
});

test('updateModelRadius falls back to 1 for an empty or degenerate model', () => {
  assertEqual(fixture(new THREE.Group()).outlines.updateModelRadius(), 1);

  const point = new THREE.BufferGeometry();
  point.setAttribute('position', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
  assertEqual(fixture(new THREE.Mesh(point)).outlines.updateModelRadius(), 1);
});

test('sliceEdge lays a line on the surface, lifted clear of it', () => {
  const { outlines } = fixture();
  const radius = outlines.updateModelRadius();

  const up = vec(0, 1, 0);
  const segments = outlines.sliceEdge(vec(-0.5, 0, 0), vec(0.5, 0, 0), up.clone(), up.clone());

  assert(segments.length > 0, 'the edge should follow the quad');
  for (const point of segments) {
    assertClose(point.y, radius * 0.0010, 1e-9, 'segments should sit just above the surface');
    assertClose(point.z, 0, 1e-6);
  }
});

test('sliceEdge lifts along the average of the two normals', () => {
  const { outlines } = fixture();
  outlines.updateModelRadius();

  const segments = outlines.sliceEdge(vec(-0.5, 0, 0), vec(0.5, 0, 0), vec(0, 1, 0), vec(0, -1, 0));
  assert(segments.length > 0, 'an edge should still be produced');
  assert(segments[0].y > 0, 'the lift should follow the first normal');
});

test('sliceEdge re-reads the geometry when the model is replaced', () => {
  const { state, outlines } = fixture();
  const up = vec(0, 1, 0);
  const slice = (y) =>
    outlines.sliceEdge(vec(-0.5, y, 0), vec(0.5, y, 0), up.clone(), up.clone());

  assert(slice(0).length > 0, 'the first model should be sliced');
  assertEqual(slice(5).length, 0, 'nothing to slice where the first model is not');

  state.model = quad(5);
  assert(slice(5).length > 0, 'the replacement model should be sliced');
});

test('createEditGroup puts a drawable group in the scene', () => {
  const { scene, outlines } = fixture();
  const active = outlines.createEditGroup();

  assert(scene.children.includes(active.group), 'the group should be added to the scene');
  assertEqual(active.group.children.length, 2, 'committed segments plus the rubber-band preview');
  assert(active.segments.isLineSegments, 'segments should be a line');
  assert(!active.segments.frustumCulled, 'outlines must not be culled');
  assert(!active.segments.material.depthTest, 'a drawing outline shows through the model');
});

test('addEditMarker scales markers to the model', () => {
  const { outlines } = fixture(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)));
  const radius = outlines.updateModelRadius();
  const active = outlines.createEditGroup();

  outlines.addEditMarker(active.group, vec(1, 2, 3));

  const [marker] = markersOf(active.group);
  assertEqual(marker.position.x, 1);
  assertEqual(marker.position.z, 3);
  assertClose(marker.scale.x, radius * 0.0005);
  assert(!marker.material.depthTest, 'markers show through while drawing');
});

test('commitEditGroup swaps the drawing objects for a finished outline', () => {
  const { outlines } = fixture();
  const active = outlines.createEditGroup();
  outlines.addEditMarker(active.group, vec(0, 0, 0));
  active.segments.geometry.setFromPoints([vec(-0.5, 0, 0), vec(0.5, 0, 0)]);

  outlines.commitEditGroup(active);

  assert(!active.group.children.includes(active.preview), 'the preview is dropped');
  assert(!active.group.children.includes(active.segments), 'the thin line is replaced');

  const line = lineOf(active.group);
  assert(line, 'a wide line should have taken its place');
  assertEqual(line.geometry.attributes.instanceStart.count, 1, 'one segment carried over');

  const [marker] = markersOf(active.group);
  assert(marker.material.depthTest, 'a finished marker can be hidden by the model');
});

test('commitEditGroup copes with an outline that has no segments', () => {
  const { outlines } = fixture();
  const active = outlines.createEditGroup();

  outlines.commitEditGroup(active);
  assert(lineOf(active.group), 'an empty outline still yields a line object');
});

test('buildGroup rebuilds a saved outline in one shot', () => {
  const { scene, outlines } = fixture();
  outlines.updateModelRadius();

  const points = [vec(-0.5, 0, -0.5), vec(0.5, 0, -0.5), vec(0.5, 0, 0.5)];
  const normals = points.map(() => vec(0, 1, 0));
  const group = outlines.buildGroup(points, normals);

  assert(scene.children.includes(group), 'the rebuilt outline should be in the scene');
  assertEqual(markersOf(group).length, 3, 'one marker per clicked point');
  assert(lineOf(group).geometry.attributes.instanceStart.count > 0, 'the loop should be sliced');
});

test('setGroupVisible hides an outline without removing it', () => {
  const { scene, outlines } = fixture();
  const group = outlines.buildGroup([vec(0, 0, 0)], [vec(0, 1, 0)]);

  outlines.setGroupVisible(group, false);
  assertEqual(group.visible, false);
  assert(scene.children.includes(group), 'a hidden outline stays in the scene');

  outlines.setGroupVisible(group, true);
  assertEqual(group.visible, true);
});

test('setGroupSelected draws the current annotation more thickly', () => {
  const { outlines } = fixture();
  const group = outlines.buildGroup([vec(0, 0, 0)], [vec(0, 1, 0)]);

  outlines.setGroupSelected(group, true);
  assertEqual(lineOf(group).material.linewidth, 3);

  outlines.setGroupSelected(group, false);
  assertEqual(lineOf(group).material.linewidth, 1);
});

test('disposeGroup removes the outline and frees only its own geometry', () => {
  const { scene, outlines } = fixture();
  const group = outlines.buildGroup([vec(0, 0, 0)], [vec(0, 1, 0)]);

  const disposed = [];
  group.traverse((o) => o.geometry?.addEventListener('dispose', () => disposed.push(o)));

  outlines.disposeGroup(group);

  assert(!scene.children.includes(group), 'the group should leave the scene');
  assert(disposed.some((o) => o.isLineSegments2), 'the line geometry should be freed');

  assertEqual(disposed.length, 1, 'the shared marker geometry must survive');
});

test('setOutlineColor recolours markers and outlines together', () => {
  try {
    setOutlineColor('#ff0000');

    const { outlines } = fixture();
    const active = outlines.createEditGroup();
    outlines.addEditMarker(active.group, vec(0, 0, 0));

    assertEqual(active.segments.material.color.getHex(), 0xff0000);
    assertEqual(markersOf(active.group)[0].material.color.getHex(), 0xff0000);

    outlines.commitEditGroup(active);
    assertEqual(lineOf(active.group).material.color.getHex(), 0xff0000);
    assertEqual(markersOf(active.group)[0].material.color.getHex(), 0xff0000);
  } finally {
    setOutlineColor(DEFAULT_COLOR);
  }
});
