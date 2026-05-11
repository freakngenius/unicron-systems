// POST /api/atrium/plaid/sync — S5b skeleton
// Placeholder endpoint for the future Plaid → cash_balance sync. Returns
// 503 with `configured:false` until PLAID_CLIENT_ID + PLAID_SECRET are set
// in Vercel env. The actual Plaid client wiring lands in a follow-up PR
// once the credentials are provisioned.

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    res.status(503).json({
      configured: false,
      message: 'Plaid is not connected. Manual cash entry via ns_money_cash_set is the default path until PLAID_CLIENT_ID + PLAID_SECRET are set.',
    });
    return;
  }

  // TODO follow-up PR: instantiate Plaid client, exchange link token,
  // call Plaid /accounts/balance/get, INSERT into nervous_system.cash_balance
  // with source='plaid'. Until then we ack the request without action.
  res.status(202).json({
    configured: true,
    message: 'Plaid integration shipped as a skeleton. Live sync wiring is a follow-up.',
  });
}
