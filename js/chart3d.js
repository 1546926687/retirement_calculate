// js/chart3d.js — 3D glow curve chart with raycaster hover + CSS2D labels
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { formatMoney } from './calculator.js';

let chartGroup;
let tubeMesh, fillMesh;
let dataPointMeshes = [];
let axisLines = [];
let axisLabels = [];
let depletionPlane, depletionLabel;
let css2dRenderer;
let raycaster, mouse;
let camera;

const CHART_WIDTH = 600;
const CHART_HEIGHT = 250;
const CHART_OFFSET_Y = -350;

export function initChart(scene, cam, domContainer) {
  camera = cam;
  chartGroup = new THREE.Group();
  chartGroup.position.set(-CHART_WIDTH / 2, CHART_OFFSET_Y, 0);
  scene.add(chartGroup);

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // CSS2D Renderer for labels
  css2dRenderer = new CSS2DRenderer();
  css2dRenderer.setSize(window.innerWidth, window.innerHeight);
  css2dRenderer.domElement.style.position = 'absolute';
  css2dRenderer.domElement.style.top = '0';
  css2dRenderer.domElement.style.left = '0';
  css2dRenderer.domElement.style.pointerEvents = 'none';
  domContainer.appendChild(css2dRenderer.domElement);

  // Mouse interaction
  domContainer.style.pointerEvents = 'auto';
  domContainer.addEventListener('mousemove', onMouseMove);

  window.addEventListener('resize', () => {
    css2dRenderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(dataPointMeshes);

  // Reset all points
  dataPointMeshes.forEach(m => {
    m.scale.setScalar(1);
    m.material.opacity = 0.4;
    if (m.userData.tooltipObj) m.userData.tooltipObj.visible = false;
  });

  if (intersects.length > 0) {
    const point = intersects[0].object;
    point.scale.setScalar(2);
    point.material.opacity = 1;
    if (point.userData.tooltipObj) {
      point.userData.tooltipObj.visible = true;
    }
  }
}

export function updateChart(years, depleted, startAge) {
  if (!chartGroup) return;
  clearChart();
  if (years.length === 0) return;

  const data = [years[0].startBalance, ...years.map(y => y.endBalance)];
  const maxVal = Math.max(...data) * 1.1 || 1;

  // Create curve points
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * CHART_WIDTH;
    const y = (val / maxVal) * CHART_HEIGHT;
    return new THREE.Vector3(x, y, 0);
  });

  // Tube curve
  if (points.length >= 2) {
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.3);
    const tubeGeom = new THREE.TubeGeometry(curve, points.length * 8, 1.5, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0x1e90ff,
      transparent: true,
      opacity: 0.9,
    });
    tubeMesh = new THREE.Mesh(tubeGeom, tubeMat);
    chartGroup.add(tubeMesh);

    // Fill area under curve
    const fillShape = new THREE.Shape();
    fillShape.moveTo(0, 0);
    points.forEach(p => fillShape.lineTo(p.x, p.y));
    fillShape.lineTo(points[points.length - 1].x, 0);
    fillShape.lineTo(0, 0);

    const fillGeom = new THREE.ShapeGeometry(fillShape);
    const fillMat = new THREE.ShaderMaterial({
      uniforms: {
        maxHeight: { value: CHART_HEIGHT },
        color: { value: new THREE.Color(0x1e90ff) },
      },
      vertexShader: `
        varying vec2 vUv;
        uniform float maxHeight;
        void main() {
          vUv = vec2(position.x, position.y / maxHeight);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 color;
        void main() {
          float alpha = vUv.y * 0.15;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    fillMesh = new THREE.Mesh(fillGeom, fillMat);
    chartGroup.add(fillMesh);
  }

  // Data point spheres
  const pointGeom = new THREE.SphereGeometry(3, 12, 12);

  points.forEach((p, i) => {
    const age = startAge + i;
    const yearData = i > 0 ? years[i - 1] : null;
    const hasExpense = yearData && yearData.bigExpense > 0;

    const mat = new THREE.MeshBasicMaterial({
      color: hasExpense ? 0xe17055 : 0x1e90ff,
      transparent: true,
      opacity: 0.4,
    });

    const mesh = new THREE.Mesh(pointGeom, mat);
    mesh.position.copy(p);
    chartGroup.add(mesh);

    // Tooltip label
    let tooltipText = `${age} 岁\n余额: ${formatMoney(data[i])}`;
    if (yearData) {
      if (yearData.workIncome > 0) tooltipText += `\n收入: +${formatMoney(yearData.workIncome)}`;
      if (yearData.bigExpense > 0) tooltipText += `\n${yearData.bigExpenseNotes}`;
      if (yearData.loanRepayment > 0) tooltipText += `\n还贷: ${formatMoney(yearData.loanRepayment)}`;
    }

    const labelDiv = document.createElement('div');
    labelDiv.style.cssText = `
      background: rgba(6,13,26,0.92);
      border: 1px solid rgba(30,144,255,0.3);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11px;
      color: #e0e8ff;
      white-space: pre-line;
      pointer-events: none;
      font-family: -apple-system, sans-serif;
    `;
    labelDiv.textContent = tooltipText;
    const labelObj = new CSS2DObject(labelDiv);
    labelObj.position.set(0, 15, 0);
    labelObj.visible = false;
    mesh.add(labelObj);
    mesh.userData.tooltipObj = labelObj;

    dataPointMeshes.push(mesh);
  });

  // Axes
  const axisMat = new THREE.LineBasicMaterial({
    color: 0x1e90ff,
    transparent: true,
    opacity: 0.2,
  });

  const xAxisGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(CHART_WIDTH, 0, 0),
  ]);
  const xAxis = new THREE.Line(xAxisGeom, axisMat);
  chartGroup.add(xAxis);
  axisLines.push(xAxis);

  const yAxisGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, CHART_HEIGHT, 0),
  ]);
  const yAxis = new THREE.Line(yAxisGeom, axisMat);
  chartGroup.add(yAxis);
  axisLines.push(yAxis);

  // X axis labels
  const xStep = Math.max(1, Math.floor(data.length / 6));
  for (let i = 0; i < data.length; i += xStep) {
    const x = (i / (data.length - 1)) * CHART_WIDTH;
    const labelDiv = document.createElement('div');
    labelDiv.style.cssText = 'font-size:10px;color:rgba(160,180,220,0.5);pointer-events:none;font-family:sans-serif;';
    labelDiv.textContent = (startAge + i) + '岁';
    const labelObj = new CSS2DObject(labelDiv);
    labelObj.position.set(x, -15, 0);
    chartGroup.add(labelObj);
    axisLabels.push(labelObj);
  }

  // Y axis labels
  for (let i = 0; i <= 4; i++) {
    const val = maxVal * (i / 4);
    const y = (i / 4) * CHART_HEIGHT;
    const labelDiv = document.createElement('div');
    labelDiv.style.cssText = 'font-size:10px;color:rgba(160,180,220,0.5);pointer-events:none;font-family:sans-serif;text-align:right;width:60px;';
    labelDiv.textContent = formatMoney(val);
    const labelObj = new CSS2DObject(labelDiv);
    labelObj.position.set(-35, y, 0);
    chartGroup.add(labelObj);
    axisLabels.push(labelObj);
  }

  // Depletion indicator
  if (depleted > 0) {
    const dx = (depleted / (data.length - 1)) * CHART_WIDTH;

    const planeGeom = new THREE.PlaneGeometry(2, CHART_HEIGHT);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0xff4757,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    depletionPlane = new THREE.Mesh(planeGeom, planeMat);
    depletionPlane.position.set(dx, CHART_HEIGHT / 2, 0);
    chartGroup.add(depletionPlane);

    const depLabelDiv = document.createElement('div');
    depLabelDiv.style.cssText = 'font-size:11px;color:#ff4757;font-weight:bold;pointer-events:none;font-family:sans-serif;';
    depLabelDiv.textContent = (startAge + depleted) + '岁耗尽';
    depletionLabel = new CSS2DObject(depLabelDiv);
    depletionLabel.position.set(dx, CHART_HEIGHT + 15, 0);
    chartGroup.add(depletionLabel);
  }
}

function clearChart() {
  if (!chartGroup) return;

  if (tubeMesh) {
    chartGroup.remove(tubeMesh);
    tubeMesh.geometry.dispose();
    tubeMesh.material.dispose();
    tubeMesh = null;
  }
  if (fillMesh) {
    chartGroup.remove(fillMesh);
    fillMesh.geometry.dispose();
    fillMesh.material.dispose();
    fillMesh = null;
  }

  dataPointMeshes.forEach(m => {
    chartGroup.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  });
  dataPointMeshes.length = 0;

  axisLines.forEach(l => {
    chartGroup.remove(l);
    l.geometry.dispose();
    l.material.dispose();
  });
  axisLines.length = 0;

  axisLabels.forEach(l => chartGroup.remove(l));
  axisLabels.length = 0;

  if (depletionPlane) {
    chartGroup.remove(depletionPlane);
    depletionPlane.geometry.dispose();
    depletionPlane.material.dispose();
    depletionPlane = null;
  }
  if (depletionLabel) {
    chartGroup.remove(depletionLabel);
    depletionLabel = null;
  }
}

export function renderCSS2D(scene, camera) {
  if (css2dRenderer) {
    css2dRenderer.render(scene, camera);
  }
}
