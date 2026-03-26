# Three.js HUD Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the retirement savings calculator as a full 3D JARVIS-style HUD experience using Three.js, while preserving all existing calculation logic and mobile compatibility.

**Architecture:** Single-page app with Three.js WebGLRenderer for 3D backgrounds/chart and CSS3DRenderer for interactive HTML form panels. Calculator logic extracted as pure functions in a separate module. Mobile devices get a 2D CSS-only fallback.

**Tech Stack:** Three.js (r160+ via CDN importmap), ES modules, vanilla CSS, no build tools.

**Spec:** `docs/superpowers/specs/2026-03-26-threejs-hud-redesign.md`

---

## File Map

| File | Responsibility | New/Modified |
|------|---------------|--------------|
| `index.html` | Entry point, importmap, HTML panels markup | Modified (rewrite) |
| `css/hud.css` | JARVIS-blue HUD panel styles, form controls, desktop layout | New |
| `css/mobile.css` | Mobile 2D fallback styles | New |
| `js/main.js` | Device detection, init 3D or 2D path, animation loop | New |
| `js/calculator.js` | Pure calculation functions extracted from current code | New |
| `js/ui.js` | Form interaction, income/expense management, DOM events | New |
| `js/scene.js` | Three.js scene, camera, dual renderers, resize | New |
| `js/background.js` | Particle starfield + data flow network animation | New |
| `js/chart3d.js` | 3D glow curve chart with raycaster interaction | New |
| `js/postprocessing.js` | EffectComposer + UnrealBloomPass setup | New |
| `js/panels.js` | CSS3DRenderer panel positioning + enter animations | New |

---

### Task 1: Project scaffolding and calculator extraction

**Files:**
- Create: `js/calculator.js`
- Create: `css/hud.css` (minimal starter)
- Create: `css/mobile.css` (minimal starter)

This task extracts all pure calculation logic from the monolithic `index.html` into `js/calculator.js`. No DOM manipulation, no UI — just math.

- [ ] **Step 1: Create `js/calculator.js` with extracted pure functions**

Extract `formatMoney`, `addCommas`, `parseFormatted`, `wanHint`, and the core `calculate` function. The `calculate` function currently reads from DOM; refactor it to accept a params object and return data.

```js
// js/calculator.js

export function formatMoney(n) {
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2) + ' 万';
  return n.toFixed(2) + ' 元';
}

export function addCommas(n) {
  const parts = n.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

export function parseFormatted(s) {
  return parseFloat(String(s).replace(/,/g, '')) || 0;
}

export function wanHint(n) {
  if (n >= 1e8) return (n / 1e8) + ' 亿';
  if (n >= 1e4) return (n / 1e4) + ' 万';
  if (n > 0) return n + ' 元';
  return '';
}

/**
 * @param {Object} params
 * @param {number} params.age
 * @param {number} params.lifespan
 * @param {number} params.savings
 * @param {number} params.rate - decimal, e.g. 0.04
 * @param {number} params.spending - yearly
 * @param {boolean} params.hasPension
 * @param {string} params.gender - 'male' | 'female'
 * @param {number} params.pensionMonthly
 * @param {Array} params.incomes - [{label, startAge, endAge, monthly, yearly}]
 * @param {Array} params.expenses - [{age, amount, note, loanYearlyPayment, loanYears, loanAmount}]
 * @returns {Object} { years, depleted, safeSpending, remainingYears, lastBalance }
 */
export function calculate(params) {
  const {
    age, lifespan, savings, rate, spending,
    hasPension, gender, pensionMonthly,
    incomes, expenses
  } = params;

  const remainingYears = Math.max(lifespan - age, 1);
  const pensionYearly = pensionMonthly * 12;
  const pensionStartAge = gender === 'male' ? 65 : 60;
  const safeSpending = savings * rate;

  // Build expense lookup by age
  const expenseByAge = {};
  expenses.forEach(e => {
    if (!expenseByAge[e.age]) expenseByAge[e.age] = [];
    expenseByAge[e.age].push(e);
  });

  const years = [];
  let balance = savings;
  let depleted = -1;

  for (let i = 1; i <= remainingYears; i++) {
    const currentAge = age + i;
    const interest = balance * rate;
    const pensionIncome = (hasPension && currentAge >= pensionStartAge) ? pensionYearly : 0;

    let workIncome = 0;
    incomes.forEach(inc => {
      if (currentAge >= inc.startAge && currentAge < inc.endAge) {
        workIncome += inc.yearly;
      }
    });

    const yearExpenses = expenseByAge[currentAge] || [];
    const bigExpenseTotal = yearExpenses.reduce((sum, e) => sum + e.amount, 0);
    const bigExpenseNotes = yearExpenses.map(e => {
      if (e.loanAmount > 0) return e.note + ' 首付' + formatMoney(e.amount);
      return e.note + ' ' + formatMoney(e.amount);
    }).join('、');

    let loanRepayment = 0;
    const loanDetails = [];
    expenses.forEach(e => {
      if (e.loanYearlyPayment > 0 && currentAge > e.age && currentAge <= e.age + e.loanYears) {
        loanRepayment += e.loanYearlyPayment;
        loanDetails.push(e.note + '月供');
      }
    });

    const totalIncome = workIncome + pensionIncome;
    const netSpending = spending + bigExpenseTotal + loanRepayment - totalIncome;
    const yearEnd = balance + interest - netSpending;

    years.push({
      year: i,
      age: currentAge,
      startBalance: balance,
      interest,
      pension: pensionIncome,
      workIncome,
      spending,
      bigExpense: bigExpenseTotal,
      bigExpenseNotes,
      loanRepayment,
      loanDetails: loanDetails.join('、'),
      netSpending,
      endBalance: Math.max(yearEnd, 0)
    });

    if (yearEnd <= 0 && depleted < 0) {
      depleted = i;
      break;
    }
    balance = yearEnd;
  }

  const lastBalance = years.length > 0 ? years[years.length - 1].endBalance : savings;

  return { years, depleted, safeSpending, remainingYears, lastBalance, pensionStartAge };
}
```

- [ ] **Step 2: Create minimal `css/hud.css` starter**

```css
/* css/hud.css — JARVIS Blue HUD Theme */
* { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --hud-primary: #1e90ff;
  --hud-primary-dim: rgba(30, 144, 255, 0.25);
  --hud-primary-glow: rgba(30, 144, 255, 0.6);
  --hud-bg: #060d1a;
  --hud-panel-bg: rgba(10, 20, 40, 0.75);
  --hud-panel-border: rgba(30, 144, 255, 0.25);
  --hud-text: #e0e8ff;
  --hud-text-dim: rgba(160, 180, 220, 0.7);
  --hud-safe: #2ed573;
  --hud-warn: #ffa502;
  --hud-danger: #ff4757;
  --hud-expense: #e17055;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--hud-bg);
  color: var(--hud-text);
  min-height: 100vh;
  overflow-x: hidden;
}
```

- [ ] **Step 3: Create minimal `css/mobile.css` starter**

```css
/* css/mobile.css — Mobile 2D Fallback */
.mobile-mode .three-container { display: none !important; }

.mobile-mode .container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px 12px;
}
```

- [ ] **Step 4: Verify file structure**

Run: `ls -la js/ css/`
Expected: `calculator.js` in `js/`, `hud.css` and `mobile.css` in `css/`

- [ ] **Step 5: Commit**

```bash
git add js/calculator.js css/hud.css css/mobile.css
git commit -m "feat: extract calculator logic and create CSS starters"
```

---

### Task 2: UI module — form interaction logic

**Files:**
- Create: `js/ui.js`

Extract all DOM interaction logic: `stepAge`, `stepRate`, `createComboSelect`, `setupMoneyInput`, `addIncomeItem`, `getIncomes`, `addExpenseItem`, `getExpenses`, and event binding. This module reads DOM values and calls a provided `onCalculate` callback.

- [ ] **Step 1: Create `js/ui.js`**

