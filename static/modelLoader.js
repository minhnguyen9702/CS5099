import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function initModelLoader({ scene, camera, controls }) {
  const loader = new GLTFLoader();
  let currentModel = null;

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

  return {
    getModel: () => currentModel,
    frameObject,
  };
}
