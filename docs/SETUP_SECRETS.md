# One-time setup: Firebase + GitHub secrets

This repo deploys Jarvis to `https://www.wheelhousefoundation.com/jarvis/` by merging
`index.html` into the live Wheelhouse Firebase Hosting site.

## 1. Create a Firebase service account

1. Open [Google Cloud Console IAM](https://console.cloud.google.com/iam-admin/serviceaccounts?project=wheelhouse-foundation-website).
2. Create a service account named `github-jarvis-deploy`.
3. Grant the role **Firebase Hosting Admin**.
4. Create and download a JSON key.

## 2. Add GitHub Actions secrets

In **Trashyyy396/jarvis-frc-website** → Settings → Secrets and variables → Actions:

| Secret | Value |
|--------|-------|
| `FIREBASE_SERVICE_ACCOUNT` | Full contents of the JSON key file |
| `FIREBASE_PROJECT_ID` | `wheelhouse-foundation-website` |

## 3. Verify

Push to `main`. The workflow should:

1. Download the current live site
2. Copy `index.html` to `/jarvis/`
3. Deploy the merged bundle

## Local test (optional)

```bash
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
export FIREBASE_PROJECT_ID=wheelhouse-foundation-website
npm ci
npm run prepare-deploy
cd deploy && firebase deploy --only hosting --project wheelhouse-foundation-website
```
