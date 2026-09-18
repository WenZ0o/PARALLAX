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


export const AUTO_PAPER_MIN_MOMENTUM = 2;
export const AUTO_PAPER_POSITION_FRACTION = 0.10;
export const AUTO_PAPER_MAX_OPEN = 2;
export const AUTO_PAPER_COOLDOWN_MS = 10 * 60 * 1000;
export const AUTO_PAPER_STOP_PCT = 2.5;
export const AUTO_PAPER_TAKE_PCT = 5;

function timestamp(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : 0;
}

export function autonomousPaperDecision({
  assets = [],
  state = {},
  prices = {},
  now = Date.now(),
  minMomentum = AUTO_PAPER_MIN_MOMENTUM,
  maxOpen = AUTO_PAPER_MAX_OPEN,
  cooldownMs = AUTO_PAPER_COOLDOWN_MS,
  positionFraction = AUTO_PAPER_POSITION_FRACTION
} = {}) {
  const positions = Array.isArray(state?.positions) ? state.positions : [];
  const history = Array.isArray(state?.history) ? state.history : [];
  const metrics = calculatePaperEquity(state, prices);

  if (positions.length >= maxOpen) {
    return { action:'HOLD', reason:`Risk gate: ${maxOpen} autonomous positions already open.` };
  }

  const candidates = assets
    .map((asset) => ({
      symbol:String(asset?.symbol || '').toUpperCase(),
      price:finite(asset?.price),
      change24h:finite(asset?.change24h, NaN)
    }))
    .filter((asset) =>
      SUPPORTED_ASSETS.includes(asset.symbol) &&
      asset.price > 0 &&
      Number.isFinite(asset.change24h) &&
      Math.abs(asset.change24h) >= minMomentum
    )
    .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));

  if (!candidates.length) {
    return { action:'HOLD', reason:`No asset cleared the ${minMomentum.toFixed(1)}% momentum threshold.` };
  }

  for (const candidate of candidates) {
    if (positions.some((position) => position?.asset === candidate.symbol)) continue;

    const lastTouch = Math.max(
      ...positions
        .filter((position) => position?.asset === candidate.symbol)
        .map((position) => timestamp(position?.createdAt)),
      ...history
        .filter((item) => item?.asset === candidate.symbol)
        .map((item) => Math.max(timestamp(item?.closedAt), timestamp(item?.createdAt))),
      0
    );

    if (lastTouch && now - lastTouch < cooldownMs) continue;

    const requested = Math.round(Math.min(
      metrics.equity * positionFraction,
      metrics.cash
    ) * 100) / 100;

    if (requested < 50) {
      return { action:'HOLD', reason:'Risk gate: less than $50 paper cash available for a new position.' };
    }

    const validation = validatePaperOrder({
      notional:requested,
      equity:metrics.equity,
      exposure:metrics.exposure
    });

    if (!validation.ok) {
      return { action:'HOLD', reason:`Risk gate: ${validation.error}` };
    }

    return {
      action:'OPEN',
      asset:candidate.symbol,
      side:candidate.change24h >= 0 ? 'BUY' : 'SELL',
      notional:requested,
      entryPrice:candidate.price,
      stopPct:AUTO_PAPER_STOP_PCT,
      takePct:AUTO_PAPER_TAKE_PCT,
      change24h:candidate.change24h,
      reason:`${candidate.symbol} has the strongest eligible 24h momentum at ${candidate.change24h >= 0 ? '+' : ''}${candidate.change24h.toFixed(2)}%.`
    };
  }

  return { action:'HOLD', reason:'Eligible assets are already open or still inside the cooldown window.' };
}