```js
// js/ui.js
import { formatMoney, addCommas, parseFormatted, wanHint } from './calculator.js';

const $ = id => document.getElementById(id);

let onCalculate = () => {};

export function setOnCalculate(fn) {
  onCalculate = fn;
}

export function stepAge(inputId, delta) {
  const input = typeof inputId === 'string' ? $(inputId) : inputId;
  const min = parseInt(input.min) || 1;
  const max = parseInt(input.max) || 120;
  let val = (parseInt(input.value) || 0) + delta;
  val = Math.max(min, Math.min(max, val));
  input.value = val;
  input.dispatchEvent(new Event('input'));
}

export function stepRate(inputId, delta) {
  const input = typeof inputId === 'string' ? $(inputId) : inputId;
  const min = parseFloat(input.min) || 0;
  const max = parseFloat(input.max) || 100;
  let val = Math.round(((parseFloat(input.value) || 0) + delta) * 10) / 10;
  val = Math.max(min, Math.min(max, val));
  input.value = val;
  input.dispatchEvent(new Event('input'));
}

export function createComboSelect(options, opts) {
  const width = opts.width || '100px';
  const placeholder = opts.placeholder || '选择或输入';
  const onSelect = opts.onSelect || function(){};

  const wrap = document.createElement('div');
  wrap.className = 'combo-select';
  wrap.style.width = width;

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.style.width = '100%';
  input.style.paddingRight = '24px';
  if (opts.dataField) input.dataset.field = opts.dataField;

  const arrow = document.createElement('span');
  arrow.className = 'combo-arrow';
  arrow.textContent = '\u25BC';

  const dropdown = document.createElement('div');
  dropdown.className = 'combo-dropdown';
  options.forEach(opt => {
    const item = document.createElement('div');
    item.className = 'combo-option';
    item.textContent = opt;
    item.addEventListener('mousedown', function(e) {
      e.preventDefault();
      input.value = opt;
      wrap.classList.remove('open');
      onSelect(opt);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    dropdown.appendChild(item);
  });

  wrap.appendChild(input);
  wrap.appendChild(arrow);
  wrap.appendChild(dropdown);

  input.addEventListener('focus', function() { wrap.classList.add('open'); });
  input.addEventListener('blur', function() { wrap.classList.remove('open'); });

  return { wrap, input };
}

export function setupMoneyInput(inputId, hintId) {
  const input = $(inputId);
  const hint = $(hintId);

  function updateHint() {
    const val = parseFormatted(input.value);
    hint.textContent = wanHint(val);
  }

  input.addEventListener('input', function() {
    const pos = this.selectionStart;
    const beforeCursor = this.value.substring(0, pos);
    const digitsBefore = beforeCursor.replace(/[^0-9]/g, '').length;
    const raw = this.value.replace(/[^0-9]/g, '');
    const num = parseInt(raw) || 0;
    this.value = num > 0 ? addCommas(num) : '';
    let newPos = 0, digits = 0;
    for (let i = 0; i < this.value.length; i++) {
      if (this.value[i] !== ',') digits++;
      if (digits >= digitsBefore) { newPos = i + 1; break; }
    }
    if (digits < digitsBefore) newPos = this.value.length;
    this.setSelectionRange(newPos, newPos);
    updateHint();
    onCalculate();
  });

  updateHint();
}

// --- Income management ---
let incomeId = 0;

export function addIncomeItem() {
  const id = ++incomeId;
  const currentAge = parseInt($('age').value) || 30;
  const div = document.createElement('div');
  div.className = 'income-item';
  div.dataset.id = id;

  const incCombo = createComboSelect(['工资', '副业', '租金', '分红', '其他'], {
    width: '100px', placeholder: '来源', dataField: 'incLabel'
  });

  div.innerHTML = `
    <span data-slot="incLabel"></span>
    <div class="age-stepper">
      <button type="button" data-step="-1" data-target="incStart">−</button>
      <input type="number" data-field="incStart" value="${currentAge}" min="1" max="120">
      <button type="button" data-step="1" data-target="incStart">+</button>
    </div>
    <span style="color:#666;font-size:0.85em">~</span>
    <div class="age-stepper">
      <button type="button" data-step="-1" data-target="incEnd">−</button>
      <input type="number" data-field="incEnd" value="${Math.min(currentAge + 30, 65)}" min="1" max="120">
      <button type="button" data-step="1" data-target="incEnd">+</button>
    </div>
    <span style="color:#666;font-size:0.85em">岁</span>
    <input type="text" class="inc-amount" data-field="incMonthly" value="${addCommas(10000)}" inputmode="numeric" placeholder="月收入">
    <span class="inc-hint"></span>
    <button class="inc-remove" title="删除">&times;</button>
    <div class="inc-summary"></div>
  `;

  div.querySelector('[data-slot="incLabel"]').replaceWith(incCombo.wrap);
  $('incomeList').appendChild(div);

  // Stepper buttons
  div.querySelectorAll('[data-step]').forEach(btn => {
    btn.addEventListener('click', function() {
      const target = div.querySelector(`[data-field="${this.dataset.target}"]`);
      stepAge(target, parseInt(this.dataset.step));
    });
  });

  // Amount formatting
  const amountInput = div.querySelector('[data-field="incMonthly"]');
  const hint = div.querySelector('.inc-hint');
  const summary = div.querySelector('.inc-summary');

  function updateIncHint() {
    const monthly = parseFormatted(amountInput.value);
    hint.textContent = monthly > 0 ? '/月' : '';
    const startAge = parseInt(div.querySelector('[data-field="incStart"]').value) || 0;
    const endAge = parseInt(div.querySelector('[data-field="incEnd"]').value) || 0;
    const years = endAge - startAge;
    if (monthly > 0 && years > 0) {
      summary.innerHTML = `${startAge}~${endAge}岁，共${years}年，年收入 <b>${formatMoney(monthly * 12)}</b>，总收入 <b>${formatMoney(monthly * 12 * years)}</b>`;
    } else {
      summary.textContent = '';
    }
  }

  function setupFormattedIncInput(input) {
    input.addEventListener('input', function() {
      const pos = this.selectionStart;
      const beforeCursor = this.value.substring(0, pos);
      const digitsBefore = beforeCursor.replace(/[^0-9]/g, '').length;
      const raw = this.value.replace(/[^0-9]/g, '');
      const num = parseInt(raw) || 0;
      this.value = num > 0 ? addCommas(num) : '';
      let newPos = 0, digits = 0;
      for (let i = 0; i < this.value.length; i++) {
        if (this.value[i] !== ',') digits++;
        if (digits >= digitsBefore) { newPos = i + 1; break; }
      }
      if (digits < digitsBefore) newPos = this.value.length;
      this.setSelectionRange(newPos, newPos);
      updateIncHint();
      onCalculate();
    });
  }

  setupFormattedIncInput(amountInput);

  div.querySelectorAll('[data-field="incStart"],[data-field="incEnd"]').forEach(el => {
    el.addEventListener('input', function() { updateIncHint(); onCalculate(); });
  });

  div.querySelector('.inc-remove').addEventListener('click', function() {
    div.remove();
    onCalculate();
  });

  updateIncHint();
  onCalculate();
}

export function getIncomes() {
  const items = [];
  document.querySelectorAll('.income-item').forEach(div => {
    const label = div.querySelector('[data-field="incLabel"]').value;
    const startAge = parseInt(div.querySelector('[data-field="incStart"]').value) || 0;
    const endAge = parseInt(div.querySelector('[data-field="incEnd"]').value) || 0;
    const monthly = parseFormatted(div.querySelector('[data-field="incMonthly"]').value);
    if (startAge > 0 && endAge > startAge && monthly > 0) {
      items.push({ label, startAge, endAge, monthly, yearly: monthly * 12 });
    }
  });
  return items;
}

// --- Expense management ---
let expenseId = 0;
const presetExpenses = [
  { label: '买房', amount: 2000000 },
  { label: '买车', amount: 200000 },
  { label: '装修', amount: 200000 },
  { label: '婚礼', amount: 200000 },
  { label: '教育', amount: 100000 },
  { label: '医疗', amount: 100000 },
  { label: '其他', amount: 0 },
];

export function addExpenseItem(preset) {
  const id = ++expenseId;
  const currentAge = parseInt($('age').value) || 30;
  const div = document.createElement('div');
  div.className = 'expense-item';
  div.dataset.id = id;
  div.style.flexDirection = 'column';

  const defaultAmount = preset ? preset.amount : 0;

  const expCombo = createComboSelect(presetExpenses.map(p => p.label), {
    width: '100px', placeholder: '用途', dataField: 'note',
    onSelect: function(label) {
      const found = presetExpenses.find(p => p.label === label);
      if (found && found.amount > 0) {
        const ai = div.querySelector('[data-field="amount"]');
        ai.value = addCommas(found.amount);
        ai.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });

  div.innerHTML = `
    <div class="exp-main-row">
      <span data-slot="expNote"></span>
      <div class="age-stepper">
        <button type="button" data-step="-1">−</button>
        <input type="number" data-field="age" value="${currentAge + 5}" min="1" max="120">
        <button type="button" data-step="1">+</button>
      </div>
      <span style="color:#666;font-size:0.85em">岁</span>
      <input type="text" class="exp-amount" data-field="amount" value="${defaultAmount > 0 ? addCommas(defaultAmount) : ''}" inputmode="numeric" placeholder="总价">
      <span class="exp-hint"></span>
      <button class="exp-loan-toggle" data-action="toggleLoan">贷款</button>
      <button class="exp-remove" title="删除">&times;</button>
    </div>
    <div class="exp-loan-row" data-loan-row>
      <label>首付</label>
      <select data-field="downPct" style="width:70px;">
        <option value="100">全款</option>
        <option value="70">70%</option>
        <option value="50">50%</option>
        <option value="30" selected>30%</option>
        <option value="20">20%</option>
        <option value="10">10%</option>
        <option value="0">0%</option>
      </select>
      <label>利率</label>
      <div class="age-stepper" style="display:inline-flex;">
        <button type="button" data-rate-step="-0.1">−</button>
        <input type="number" data-field="loanRate" value="3.5" min="0" max="30" step="0.1" style="width:52px;">
        <button type="button" data-rate-step="0.1">+</button>
      </div>
      <span style="color:#666;font-size:0.8em">%</span>
      <label>期限</label>
      <select data-field="loanYears" style="width:70px;">
        <option value="5">5年</option>
        <option value="10">10年</option>
        <option value="15">15年</option>
        <option value="20">20年</option>
        <option value="25">25年</option>
        <option value="30" selected>30年</option>
      </select>
      <div class="exp-loan-info" data-loan-info></div>
    </div>
  `;

  div.querySelector('[data-slot="expNote"]').replaceWith(expCombo.wrap);
  $('expenseList').appendChild(div);

  div.querySelectorAll('[data-step]').forEach(btn => {
    btn.addEventListener('click', function() {
      stepAge(div.querySelector('[data-field="age"]'), parseInt(this.dataset.step));
    });
  });

  div.querySelectorAll('[data-rate-step]').forEach(btn => {
    btn.addEventListener('click', function() {
      const input = div.querySelector('[data-field="loanRate"]');
      const delta = parseFloat(this.dataset.rateStep);
      let val = Math.round(((parseFloat(input.value) || 0) + delta) * 10) / 10;
      val = Math.max(0, Math.min(30, val));
      input.value = val;
      input.dispatchEvent(new Event('input'));
    });
  });

  const amountInput = div.querySelector('[data-field="amount"]');
  const hint = div.querySelector('.exp-hint');

  function updateExpHint() {
    hint.textContent = wanHint(parseFormatted(amountInput.value));
  }

  function setupFormattedInput(input) {
    input.addEventListener('input', function() {
      const pos = this.selectionStart;
      const beforeCursor = this.value.substring(0, pos);
      const digitsBefore = beforeCursor.replace(/[^0-9]/g, '').length;
      const raw = this.value.replace(/[^0-9]/g, '');
      const num = parseInt(raw) || 0;
      this.value = num > 0 ? addCommas(num) : '';
      let newPos = 0, digits = 0;
      for (let i = 0; i < this.value.length; i++) {
        if (this.value[i] !== ',') digits++;
        if (digits >= digitsBefore) { newPos = i + 1; break; }
      }
      if (digits < digitsBefore) newPos = this.value.length;
      this.setSelectionRange(newPos, newPos);
      updateExpHint();
      updateLoanInfo();
      onCalculate();
    });
  }

  setupFormattedInput(amountInput);

  const loanToggle = div.querySelector('[data-action="toggleLoan"]');
  const loanRow = div.querySelector('[data-loan-row]');
  loanToggle.addEventListener('click', function() {
    const show = !loanRow.classList.contains('show');
    loanRow.classList.toggle('show', show);
    this.classList.toggle('active', show);
    this.textContent = show ? '取消贷款' : '贷款';
    updateLoanInfo();
    onCalculate();
  });

  const loanInfoEl = div.querySelector('[data-loan-info]');
  function updateLoanInfo() {
    if (!loanRow.classList.contains('show')) { loanInfoEl.textContent = ''; return; }
    const total = parseFormatted(amountInput.value);
    const downPct = parseInt(div.querySelector('[data-field="downPct"]').value) || 0;
    const loanRate = (parseFloat(div.querySelector('[data-field="loanRate"]').value) || 0) / 100;
    const loanYears = parseInt(div.querySelector('[data-field="loanYears"]').value) || 30;

    if (downPct >= 100 || total <= 0) { loanInfoEl.textContent = '全款支付，无贷款'; return; }

    const downPayment = total * downPct / 100;
    const loanAmount = total - downPayment;
    const monthlyRate = loanRate / 12;
    const months = loanYears * 12;
    let monthlyPayment = 0;
    if (monthlyRate > 0) {
      monthlyPayment = loanAmount * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1);
    } else {
      monthlyPayment = loanAmount / months;
    }
    const totalInterest = monthlyPayment * months - loanAmount;

    loanInfoEl.innerHTML = `首付 <b>${formatMoney(downPayment)}</b>，贷款 <b>${formatMoney(loanAmount)}</b>，月供 <b>${formatMoney(monthlyPayment)}</b>（年还 ${formatMoney(monthlyPayment * 12)}），${loanYears}年总利息 ${formatMoney(totalInterest)}`;
  }

  div.querySelectorAll('[data-field="downPct"],[data-field="loanRate"],[data-field="loanYears"]').forEach(el => {
    el.addEventListener('input', function() { updateLoanInfo(); onCalculate(); });
    el.addEventListener('change', function() { updateLoanInfo(); onCalculate(); });
  });

  expCombo.input.addEventListener('input', onCalculate);
  div.querySelector('[data-field="age"]').addEventListener('input', function() { updateLoanInfo(); onCalculate(); });
  div.querySelector('.exp-remove').addEventListener('click', function() {
    div.remove();
    onCalculate();
  });

  updateExpHint();
  updateLoanInfo();
  onCalculate();
}

export function getExpenses() {
  const items = [];
  document.querySelectorAll('.expense-item').forEach(div => {
    const age = parseInt(div.querySelector('[data-field="age"]').value) || 0;
    const amount = parseFormatted(div.querySelector('[data-field="amount"]').value);
    const note = div.querySelector('[data-field="note"]').value;
    if (age <= 0 || amount <= 0) return;

    const loanRow = div.querySelector('[data-loan-row]');
    const hasLoan = loanRow.classList.contains('show');
    const downPct = parseInt(div.querySelector('[data-field="downPct"]').value) || 0;

    if (hasLoan && downPct < 100) {
      const loanRate = (parseFloat(div.querySelector('[data-field="loanRate"]').value) || 0) / 100;
      const loanYears = parseInt(div.querySelector('[data-field="loanYears"]').value) || 30;
      const downPayment = amount * downPct / 100;
      const loanAmount = amount - downPayment;
      const monthlyRate = loanRate / 12;
      const months = loanYears * 12;
      let monthlyPayment = 0;
      if (monthlyRate > 0) {
        monthlyPayment = loanAmount * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1);
      } else {
        monthlyPayment = loanAmount / months;
      }
      items.push({
        age, note,
        amount: downPayment,
        loanYearlyPayment: monthlyPayment * 12,
        loanYears,
        loanAmount
      });
    } else {
      items.push({ age, amount, note, loanYearlyPayment: 0, loanYears: 0, loanAmount: 0 });
    }
  });
  return items;
}

/**
 * Collect all form params from DOM and return a params object for calculate()
 */
export function collectParams() {
  return {
    age: parseInt($('age').value) || 30,
    lifespan: parseInt($('lifespan').value) || 80,
    savings: parseFormatted($('savings').value),
    rate: (parseFloat($('rate').value) || 0) / 100,
    spending: parseFormatted($('spending').value),
    hasPension: $('pensionToggle').checked,
    gender: $('gender').value,
    pensionMonthly: parseFormatted($('pension').value),
    incomes: getIncomes(),
    expenses: getExpenses(),
  };
}

/**
 * Render results HTML into the results container
 */
export function renderResults(results, params) {
  const { years, depleted, safeSpending, remainingYears, lastBalance, pensionStartAge } = results;
  const { age, lifespan, spending, hasPension, expenses } = params;
  const resultsEl = $('results');
  let html = '';

  // Safe spending
  let safeDetail = `每月 ${formatMoney(safeSpending / 12)}，按此花费永远不会花光本金`;
  if (hasPension) {
    safeDetail += `<br>领取养老金后（${pensionStartAge} 岁起），安全支出可提高到 ${formatMoney(safeSpending + params.pensionMonthly * 12)}/年`;
  }
  html += `<div class="result-box result-safe">
    <div class="label">永续安全支出（每年利息${hasPension ? ' + 养老金' : ''}）</div>
    <div class="value">${formatMoney(safeSpending)}/年</div>
    <div class="detail">${safeDetail}</div>
  </div>`;

  if (spending <= safeSpending) {
    html += `<div class="result-box result-safe">
      <div class="label">当前花费状态（到 ${lifespan} 岁，还有 ${remainingYears} 年）</div>
      <div class="value">永远花不完</div>
      <div class="detail">你的年支出 ${formatMoney(spending)} ≤ 年利息 ${formatMoney(safeSpending)}，到 ${lifespan} 岁时还剩 ${formatMoney(lastBalance)}</div>
    </div>`;
  } else if (depleted < 0) {
    html += `<div class="result-box result-warn">
      <div class="label">当前花费状态（到 ${lifespan} 岁，还有 ${remainingYears} 年）</div>
      <div class="value">够花到 ${lifespan} 岁</div>
      <div class="detail">虽然每年消耗本金，但到 ${lifespan} 岁时还剩 ${formatMoney(lastBalance)}${hasPension ? '（含养老金补贴）' : ''}</div>
    </div>`;
  } else {
    const depletedAge = age + depleted;
    const cls = depleted <= 20 ? 'result-danger' : 'result-warn';
    html += `<div class="result-box ${cls}">
      <div class="label">预计耗尽时间</div>
      <div class="value">${depleted} 年后花光（${depletedAge} 岁）</div>
      <div class="detail">你的年支出 ${formatMoney(spending)} 超过承受能力，${depletedAge < lifespan ? '撑不到 ' + lifespan + ' 岁' : '刚好到 ' + lifespan + ' 岁'}${hasPension && depletedAge < pensionStartAge ? '（还没开始领养老金）' : ''}</div>
    </div>`;
  }

  // Expense summary
  if (expenses.length > 0) {
    const totalDown = expenses.reduce((s, e) => s + e.amount, 0);
    const totalLoan = expenses.reduce((s, e) => s + (e.loanAmount || 0), 0);
    const expList = expenses.map(e => {
      let s = `${e.age}岁 ${e.note}`;
      if (e.loanAmount > 0) {
        s += ` 首付${formatMoney(e.amount)} + 贷款${formatMoney(e.loanAmount)}（年还${formatMoney(e.loanYearlyPayment)}×${e.loanYears}年）`;
      } else {
        s += ` ${formatMoney(e.amount)}`;
      }
      return s;
    }).join('<br>');
    const totalLabel = totalLoan > 0 ? `一次性支出 ${formatMoney(totalDown)}，贷款 ${formatMoney(totalLoan)}` : `共 ${formatMoney(totalDown)}`;
    html += `<div class="result-box result-expense">
      <div class="label">大额支出计划</div>
      <div class="value">${totalLabel}</div>
      <div class="detail">${expList}</div>
    </div>`;
  }

  resultsEl.innerHTML = html;
}

/**
 * Fill the detailed year-by-year table
 */
export function fillTable(years, hasPension, hasIncome, hasExpenses) {
  let cols = '<th>年龄</th><th>年初余额</th><th>投资收益</th>';
  if (hasIncome) cols += '<th>工作收入</th>';
  if (hasPension) cols += '<th>养老金</th>';
  cols += '<th>日常支出</th>';
  if (hasExpenses) cols += '<th>大额/还贷</th>';
  cols += '<th>年末余额</th>';
  $('tableHead').innerHTML = cols;

  const tbody = $('tableBody');
  tbody.innerHTML = years.map(y => {
    const hasExtra = y.bigExpense > 0 || y.loanRepayment > 0;
    const cls = y.endBalance <= 0 ? 'zero-row' : (hasExtra ? 'expense-row' : '');
    const incomeCol = hasIncome ? `<td style="color:var(--hud-safe)">${y.workIncome > 0 ? '+' + formatMoney(y.workIncome) : '-'}</td>` : '';
    const pensionCol = hasPension ? `<td style="color:var(--hud-safe)">${y.pension > 0 ? '+' + formatMoney(y.pension) : '-'}</td>` : '';
    let extraCol = '';
    if (hasExpenses) {
      const parts = [];
      if (y.bigExpense > 0) parts.push(y.bigExpenseNotes);
      if (y.loanRepayment > 0) parts.push('还贷 ' + formatMoney(y.loanRepayment));
      const extraTotal = y.bigExpense + y.loanRepayment;
      extraCol = `<td style="color:var(--hud-expense)" title="${parts.join('；')}">${extraTotal > 0 ? '-' + formatMoney(extraTotal) : '-'}</td>`;
    }
    return `<tr ${cls ? 'class="' + cls + '"' : ''}>
      <td>${y.age} 岁${hasExtra ? ' *' : ''}</td>
      <td>${formatMoney(y.startBalance)}</td>
      <td>+${formatMoney(y.interest)}</td>
      ${incomeCol}
      ${pensionCol}
      <td>-${formatMoney(y.spending)}</td>
      ${extraCol}
      <td>${formatMoney(y.endBalance)}</td>
    </tr>`;
  }).join('');
}

/**
 * Initialize all event listeners for the form
 */
export function initUI() {
  // Money inputs with comma formatting
  setupMoneyInput('savings', 'savings-hint');
  setupMoneyInput('spending', 'spending-hint');
  setupMoneyInput('pension', 'pension-hint');

  // Other inputs
  ['age', 'rate', 'lifespan', 'gender'].forEach(id => {
    $(id).addEventListener('input', onCalculate);
    $(id).addEventListener('change', onCalculate);
  });

  $('pensionToggle').addEventListener('change', function() {
    $('pensionFields').classList.toggle('show', this.checked);
    onCalculate();
  });

  $('addIncome').addEventListener('click', () => addIncomeItem());
  $('addExpense').addEventListener('click', () => addExpenseItem(presetExpenses[0]));

  $('toggleTable').addEventListener('click', function() {
    const t = $('yearTable');
    t.classList.toggle('show');
    this.textContent = t.classList.contains('show') ? '隐藏详细表格' : '显示详细表格';
  });

  // Expose stepAge/stepRate globally for inline onclick handlers
  window.stepAge = stepAge;
  window.stepRate = stepRate;
}
```

