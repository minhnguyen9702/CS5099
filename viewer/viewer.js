import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ArcballControls } from 'three/addons/controls/ArcballControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { initOutlineRenderer, setOutlineColor } from './outlineRenderer.js';
import { createAnnotationStore } from './annotationStore.js';
import { initAnnotationPicker } from './annotationPicker.js';
import { initViewerPanel } from './viewerPanel.js';

const MODEL_URL = './model.glb';
const ANNOTATIONS_URL = './annotations.json';

const toVectors = (list) => (list || []).map((p) => new THREE.Vector3(p.x, p.y, p.z));


// renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
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


// model loading (from the bundled .glb rather than a file picker)
let currentModel = null;
const getModel = () => currentModel;

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

async function loadModel(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  currentModel = gltf.scene;
  scene.add(currentModel);
  frameObject(currentModel);
}


window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

function setView(json) {
  controls.setStateFromJSON(json);
}


// annotations
const store = createAnnotationStore();
const outlines = initOutlineRenderer({ scene, getModel });

let panel;

function syncOutlineVisibility() {
  const current = store.getCurrentGroup();
  const currentAnnotation = store.getCurrent();
  for (const group of store.getGroups()) {
    for (const annotation of group.annotations) {
      for (const outline of annotation.outlines) {
        outlines.setGroupVisible(outline.group, group === current);
        outlines.setGroupSelected(outline.group, annotation === currentAnnotation);
      }
    }
  }
}

function refreshPanel() {
  syncOutlineVisibility();
  panel.render();
}

function selectGroup(groupId) {
  if (store.setCurrentGroup(groupId)) refreshPanel();
}

function selectAnnotation(annotationId) {
  if (store.setCurrent(annotationId)) refreshPanel();
}

function showOutline(annotationId, outlineId) {
  const outline = store.findOutline(annotationId, outlineId);
  if (outline && outline.view) setView(JSON.stringify(outline.view));
}

// IMPORT (mirrors the editor's import path, minus the editing hooks)

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
  const built = (record.outlines || []).filter(isDrawable).map(buildOutline);
  if (!built.length) return;

  const annotation = store.create({ id: record.id, name: record.name, body: record.body, groupId });
  for (const outline of built) store.addOutline(annotation.id, outline);
}

function importGroup(record) {
  const group = store.createGroup({ id: record.id, name: record.name });
  for (const annotation of record.annotations || []) importAnnotation(annotation, group.id);
}

function applySettings(settings) {
  if (!settings) return;
  if (settings.outlineColor) setOutlineColor(settings.outlineColor);
  if (settings.bgColor) scene.background = new THREE.Color(settings.bgColor);
}


async function start() {
  panel = initViewerPanel({
    getGroups: store.getGroups,
    getCurrentGroup: store.getCurrentGroup,
    onSelectGroup: selectGroup,
    getAnnotations: store.getVisibleAnnotations,
    getCurrentAnnotation: store.getCurrent,
    onSelectAnnotation: selectAnnotation,
    onShowOutline: showOutline,
  });

  initAnnotationPicker({
    camera,
    renderer,
    getModel,
    getAnnotations: store.getVisibleAnnotations,
    isEnabled: () => true,
    onPick: (annotation) => selectAnnotation(annotation.id),
  });

  const [, data] = await Promise.all([
    loadModel(MODEL_URL),
    fetch(ANNOTATIONS_URL).then((r) => r.json()),
  ]);

  applySettings(data.settings);

  outlines.updateModelRadius();
  for (const record of data.groups || []) importGroup(record);

  const [first] = store.getGroups();
  if (first) store.setCurrentGroup(first.id);

  if (data.settings && data.settings.homeView) setView(data.settings.homeView);

  refreshPanel();
}

start().catch((err) => console.error('Failed to start viewer:', err));
