const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';
const BASE58_PUBLIC_KEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function reply(data, status = 200) {
  return Response.json(data, { status, headers:{ 'cache-control':'no-store' } });
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') return reply({ error:'Method not allowed' }, 405);

    const url = new URL(request.url);
    const address = String(url.searchParams.get('address') || '').trim();
    if (!BASE58_PUBLIC_KEY.test(address)) {
      return reply({ error:'Enter a valid Solana public wallet address.' }, 400);
    }

    const rpc = process.env.SOLANA_RPC_URL || DEFAULT_RPC;

    try {
      const response = await fetch(rpc, {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        signal:AbortSignal.timeout(8000),
        body:JSON.stringify({
          jsonrpc:'2.0',
          id:'parallax-wallet-read',
          method:'getBalance',
          params:[address, { commitment:'confirmed' }]
        })
      });
      if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
      const data = await response.json();
      if (data?.error) throw new Error(data.error.message || 'Solana RPC error');

      const lamports = Number(data?.result?.value || 0);
      return reply({
        network:'solana-mainnet',
        address,
        lamports,
        sol:lamports / 1_000_000_000,
        readOnly:true,
        signing:false,
        privateKeyRequired:false,
        updatedAt:new Date().toISOString()
      });
    } catch (error) {
      return reply({
        error:'Wallet balance could not be loaded from the Solana RPC.',
        detail:String(error?.message || 'RPC unavailable').slice(0, 180)
      }, 502);
    }
  }
};
