// js/calculator.js — Pure calculation functions, no DOM

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
 * @returns {Object} { years, depleted, safeSpending, remainingYears, lastBalance, pensionStartAge }
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
