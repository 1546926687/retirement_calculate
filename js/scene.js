// js/scene.js — Three.js scene, camera, dual renderers, animation loop
import * as THREE from 'three';
import { createPostProcessing } from './postprocessing.js';

let camera, scene, renderer, composer;
let mouseX = 0, mouseY = 0;
let updateBg, renderCSS2D;
let chartUpdateFn;

export async function initScene() {
  const container = document.getElementById('threeContainer');
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Scene
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
  camera.position.set(0, 0, 1500);

  // WebGL Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  // Post-processing
  const pp = createPostProcessing(renderer, scene, camera);
  composer = pp.composer;

  // Mouse parallax
  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  // Load background
  const bgModule = await import('./background.js');
  bgModule.initBackground(scene);
  updateBg = bgModule.updateBackground;

  // Load 3D chart
  const chartModule = await import('./chart3d.js');
  chartModule.initChart(scene, camera, container);
  renderCSS2D = chartModule.renderCSS2D;
  chartUpdateFn = chartModule.updateChart;

  // Resize handler
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  });

  // Target rotation for parallax
  let targetRotX = 0, targetRotY = 0;

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);

    // Mouse parallax (~2 degrees)
    targetRotY = mouseX * 0.035;
    targetRotX = -mouseY * 0.035;
    camera.rotation.x += (targetRotX - camera.rotation.x) * 0.05;
    camera.rotation.y += (targetRotY - camera.rotation.y) * 0.05;

    updateBg();
    composer.render();
    if (renderCSS2D) renderCSS2D(scene, camera);
  }
  animate();

  return chartUpdateFn;
}
