export type RowState = {
  odd: string;
  comm: string;
  stake: string;
  liability: string;
  stakeLay: string;
  c: boolean;
  boostActive: boolean;
  boostVal: string;
  fb: boolean;
  cbPct: string;
  cbTipo: 'real' | 'freebet' | 'deposito';
  cbMax: string;
  oddAdd: string;
  stakeAdd: string;
  bookmaker: string;
};

export type CalculatorState = {
  numOutcomes: number;
  totalStake: string;
  cbConversion: string;
  rows: RowState[];
  rowIsLay: boolean[];
  isManual: boolean[];
  boostFeatureEnabled: boolean;
  freebetFeatureEnabled: boolean;
  cashbackFeatureEnabled: boolean;
  extraBetFeatureEnabled: boolean;
};

export type CalcResults = {
  effOdds: number[];
  profits: number[];
  totalStake: number;
  minProfit: number;
  profitPercent: number;
  fbConversion: number;
};

export function createDefaultRow(): RowState {
  return {
    odd: '',
    comm: '',
    stake: '',
    liability: '',
    stakeLay: '',
    c: false,
    boostActive: false,
    boostVal: '',
    fb: false,
    cbPct: '',
    cbTipo: 'real',
    cbMax: '',
    oddAdd: '',
    stakeAdd: '',
    bookmaker: '',
  };
}

export function createDefaultState(): CalculatorState {
  return {
    numOutcomes: 3,
    totalStake: '',
    cbConversion: '100',
    rows: Array.from({ length: 6 }, () => createDefaultRow()),
    rowIsLay: Array.from({ length: 6 }, () => false),
    isManual: Array.from({ length: 6 }, () => false),
    boostFeatureEnabled: false,
    freebetFeatureEnabled: false,
    cashbackFeatureEnabled: false,
    extraBetFeatureEnabled: false,
  };
}

function toNum(v: string | undefined): number {
  if (v === undefined || v === null || v === '') return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export function sanitizeDecimal(value: string): string {
  // Allow the user to type freely: digits, one dot, one leading minus.
  // Preserve trailing dots so "1." stays "1." while typing.
  let v = value.replace(',', '.');
  v = v.replace(/[^0-9.\-]/g, '');
  // Keep only the first dot
  const firstDot = v.indexOf('.');
  if (firstDot >= 0) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
  }
  // Keep only a leading minus
  const hasMinus = v.startsWith('-');
  v = v.replace(/-/g, '');
  if (hasMinus) v = '-' + v;
  return v;
}

function getBoostedOdd(row: RowState, boostEnabled: boolean): number {
  let odd = toNum(row.odd);
  if (boostEnabled && row.boostActive) {
    const b = toNum(row.boostVal) / 100;
    odd = odd + b * (odd - 1);
  }
  return odd;
}

function getEffOdd(
  row: RowState,
  isLay: boolean,
  boostEnabled: boolean
): number {
  const odd = getBoostedOdd(row, boostEnabled);
  const comm = toNum(row.comm);
  if (odd <= 0) return 0;
  if (isLay) {
    if (odd <= 1) return 0;
    return 1 + (1 - comm / 100) / (odd - 1);
  }
  return 1 + (odd - 1) * (1 - comm / 100);
}

function getStakeAddVal(row: RowState, extraEnabled: boolean): number {
  return extraEnabled ? toNum(row.stakeAdd) : 0;
}

function getOddAddVal(row: RowState, extraEnabled: boolean): number {
  return extraEnabled ? toNum(row.oddAdd) : 0;
}

function hasAdditionalBet(row: RowState, extraEnabled: boolean): boolean {
  return extraEnabled && getOddAddVal(row, extraEnabled) > 0 && getStakeAddVal(row, extraEnabled) > 0;
}

function getEffOddAdd(row: RowState, isLay: boolean): number {
  const odd = getOddAddVal(row, true);
  const comm = toNum(row.comm);
  if (odd <= 0) return 0;
  if (isLay) {
    if (odd <= 1) return 0;
    return 1 + (1 - comm / 100) / (odd - 1);
  }
  return 1 + (odd - 1) * (1 - comm / 100);
}

function getBaseValue(row: RowState, isLay: boolean): number {
  return isLay ? toNum(row.liability) : toNum(row.stake);
}

