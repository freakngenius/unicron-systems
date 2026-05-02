// tests/connectors/teams-signature.test.ts — Bot Framework JWT verifier.
//
// We build real RS256-signed tokens using node:crypto and stub the JWKS
// fetch to return our public key, then exercise the success + every
// failure mode. The test-bypass escape-hatch is also covered.

import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

import {
  __resetJwksCacheForTests,
  verifyTeamsRequest,
} from '@/lib/connectors/teams/signature';

const realFetch = global.fetch;

interface KeyPair {
  publicKey: crypto.KeyObject;
  privateKey: crypto.KeyObject;
  jwk: { kty: string; n: string; e: string; kid: string };
}

function genKey(kid = 'kid-1'): KeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const jwk = publicKey.export({ format: 'jwk' }) as { kty?: string; n?: string; e?: string };
  return {
    publicKey,
    privateKey,
    jwk: { kty: jwk.kty ?? 'RSA', n: jwk.n ?? '', e: jwk.e ?? '', kid },
  };
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signJwt(privateKey: crypto.KeyObject, header: object, payload: object): string {
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const signing = `${h}.${p}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signing);
  const sig = b64url(signer.sign(privateKey));
  return `${h}.${p}.${sig}`;
}

function mockJwksFetch(jwk: { kty: string; n: string; e: string; kid: string }): void {
  global.fetch = vi.fn().mockImplementation(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes('openidconfiguration')) {
      return {
        ok: true,
        json: async () => ({ jwks_uri: 'https://test.local/jwks' }),
      } as Response;
    }
    if (u.includes('/jwks')) {
      return {
        ok: true,
        json: async () => ({ keys: [jwk] }),
      } as Response;
    }
    return { ok: false, status: 500 } as Response;
  }) as unknown as typeof fetch;
}

describe('verifyTeamsRequest', () => {
  beforeEach(() => {
    __resetJwksCacheForTests();
    process.env.TEAMS_BOT_ID = 'bot-id-1';
    delete process.env.TEAMS_DISABLE_JWT_VERIFY;
    vi.stubEnv('NODE_ENV', 'test');
  });
  afterEach(() => {
    delete process.env.TEAMS_BOT_ID;
    delete process.env.TEAMS_DISABLE_JWT_VERIFY;
    vi.unstubAllEnvs();
    global.fetch = realFetch;
  });

  it('rejects a missing Authorization header', async () => {
    const out = await verifyTeamsRequest(null);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('missing_authorization');
  });

  it('rejects a non-Bearer Authorization header', async () => {
    const out = await verifyTeamsRequest('Basic abc');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('missing_authorization');
  });

  it('rejects a malformed JWT (not three segments)', async () => {
    const out = await verifyTeamsRequest('Bearer not.a.jwt.really');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('malformed_jwt');
  });

  it('accepts a correctly signed RS256 token with valid claims', async () => {
    const kp = genKey();
    mockJwksFetch(kp.jwk);
    const now = Math.floor(Date.now() / 1000);
    const jwt = signJwt(
      kp.privateKey,
      { alg: 'RS256', kid: 'kid-1' },
      { iss: 'https://api.botframework.com', aud: 'bot-id-1', exp: now + 600, nbf: now - 60 },
    );
    const out = await verifyTeamsRequest(`Bearer ${jwt}`);
    expect(out.ok).toBe(true);
  });

  it('rejects when issuer is wrong', async () => {
    const kp = genKey();
    mockJwksFetch(kp.jwk);
    const now = Math.floor(Date.now() / 1000);
    const jwt = signJwt(
      kp.privateKey,
      { alg: 'RS256', kid: 'kid-1' },
      { iss: 'https://evil.example.com', aud: 'bot-id-1', exp: now + 600 },
    );
    const out = await verifyTeamsRequest(`Bearer ${jwt}`);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('wrong_issuer');
  });

  it('rejects when audience is wrong', async () => {
    const kp = genKey();
    mockJwksFetch(kp.jwk);
    const now = Math.floor(Date.now() / 1000);
    const jwt = signJwt(
      kp.privateKey,
      { alg: 'RS256', kid: 'kid-1' },
      { iss: 'https://api.botframework.com', aud: 'someone-else', exp: now + 600 },
    );
    const out = await verifyTeamsRequest(`Bearer ${jwt}`);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('wrong_audience');
  });

  it('rejects an expired token', async () => {
    const kp = genKey();
    mockJwksFetch(kp.jwk);
    const old = Math.floor(Date.now() / 1000) - 60 * 60; // 1h ago
    const jwt = signJwt(
      kp.privateKey,
      { alg: 'RS256', kid: 'kid-1' },
      { iss: 'https://api.botframework.com', aud: 'bot-id-1', exp: old },
    );
    const out = await verifyTeamsRequest(`Bearer ${jwt}`);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('expired');
  });

  it('rejects when signed with the wrong key', async () => {
    const real = genKey('kid-1');
    const attacker = genKey('kid-1'); // same kid, different key
    mockJwksFetch(real.jwk);
    const now = Math.floor(Date.now() / 1000);
    const jwt = signJwt(
      attacker.privateKey,
      { alg: 'RS256', kid: 'kid-1' },
      { iss: 'https://api.botframework.com', aud: 'bot-id-1', exp: now + 600 },
    );
    const out = await verifyTeamsRequest(`Bearer ${jwt}`);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('bad_signature');
  });

  it('rejects when kid is unknown to the JWKS', async () => {
    const real = genKey('kid-known');
    mockJwksFetch(real.jwk);
    const now = Math.floor(Date.now() / 1000);
    const jwt = signJwt(
      real.privateKey,
      { alg: 'RS256', kid: 'kid-different' },
      { iss: 'https://api.botframework.com', aud: 'bot-id-1', exp: now + 600 },
    );
    const out = await verifyTeamsRequest(`Bearer ${jwt}`);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('unknown_kid');
  });

  it('honours TEAMS_DISABLE_JWT_VERIFY in non-prod', async () => {
    process.env.TEAMS_DISABLE_JWT_VERIFY = '1';
    const out = await verifyTeamsRequest('Bearer arbitrary.token.here');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.reason).toBe('test_bypass');
  });

  it('IGNORES TEAMS_DISABLE_JWT_VERIFY in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.TEAMS_DISABLE_JWT_VERIFY = '1';
    const out = await verifyTeamsRequest('Bearer arbitrary.token.here');
    expect(out.ok).toBe(false); // bypass is disabled in prod
  });
});
