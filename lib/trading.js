export const PAPER_STARTING_CASH = 10000;
export const PAPER_MAX_POSITION_FRACTION = 0.20;
export const PAPER_MAX_EXPOSURE_FRACTION = 0.60;
export const SUPPORTED_ASSETS = Object.freeze(['BTC', 'ETH', 'SOL']);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function calculatePaperPnl(position, markPrice) {
  const entry = finite(position?.entryPrice);
  const mark = finite(markPrice, entry);
  const notional = Math.max(0, finite(position?.notional));
  if (!entry || !notional) return 0;
  const quantity = notional / entry;
  const side = String(position?.side || 'BUY').toUpperCase();
  return side === 'SELL'
    ? quantity * (entry - mark)
    : quantity * (mark - entry);
}

export function calculatePaperEquity(state, prices = {}) {
  const cash = Math.max(0, finite(state?.cash, PAPER_STARTING_CASH));
  const positions = Array.isArray(state?.positions) ? state.positions : [];
  let exposure = 0;
  let unrealizedPnl = 0;
  let markedValue = 0;

  for (const position of positions) {
    const notional = Math.max(0, finite(position?.notional));
    const mark = finite(prices[position?.asset], finite(position?.entryPrice));
    const pnl = calculatePaperPnl(position, mark);
    exposure += notional;
    unrealizedPnl += pnl;
    markedValue += Math.max(0, notional + pnl);
  }

  return { cash, exposure, unrealizedPnl, equity: cash + markedValue };
}

export function validatePaperOrder({ notional, equity, exposure }) {
  const amount = finite(notional);
  const totalEquity = Math.max(0, finite(equity));
  const openExposure = Math.max(0, finite(exposure));

  if (!(amount > 0)) return { ok:false, error:'Paper notional must be greater than zero.' };
  if (!(totalEquity > 0)) return { ok:false, error:'Paper portfolio has no available equity.' };
  if (amount > totalEquity * PAPER_MAX_POSITION_FRACTION + 1e-9) {
    return { ok:false, error:`Single paper positions are capped at ${Math.round(PAPER_MAX_POSITION_FRACTION * 100)}% of equity.` };
  }
  if (openExposure + amount > totalEquity * PAPER_MAX_EXPOSURE_FRACTION + 1e-9) {
    return { ok:false, error:`Total paper exposure is capped at ${Math.round(PAPER_MAX_EXPOSURE_FRACTION * 100)}% of equity.` };
  }
  return { ok:true };
}

export function stopDecision(position, markPrice) {
  const mark = finite(markPrice);
  const stop = finite(position?.stopLossPrice);
  const take = finite(position?.takeProfitPrice);
  const side = String(position?.side || 'BUY').toUpperCase();

  if (!mark) return null;
  if (side === 'SELL') {
    if (stop && mark >= stop) return 'STOP LOSS';
    if (take && mark <= take) return 'TAKE PROFIT';
  } else {
    if (stop && mark <= stop) return 'STOP LOSS';
    if (take && mark >= take) return 'TAKE PROFIT';
  }
  return null;
}

export function deriveMarketRegime(change24h) {
  const change = finite(change24h);
  if (change >= 3) return { label:'MOMENTUM UP', tone:'positive' };
  if (change > 0) return { label:'CONSTRUCTIVE', tone:'positive' };
  if (change <= -3) return { label:'MOMENTUM DOWN', tone:'negative' };
  if (change < 0) return { label:'DEFENSIVE', tone:'negative' };
  return { label:'NEUTRAL', tone:'neutral' };
}
