// js/postprocessing.js — EffectComposer + UnrealBloomPass
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export function createPostProcessing(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    0.8,  // strength
    0.4,  // radius
    0.6   // threshold
  );
  composer.addPass(bloomPass);

  return { composer, bloomPass };
}
