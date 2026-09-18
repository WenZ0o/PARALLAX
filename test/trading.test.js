import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePaperPnl,
  calculatePaperEquity,
  validatePaperOrder,
  stopDecision,
  deriveMarketRegime
} from '../lib/trading.js';

test('calculates long and short paper PnL', () => {
  assert.equal(calculatePaperPnl({ side:'BUY', entryPrice:100, notional:1000 }, 110), 100);
  assert.equal(calculatePaperPnl({ side:'SELL', entryPrice:100, notional:1000 }, 90), 100);
});

test('paper equity includes reserved position value and unrealized pnl', () => {
  const state = { cash:9000, positions:[{ asset:'BTC', side:'BUY', entryPrice:100, notional:1000 }] };
  const metrics = calculatePaperEquity(state, { BTC:110 });
  assert.equal(metrics.exposure, 1000);
  assert.equal(metrics.unrealizedPnl, 100);
  assert.equal(metrics.equity, 10100);
});

test('risk guard caps single positions and total exposure', () => {
  assert.equal(validatePaperOrder({ notional:1500, equity:10000, exposure:0 }).ok, true);
  assert.equal(validatePaperOrder({ notional:2500, equity:10000, exposure:0 }).ok, false);
  assert.equal(validatePaperOrder({ notional:1500, equity:10000, exposure:5000 }).ok, false);
});

test('stop decisions respect trade direction', () => {
  assert.equal(stopDecision({ side:'BUY', stopLossPrice:95, takeProfitPrice:110 }, 94), 'STOP LOSS');
  assert.equal(stopDecision({ side:'SELL', stopLossPrice:105, takeProfitPrice:90 }, 89), 'TAKE PROFIT');
});

test('market regime classifies 24h momentum', () => {
  assert.equal(deriveMarketRegime(4).label, 'MOMENTUM UP');
  assert.equal(deriveMarketRegime(-4).label, 'MOMENTUM DOWN');
});
