# Railway SSL Certificate Solution

## 🚨 Current Issue

Railway is still showing "self-signed certificate in certificate chain" errors despite the SSL fix.

## 🎯 **IMMEDIATE SOLUTION**

### Option 1: Use Supabase Connection Pooling URL (RECOMMENDED)

Update your Railway environment variable `SUPABASE_DB_URL` to:

```bash
SUPABASE_DB_URL=postgresql://postgres.qwpxsufrgigpjcxtnery:6d9465b23f86855304c712c2393c5f867fa83165c0c49769fef74d363a9b8cc1@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require
```

**Key differences:**

- `postgres.PROJECT_REF` instead of `postgres`
- Port `6543` (pooling) instead of `5432` (direct)
- `aws-0-us-east-1.pooler.supabase.com` hostname
- This format is specifically designed for external connections

### Option 2: Alternative SSL Parameters

If Option 1 doesn't work, try:

```bash
SUPABASE_DB_URL=postgresql://postgres:6d9465b23f86855304c712c2393c5f867fa83165c0c49769fef74d363a9b8cc1@db.qwpxsufrgigpjcxtnery.supabase.co:5432/postgres?sslmode=require&sslcert=&sslkey=&sslrootcert=
```

## 🔧 **Steps to Fix**

1. **Go to Railway Dashboard**
2. **Select your achievements-worker service**
3. **Click "Variables" tab**
4. **Update `SUPABASE_DB_URL`** with Option 1 above
5. **Save changes** - Railway will automatically redeploy
6. **Wait 2-3 minutes** for deployment to complete
7. **Check logs** for success

## ✅ **Expected Success Logs**

After the fix, you should see:

```
Starting achievements worker
Health check server started
Starting event processing loop
Claimed queue batch: 0  # No more SSL errors!
```

## 🧪 **Test Your Fix**

Once working, test the health endpoint:

```bash
curl https://your-railway-app.railway.app/healthz
```

Should return:

```json
{
  "status": "ok",
  "queueLag": 0,
  "time": "2025-09-22T09:02:00.000Z"
}
```

## 🔍 **Why This Happens**

- Railway's Node.js environment has strict SSL certificate validation
- Supabase direct connections use certificates that Railway doesn't trust
- Connection pooling URLs are designed for external access and have better SSL compatibility
- The pooling service handles SSL certificate validation differently

## 📋 **Code Changes Made**

The codebase has been updated with:

1. **SSL configuration** in `src/db.ts`
2. **Connection string parsing** to add SSL parameters
3. **Multiple fallback approaches** for SSL handling

## 🚀 **Next Steps After Fix**

Once the database connection works:

1. **Add your R2 credentials** to Railway environment variables
2. **Test with sample events** in your Supabase `public.event_queue` table
3. **Monitor badge generation** in your R2 bucket

The achievements-worker will be fully operational! 🎉