- [ ] **Step 2: Verify file exists**

Run: `ls -la js/ui.js`
Expected: file exists with reasonable size (~300 lines)

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "feat: extract UI interaction logic to js/ui.js"
```

---

### Task 3: New `index.html` with HUD markup

**Files:**
- Modify: `index.html` (full rewrite)

Rewrite `index.html` with importmap for Three.js CDN, HUD-styled HTML panels, and ES module entry point. The HTML structure stays functionally identical but uses JARVIS-blue CSS classes.

- [ ] **Step 1: Rewrite `index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>存款复利计算器 - 每年能花多少钱？</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='%23060d1a'/><path d='M16 44 L26 32 L36 36 L48 18' stroke='%231e90ff' stroke-width='4' stroke-linecap='round' stroke-linejoin='round' fill='none'/><circle cx='48' cy='18' r='3.5' fill='%231e90ff'/><path d='M16 44 L26 32 L36 36 L48 18 L48 44 Z' fill='%231e90ff' opacity='0.15'/></svg>">
<link rel="stylesheet" href="css/hud.css">
<link rel="stylesheet" href="css/mobile.css">
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
  }
}
</script>
</head>
<body>

<!-- Three.js canvas container (desktop only) -->
<div id="threeContainer" class="three-container"></div>

<!-- HUD Panels -->
<div class="container" id="appContainer">
  <h1>存款复利计算器</h1>
  <p class="subtitle">看看你的钱能花多久</p>

  <!-- Input Panel -->
  <div class="card hud-panel" id="panelInput">
    <div class="panel-header">
      <svg class="panel-arc" width="60" height="20" viewBox="0 0 60 20">
        <path d="M5,18 Q30,2 55,18" fill="none" stroke="rgba(30,144,255,0.4)" stroke-width="1"/>
        <circle cx="30" cy="8" r="2" fill="rgba(30,144,255,0.6)"/>
      </svg>
    </div>
    <div class="input-group">
      <div class="field">
        <label>当前年龄 (岁)</label>
        <div class="age-stepper" style="width:100%;border-radius:10px;">
          <button type="button" onclick="stepAge('age',-1)">−</button>
          <input type="number" id="age" value="30" min="1" max="120" step="1" style="flex:1;width:auto;font-size:1.1em;padding:12px 4px!important;">
          <button type="button" onclick="stepAge('age',1)">+</button>
        </div>
      </div>
      <div class="field">
        <label>预期寿命 (岁)</label>
        <select id="lifespan">
          <option value="70">70 岁</option>
          <option value="75">75 岁</option>
          <option value="80" selected>80 岁</option>
          <option value="85">85 岁</option>
          <option value="90">90 岁</option>
          <option value="95">95 岁</option>
          <option value="100">100 岁</option>
        </select>
      </div>
      <div class="field">
        <label>总存款 (元)</label>
        <input type="text" id="savings" value="1,000,000" inputmode="numeric">
        <div class="unit" id="savings-hint">100 万</div>
      </div>
      <div class="field">
        <label>年化回报率 (%)</label>
        <div class="age-stepper" style="width:100%;border-radius:10px;">
          <button type="button" onclick="stepRate('rate',-0.1)">−</button>
          <input type="number" id="rate" value="4" min="0" max="100" step="0.1" style="flex:1;width:auto;font-size:1.1em;padding:12px 4px!important;">
          <button type="button" onclick="stepRate('rate',0.1)">+</button>
        </div>
        <div class="unit">投资年化收益率</div>
      </div>
      <div class="field">
        <label>每年花费 (元)</label>
        <input type="text" id="spending" value="80,000" inputmode="numeric">
        <div class="unit" id="spending-hint">8 万</div>
      </div>
    </div>

    <div style="margin-bottom:24px;">
      <div class="pension-group">
        <label class="toggle-switch">
          <input type="checkbox" id="pensionToggle">
          <span class="toggle-slider"></span>
        </label>
        <label style="color:var(--hud-text-dim);font-size:0.9em;cursor:pointer;" onclick="document.getElementById('pensionToggle').click()">领取养老金</label>
      </div>
      <div class="pension-fields" id="pensionFields">
        <div class="field" style="min-width:150px;">
          <label>性别</label>
          <select id="gender">
            <option value="male">男（65 岁领取）</option>
            <option value="female">女（60 岁领取）</option>
          </select>
        </div>
        <div class="field" style="min-width:200px;">
          <label>每月养老金 (元)</label>
          <input type="text" id="pension" value="3,000" inputmode="numeric">
          <div class="unit" id="pension-hint">0.3 万</div>
        </div>
      </div>
    </div>

    <div class="income-section">
      <div class="expense-header">
        <h4>收入计划</h4>
      </div>
      <div class="expense-list" id="incomeList"></div>
      <button class="btn-add-income" id="addIncome">+ 添加收入阶段（工资、副业、租金等）</button>
    </div>

    <div class="expense-section">
      <div class="expense-header">
        <h4>大额支出计划</h4>
      </div>
      <div class="expense-list" id="expenseList"></div>
      <button class="btn-add-expense" id="addExpense">+ 添加大额支出（买房、买车、装修等）</button>
    </div>

    <div class="result-section" id="results"></div>
  </div>

  <!-- Chart Panel -->
  <div class="card hud-panel" id="panelChart">
    <div class="panel-header">
      <h3>资产变化趋势</h3>
      <svg class="panel-arc" width="60" height="20" viewBox="0 0 60 20">
        <path d="M5,18 Q30,2 55,18" fill="none" stroke="rgba(30,144,255,0.4)" stroke-width="1"/>
        <circle cx="30" cy="8" r="2" fill="rgba(30,144,255,0.6)"/>
      </svg>
    </div>
    <!-- 3D chart renders here on desktop; 2D canvas fallback on mobile -->
    <div class="chart-container" id="chartContainer">
      <canvas id="chart"></canvas>
      <div class="chart-tooltip" id="chartTooltip"></div>
      <div class="chart-crosshair-v" id="crossV"></div>
      <div class="chart-crosshair-h" id="crossH"></div>
      <div class="chart-dot" id="chartDot"></div>
    </div>
    <button class="table-toggle" id="toggleTable">显示详细表格</button>
    <table class="year-table" id="yearTable">
      <thead>
        <tr id="tableHead">
          <th>年龄</th>
          <th>年初余额</th>
          <th>投资收益</th>
          <th>养老金</th>
          <th>年度支出</th>
          <th>年末余额</th>
        </tr>
      </thead>
      <tbody id="tableBody"></tbody>
    </table>
  </div>
