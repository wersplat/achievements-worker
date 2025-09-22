# Railway Environment Variables Setup

## Database Connection String ✅

Your correct Supabase connection string:
```
postgresql://postgres:6d9465b23f86855304c712c2393c5f867fa83165c0c49769fef74d363a9b8cc1@db.qwpxsufrgigpjcxtnery.supabase.co:5432/postgres?sslmode=require
```

## Complete Environment Variables for Railway

Set these in your Railway dashboard (Service → Variables):

### Database
```bash
SUPABASE_DB_URL=postgresql://postgres:6d9465b23f86855304c712c2393c5f867fa83165c0c49769fef74d363a9b8cc1@db.qwpxsufrgigpjcxtnery.supabase.co:5432/postgres?sslmode=require
```

### R2 Configuration
```bash
R2_ACCOUNT_ID=773fabe537380d65f5647dcbd32cd292
R2_ACCESS_KEY_ID=your_r2_access_key_here
R2_SECRET_ACCESS_KEY=your_r2_secret_key_here
R2_BUCKET=badges
R2_ENDPOINT=https://773fabe537380d65f5647dcbd32cd292.r2.cloudflarestorage.com
R2_PUBLIC_BASE_URL=https://773fabe537380d65f5647dcbd32cd292.r2.cloudflarestorage.com/badges
```

### Optional (Defaults)
```bash
NODE_ENV=production
PORT=8080
BATCH_SIZE=50
POLL_INTERVAL_MS=1000
MAX_ATTEMPTS=10
```

## Steps to Fix

1. **Go to Railway Dashboard**
2. **Select your achievements-worker service**
3. **Click "Variables" tab**
4. **Add/Update `SUPABASE_DB_URL`** with the connection string above
5. **Add your R2 credentials** (get from Cloudflare dashboard)
6. **Save changes** - Railway will automatically redeploy

## Expected Results

After updating the environment variables, your logs should show:

✅ **Success Messages:**
```
Starting achievements worker
Health check server started
Starting event processing loop
Claimed queue batch: 0  # No errors, just no events to process
```

❌ **No More Errors:**
- No more `ENETUNREACH` errors
- No more `self-signed certificate in certificate chain` errors
- No more `Database query failed` messages

## SSL Certificate Fix

The worker has been updated to handle Supabase's SSL certificates properly. The database connection now includes:
```typescript
ssl: {
  rejectUnauthorized: false, // Allow self-signed certificates for Supabase
}
```

## Test Health Endpoint

Once fixed, test your health endpoint:
```bash
curl https://your-railway-app.railway.app/healthz
```

Should return:
```json
{
  "status": "ok",
  "queueLag": 0,
  "time": "2025-09-22T08:47:27.748Z"
}
```

## Next Steps

Once the database connection is working:
1. **Add events to your Supabase `public.event_queue` table**
2. **Worker will automatically process them**
3. **Badges will be generated and uploaded to R2**
4. **Achievement records will be created in `public.player_awards`**
