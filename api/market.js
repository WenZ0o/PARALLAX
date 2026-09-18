const ASSETS = [
  { id:'bitcoin', symbol:'BTC', name:'Bitcoin', product:'BTC-USD' },
  { id:'ethereum', symbol:'ETH', name:'Ethereum', product:'ETH-USD' },
  { id:'solana', symbol:'SOL', name:'Solana', product:'SOL-USD' }
];

function json(data, status = 200, extra = {}) {
  return Response.json(data, {
    status,
    headers: {
      'cache-control':'public, s-maxage=20, stale-while-revalidate=40',
      ...extra
    }
  });
}

async function fromCoinGecko() {
  const ids = ASSETS.map((asset) => asset.id).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`;
  const response = await fetch(url, {
    headers:{ accept:'application/json', 'user-agent':'PARALLAX/1.1' },
    signal:AbortSignal.timeout(6500)
  });
  if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);
  const data = await response.json();
  return ASSETS.map((asset) => {
    const row = data?.[asset.id] || {};
    const price = Number(row.usd);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Missing ${asset.symbol} price`);
    return {
      symbol:asset.symbol,
      name:asset.name,
      price,
      change24h:Number.isFinite(Number(row.usd_24h_change)) ? Number(row.usd_24h_change) : null,
      updatedAt:row.last_updated_at ? new Date(row.last_updated_at * 1000).toISOString() : null
    };
  });
}

async function fromCoinbase() {
  return Promise.all(ASSETS.map(async (asset) => {
    const response = await fetch(`https://api.exchange.coinbase.com/products/${asset.product}/stats`, {
      headers:{ accept:'application/json', 'user-agent':'PARALLAX/1.1' },
      signal:AbortSignal.timeout(6500)
    });
    if (!response.ok) throw new Error(`Coinbase HTTP ${response.status}`);
    const data = await response.json();
    const last = Number(data.last);
    const open = Number(data.open);
    if (!Number.isFinite(last) || last <= 0) throw new Error(`Missing ${asset.symbol} price`);
    return {
      symbol:asset.symbol,
      name:asset.name,
      price:last,
      change24h:Number.isFinite(open) && open > 0 ? ((last - open) / open) * 100 : null,
      updatedAt:null
    };
  }));
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') return json({ error:'Method not allowed' }, 405, { Allow:'GET' });

    try {
      let assets;
      let source = 'coingecko';
      try {
        assets = await fromCoinGecko();
      } catch {
        assets = await fromCoinbase();
        source = 'coinbase';
      }
      return json({ source, readOnly:true, updatedAt:new Date().toISOString(), assets });
    } catch (error) {
      return json({
        error:'Live market data is temporarily unavailable.',
        detail:String(error?.message || 'Unknown provider error').slice(0, 180)
      }, 502);
    }
  }
};