</div>

<script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify HTML loads without JS errors**

Open `index.html` in a browser. At this stage `js/main.js` doesn't exist yet, so the console will show a 404 for it — that's expected. Verify the HTML structure renders correctly (unstyled).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: rewrite index.html with HUD markup and Three.js importmap"
```

---

### Task 4: Complete HUD CSS styles

**Files:**
- Modify: `css/hud.css` (expand from minimal starter)

Add all form control styles, panel styles, result box styles, chart styles, table styles — migrated from current `index.html` `<style>` block with JARVIS-blue color scheme.

- [ ] **Step 1: Write complete `css/hud.css`**

```css
/* css/hud.css — JARVIS Blue HUD Theme */
* { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --hud-primary: #1e90ff;
  --hud-primary-dim: rgba(30, 144, 255, 0.25);
  --hud-primary-glow: rgba(30, 144, 255, 0.6);
  --hud-bg: #060d1a;
  --hud-panel-bg: rgba(10, 20, 40, 0.75);
  --hud-panel-border: rgba(30, 144, 255, 0.25);
  --hud-text: #e0e8ff;
  --hud-text-dim: rgba(160, 180, 220, 0.7);
  --hud-safe: #2ed573;
  --hud-warn: #ffa502;
  --hud-danger: #ff4757;
  --hud-expense: #e17055;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--hud-bg);
  color: var(--hud-text);
  min-height: 100vh;
  overflow-x: hidden;
}

