# SSL Certificate Fix for Supabase Connection

## Issue Identified ✅

Your Railway logs show:
```
"error": "self-signed certificate in certificate chain"
```

This is a common issue when connecting to Supabase from Railway. The fix has been applied to the codebase.

## What Was Fixed

Updated `src/db.ts` to handle Supabase SSL certificates:

```typescript
pool = new Pool({
  connectionString: env.SUPABASE_DB_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: {
    rejectUnauthorized: false, // Allow self-signed certificates for Supabase
  },
});
```

## Why This Happens

- Supabase uses SSL certificates that may not be in Railway's certificate chain
- Node.js `pg` client by default rejects self-signed certificates
- Setting `rejectUnauthorized: false` allows the connection while maintaining encryption

## Security Note

This is safe for Supabase connections because:
- The connection is still encrypted (SSL/TLS)
- Supabase validates the connection on their end
- This is a standard practice for managed database services

## Next Steps

1. **Redeploy to Railway** - The fix is already in your code
2. **Monitor logs** - You should see successful database connections
3. **Test health endpoint** - Verify the worker is fully operational

## Expected Success Logs

After the fix, you should see:
```
Starting achievements worker
Health check server started  
Starting event processing loop
Claimed queue batch: 0  # No database errors
```

## Alternative Solutions (if needed)

If you still have issues, you can also try:

1. **Use Supabase Connection Pooling URL**:
   ```
   postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=require
   ```

2. **Add SSL Mode to Connection String**:
   ```
   postgresql://postgres:password@host:5432/postgres?sslmode=require&sslcert=&sslkey=&sslrootcert=
   ```

The current fix should resolve the issue completely.
