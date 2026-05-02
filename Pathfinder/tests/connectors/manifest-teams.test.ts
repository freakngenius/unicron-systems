// tests/connectors/manifest-teams.test.ts — Teams manifest + zip generator.
//
// Covers:
//   • Zip parses cleanly and contains manifest.json + color.png + outline.png
//   • manifest.json has all schema-required fields (id, manifestVersion,
//     name.short, packageName, bots[].botId, etc.)
//   • Same orgId yields the same manifest id (deterministic UUID)
//   • Different orgIds yield different manifest ids
//   • Bot id placeholder is surfaced when env is unset
//   • Icons are valid PNGs (signature byte check)

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';

import { generateTeamsPackage } from '@/lib/connectors/manifests/teams';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('generateTeamsPackage', () => {
  it('returns a buffer and a per-org filename', async () => {
    const pkg = await generateTeamsPackage({
      orgId: 'zedcor',
      baseUrl: 'https://www.unicron.systems/pathfinder',
      botId: 'bot-12345',
    });
    expect(pkg.filename).toBe('pathfinder-teams-zedcor.zip');
    expect(Buffer.isBuffer(pkg.body)).toBe(true);
    expect(pkg.body.length).toBeGreaterThan(0);
  });

  it('produces a zip that contains manifest.json + color.png + outline.png', async () => {
    const pkg = await generateTeamsPackage({
      orgId: 'zedcor',
      baseUrl: 'https://www.unicron.systems/pathfinder',
      botId: 'bot-12345',
    });
    const zip = await JSZip.loadAsync(pkg.body);
    expect(zip.file('manifest.json')).toBeTruthy();
    expect(zip.file('color.png')).toBeTruthy();
    expect(zip.file('outline.png')).toBeTruthy();
  });

  it('includes manifest.json that parses and has schema-required fields', async () => {
    const pkg = await generateTeamsPackage({
      orgId: 'zedcor',
      baseUrl: 'https://www.unicron.systems/pathfinder',
      botId: 'bot-12345',
    });
    const zip = await JSZip.loadAsync(pkg.body);
    const manifestText = await zip.file('manifest.json')!.async('string');
    const manifest = JSON.parse(manifestText);
    expect(manifest.manifestVersion).toBe('1.16');
    expect(typeof manifest.id).toBe('string');
    expect(manifest.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(manifest.name.short.length).toBeGreaterThan(0);
    expect(manifest.name.short.length).toBeLessThanOrEqual(30);
    expect(manifest.packageName).toBe('systems.unicron.pathfinder.zedcor');
    expect(manifest.icons.color).toBe('color.png');
    expect(manifest.icons.outline).toBe('outline.png');
    expect(Array.isArray(manifest.bots)).toBe(true);
    expect(manifest.bots[0].botId).toBe('bot-12345');
    expect(manifest.bots[0].scopes).toContain('personal');
    expect(manifest.bots[0].scopes).toContain('team');
    expect(manifest.validDomains).toContain('www.unicron.systems');
  });

  it('produces a stable manifest id for the same org and a different one for a different org', async () => {
    const a = await generateTeamsPackage({
      orgId: 'zedcor',
      baseUrl: 'https://www.unicron.systems/pathfinder',
    });
    const b = await generateTeamsPackage({
      orgId: 'zedcor',
      baseUrl: 'https://www.unicron.systems/pathfinder',
    });
    const c = await generateTeamsPackage({
      orgId: 'tenant-other',
      baseUrl: 'https://www.unicron.systems/pathfinder',
    });
    expect(a.manifest.id).toBe(b.manifest.id);
    expect(a.manifest.id).not.toBe(c.manifest.id);
  });

  it('surfaces a placeholder bot id when env is not threaded in', async () => {
    const pkg = await generateTeamsPackage({
      orgId: 'zedcor',
      baseUrl: 'https://www.unicron.systems/pathfinder',
    });
    expect(pkg.manifest.bots[0].botId).toBe('REPLACE_BEFORE_INSTALL');
  });

  it('writes valid PNG icons (signature check)', async () => {
    const pkg = await generateTeamsPackage({
      orgId: 'zedcor',
      baseUrl: 'https://www.unicron.systems/pathfinder',
    });
    const zip = await JSZip.loadAsync(pkg.body);
    const colorPng = await zip.file('color.png')!.async('nodebuffer');
    const outlinePng = await zip.file('outline.png')!.async('nodebuffer');
    expect(colorPng.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(outlinePng.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    // The two icons must differ in size (192x192 vs 32x32).
    expect(colorPng.length).toBeGreaterThan(outlinePng.length);
  });

  it('rejects malformed org ids and non-https base URLs', async () => {
    await expect(
      generateTeamsPackage({ orgId: 'bad space', baseUrl: 'https://example.com' }),
    ).rejects.toThrow();
    await expect(
      generateTeamsPackage({ orgId: '', baseUrl: 'https://example.com' }),
    ).rejects.toThrow();
    await expect(
      generateTeamsPackage({ orgId: 'zedcor', baseUrl: 'http://insecure.example.com' }),
    ).rejects.toThrow();
  });

  it('does not leak teams client secret or bot password in the manifest body', async () => {
    process.env.TEAMS_CLIENT_SECRET = 'extremely-secret-teams-secret';
    process.env.TEAMS_BOT_PASSWORD = 'extremely-secret-teams-password';
    const pkg = await generateTeamsPackage({
      orgId: 'zedcor',
      baseUrl: 'https://www.unicron.systems/pathfinder',
      botId: 'bot-public-id',
    });
    const zip = await JSZip.loadAsync(pkg.body);
    const text = await zip.file('manifest.json')!.async('string');
    expect(text).not.toContain('extremely-secret-teams-secret');
    expect(text).not.toContain('extremely-secret-teams-password');
  });
});