/* Three.js container */
.three-container {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  z-index: 0;
  pointer-events: none;
}
.three-container canvas {
  display: block;
}

/* Main container */
.container {
  position: relative;
  z-index: 1;
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
}

h1 {
  text-align: center;
  font-size: 2em;
  margin-bottom: 8px;
  background: linear-gradient(90deg, #4a90d9, #a0d4ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subtitle {
  text-align: center;
  color: var(--hud-text-dim);
  margin-bottom: 40px;
  font-size: 0.95em;
}

/* HUD Panels */
.card {
  background: var(--hud-panel-bg);
  border: 1px solid var(--hud-panel-border);
  border-top: 2px solid var(--hud-primary-glow);
  border-radius: 12px;
  padding: 32px;
  margin-bottom: 24px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.panel-header h3 {
  color: var(--hud-text);
  font-size: 1.1em;
}
.panel-arc {
  flex-shrink: 0;
}

/* Panel enter animation */
.hud-panel {
  opacity: 0;
  transform: translateY(30px);
  animation: panelEnter 0.5s ease forwards;
}
.hud-panel:nth-child(2) { animation-delay: 0s; }
.hud-panel:nth-child(3) { animation-delay: 0.2s; }
.hud-panel:nth-child(4) { animation-delay: 0.4s; }

@keyframes panelEnter {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Input groups */
.input-group {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 24px;
}

.field {
  flex: 1;
  min-width: 200px;
}
.field label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.9em;
  color: var(--hud-text-dim);
}
.field input, .field select {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--hud-panel-border);
  border-radius: 10px;
  background: rgba(10, 30, 60, 0.6);
  color: #fff;
  font-size: 1.1em;
  outline: none;
  transition: border-color 0.2s;
}
.field input:focus, .field select:focus {
  border-color: var(--hud-primary);
  box-shadow: 0 0 8px rgba(30, 144, 255, 0.2);
}
.field select option {
  background: #0a1628;
  color: #fff;
}
.field .unit {
  font-size: 0.8em;
  color: var(--hud-text-dim);
  margin-top: 4px;
}

/* Pension group */
.pension-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.pension-group label { margin-bottom: 0 !important; }

.toggle-switch {
  position: relative;
  width: 48px;
  height: 26px;
  flex-shrink: 0;
}
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(30, 144, 255, 0.15);
  border-radius: 26px;
  transition: 0.3s;
}
.toggle-slider::before {
  content: '';
  position: absolute;
  height: 20px; width: 20px;
  left: 3px; bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: 0.3s;
}
.toggle-switch input:checked + .toggle-slider {
  background: var(--hud-primary);
}
.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(22px);
}

.pension-fields {
  display: none;
  gap: 20px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.pension-fields.show { display: flex; }

/* Result boxes */
.result-section { margin-top: 8px; }
.result-box {
  padding: 20px 24px;
  border-radius: 12px;
  margin-bottom: 16px;
}
.result-safe {
  background: rgba(46, 213, 115, 0.08);
  border: 1px solid rgba(46, 213, 115, 0.25);
}
.result-warn {
  background: rgba(255, 165, 0, 0.08);
  border: 1px solid rgba(255, 165, 0, 0.25);
}
.result-danger {
  background: rgba(255, 71, 87, 0.08);
  border: 1px solid rgba(255, 71, 87, 0.25);
}
.result-expense {
  background: rgba(225, 112, 85, 0.08);
  border: 1px solid rgba(225, 112, 85, 0.25);
}
.result-box .label {
  font-size: 0.85em;
  color: var(--hud-text-dim);
  margin-bottom: 4px;
}
.result-box .value {
  font-size: 1.6em;
  font-weight: 700;
}
.result-safe .value { color: var(--hud-safe); }
.result-warn .value { color: var(--hud-warn); }
.result-danger .value { color: var(--hud-danger); }
.result-expense .value { color: var(--hud-expense); font-size: 1.3em; }
.result-box .detail {
  font-size: 0.85em;
  color: var(--hud-text-dim);
  margin-top: 6px;
}

/* Age stepper */
.age-stepper {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--hud-panel-border);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(10, 30, 60, 0.6);
  transition: border-color 0.2s;
}
.age-stepper:focus-within {
  border-color: var(--hud-primary);
  box-shadow: 0 0 8px rgba(30, 144, 255, 0.2);
}
.age-stepper input {
  width: 52px;
  text-align: center;
  border: none !important;
  background: transparent !important;
  padding: 6px 2px !important;
  font-size: 0.95em;
  color: #fff;
  outline: none;
  -moz-appearance: textfield;
  border-radius: 0 !important;
}
.age-stepper input::-webkit-outer-spin-button,
.age-stepper input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.age-stepper button {
  background: rgba(30, 144, 255, 0.06);
  border: none;
  color: var(--hud-text-dim);
  width: 30px;
  align-self: stretch;
  cursor: pointer;
  font-size: 1.1em;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  user-select: none;
}
.age-stepper button:hover { background: rgba(30, 144, 255, 0.15); color: var(--hud-primary); }
.age-stepper button:active { background: rgba(30, 144, 255, 0.25); }

/* Combo select */
.combo-select { position: relative; display: inline-block; }
.combo-select input { cursor: pointer; }
.combo-select .combo-arrow {
  position: absolute;
  right: 8px; top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--hud-text-dim);
  font-size: 0.7em;
  transition: transform 0.2s;
}
.combo-select.open .combo-arrow { transform: translateY(-50%) rotate(180deg); }
.combo-dropdown {
  display: none;
  position: absolute;
  top: calc(100% + 4px); left: 0;
  min-width: 100%;
  background: #0a1628;
  border: 1px solid var(--hud-panel-border);
  border-radius: 8px;
  overflow: hidden;
  z-index: 20;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
}
.combo-select.open .combo-dropdown { display: block; }
.combo-dropdown .combo-option {
  padding: 8px 14px;
  color: var(--hud-text-dim);
  font-size: 0.9em;
  cursor: pointer;
  transition: background 0.1s;
  white-space: nowrap;
}
.combo-dropdown .combo-option:hover {
  background: rgba(30, 144, 255, 0.12);
  color: #fff;
}

