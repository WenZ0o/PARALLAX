import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePaperPnl,
  calculatePaperEquity,
  validatePaperOrder,
  stopDecision,
  deriveMarketRegime,
  autonomousPaperDecision
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


test('autonomous paper agent opens the strongest eligible momentum asset', () => {
  const decision = autonomousPaperDecision({
    assets:[
      { symbol:'BTC', price:100, change24h:2.4 },
      { symbol:'ETH', price:50, change24h:-4.2 },
      { symbol:'SOL', price:20, change24h:3.1 }
    ],
    state:{ cash:10000, positions:[], history:[] },
    prices:{ BTC:100, ETH:50, SOL:20 },
    now:1_800_000_000_000
  });
  assert.equal(decision.action, 'OPEN');
  assert.equal(decision.asset, 'ETH');
  assert.equal(decision.side, 'SELL');
  assert.equal(decision.notional, 1000);
});

test('autonomous paper agent holds when momentum is weak', () => {
  const decision = autonomousPaperDecision({
    assets:[
      { symbol:'BTC', price:100, change24h:0.5 },
      { symbol:'ETH', price:50, change24h:-1.1 }
    ],
    state:{ cash:10000, positions:[], history:[] },
    prices:{ BTC:100, ETH:50 }
  });
  assert.equal(decision.action, 'HOLD');
});

test('autonomous paper agent respects open-position cap and cooldown', () => {
  const now = 1_800_000_000_000;
  const capped = autonomousPaperDecision({
    assets:[{ symbol:'BTC', price:100, change24h:5 }],
    state:{
      cash:8000,
      positions:[
        { asset:'ETH', side:'BUY', entryPrice:50, notional:1000 },
        { asset:'SOL', side:'BUY', entryPrice:20, notional:1000 }
      ],
      history:[]
    },
    prices:{ BTC:100, ETH:50, SOL:20 },
    now
  });
  assert.equal(capped.action, 'HOLD');

  const cooling = autonomousPaperDecision({
    assets:[{ symbol:'BTC', price:100, change24h:5 }],
    state:{
      cash:10000,
      positions:[],
      history:[{ asset:'BTC', closedAt:new Date(now - 60_000).toISOString() }]
    },
    prices:{ BTC:100 },
    now
  });
  assert.equal(cooling.action, 'HOLD');
});