function getRowTotalBase(row: RowState, isLay: boolean, extraEnabled: boolean): number {
  return getBaseValue(row, isLay) + getStakeAddVal(row, extraEnabled);
}

function getRowEffOdd(
  row: RowState,
  isLay: boolean,
  boostEnabled: boolean,
  extraEnabled: boolean
): number {
  const eff1 = getEffOdd(row, isLay, boostEnabled);
  if (!hasAdditionalBet(row, extraEnabled)) return eff1;
  const stake1 = getBaseValue(row, isLay);
  const stake2 = getStakeAddVal(row, extraEnabled);
  const eff2 = getEffOddAdd(row, isLay);
  const totalRow = stake1 + stake2;
  if (totalRow <= 0) return eff1;
  return (stake1 * eff1 + stake2 * eff2) / totalRow;
}

function isFB(row: RowState, fbEnabled: boolean): boolean {
  return fbEnabled && row.fb;
}

function getRowReturn(row: RowState, base: number, effOdd: number, fbEnabled: boolean): number {
  return isFB(row, fbEnabled) ? base * (effOdd - 1) : base * effOdd;
}

function baseFromReturn(row: RowState, targetReturn: number, effOdd: number, fbEnabled: boolean): number {
  if (effOdd <= 0) return 0;
  return isFB(row, fbEnabled) ? targetReturn / (effOdd - 1) : targetReturn / effOdd;
}

function isCashbackActive(row: RowState, cbEnabled: boolean): boolean {
  if (!cbEnabled) return false;
  return toNum(row.cbPct) > 0;
}

function getCashbackExtracted(
  row: RowState,
  isLay: boolean,
  extraEnabled: boolean,
  cbEnabled: boolean,
  cbConversion: number
): number {
  if (!isCashbackActive(row, cbEnabled)) return 0;
  const base = getRowTotalBase(row, isLay, extraEnabled);
  const pct = toNum(row.cbPct);
  let face = (base * pct) / 100;
  if (row.cbTipo === 'freebet') {
    const maxVal = toNum(row.cbMax);
    if (maxVal > 0) face = Math.min(face, maxVal);
    return (face * cbConversion) / 100;
  }
  return face;
}

function getCashbackBonus(
  rows: RowState[],
  rowIsLay: boolean[],
  extraEnabled: boolean,
  cbEnabled: boolean,
  cbConversion: number,
  n: number,
  excludeIndex: number
): number {
  let bonus = 0;
  for (let r = 0; r < n; r++) {
    if (!isCashbackActive(rows[r], cbEnabled)) continue;
    const tipo = rows[r].cbTipo;
    if (tipo === 'deposito') {
      bonus += getCashbackExtracted(rows[r], rowIsLay[r], extraEnabled, cbEnabled, cbConversion);
    } else if (r !== excludeIndex) {
      bonus += getCashbackExtracted(rows[r], rowIsLay[r], extraEnabled, cbEnabled, cbConversion);
    }
  }
  return bonus;
}

function getRefIndex(rows: RowState[], n: number): number | 'total' {
  for (let i = 0; i < n; i++) {
    if (rows[i].c) return i;
  }
  return 'total';
}