/* Income section */
.income-section { margin-bottom: 24px; }
.income-item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: rgba(46, 213, 115, 0.04);
  border: 1px solid rgba(46, 213, 115, 0.12);
  border-radius: 10px;
  transition: border-color 0.2s;
  overflow: visible;
}
.income-item:hover { border-color: rgba(46, 213, 115, 0.3); }
.income-item input {
  padding: 8px 12px;
  border: 1px solid var(--hud-panel-border);
  border-radius: 8px;
  background: rgba(10, 30, 60, 0.6);
  color: #fff;
  font-size: 0.95em;
  outline: none;
  transition: border-color 0.2s;
}
.income-item input:focus { border-color: var(--hud-safe); }
.income-item .inc-amount { width: 140px; }
.income-item .inc-hint { font-size: 0.75em; color: var(--hud-text-dim); min-width: 50px; }
.income-item .inc-remove {
  background: none; border: none;
  color: var(--hud-text-dim);
  font-size: 1.2em; cursor: pointer;
  padding: 4px 8px; border-radius: 6px;
  transition: all 0.2s;
  margin-left: auto;
}
.income-item .inc-remove:hover { color: var(--hud-danger); background: rgba(255,71,87,0.1); }
.income-item .inc-summary {
  font-size: 0.78em;
  color: var(--hud-safe);
  width: 100%;
  margin-top: 2px;
}
.btn-add-income {
  background: none;
  border: 1px dashed rgba(46, 213, 115, 0.3);
  color: var(--hud-text-dim);
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85em;
  margin-top: 8px;
  transition: all 0.2s;
}
.btn-add-income:hover { border-color: var(--hud-safe); color: var(--hud-safe); }

/* Expense section */
.expense-section { margin-bottom: 24px; }
.expense-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.expense-header h4 { color: var(--hud-text-dim); font-size: 0.9em; font-weight: 500; }
.expense-list { display: flex; flex-direction: column; gap: 10px; }
.expense-item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: rgba(30, 144, 255, 0.03);
  border: 1px solid rgba(30, 144, 255, 0.1);
  border-radius: 10px;
  transition: border-color 0.2s;
  overflow: visible;
}
.expense-item:hover { border-color: rgba(30, 144, 255, 0.25); }
.expense-item input, .expense-item select {
  padding: 8px 12px;
  border: 1px solid var(--hud-panel-border);
  border-radius: 8px;
  background: rgba(10, 30, 60, 0.6);
  color: #fff;
  font-size: 0.95em;
  outline: none;
  transition: border-color 0.2s;
}
.expense-item input:focus, .expense-item select:focus { border-color: var(--hud-primary); }
.expense-item select option { background: #0a1628; color: #fff; }
.expense-item .exp-amount { width: 140px; }
.expense-item .exp-note { width: 100px; }
.expense-item .exp-hint { font-size: 0.75em; color: var(--hud-text-dim); min-width: 50px; }
.expense-item .exp-remove {
  background: none; border: none;
  color: var(--hud-text-dim);
  font-size: 1.2em; cursor: pointer;
  padding: 4px 8px; border-radius: 6px;
  transition: all 0.2s;
  margin-left: auto;
}
.expense-item .exp-remove:hover { color: var(--hud-danger); background: rgba(255,71,87,0.1); }

/* Loan sub-row */
.expense-item .exp-main-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
}
.expense-item .exp-loan-row {
  display: none;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(30, 144, 255, 0.08);
}
.expense-item .exp-loan-row.show { display: flex; }
.expense-item .exp-loan-row label {
  font-size: 0.8em;
  color: var(--hud-text-dim);
  white-space: nowrap;
}
.expense-item .exp-loan-row > input,
.expense-item .exp-loan-row > select {
  padding: 6px 10px;
  font-size: 0.85em;
}
.exp-loan-toggle {
  background: none;
  border: 1px solid var(--hud-panel-border);
  color: var(--hud-text-dim);
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.78em;
  transition: all 0.2s;
  white-space: nowrap;
}
.exp-loan-toggle:hover { border-color: var(--hud-primary); color: var(--hud-primary); }
.exp-loan-toggle.active { border-color: var(--hud-expense); color: var(--hud-expense); }
.exp-loan-info {
  font-size: 0.78em;
  color: var(--hud-expense);
  width: 100%;
  margin-top: 4px;
}

.btn-add-expense {
  background: none;
  border: 1px dashed rgba(30, 144, 255, 0.2);
  color: var(--hud-text-dim);
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85em;
  margin-top: 8px;
  transition: all 0.2s;
}
.btn-add-expense:hover { border-color: var(--hud-primary); color: var(--hud-primary); }

/* Chart */
.chart-container {
  margin-top: 8px;
  position: relative;
  width: 100%;
  height: 320px;
}
.chart-container canvas { width: 100% !important; height: 100% !important; cursor: crosshair; }
.chart-tooltip {
  position: absolute;
  pointer-events: none;
  background: rgba(6, 13, 26, 0.92);
  border: 1px solid var(--hud-primary-dim);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.82em;
  color: var(--hud-text);
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 10;
}
.chart-tooltip.show { opacity: 1; }
.chart-tooltip .tt-age { color: var(--hud-primary); font-weight: 600; }
.chart-tooltip .tt-val { color: var(--hud-safe); font-weight: 600; }
.chart-crosshair-v, .chart-crosshair-h {
  position: absolute;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
}
.chart-crosshair-v {
  width: 1px;
  border-left: 1px dashed var(--hud-primary-dim);
  top: 0; bottom: 0;
}
.chart-crosshair-h {
  height: 1px;
  border-top: 1px dashed var(--hud-primary-dim);
  left: 0; right: 0;
}
.chart-crosshair-v.show, .chart-crosshair-h.show { opacity: 1; }
.chart-dot {
  position: absolute;
  width: 8px; height: 8px;
  background: var(--hud-primary);
  border-radius: 50%;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 6px rgba(30, 144, 255, 0.5);
}
.chart-dot.show { opacity: 1; }

/* Table */
.table-toggle {
  background: none;
  border: 1px solid var(--hud-panel-border);
  color: var(--hud-text-dim);
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9em;
  margin-top: 16px;
  transition: all 0.2s;
}
.table-toggle:hover { border-color: var(--hud-primary); color: var(--hud-primary); }
.year-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 16px;
  font-size: 0.85em;
  display: none;
}
.year-table.show { display: table; }
.year-table th, .year-table td {
  padding: 10px 12px;
  text-align: right;
  border-bottom: 1px solid rgba(30, 144, 255, 0.06);
}
.year-table th {
  color: var(--hud-text-dim);
  font-weight: 500;
  position: sticky;
  top: 0;
  background: #0a1628;
}
.year-table td:first-child, .year-table th:first-child { text-align: left; }
.year-table tr:hover td { background: rgba(30, 144, 255, 0.03); }
.zero-row td { color: var(--hud-danger); font-weight: 600; }
.expense-row td { color: var(--hud-expense); }

/* Mobile responsive */
@media (max-width: 600px) {
  body { padding: 0; }
  .container { padding: 20px 12px; }
  h1 { font-size: 1.5em; }
  .card { padding: 20px; }
  .result-box .value { font-size: 1.3em; }
}
```

- [ ] **Step 2: Verify styles render correctly**

Open `index.html` in a browser. All form controls, panels, and result boxes should display with blue HUD styling. Three.js is not loaded yet so no 3D background.

- [ ] **Step 3: Commit**

```bash
git add css/hud.css
git commit -m "feat: complete JARVIS-blue HUD CSS theme"
```

---

### Task 5: Main entry point with device detection and 2D canvas chart fallback

**Files:**
- Create: `js/main.js`

Wire up everything: detect mobile vs desktop, initialize UI, run calculation loop. On mobile (or initially for desktop too), use the 2D canvas chart. Three.js integration will be added in later tasks.

- [ ] **Step 1: Create `js/main.js`**

```js
// js/main.js
import { calculate, formatMoney, parseFormatted } from './calculator.js';
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
let updateChart = drawChart2D; // Will be replaced by 3D chart on desktop

function runCalculation() {
  const params = collectParams();
  const results = calculate(params);
  renderResults(results, params);
  updateChart(results.years, results.depleted, params.age);
  fillTable(results.years, params.hasPension, params.incomes.length > 0, params.expenses.length > 0);
}

// --- Initialization ---
async function init() {
  if (isMobile) {
    document.body.classList.add('mobile-mode');
  }

  // Set up UI
  setOnCalculate(runCalculation);
  initUI();
  initChartTooltip();

  // Load 3D scene on desktop
  if (!isMobile) {
    try {
      const { initScene, getUpdateChart } = await import('./scene.js');
      const chart3dUpdate = await initScene();
      if (chart3dUpdate) {
        updateChart = chart3dUpdate;
      }
    } catch (e) {
      console.warn('Three.js init failed, using 2D fallback:', e);
    }
  }

  // Initial calculation
  runCalculation();

  // Resize handler
  window.addEventListener('resize', runCalculation);
}

