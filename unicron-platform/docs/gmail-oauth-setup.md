# Gmail OAuth2 Setup — Sprint 5 Stream A Email Ingest

One-time human-run setup to obtain the three env vars required by the email daily cron
(`Pathfinder/lib/inngest/functions/email-cron.ts`):

| Variable | Purpose |
|---|---|
| `GMAIL_CLIENT_ID` | Google OAuth2 client ID |
| `GMAIL_CLIENT_SECRET` | Google OAuth2 client secret |
| `GMAIL_REFRESH_TOKEN_KYLE` | Long-lived refresh token for kyle@unicron.systems |

---

## 1. Google Cloud Console — enable Gmail API and create OAuth credentials

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and select the **unicron-systems** project (or create one if it does not exist: **New Project** → name it `unicron-systems`).

2. In the left sidebar open **APIs & Services** → **Enabled APIs & services** → **+ Enable APIs and Services**.

3. Search for **Gmail API** → click it → **Enable**.

4. In the left sidebar open **APIs & Services** → **Credentials** → **+ Create Credentials** → **OAuth 2.0 Client ID**.

5. If prompted to configure the OAuth consent screen first:
   - **User Type:** Internal (Unicron is a Google Workspace org) — or External if not on Workspace.
   - **App name:** `Unicron Email Ingest`
   - **User support email:** kyle@unicron.systems
   - **Developer contact email:** kyle@unicron.systems
   - Add the scope `https://www.googleapis.com/auth/gmail.readonly` under **Scopes** → **Add or Remove Scopes**.
   - Save and continue through the remaining screens.

6. Back on **Create OAuth 2.0 Client ID**:
   - **Application type:** Desktop app
   - **Name:** `Unicron Email Bootstrap`
   - Click **Create**.

7. In the modal that appears click **Download JSON**. Save the file as `client_secret.json` somewhere safe (not committed to the repo).

8. Open the downloaded JSON. The values you need are:

   ```json
   {
     "installed": {
       "client_id": "XXXXXXXXXXXX-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com",
       "client_secret": "GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
       ...
     }
   }
   ```

   Copy `client_id` and `client_secret` — you will pass them to the bootstrap script in step 3.

---

## 2. Add Authorized Redirect URI

1. In Google Cloud Console open **APIs & Services** → **Credentials** → click the client you just created.
2. Under **Authorized redirect URIs** click **+ Add URI**.
3. Enter: `http://localhost:3000/oauth/callback`
4. Click **Save**.

---

## 3. Generate the refresh token (one-time, run locally)

The bootstrap script at `unicron-platform/scripts/gmail-oauth-bootstrap.js` handles the full OAuth2 authorization code flow.

**Prerequisites:**

```bash
cd unicron-platform
npm install googleapis   # only needed for this script — not in the main bundle
```

**Run:**

```bash
node scripts/gmail-oauth-bootstrap.js \
  --client-id "YOUR_CLIENT_ID" \
  --client-secret "YOUR_CLIENT_SECRET"
```

The script will:
1. Print an authorization URL and attempt to open it in your default browser.
2. Google will ask you to sign in as **kyle@unicron.systems** and grant `gmail.readonly`.
3. After you authorize, Google redirects to `http://localhost:3000/oauth/callback` — the script catches that callback automatically.
4. The script exchanges the authorization code for tokens and prints:

   ```
   GMAIL_REFRESH_TOKEN_KYLE=1//0xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

Copy that value — it is the refresh token.

> The script requests `access_type: offline` and `prompt: consent` to guarantee Google returns a refresh token, even if the account has been previously authorized.

---

## 4. Add env vars to Pathfinder Vercel project

In the Vercel dashboard open the **Pathfinder** project → **Settings** → **Environment Variables**.
Add the following to **Production** (and optionally Preview):

| Variable | Value | Environment |
|---|---|---|
| `GMAIL_CLIENT_ID` | From step 1 | Production |
| `GMAIL_CLIENT_SECRET` | From step 1 | Production |
| `GMAIL_REFRESH_TOKEN_KYLE` | From step 3 | Production |

> These vars are consumed server-side only inside the Inngest function. They are never `NEXT_PUBLIC_` prefixed and never reach the browser bundle.

---

## 5. Required OAuth scopes

| Scope | Why |
|---|---|
| `https://www.googleapis.com/auth/gmail.readonly` | List message IDs and fetch full message payloads. The cron does **not** mark emails as read or modify any message. |

If a future stream adds read-receipt marking, upgrade the scope to `https://www.googleapis.com/auth/gmail.modify` and re-run the bootstrap script to generate a new refresh token with the broader scope.

---

## 6. Verify the cron is working

1. Apply the migration from PR #221 if not already applied (see that PR for the SQL).
2. Deploy to Pathfinder Vercel (env vars take effect on next deploy).
3. In Inngest Cloud open the **Pathfinder** app → find the `nervous-system-email-daily-ingest` function.
4. Click **Invoke** to trigger a manual run.
5. Check the run output — expect:

   ```json
   {
     "account": "kyle@unicron.systems",
     "messages_fetched": N,
     "processed": N,
     "skipped_spam": N,
     "skipped_dup": N
   }
   ```

6. Verify rows in `nervous_system.ledger` with `source_type = 'email'`.
7. Verify a row in `nervous_system.audit_log` with `action = 'email_cron_run'`.
