import * as THREE from 'three';
// Module responsible for saving and restoring camera views.

// https://easings.net/#easeInOutQuad
const easeInOut = (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

const positionOf = (matrix) =>
  new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(matrix.elements));

function savedPose(json) {
  const state = JSON.parse(json).arcballState;
  return {
    position: positionOf(state.cameraMatrix),
    target: positionOf(state.gizmoMatrix),
    up: new THREE.Vector3().copy(state.cameraUp).normalize(),
    fov: state.cameraFov,
    zoom: state.cameraZoom,
    near: state.cameraNear,
    far: state.cameraFar,
  };
}

export function initCameraView({ camera, controls }) {
  let flightId = 0;

  function getView() {
    camera.updateMatrix();
    controls._gizmos.updateMatrix();

    return JSON.stringify({
      arcballState: {
        cameraFar: camera.far,
        cameraFov: camera.fov,
        cameraMatrix: camera.matrix,
        cameraNear: camera.near,
        cameraUp: camera.up,
        cameraZoom: camera.zoom,
        gizmoMatrix: controls._gizmos.matrix,
        target: controls.target.toArray(),
      },
    });
  }

  const livePose = () => ({
    position: camera.position.clone(),
    target: controls.target.clone(),
    up: camera.up.clone(),
    fov: camera.fov,
    zoom: camera.zoom,
    near: camera.near,
    far: camera.far,
  });

  function poseAt(from, to, t) {
    camera.position.lerpVectors(from.position, to.position, t);
    controls.target.lerpVectors(from.target, to.target, t);

    camera.up.lerpVectors(from.up, to.up, t);
    if (camera.up.lengthSq() < 1e-8) camera.up.copy(to.up);
    camera.up.normalize();
    camera.lookAt(controls.target);

    camera.fov = THREE.MathUtils.lerp(from.fov, to.fov, t);
    camera.zoom = THREE.MathUtils.lerp(from.zoom, to.zoom, t);
    camera.near = THREE.MathUtils.lerp(from.near, to.near, t);
    camera.far = THREE.MathUtils.lerp(from.far, to.far, t);
    camera.updateProjectionMatrix();
  }

  // Jump straight to a saved view.
  const applyView = (json) => controls.setStateFromJSON(json);

  function setView(json, duration = 800) {
    const from = livePose();
    const to = savedPose(json);

    const id = ++flightId;
    controls.enabled = false;
    const start = performance.now();

    (function step(now = start) {
      if (id !== flightId) return;

      const t = Math.min((now - start) / duration, 1);
      poseAt(from, to, easeInOut(t));

      if (t < 1) requestAnimationFrame(step);
      else {
        applyView(json);
        controls.enabled = true;
      }
    })();
  }

  return { getView, setView, applyView };
}