init();
```

- [ ] **Step 2: Create a stub `js/scene.js` so the dynamic import doesn't break**

```js
// js/scene.js — stub, will be implemented in Task 6
export async function initScene() {
  return null; // No 3D chart yet
}
```

- [ ] **Step 3: Test the full 2D flow**

Open `index.html` in a browser. The calculator should be fully functional: inputs, results, 2D chart, table — all with JARVIS-blue styling. Console should show "Three.js init failed" warning (expected since scene.js is a stub).

- [ ] **Step 4: Commit**

```bash
git add js/main.js js/scene.js
git commit -m "feat: wire up main entry point with 2D fallback"
```

---

### Task 6: Three.js scene setup with dual renderers

**Files:**
- Modify: `js/scene.js` (replace stub)
- Create: `js/postprocessing.js`

Set up the WebGLRenderer, CSS3DRenderer, PerspectiveCamera, mouse parallax, EffectComposer with Bloom, and the animation loop.

- [ ] **Step 1: Create `js/postprocessing.js`**

```js
// js/postprocessing.js
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
```

- [ ] **Step 2: Implement `js/scene.js`**

```js
// js/scene.js
import * as THREE from 'three';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { createPostProcessing } from './postprocessing.js';

let camera, scene, renderer, cssRenderer, composer;
let mouseX = 0, mouseY = 0;
let targetRotX = 0, targetRotY = 0;

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

  // CSS3D Renderer (overlaid on top)
  cssRenderer = new CSS3DRenderer();
  cssRenderer.setSize(width, height);
  cssRenderer.domElement.style.position = 'absolute';
  cssRenderer.domElement.style.top = '0';
  cssRenderer.domElement.style.left = '0';
  cssRenderer.domElement.style.pointerEvents = 'none';
  // Don't append CSS3DRenderer for now — panels will be positioned via regular CSS
  // CSS3DRenderer will be used if we need true 3D-positioned HTML panels

  // Post-processing
  const pp = createPostProcessing(renderer, scene, camera);
  composer = pp.composer;

  // Mouse parallax
  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / width - 0.5) * 2;
    mouseY = (e.clientY / height - 0.5) * 2;
  });

  // Load background
  const { initBackground, updateBackground } = await import('./background.js');
  initBackground(scene);

  // Resize handler
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  });

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);

    // Mouse parallax (±2 degrees)
    targetRotY = mouseX * 0.035; // ~2 degrees in radians
    targetRotX = -mouseY * 0.035;
    camera.rotation.x += (targetRotX - camera.rotation.x) * 0.05;
    camera.rotation.y += (targetRotY - camera.rotation.y) * 0.05;

    updateBackground();
    composer.render();
  }
  animate();

  // Return null for now — 3D chart will be integrated in Task 8
  return null;
}
```

- [ ] **Step 3: Create a stub `js/background.js`**

```js
// js/background.js — stub, implemented in Task 7
export function initBackground(scene) {}
export function updateBackground() {}
```

- [ ] **Step 4: Test Three.js initializes**

Open `index.html` in a desktop browser. The page should load without errors. The Three.js canvas should be present (transparent/black background behind the panels). Console should have no errors.

- [ ] **Step 5: Commit**

```bash
git add js/scene.js js/postprocessing.js js/background.js
git commit -m "feat: Three.js scene with dual renderers and bloom post-processing"
```

---

### Task 7: 3D background — particle starfield and data flow network

**Files:**
- Modify: `js/background.js` (replace stub)

Implement the particle starfield (far) and data flow network (mid) animations.

- [ ] **Step 1: Implement `js/background.js`**

```js
// js/background.js
import * as THREE from 'three';

let particles, particlePositions, particleOpacities;
let nodes = [], lines = [], pulses = [];
let clock;

const PARTICLE_COUNT = 2000;
const NODE_COUNT = 30;
const CONNECTION_DISTANCE = 250;
const PULSE_SPEED = 2;

export function initBackground(scene) {
  clock = new THREE.Clock();

  // --- Particle Starfield ---
  const particleGeom = new THREE.BufferGeometry();
  particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  particleOpacities = new Float32Array(PARTICLE_COUNT);
  const particleColors = new Float32Array(PARTICLE_COUNT * 3);
  const particleSizes = new Float32Array(PARTICLE_COUNT);

  const colorA = new THREE.Color(0x4a90d9);
  const colorB = new THREE.Color(0xffffff);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particlePositions[i * 3] = (Math.random() - 0.5) * 3000;
    particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 2000;
    particlePositions[i * 3 + 2] = -500 - Math.random() * 1500; // z: -500 to -2000

    particleOpacities[i] = 0.3 + Math.random() * 0.7;
    particleSizes[i] = 1 + Math.random() * 2;

    const mixFactor = Math.random();
    const color = colorA.clone().lerp(colorB, mixFactor);
    particleColors[i * 3] = color.r;
    particleColors[i * 3 + 1] = color.g;
    particleColors[i * 3 + 2] = color.b;
  }

  particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeom.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
  particleGeom.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));

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
      -100 - Math.random() * 200 // z: -100 to -300
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

  // Flicker some particles
  const opacities = particles.geometry.attributes.color; // we modulate via material
  // Simple approach: modulate overall opacity slightly with time
  particles.material.opacity = 0.6 + Math.sin(time * 0.5) * 0.1;

  // Move data flow nodes
  nodes.forEach(node => {
    node.position.add(node.userData.velocity);

    // Bounce within bounds
    if (Math.abs(node.position.x) > 800) node.userData.velocity.x *= -1;
    if (Math.abs(node.position.y) > 500) node.userData.velocity.y *= -1;
    if (node.position.z > -100 || node.position.z < -300) node.userData.velocity.z *= -1;
  });

  // Update connections: remove old lines, create new ones
  lines.forEach(line => line.parent && line.parent.remove(line));
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
        particles.parent.add(line);
        lines.push(line);
      }
    }
  }

  // Data pulses (spawn occasionally)
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
    particles.parent.add(pulseMesh);
    pulses.push(pulseMesh);
  }

  // Animate pulses
  for (let i = pulses.length - 1; i >= 0; i--) {
    const pulse = pulses[i];
    pulse.userData.progress += 0.02;
    if (pulse.userData.progress >= 1) {
      pulse.parent && pulse.parent.remove(pulse);
      pulse.geometry.dispose();
      pulse.material.dispose();
      pulses.splice(i, 1);
    } else {
      pulse.position.lerpVectors(pulse.userData.start, pulse.userData.end, pulse.userData.progress);
      pulse.material.opacity = 0.8 * (1 - Math.abs(pulse.userData.progress - 0.5) * 2);
    }
  }
}
```

- [ ] **Step 2: Test background animations**

Open `index.html` on desktop. Behind the HUD panels you should see:
- Blue particles slowly rotating
- Small blue nodes drifting with faint connecting lines
- Occasional light pulses traveling along connections

- [ ] **Step 3: Commit**

```bash
git add js/background.js
git commit -m "feat: particle starfield and data flow network background"
```

---

### Task 8: 3D glow chart

**Files:**
- Create: `js/chart3d.js`
- Modify: `js/scene.js` — integrate chart and return `updateChart` function

Implement the 3D glowing curve chart with TubeGeometry, data point spheres, raycaster hover, and smooth update animation.

- [ ] **Step 1: Create `js/chart3d.js`**

```js
// js/chart3d.js
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { formatMoney } from './calculator.js';

let chartGroup;
let tubeMesh, fillMesh;
let dataPointMeshes = [];
let axisLines = [];
let axisLabels = [];
let depletionPlane, depletionLabel;
let currentData = [];
let targetData = [];
let isAnimating = false;
let animProgress = 1;
let css2dRenderer;
let tooltipDiv;
let raycaster, mouse;
let camera;

const CHART_WIDTH = 600;
const CHART_HEIGHT = 250;
const CHART_OFFSET_Y = -350; // Position below panels

