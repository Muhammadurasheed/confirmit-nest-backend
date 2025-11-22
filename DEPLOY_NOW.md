# 🚀 Deploy Backend NOW - 2 Minute Fix

## The Issue
Your backend CORS isn't allowing the frontend origin. I've fixed the code, now you just need to redeploy.

## Solution (Choose ONE method)

### Option A: Redeploy via Vercel Dashboard (FASTEST)
1. Go to https://vercel.com/dashboard
2. Select project: **confirmit-nest-backend**
3. Click **Deployments** tab
4. Click **⋯** menu on latest deployment
5. Click **Redeploy** → **Redeploy**
6. ✅ Done! Wait ~60 seconds

### Option B: Redeploy via Git Push
```bash
cd backend
git add .
git commit -m "fix: Add production CORS origins"
git push
```

## Verify It's Working (After ~60 seconds)

1. Open: https://confirmitx.vercel.app/business/directory
2. Open DevTools → Console
3. You should see data loading, NO CORS errors

## Still Having Issues?

Make sure these environment variables are set in Vercel backend project:

```bash
CORS_ORIGIN=https://confirmitx.vercel.app
FRONTEND_URL=https://confirmitx.vercel.app
```

Then redeploy again.

---

**ETA to working**: 60-90 seconds after redeployment starts
