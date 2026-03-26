// js/background.js — Particle starfield + data flow network animation
import * as THREE from 'three';

let particles;
let nodes = [], lines = [], pulses = [];
let clock;
let parentScene;

const PARTICLE_COUNT = 2000;
const NODE_COUNT = 30;
const CONNECTION_DISTANCE = 250;

export function initBackground(scene) {
  parentScene = scene;
  clock = new THREE.Clock();

  // --- Particle Starfield ---
  const particleGeom = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);

  const colorA = new THREE.Color(0x4a90d9);
  const colorB = new THREE.Color(0xffffff);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 3000;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2000;
    positions[i * 3 + 2] = -500 - Math.random() * 1500;

    const mixFactor = Math.random();
    const color = colorA.clone().lerp(colorB, mixFactor);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const particleMat = new THREE.PointsMaterial({
    size: 2,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  particles = new THREE.Points(particleGeom, particleMat);
  scene.add(particles);

  // --- Data Flow Network ---
  const nodeMat = new THREE.MeshBasicMaterial({
    color: 0x1e90ff,
    transparent: true,
    opacity: 0.6,
  });
  const nodeGeom = new THREE.SphereGeometry(3, 8, 8);

  for (let i = 0; i < NODE_COUNT; i++) {
    const mesh = new THREE.Mesh(nodeGeom, nodeMat.clone());
    mesh.position.set(
      (Math.random() - 0.5) * 1600,
      (Math.random() - 0.5) * 1000,
      -100 - Math.random() * 200
    );
    mesh.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.1
    );
    scene.add(mesh);
    nodes.push(mesh);
  }
}

export function updateBackground() {
  if (!particles) return;
  const time = clock.getElapsedTime();

  // Rotate starfield
  particles.rotation.y += 0.0002;

  // Flicker
  particles.material.opacity = 0.6 + Math.sin(time * 0.5) * 0.1;

  // Move data flow nodes
  nodes.forEach(node => {
    node.position.add(node.userData.velocity);
    if (Math.abs(node.position.x) > 800) node.userData.velocity.x *= -1;
    if (Math.abs(node.position.y) > 500) node.userData.velocity.y *= -1;
    if (node.position.z > -100 || node.position.z < -300) node.userData.velocity.z *= -1;
  });

  // Update connections
  lines.forEach(line => {
    if (line.parent) line.parent.remove(line);
    line.geometry.dispose();
    line.material.dispose();
  });
  lines.length = 0;

  const lineMat = new THREE.LineBasicMaterial({
    color: 0x1e90ff,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dist = nodes[i].position.distanceTo(nodes[j].position);
      if (dist < CONNECTION_DISTANCE) {
        const geom = new THREE.BufferGeometry().setFromPoints([
          nodes[i].position.clone(),
          nodes[j].position.clone()
        ]);
        const line = new THREE.Line(geom, lineMat.clone());
        line.material.opacity = 0.12 * (1 - dist / CONNECTION_DISTANCE);
        parentScene.add(line);
        lines.push(line);
      }
    }
  }

  // Data pulses
  if (Math.random() < 0.02 && lines.length > 0) {
    const lineIdx = Math.floor(Math.random() * lines.length);
    const line = lines[lineIdx];
    const positions = line.geometry.attributes.position.array;
    const start = new THREE.Vector3(positions[0], positions[1], positions[2]);
    const end = new THREE.Vector3(positions[3], positions[4], positions[5]);

    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0x4a90d9,
      transparent: true,
      opacity: 0.8,
    });
    const pulseGeom = new THREE.SphereGeometry(1.5, 6, 6);
    const pulseMesh = new THREE.Mesh(pulseGeom, pulseMat);
    pulseMesh.position.copy(start);
    pulseMesh.userData.start = start;
    pulseMesh.userData.end = end;
    pulseMesh.userData.progress = 0;
    parentScene.add(pulseMesh);
    pulses.push(pulseMesh);
  }

  // Animate pulses
  for (let i = pulses.length - 1; i >= 0; i--) {
    const pulse = pulses[i];
    pulse.userData.progress += 0.02;
    if (pulse.userData.progress >= 1) {
      if (pulse.parent) pulse.parent.remove(pulse);
      pulse.geometry.dispose();
      pulse.material.dispose();
      pulses.splice(i, 1);
    } else {
      pulse.position.lerpVectors(pulse.userData.start, pulse.userData.end, pulse.userData.progress);
      pulse.material.opacity = 0.8 * (1 - Math.abs(pulse.userData.progress - 0.5) * 2);
    }
  }
}
