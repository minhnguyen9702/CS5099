/*
 * GLB viewer — flat / documentary rendering
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';


// ─── Page elements ──────────────────────────────────────────────────────────
const openButton = document.getElementById('open');
const fileInput  = document.getElementById('file');


// ─── Renderer ───────────────────────────────────────────────────────────────
// No tone mapping or exposure: the texture's own colours are shown as-is,
// rather than being remapped for a "photographic" look.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);   // crisp on HiDPI screens
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);


// ─── Scene & camera ─────────────────────────────────────────────────────────
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  50,                                       // field of view
  window.innerWidth / window.innerHeight,   // aspect ratio
  0.001,                                    // near clip — very close, for detail
  2000,                                     // far clip
);
camera.up.set(0, 0, 1);                     // Z-up coordinate convention
camera.position.set(3, 3, 3);               // start off to one side


// ─── Lighting ───────────────────────────────────────────────────────────────
// One white ambient light at full strength and nothing else. The model is lit
// evenly from all sides, so textures read clearly and nothing casts shadows —
// the trade-off is no surface relief or highlights from lighting.
scene.add(new THREE.AmbientLight(0xffffff, 1.0));


// ─── Controls ───────────────────────────────────────────────────────────────
// Click-drag to orbit, scroll to zoom (respects the Z-up axis set above).
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;


// ─── Helper: frame the camera on an object ──────────────────────────────────
// Centres the orbit point on the object and pulls the camera back just far
// enough to fit it on screen (margin = breathing room around it).
function frameObject(object, margin = 1.2) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;

  const size   = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);

  const fitHeight = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  const fitWidth  = fitHeight / camera.aspect;
  const distance  = margin * Math.max(fitHeight, fitWidth);

  // Keep looking from the camera's current direction, just at the new distance.
  const viewDir = new THREE.Vector3().subVectors(camera.position, controls.target);
  if (viewDir.lengthSq() === 0) viewDir.set(1, 1, 1);
  viewDir.normalize();

  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(viewDir, distance);

  // Keep the near/far range tight to the object so it never gets clipped.
  camera.near = Math.max(distance / 1000, 0.001);
  camera.far  = distance * 100;
  camera.updateProjectionMatrix();
  controls.update();
}


// ─── Helper: load a .glb file and show it ───────────────────────────────────
const loader = new GLTFLoader();
let currentModel = null;   // the model currently on screen, if any

async function loadModel(file) {
  const url = URL.createObjectURL(file);   // turn the local file into a loadable URL
  try {
    const gltf = await loader.loadAsync(url);

    if (currentModel) removeModel(currentModel);   // clear the previous one first
    currentModel = gltf.scene;
    scene.add(currentModel);

    frameObject(currentModel);
  } catch (err) {
    console.error('Failed to load model:', err);
  } finally {
    URL.revokeObjectURL(url);   // release the temporary URL
  }
}

// Remove a model from the scene and free its GPU memory.
function removeModel(model) {
  scene.remove(model);
  model.traverse((o) => {
    o.geometry?.dispose?.();
    o.material?.dispose?.();
  });
}


// ─── Events ─────────────────────────────────────────────────────────────────
// The visible button just forwards the click to the hidden file input.
openButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadModel(file);
});

// Keep the view correct when the window resizes, and re-frame the model.
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (currentModel) frameObject(currentModel);
});


// ─── Render loop ────────────────────────────────────────────────────────────
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});