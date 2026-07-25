# One-time setup: Firebase GitHub secret

This repo deploys Jarvis to `https://www.wheelhousefoundation.com/jarvis/` by merging
`index.html` into the live Wheelhouse Firebase Hosting site.

## Required GitHub secret

The deploy workflow needs **one** repository secret:

| Secret | Value |
|--------|-------|
| `FIREBASE_SERVICE_ACCOUNT` | Full contents of a Google Cloud service account JSON key |

If this secret is missing, the workflow fails with:

`the GitHub Action workflow must specify exactly one of "workload_identity_provider" or "credentials_json"`

That means the secret has not been added yet.

## Create the service account

1. Open [Google Cloud Console → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=wheelhouse-foundation-website).
2. Click **Create service account**.
   - Name: `github-jarvis-deploy`
3. Grant this role:
   - **Firebase Hosting Admin**
4. Open the new service account → **Keys** → **Add key** → **Create new key** → **JSON**.
5. Save the downloaded `.json` file.

## Add the secret in GitHub

1. Open [Trashyyy396/jarvis-frc-website → Settings → Secrets and variables → Actions](https://github.com/Trashyyy396/jarvis-frc-website/settings/secrets/actions).
2. Click **New repository secret**.
3. Name: `FIREBASE_SERVICE_ACCOUNT`
4. Value: paste the **entire JSON file** contents, starting with `{` and ending with `}`.
5. Save.

## Re-run deploy

After the secret is saved:

1. Go to **Actions** in the jarvis-frc-website repo.
2. Open the failed **Deploy Jarvis to /jarvis** run.
3. Click **Re-run all jobs**.

Or push any commit to `main`.

## Custom domain note

Jarvis is deployed to Firebase Hosting at `https://wheelhouse-foundation-website.web.app/jarvis/`.
If `www.wheelhousefoundation.com` is served by Vercel, add a `/jarvis` rewrite in the main Wheelhouse
site's Vercel config so the custom domain path proxies to Firebase.

## Local test (optional)

```bash
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
export FIREBASE_PROJECT_ID=wheelhouse-foundation-website
npm ci
npm run prepare-deploy
cd deploy && firebase deploy --only hosting --project wheelhouse-foundation-website
```
