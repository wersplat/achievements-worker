# achievements-worker

A production-ready achievements worker service for Railway that processes Supabase events and generates badge SVGs stored in Cloudflare R2.

## Features

- **Event Processing**: Consumes `public.event_queue` with `FOR UPDATE SKIP LOCKED` for concurrent processing
- **Counter Updates**: Updates `public.player_counters` for both career and season stats via MERGE operations
- **Rule Evaluation**: Evaluates JsonLogic-style predicates against player stats
- **Badge Generation**: Creates and uploads SVG badges to Cloudflare R2
- **Retry Logic**: Implements exponential backoff with configurable max attempts
- **Health Checks**: Exposes `/healthz` endpoint for Railway monitoring
- **Graceful Shutdown**: Handles SIGINT/SIGTERM for clean shutdowns
- **Structured Logging**: Uses Pino for structured JSON logging
- **Type Safety**: Full TypeScript with Zod environment validation

## Quick Start

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Copy environment template**:

   ```bash
   cp .env.example .env
   ```

3. **Configure environment variables** in `.env`:

   ```bash
   SUPABASE_DB_URL=postgresql://postgres:password@host:5432/postgres?sslmode=require
   R2_ACCOUNT_ID=your_r2_account_id
   R2_ACCESS_KEY_ID=your_r2_access_key
   R2_SECRET_ACCESS_KEY=your_r2_secret_key
   R2_BUCKET=badges
   R2_ENDPOINT=https://your_account.r2.cloudflarestorage.com
   R2_PUBLIC_BASE_URL=https://cdn.example.com/badges
   ```

4. **Build and start**:

   ```bash
   npm run build
   npm start
   ```

## Development

```bash
npm run dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | HTTP server port | `8080` |
| `SUPABASE_DB_URL` | Postgres connection string | Required |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID | Required |
| `R2_ACCESS_KEY_ID` | R2 access key | Required |
| `R2_SECRET_ACCESS_KEY` | R2 secret key | Required |
| `R2_BUCKET` | R2 bucket name | Required |
| `R2_ENDPOINT` | R2 endpoint URL | Required |
| `R2_PUBLIC_BASE_URL` | Public CDN URL for badges | Required |
| `BATCH_SIZE` | Events processed per batch | `50` |
| `POLL_INTERVAL_MS` | Polling interval when idle | `1000` |
| `MAX_ATTEMPTS` | Max retry attempts before error | `10` |

## Database Schema

The worker expects these tables to exist:

- `public.events` - Source events
- `public.event_queue` - Processing queue
- `public.player_counters` - Player statistics
- `public.achievement_rules` - Achievement definitions
- `public.player_awards` - Awarded achievements

## Rule Predicate Format

Achievement rules use JsonLogic-style predicates:

```json
{
  ">=": ["per_game.points", 50]
}
```

Supported operations:

- Comparisons: `>=`, `>`, `<=`, `<`, `==`, `!=`
- Logic: `and`, `or`, `not`
- Arithmetic: `+`, `-`, `*`, `/`
- Object: `has`

Context paths:

- `per_game.*` - Current game stats
- `season.*` - Season totals
- `career.*` - Career totals

## Deployment

### Railway

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Railway will automatically build and deploy using the Dockerfile

### Docker

```bash
docker build -t achievements-worker .
docker run -p 8080:8080 --env-file .env achievements-worker
```

## Monitoring

- **Health Check**: `GET /healthz` returns queue lag and system status
- **Logs**: Structured JSON logs via Pino
- **Metrics**: Queue processing metrics in logs

## Testing

To test the worker with a 52-point game event:

1. Insert a `player_stat_event` with `{"points": 52}` payload
2. Worker should:
   - Update player counters
   - Evaluate "50 Bomb" rule (if exists)
   - Generate SVG badge
   - Upload to R2
   - Update award record

## Architecture

```
Event Queue → Worker → [Counters, Rules, Awards] → Badge SVG → R2
```

The worker processes events in batches, updates player statistics, evaluates achievement rules, and generates visual badges for earned achievements.
