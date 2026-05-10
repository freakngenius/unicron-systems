#!/usr/bin/env node
// scripts/gmail-oauth-bootstrap.js
//
// One-time OAuth2 authorization flow to generate GMAIL_REFRESH_TOKEN_KYLE.
// See docs/gmail-oauth-setup.md for full setup instructions.
//
// Usage:
//   node scripts/gmail-oauth-bootstrap.js \
//     --client-id "YOUR_CLIENT_ID" \
//     --client-secret "YOUR_CLIENT_SECRET"
//
// Prerequisites: npm install googleapis

'use strict';

const http = require('http');
const { google } = require('googleapis');

// ── Parse CLI args ────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--client-id' && args[i + 1]) result.clientId = args[++i];
    else if (args[i] === '--client-secret' && args[i + 1]) result.clientSecret = args[++i];
  }
  return result;
}

const { clientId, clientSecret } = parseArgs();

if (!clientId || !clientSecret) {
  console.error(
    'Usage: node scripts/gmail-oauth-bootstrap.js --client-id <id> --client-secret <secret>'
  );
  process.exit(1);
}

// ── OAuth2 config ─────────────────────────────────────────────────────────────

const REDIRECT_URI = 'http://localhost:3000/oauth/callback';
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

// ── Generate auth URL ─────────────────────────────────────────────────────────

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // force refresh token even if previously authorized
  scope: SCOPES,
});

console.log('\nOpening authorization URL in your default browser...');
console.log('\nIf the browser does not open automatically, paste this URL:\n');
console.log(authUrl + '\n');

// Attempt to open browser (non-fatal if it fails)
try {
  const { execSync } = require('child_process');
  const platform = process.platform;
  if (platform === 'darwin') execSync(`open "${authUrl}"`, { stdio: 'ignore' });
  else if (platform === 'win32') execSync(`start "" "${authUrl}"`, { stdio: 'ignore', shell: true });
  else execSync(`xdg-open "${authUrl}"`, { stdio: 'ignore' });
} catch {
  // Browser open failed — user can copy/paste the URL above
}

// ── Local callback server ─────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:3000`);

  if (url.pathname !== '/oauth/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h2>Authorization failed</h2><p>${error}</p><p>You can close this tab.</p>`);
    console.error('\nAuthorization failed:', error);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end('<h2>No authorization code received.</h2><p>You can close this tab.</p>');
    server.close();
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<h2>No refresh token returned.</h2>' +
        '<p>This usually means the account was already authorized. ' +
        'Revoke access at https://myaccount.google.com/permissions and run the script again.</p>'
      );
      console.error(
        '\nGoogle did not return a refresh token.',
        '\nRevoke access at https://myaccount.google.com/permissions and re-run.'
      );
      server.close();
      process.exit(1);
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Authorization successful!</h2><p>You can close this tab and return to the terminal.</p>');

    console.log('\nSuccess! Add this to the Pathfinder Vercel project environment variables:\n');
    console.log(`GMAIL_REFRESH_TOKEN_KYLE=${tokens.refresh_token}`);
    console.log('\nSee docs/gmail-oauth-setup.md step 4 for where to add it.\n');

    server.close();
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end('<h2>Token exchange failed.</h2><p>Check the terminal for details.</p>');
    console.error('\nToken exchange failed:', err.message ?? err);
    server.close();
    process.exit(1);
  }
});

server.listen(3000, '127.0.0.1', () => {
  console.log('Waiting for Google OAuth2 callback on http://localhost:3000/oauth/callback ...\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      'Port 3000 is already in use. Stop any local dev server on port 3000 and re-run this script.'
    );
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});
