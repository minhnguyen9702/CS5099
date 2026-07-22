import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ArcballControls } from 'three/addons/controls/ArcballControls.js';
import { initModelLoader } from './modelLoader.js';
import { initAnnotationEditor } from './annotationEditor.js';
import { createAnnotationStore } from './annotationStore.js';
import { initViewerGenerator } from './viewerGenerator.js';


// document-level state shared across modules (see annotationStore.js)
const store = createAnnotationStore();


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


// background color (driven by the toolbar picker, persisted in the store)
const bgColorInput = document.getElementById('bgColor');
function applyBgColor(hex) {
  bgColorInput.value = hex;
  scene.background = new THREE.Color(hex);
  store.setSetting('bgColor', hex);
}
applyBgColor(store.getSettings().bgColor);
bgColorInput.addEventListener('input', (e) => applyBgColor(e.target.value));


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


// glb model importing (see modelLoader.js)
const { getModel, getModelFile, frameObject } = initModelLoader({ scene, camera, controls });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  const currentModel = getModel();
  if (currentModel) frameObject(currentModel);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

const saveHomeView = document.getElementById('save-view');
const loadHomeView = document.getElementById("load-view");

saveHomeView.addEventListener('click', () => {
  store.setSetting('homeView', getView());
});

loadHomeView.addEventListener('click', () => {
  const { homeView } = store.getSettings();
  if (homeView) setView(homeView);
});

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

function setView(json) {
  controls.setStateFromJSON(json);
}

// lasso area annotation (see annotationEditor.js)
initAnnotationEditor({
  store,
  applyBgColor,
  scene,
  camera,
  renderer,
  controls,
  getModel,
  getView,
  setView,
});

// static viewer bundle generation (see viewerGenerator.js)
initViewerGenerator({ getModelFile, getExportData: store.getExportData });