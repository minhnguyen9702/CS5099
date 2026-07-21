import * as THREE from 'three';

// A click that drags further than this is an orbit, not a pick.
const DRAG_PIXELS = 4;

export function initAnnotationPicker({ camera, renderer, getModel, getAnnotations, isEnabled, onPick }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function surfacePointAt(x, y, rect) {
    const model = getModel();
    if (!model) return null;
    pointer.x = (x / rect.width) * 2 - 1;
    pointer.y = -(y / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(model, true)[0];
    return hit ? hit.point : null;
  }


  function toScreen(v, rect) {
    const p = v.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * rect.width, y: (-p.y * 0.5 + 0.5) * rect.height };
  }


  function loopContains(loop, x, y) {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const a = loop[i];
      const b = loop[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  const centroid = (pts) =>
    pts.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(pts.length);

  function annotationAt(x, y, rect, surfacePoint) {
    let found = null;
    let best = Infinity;

    for (const annotation of getAnnotations()) {
      for (const outline of annotation.outlines) {
        const pts = outline.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
        if (!loopContains(pts.map((p) => toScreen(p, rect)), x, y)) continue;

        const distance = centroid(pts).distanceTo(surfacePoint);
        if (distance < best) {
          best = distance;
          found = annotation;
        }
      }
    }
    return found;
  }

  let pressedAt = null;

  renderer.domElement.addEventListener('pointerdown', (e) => {
    pressedAt = { x: e.clientX, y: e.clientY };
  });

  renderer.domElement.addEventListener('click', (e) => {
    if (!isEnabled()) return;
    if (pressedAt && Math.hypot(e.clientX - pressedAt.x, e.clientY - pressedAt.y) > DRAG_PIXELS) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const surfacePoint = surfacePointAt(x, y, rect);
    if (!surfacePoint) return;

    const annotation = annotationAt(x, y, rect, surfacePoint);
    if (annotation) onPick(annotation);
  });
}
