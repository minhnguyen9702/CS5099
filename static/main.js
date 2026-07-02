// glb viewer

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ArcballControls } from 'three/addons/controls/ArcballControls.js';


// renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);   // crisp on HiDPI screens
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);


// scene and camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.001,
  2000,
);
camera.up.set(0, 1, 0);
camera.position.set(3, 3, 3);


// lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 1.0;
const keyLight = new THREE.DirectionalLight(0xffffff, 0.4);
keyLight.position.set(1, 2, 3);
scene.add(keyLight);


// controls
const controls = new ArcballControls(camera, renderer.domElement, scene);
controls.setGizmosVisible(false);

// helper functions
function frameObject(object, margin = 1.2) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);

  const fitHeight = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  const fitWidth = fitHeight / camera.aspect;
  const distance = margin * Math.max(fitHeight, fitWidth);

  const viewDir = new THREE.Vector3().subVectors(camera.position, controls.target);
  if (viewDir.lengthSq() === 0) viewDir.set(1, 1, 1);
  viewDir.normalize();

  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(viewDir, distance);

  camera.near = Math.max(distance / 1000, 0.001);
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  controls.update();
}
const loader = new GLTFLoader();
let currentModel = null;

async function loadModel(file) {
  const url = URL.createObjectURL(file);
  try {
    const gltf = await loader.loadAsync(url);

    if (currentModel) removeModel(currentModel);
    currentModel = gltf.scene;
    scene.add(currentModel);

    frameObject(currentModel);
  } catch (err) {
    console.error('Failed to load model:', err);
  } finally {
    URL.revokeObjectURL(url);
  }
}
function removeModel(model) {
  scene.remove(model);
  model.traverse((o) => {
    o.geometry?.dispose?.();
    o.material?.dispose?.();
  });
}

// page elements
const openButton = document.getElementById('open');
const fileInput = document.getElementById('file');

openButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadModel(file);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (currentModel) frameObject(currentModel);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});