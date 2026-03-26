// js/main.js — Entry point, device detection, calculation orchestration
import { calculate, formatMoney } from './calculator.js';
import {
  setOnCalculate, initUI, collectParams,
  renderResults, fillTable
} from './ui.js';

const $ = id => document.getElementById(id);

const isMobile = window.innerWidth <= 768
  || /Android|iPhone|iPad/i.test(navigator.userAgent);

// --- 2D Canvas Chart (used on mobile, and as fallback) ---
function drawChart2D(years, depleted, startAge) {
  const canvas = $('chart');
  if (!canvas || canvas.style.display === 'none') return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;

  ctx.clearRect(0, 0, W, H);
  if (years.length === 0) return;

  const data = [years[0].startBalance, ...years.map(y => y.endBalance)];
  const maxVal = Math.max(...data) * 1.1 || 1;
  const padL = 70, padR = 20, padT = 28, padB = 40;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // Grid lines
  ctx.strokeStyle = 'rgba(30, 144, 255, 0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    const val = maxVal * (1 - i / 4);
    ctx.fillStyle = 'rgba(160, 180, 220, 0.5)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatMoney(val), padL - 8, y + 4);
  }

  // X labels
  ctx.fillStyle = 'rgba(160, 180, 220, 0.5)';
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(data.length / 8));
  for (let i = 0; i < data.length; i += step) {
    const x = padL + (i / (data.length - 1)) * chartW;
    ctx.fillText((startAge + i) + '岁', x, H - 10);
  }

  // Line
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = padL + (i / (data.length - 1)) * chartW;
    const y = padT + chartH * (1 - data[i] / maxVal);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#1e90ff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Gradient fill
  const lastX = padL + chartW;
  ctx.lineTo(lastX, padT + chartH);
  ctx.lineTo(padL, padT + chartH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
  grad.addColorStop(0, 'rgba(30, 144, 255, 0.2)');
  grad.addColorStop(1, 'rgba(30, 144, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Expense markers
  years.forEach((y, i) => {
    const dx = padL + ((i + 1) / (data.length - 1)) * chartW;
    if (y.bigExpense > 0) {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(225, 112, 85, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dx, padT);
      ctx.lineTo(dx, padT + chartH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#e17055';
      ctx.beginPath();
      ctx.moveTo(dx, padT);
      ctx.lineTo(dx - 4, padT - 8);
      ctx.lineTo(dx + 4, padT - 8);
      ctx.closePath();
      ctx.fill();
    } else if (y.loanRepayment > 0) {
      ctx.fillStyle = 'rgba(225, 112, 85, 0.3)';
      ctx.fillRect(dx - 0.5, padT + chartH - 4, 1, 4);
    }
  });

  // Store chart metadata for tooltip
  const extraInfoByIdx = {};
  years.forEach((y, i) => {
    const parts = [];
    if (y.workIncome > 0) parts.push('<span style="color:#2ed573">收入 +' + formatMoney(y.workIncome) + '</span>');
    if (y.bigExpense > 0) parts.push('<span style="color:#e17055">' + y.bigExpenseNotes + '</span>');
    if (y.loanRepayment > 0) parts.push('<span style="color:#e17055">还贷 ' + formatMoney(y.loanRepayment) + '</span>');
    if (parts.length > 0) extraInfoByIdx[i + 1] = parts.join('<br>');
  });
  canvas._chartMeta = { data, maxVal, padL, padR, padT, padB, chartW, chartH, startAge, W, H, extraInfo: extraInfoByIdx };

  // Zero line if depleted
  if (depleted > 0) {
    const zx = padL + (depleted / (data.length - 1)) * chartW;
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#ff4757';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(zx, padT);
    ctx.lineTo(zx, padT + chartH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff4757';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((startAge + depleted) + '岁耗尽', zx, padT - 4);
  }
}

// --- Chart tooltip (2D mode) ---
function initChartTooltip() {
  const canvas = $('chart');
  const tooltip = $('chartTooltip');
  const crossV = $('crossV');
  const crossH = $('crossH');
  const dot = $('chartDot');
  const container = canvas.parentElement;

  function hideTooltip() {
    tooltip.classList.remove('show');
    crossV.classList.remove('show');
    crossH.classList.remove('show');
    dot.classList.remove('show');
  }

  container.addEventListener('mousemove', function(e) {
    const meta = canvas._chartMeta;
    if (!meta || meta.data.length < 2) { hideTooltip(); return; }

    const rect = container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (mx < meta.padL || mx > meta.W - meta.padR || my < meta.padT || my > meta.padT + meta.chartH) {
      hideTooltip();
      return;
    }

    const ratio = (mx - meta.padL) / meta.chartW;
    const idx = Math.round(ratio * (meta.data.length - 1));
    const clampedIdx = Math.max(0, Math.min(meta.data.length - 1, idx));

    const pointX = meta.padL + (clampedIdx / (meta.data.length - 1)) * meta.chartW;
    const pointY = meta.padT + meta.chartH * (1 - meta.data[clampedIdx] / meta.maxVal);

    const age = meta.startAge + clampedIdx;
    const val = meta.data[clampedIdx];

    crossV.style.left = pointX + 'px';
    crossH.style.top = pointY + 'px';
    crossV.classList.add('show');
    crossH.classList.add('show');

    dot.style.left = pointX + 'px';
    dot.style.top = pointY + 'px';
    dot.classList.add('show');

    const extra = meta.extraInfo && meta.extraInfo[clampedIdx] ? '<br>' + meta.extraInfo[clampedIdx] : '';
    tooltip.innerHTML = `<span class="tt-age">${age} 岁</span><br>余额: <span class="tt-val">${formatMoney(val)}</span>${extra}`;
    tooltip.classList.add('show');

    const ttW = tooltip.offsetWidth;
    const ttH = tooltip.offsetHeight;
    let tx = pointX + 12;
    let ty = pointY - ttH - 12;
    if (tx + ttW > meta.W) tx = pointX - ttW - 12;
    if (ty < 0) ty = pointY + 16;
    tooltip.style.left = tx + 'px';
    tooltip.style.top = ty + 'px';
  });

  container.addEventListener('mouseleave', hideTooltip);
}

// --- Main calculation orchestrator ---
let updateChart = drawChart2D;

function runCalculation() {
  const params = collectParams();
  const results = calculate(params);
  renderResults(results, params);
  fillTable(results.years, params.hasPension, params.incomes.length > 0, params.expenses.length > 0);
  try {
    updateChart(results.years, results.depleted, params.age);
  } catch (e) {
    console.warn('Chart update error:', e);
  }
}

// --- Initialization ---
async function init() {
  if (isMobile) {
    document.body.classList.add('mobile-mode');
  }

  setOnCalculate(runCalculation);
  initUI();
  initChartTooltip();

  // Load 3D background + panel parallax on desktop
  if (!isMobile) {
    try {
      const { initScene } = await import('./scene.js');
      await initScene();
    } catch (e) {
      console.warn('Three.js init failed:', e);
    }
    initParallax();
  }

  runCalculation();
  window.addEventListener('resize', runCalculation);
}

// --- Panel 3D parallax ---
function initParallax() {
  const panels = document.querySelectorAll('.hud-panel');
  let mouseX = 0, mouseY = 0;
  let currentX = 0, currentY = 0;

  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;  // -1 to 1
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  function animate() {
    requestAnimationFrame(animate);
    // Smooth lerp
    currentX += (mouseX - currentX) * 0.08;
    currentY += (mouseY - currentY) * 0.08;

    panels.forEach((panel, i) => {
      // Each panel gets slightly different parallax depth
      const depth = 1 + i * 0.3;
      const rotY = currentX * 1.5 * depth;
      const rotX = -currentY * 1.0 * depth;
      const transX = currentX * 3 * depth;
      const transY = currentY * 2 * depth;
      panel.style.transform = `translateX(${transX}px) translateY(${transY}px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    });
  }
  animate();
}

init();
