# Cloudflare R2 Setup Guide

Based on your R2 URL: `https://773fabe537380d65f5647dcbd32cd292.r2.cloudflarestorage.com/badges`

## Configuration

Your R2 configuration should be:

```bash
# Your R2 Account ID (extracted from the URL)
R2_ACCOUNT_ID=773fabe537380d65f5647dcbd32cd292

# Get these from Cloudflare Dashboard > R2 > Manage R2 API tokens
R2_ACCESS_KEY_ID=your_access_key_here
R2_SECRET_ACCESS_KEY=your_secret_key_here

# Your bucket name
R2_BUCKET=badges

# Your R2 endpoint
R2_ENDPOINT=https://773fabe537380d65f5647dcbd32cd292.r2.cloudflarestorage.com

# Public URL for serving badges (you may want to set up a custom domain)
R2_PUBLIC_BASE_URL=https://773fabe537380d65f5647dcbd32cd292.r2.cloudflarestorage.com/badges
```

## Steps to Complete Setup

1. **Get R2 API Credentials:**
   - Go to Cloudflare Dashboard
   - Navigate to R2 Object Storage
   - Click "Manage R2 API tokens"
   - Create a new API token with R2 permissions
   - Copy the Access Key ID and Secret Access Key

2. **Create/Verify Bucket:**
   ```bash
   # The worker expects a bucket named "badges"
   # Create it in your Cloudflare R2 dashboard if it doesn't exist
   ```

3. **Set Up Custom Domain (Optional but Recommended):**
   - In R2 dashboard, go to your bucket settings
   - Set up a custom domain for better SEO and branding
   - Update `R2_PUBLIC_BASE_URL` to use your custom domain
   - Example: `R2_PUBLIC_BASE_URL=https://badges.yourdomain.com`

4. **Test the Configuration:**
   ```bash
   cp .env.example .env
   # Edit .env with your actual credentials
   npm run build
   npm start
   ```

## Badge URL Structure

The worker will generate badges at:
```
{R2_PUBLIC_BASE_URL}/badges/{player_id}/{award_id}.svg
```

Example:
```
https://773fabe537380d65f5647dcbd32cd292.r2.cloudflarestorage.com/badges/badges/123/456.svg
```

## Security Notes

- Keep your R2 credentials secure
- Consider using environment variables in production
- Set appropriate bucket permissions (public read for badge serving)
- Use HTTPS for all badge URLs

## Railway Deployment

When deploying to Railway, set these environment variables in the Railway dashboard:
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID` 
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_ENDPOINT`
- `R2_PUBLIC_BASE_URL`
- `SUPABASE_DB_URL`