export function initChart(scene, cam, domContainer) {
  camera = cam;
  chartGroup = new THREE.Group();
  chartGroup.position.set(-CHART_WIDTH / 2, CHART_OFFSET_Y, 0);
  scene.add(chartGroup);

  raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: 5 };
  mouse = new THREE.Vector2();

  // CSS2D Renderer for labels
  css2dRenderer = new CSS2DRenderer();
  css2dRenderer.setSize(window.innerWidth, window.innerHeight);
  css2dRenderer.domElement.style.position = 'absolute';
  css2dRenderer.domElement.style.top = '0';
  css2dRenderer.domElement.style.left = '0';
  css2dRenderer.domElement.style.pointerEvents = 'none';
  domContainer.appendChild(css2dRenderer.domElement);

  // Tooltip element
  tooltipDiv = document.createElement('div');
  tooltipDiv.style.cssText = `
    background: rgba(6,13,26,0.92);
    border: 1px solid rgba(30,144,255,0.3);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12px;
    color: #e0e8ff;
    white-space: nowrap;
    display: none;
    font-family: -apple-system, sans-serif;
  `;

  // Mouse interaction
  domContainer.addEventListener('mousemove', onMouseMove);

  // Resize
  window.addEventListener('resize', () => {
    css2dRenderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { css2dRenderer };
}

function onMouseMove(event) {
  const rect = event.target.getBoundingClientRect ? event.target.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  mouse.x = ((event.clientX) / window.innerWidth) * 2 - 1;
  mouse.y = -((event.clientY) / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(dataPointMeshes);

  // Reset all points
  dataPointMeshes.forEach(m => {
    m.scale.setScalar(1);
    m.material.opacity = 0.4;
  });

  if (intersects.length > 0) {
    const point = intersects[0].object;
    point.scale.setScalar(2);
    point.material.opacity = 1;

    // Show tooltip
    if (point.userData.tooltipObj) {
      point.userData.tooltipObj.visible = true;
    }
  } else {
    // Hide all tooltips
    dataPointMeshes.forEach(m => {
      if (m.userData.tooltipObj) m.userData.tooltipObj.visible = false;
    });
  }
}

export function updateChart(years, depleted, startAge) {
  if (!chartGroup) return;

  // Clear previous chart elements
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
    fillShape.lineTo(CHART_WIDTH, 0);
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
  const normalPointMat = new THREE.MeshBasicMaterial({
    color: 0x1e90ff,
    transparent: true,
    opacity: 0.4,
  });
  const expensePointMat = new THREE.MeshBasicMaterial({
    color: 0xe17055,
    transparent: true,
    opacity: 0.4,
  });
  const pointGeom = new THREE.SphereGeometry(3, 12, 12);

  points.forEach((p, i) => {
    const age = startAge + i;
    const yearData = i > 0 ? years[i - 1] : null;
    const hasExpense = yearData && yearData.bigExpense > 0;

    const mesh = new THREE.Mesh(pointGeom, (hasExpense ? expensePointMat : normalPointMat).clone());
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

  // X axis
  const xAxisGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(CHART_WIDTH, 0, 0),
  ]);
  const xAxis = new THREE.Line(xAxisGeom, axisMat);
  chartGroup.add(xAxis);
  axisLines.push(xAxis);

  // Y axis
  const yAxisGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, CHART_HEIGHT, 0),
  ]);
  const yAxis = new THREE.Line(yAxisGeom, axisMat);
  chartGroup.add(yAxis);
  axisLines.push(yAxis);

  // Axis labels (CSS2D)
  // X axis labels (age)
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

  // Y axis labels (amount)
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

  if (tubeMesh) { chartGroup.remove(tubeMesh); tubeMesh.geometry.dispose(); tubeMesh.material.dispose(); tubeMesh = null; }
  if (fillMesh) { chartGroup.remove(fillMesh); fillMesh.geometry.dispose(); fillMesh.material.dispose(); fillMesh = null; }

  dataPointMeshes.forEach(m => {
    chartGroup.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  });
  dataPointMeshes.length = 0;

  axisLines.forEach(l => { chartGroup.remove(l); l.geometry.dispose(); l.material.dispose(); });
  axisLines.length = 0;

  axisLabels.forEach(l => chartGroup.remove(l));
  axisLabels.length = 0;

  if (depletionPlane) { chartGroup.remove(depletionPlane); depletionPlane.geometry.dispose(); depletionPlane.material.dispose(); depletionPlane = null; }
  if (depletionLabel) { chartGroup.remove(depletionLabel); depletionLabel = null; }
}

export function renderCSS2D(scene, camera) {
  if (css2dRenderer) {
    css2dRenderer.render(scene, camera);
  }
}
```

- [ ] **Step 2: Update `js/scene.js` to integrate the 3D chart**

Replace the content of `js/scene.js`:

```js
// js/scene.js
import * as THREE from 'three';
import { createPostProcessing } from './postprocessing.js';

let camera, scene, renderer, composer;
let mouseX = 0, mouseY = 0;
let targetRotX = 0, targetRotY = 0;
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
  const chartResult = chartModule.initChart(scene, camera, container);
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

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);

    // Mouse parallax
    targetRotY = mouseX * 0.035;
    targetRotX = -mouseY * 0.035;
    camera.rotation.x += (targetRotX - camera.rotation.x) * 0.05;
    camera.rotation.y += (targetRotY - camera.rotation.y) * 0.05;

    updateBg();
    composer.render();
    if (renderCSS2D) renderCSS2D(scene, camera);
  }
  animate();

  // Return the chart update function for main.js to use
  return chartUpdateFn;
}

export function getUpdateChart() {
  return chartUpdateFn;
}
```

- [ ] **Step 3: Update `js/main.js` to use the 3D chart return value**

The current `main.js` already handles this — `initScene()` returns the chart update function. But we need to also hide the 2D canvas chart container on desktop when 3D chart is active. Add this to the `init()` function's 3D loading block in `js/main.js`:

In `js/main.js`, replace the try block inside `if (!isMobile)`:

```js
    try {
      const { initScene } = await import('./scene.js');
      const chart3dUpdate = await initScene();
      if (chart3dUpdate) {
        updateChart = chart3dUpdate;
        // Hide 2D canvas chart elements on desktop
        const chartCanvas = document.getElementById('chart');
        if (chartCanvas) chartCanvas.style.display = 'none';
        document.getElementById('chartTooltip').style.display = 'none';
        document.getElementById('crossV').style.display = 'none';
        document.getElementById('crossH').style.display = 'none';
        document.getElementById('chartDot').style.display = 'none';
      }
    } catch (e) {
      console.warn('Three.js init failed, using 2D fallback:', e);
    }
```

- [ ] **Step 4: Test 3D chart**

Open `index.html` on desktop. You should see:
- Blue glowing tube curve showing asset projection
- Small spheres at each data point (orange for expense years)
- Hover over points to see tooltip labels
- Red depletion indicator if spending exceeds capacity
- Chart updates when changing input values

- [ ] **Step 5: Commit**

```bash
git add js/chart3d.js js/scene.js js/main.js
git commit -m "feat: 3D glow chart with raycaster hover and CSS2D labels"
```

---

### Task 9: Mobile 2D fallback CSS

**Files:**
- Modify: `css/mobile.css` (expand from starter)

Complete the mobile fallback styles — hide Three.js, ensure single-column layout works, and apply JARVIS-blue theme to the 2D chart.

- [ ] **Step 1: Write complete `css/mobile.css`**

```css
/* css/mobile.css — Mobile 2D Fallback */

/* Hide Three.js container entirely */
.mobile-mode .three-container {
  display: none !important;
}

/* Ensure panels are visible and properly styled */
.mobile-mode .container {
  position: relative;
  z-index: 1;
  max-width: 100%;
  padding: 20px 12px;
}

.mobile-mode .card {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  background: rgba(10, 20, 40, 0.9);
}

/* Make sure 2D canvas chart is visible on mobile */
.mobile-mode .chart-container canvas {
  display: block !important;
}
.mobile-mode .chart-tooltip,
.mobile-mode .chart-crosshair-v,
.mobile-mode .chart-crosshair-h,
.mobile-mode .chart-dot {
  display: block !important;
}

/* Ensure animations still play on mobile */
.mobile-mode .hud-panel {
  opacity: 0;
  transform: translateY(30px);
  animation: panelEnter 0.5s ease forwards;
}
```

- [ ] **Step 2: Test on mobile viewport**

Open browser DevTools, switch to a mobile viewport (e.g., iPhone 14). The page should:
- Show no 3D background or canvas
- Display all form panels in single column
- Show 2D canvas chart with blue color scheme
- All interactions (inputs, results, table) work correctly

- [ ] **Step 3: Commit**

```bash
git add css/mobile.css
git commit -m "feat: complete mobile 2D fallback styles"
```

---

### Task 10: Final integration and cleanup

**Files:**
- Modify: `index.html` — add `.superpowers` to `.gitignore`
- Verify all features work end-to-end

- [ ] **Step 1: Add `.superpowers` to `.gitignore`**

Check if `.gitignore` exists, create or append:

```
.superpowers/
```

- [ ] **Step 2: End-to-end testing checklist**

Open `index.html` in a desktop browser and verify:

1. 3D background: particles rotate, nodes drift with connections, pulses travel
2. HUD panels: JARVIS-blue theme, panel enter animations, all form controls work
3. Calculator: change age/savings/rate/spending → results update correctly
4. Pension toggle: shows/hides pension fields, affects calculation
5. Income items: add/remove, age steppers, amount formatting, summary text
6. Expense items: add/remove, loan toggle with rate/down payment, loan info display
7. 3D Chart: glowing blue curve, hover data points for tooltips, orange expense markers
8. Depletion line: set high spending to trigger depletion, verify red indicator appears
9. Table: toggle show/hide, columns adapt to pension/income/expense presence
10. Resize: window resize updates both renderers and chart

Open in mobile viewport and verify:
1. No 3D elements visible
2. 2D canvas chart with blue styling
3. All form interactions work
4. Single column responsive layout

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: add .superpowers to gitignore"
```

- [ ] **Step 4: Final commit with all files**

Verify all files are committed:

```bash
git status
```

Expected: clean working tree. All files tracked:
- `index.html`
- `css/hud.css`
- `css/mobile.css`
- `js/main.js`
- `js/calculator.js`
- `js/ui.js`
- `js/scene.js`
- `js/background.js`
- `js/chart3d.js`
- `js/postprocessing.js`
