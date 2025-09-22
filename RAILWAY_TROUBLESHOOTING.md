# Railway Deployment Troubleshooting

## Current Issue: Database Connection Failed

Your achievements-worker is starting successfully on Railway but failing to connect to the Supabase database.

### Error Analysis

```
connect ENETUNREACH 2600:1f18:2e13:9d17:ac6b:8125:e2d3:efc:5432
```

This indicates:

- ✅ **Worker Started**: The application is running correctly
- ✅ **Health Server**: HTTP server started on port 8080
- ✅ **Processing Loop**: Event processing loop initiated
- ❌ **Database Connection**: Cannot reach Supabase Postgres

## Root Cause

The issue is likely with the `SUPABASE_DB_URL` environment variable. The IPv6 address suggests a connection string issue.

## Solutions

### 1. Check Supabase Connection String Format

Your `SUPABASE_DB_URL` should look like:

```bash
postgresql://postgres:[PASSWORD]@[PROJECT-REF].supabase.co:5432/postgres?sslmode=require
```

**Not** an IPv6 address like:

```bash
postgresql://postgres:[PASSWORD]@2600:1f18:2e13:9d17:ac6b:8125:e2d3:efc:5432/postgres
```

### 2. Get Correct Connection String

1. Go to your Supabase Dashboard
2. Navigate to **Settings** → **Database**
3. Look for **Connection string** section
4. Copy the **URI** (not the IPv6 pooling connection)
5. Replace `[YOUR-PASSWORD]` with your actual database password

### 3. Update Railway Environment Variables

In your Railway dashboard:

1. Go to your achievements-worker service
2. Click **Variables** tab
3. Update `SUPABASE_DB_URL` with the correct connection string:

   ```
   postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=require
   ```

### 4. Alternative: Use Connection Pooling

For better performance with Railway, use Supabase's connection pooling URL:

```
postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=require
```

(Note: port 6543 for pooling vs 5432 for direct)

## Environment Variables Checklist

Make sure these are set in Railway:

### Database

- ✅ `SUPABASE_DB_URL` - Correct format with hostname (not IPv6)

### R2 Configuration  

- ✅ `R2_ACCOUNT_ID=773fabe537380d65f5647dcbd32cd292`
- ✅ `R2_ACCESS_KEY_ID=your_access_key`
- ✅ `R2_SECRET_ACCESS_KEY=your_secret_key`
- ✅ `R2_BUCKET=badges`
- ✅ `R2_ENDPOINT=https://773fabe537380d65f5647dcbd32cd292.r2.cloudflarestorage.com`
- ✅ `R2_PUBLIC_BASE_URL=https://773fabe537380d65f5647dcbd32cd292.r2.cloudflarestorage.com/badges`

### Optional

- `NODE_ENV=production` (default)
- `PORT=8080` (default)
- `BATCH_SIZE=50` (default)
- `POLL_INTERVAL_MS=1000` (default)
- `MAX_ATTEMPTS=10` (default)

## Testing the Fix

After updating the database URL:

1. **Redeploy**: Railway will automatically redeploy
2. **Check Logs**: Look for these success messages:

   ```
   Starting achievements worker
   Health check server started  
   Starting event processing loop
   Claimed queue batch: 0  # No errors, just no events to process
   ```

3. **Test Health Endpoint**:

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

## Railway Deployment

Railway will automatically detect your Node.js project and build it using the npm scripts in package.json. No Dockerfile needed!