export function compute(state: CalculatorState): CalcResults {
  const n = state.numOutcomes;
  const ref = getRefIndex(state.rows, n);
  const cbConversion = toNum(state.cbConversion);
  const ITERATIONS = 25;

  const rows = state.rows;
  const rowIsLay = state.rowIsLay;
  const isManual = state.isManual;
  const boostEnabled = state.boostFeatureEnabled;
  const fbEnabled = state.freebetFeatureEnabled;
  const cbEnabled = state.cashbackFeatureEnabled;
  const extraEnabled = state.extraBetFeatureEnabled;

  // Working copy of base values
  const baseValues: number[] = rows.slice(0, n).map((r, i) => getBaseValue(r, rowIsLay[i]));

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Recalculate effective odds based on current base values
    const effOdds: number[] = [];
    for (let i = 0; i < n; i++) {
      const rowWithBase: RowState = {
        ...rows[i],
        stake: rowIsLay[i] ? rows[i].stake : String(baseValues[i]),
        liability: rowIsLay[i] ? String(baseValues[i]) : rows[i].liability,
      };
      effOdds.push(getRowEffOdd(rowWithBase, rowIsLay[i], boostEnabled, extraEnabled));
    }

    if (ref === 'total') {
      const totalStake = toNum(state.totalStake);
      let manualTotal = 0;
      let invSum = 0;
      let bonusInvSum = 0;
      for (let i = 0; i < n; i++) {
        if (isManual[i] || isFB(rows[i], fbEnabled)) {
          manualTotal += isFB(rows[i], fbEnabled) ? 0 : getRowTotalBase(rows[i], rowIsLay[i], extraEnabled);
        } else if (effOdds[i] > 0) {
          manualTotal += getStakeAddVal(rows[i], extraEnabled);
          invSum += 1 / effOdds[i];
          bonusInvSum += getCashbackBonus(rows, rowIsLay, extraEnabled, cbEnabled, cbConversion, n, i) / effOdds[i];
        }
      }
      const avail = totalStake - manualTotal;
      if (invSum > 0) {
        const k = (avail + bonusInvSum) / invSum;
        for (let i = 0; i < n; i++) {
          if (!isManual[i] && !isFB(rows[i], fbEnabled) && effOdds[i] > 0) {
            const bonus_i = getCashbackBonus(rows, rowIsLay, extraEnabled, cbEnabled, cbConversion, n, i);
            const requiredTotal = (k - bonus_i) / effOdds[i];
            baseValues[i] = Math.round(requiredTotal - getStakeAddVal(rows[i], extraEnabled));
          }
        }
      }
    } else {
      const refIdx = ref as number;
      const refBase = getRowTotalBase(rows[refIdx], rowIsLay[refIdx], extraEnabled);
      const refReturn = getRowReturn(rows[refIdx], refBase, effOdds[refIdx], fbEnabled);
      const refBonus = getCashbackBonus(rows, rowIsLay, extraEnabled, cbEnabled, cbConversion, n, refIdx);
      const k = refReturn + refBonus;

      for (let i = 0; i < n; i++) {
        if (i === refIdx) continue;
        if (!isManual[i] && effOdds[i] > 0) {
          const bonus_i = getCashbackBonus(rows, rowIsLay, extraEnabled, cbEnabled, cbConversion, n, i);
          const requiredTotal = baseFromReturn(rows[i], k - bonus_i, effOdds[i], fbEnabled);
          baseValues[i] = Math.round(requiredTotal - getStakeAddVal(rows[i], extraEnabled));
        }
      }
    }
  }

  // Final results
  const effOdds: number[] = [];
  for (let i = 0; i < n; i++) {
    const rowWithBase: RowState = {
      ...rows[i],
      stake: rowIsLay[i] ? rows[i].stake : String(baseValues[i]),
      liability: rowIsLay[i] ? String(baseValues[i]) : rows[i].liability,
    };
    effOdds.push(getRowEffOdd(rowWithBase, rowIsLay[i], boostEnabled, extraEnabled));
  }

  let totalStake: number;
  if (ref === 'total') {
    totalStake = toNum(state.totalStake);
  } else {
    totalStake = 0;
    for (let i = 0; i < n; i++) {
      if (!isFB(rows[i], fbEnabled)) {
        totalStake += getRowTotalBase(rows[i], rowIsLay[i], extraEnabled);
      }
    }
  }

  let minProfit: number | null = null;
  let fbStakeSum = 0;
  const profits: number[] = [];

  for (let i = 0; i < n; i++) {
    const baseVal = rowIsLay[i] ? baseValues[i] : toNum(rows[i].stake);
    const actualBase = rowIsLay[i] ? baseValues[i] : (isManual[i] ? toNum(rows[i].stake) : baseValues[i]);
    if (isFB(rows[i], fbEnabled)) fbStakeSum += actualBase;
    const rowReturn = getRowReturn(rows[i], actualBase, effOdds[i], fbEnabled);
    const bonus_i = getCashbackBonus(rows, rowIsLay, extraEnabled, cbEnabled, cbConversion, n, i);
    const profit = effOdds[i] > 0 ? rowReturn - totalStake + bonus_i : 0;
    profits.push(profit);
    if (minProfit === null || profit < minProfit) minProfit = profit;
  }

  const profitPercent = totalStake > 0 && minProfit !== null ? (minProfit / totalStake) * 100 : 0;
  const fbConversion = fbStakeSum > 0 && minProfit !== null ? (minProfit / fbStakeSum) * 100 : 0;

  return {
    effOdds,
    profits,
    totalStake,
    minProfit: minProfit ?? 0,
    profitPercent,
    fbConversion,
  };
}
