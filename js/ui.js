// js/ui.js — Form interaction, income/expense management, DOM events
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

function setupFormattedInput(input, afterFormat) {
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
    if (afterFormat) afterFormat();
    onCalculate();
  });
}

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

  div.querySelectorAll('[data-step]').forEach(btn => {
    btn.addEventListener('click', function() {
      const target = div.querySelector(`[data-field="${this.dataset.target}"]`);
      stepAge(target, parseInt(this.dataset.step));
    });
  });

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

  setupFormattedInput(amountInput, updateIncHint);

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

  const loanToggle = div.querySelector('[data-action="toggleLoan"]');
  const loanRow = div.querySelector('[data-loan-row]');
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

  setupFormattedInput(amountInput, () => { updateExpHint(); updateLoanInfo(); });

  loanToggle.addEventListener('click', function() {
    const show = !loanRow.classList.contains('show');
    loanRow.classList.toggle('show', show);
    this.classList.toggle('active', show);
    this.textContent = show ? '取消贷款' : '贷款';
    updateLoanInfo();
    onCalculate();
  });

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

export function renderResults(results, params) {
  const { years, depleted, safeSpending, remainingYears, lastBalance, pensionStartAge } = results;
  const { age, lifespan, spending, hasPension, expenses } = params;
  const resultsEl = $('results');
  let html = '';

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

export function initUI() {
  setupMoneyInput('savings', 'savings-hint');
  setupMoneyInput('spending', 'spending-hint');
  setupMoneyInput('pension', 'pension-hint');

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

  // Expose for inline onclick handlers in HTML
  window.stepAge = stepAge;
  window.stepRate = stepRate;
}
