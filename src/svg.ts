import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { getEnv } from './env.js';
import { getLogger } from './logger.js';
import { canonicalJson } from './util.js';
import { PlayerAward } from './awards.js';

let s3Client: S3Client;

export function createS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }

  const env = getEnv();
  
  s3Client = new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  return s3Client;
}

export function getS3Client(): S3Client {
  if (!s3Client) {
    throw new Error('S3 client not initialized. Call createS3Client() first.');
  }
  return s3Client;
}

export interface BadgeTemplate {
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  iconPath?: string;
  width: number;
  height: number;
}

export interface BadgeData {
  award: Partial<PlayerAward>;
  template?: BadgeTemplate | undefined;
}

const DEFAULT_TEMPLATE: BadgeTemplate = {
  backgroundColor: '#1a1a2e',
  textColor: '#ffffff',
  accentColor: '#ffd700',
  width: 300,
  height: 200,
};

export function renderBadgeSVG({ award, template = DEFAULT_TEMPLATE }: BadgeData): string {
  const metadata = {
    award_id: award.id,
    rule_id: award.rule_id,
    player_id: award.player_id,
    title: award.title,
    tier: award.tier,
    awarded_at: award.awarded_at,
    stats: award.stats,
    issuer: award.issuer || 'BodegaCatsGC',
    version: award.version || '1.0',
  };

  const metadataJson = canonicalJson(metadata);
  
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${template.width}" height="${template.height}" viewBox="0 0 ${template.width} ${template.height}" xmlns="http://www.w3.org/2000/svg">
  <title>${escapeXml(award.title || 'Achievement Badge')}</title>
  <desc>${escapeXml(`${award.title} - ${award.tier} tier achievement awarded by ${award.issuer || 'BodegaCatsGC'}`)}</desc>
  <metadata>${escapeXml(metadataJson)}</metadata>
  
  <!-- Background -->
  <rect width="100%" height="100%" fill="${template.backgroundColor}" rx="12" ry="12"/>
  
  <!-- Border -->
  <rect x="4" y="4" width="${template.width - 8}" height="${template.height - 8}" 
        fill="none" stroke="${template.accentColor}" stroke-width="2" rx="8" ry="8"/>
  
  <!-- Title -->
  <text x="${template.width / 2}" y="40" 
        font-family="Arial, sans-serif" font-size="18" font-weight="bold" 
        text-anchor="middle" fill="${template.textColor}">
    ${escapeXml(award.title || 'Achievement')}
  </text>
  
  <!-- Tier -->
  <text x="${template.width / 2}" y="65" 
        font-family="Arial, sans-serif" font-size="14" 
        text-anchor="middle" fill="${template.accentColor}">
    ${escapeXml(award.tier || 'Bronze')} Tier
  </text>
  
  <!-- Achievement Icon/Shape -->
  <circle cx="${template.width / 2}" cy="120" r="30" 
          fill="${template.accentColor}" opacity="0.3"/>
  <circle cx="${template.width / 2}" cy="120" r="20" 
          fill="${template.accentColor}"/>
  
  <!-- Star in center -->
  <polygon points="${template.width / 2},105 ${template.width / 2 + 5},115 ${template.width / 2 + 15},115 ${template.width / 2 + 7},123 ${template.width / 2 + 10},135 ${template.width / 2},128 ${template.width / 2 - 10},135 ${template.width / 2 - 7},123 ${template.width / 2 - 15},115 ${template.width / 2 - 5},115"
           fill="${template.backgroundColor}"/>
  
  <!-- Date -->
  <text x="${template.width / 2}" y="175" 
        font-family="Arial, sans-serif" font-size="10" 
        text-anchor="middle" fill="${template.textColor}" opacity="0.7">
    ${escapeXml(formatDate(award.awarded_at))}
  </text>
  
  <!-- Issuer -->
  <text x="${template.width / 2}" y="190" 
        font-family="Arial, sans-serif" font-size="8" 
        text-anchor="middle" fill="${template.textColor}" opacity="0.5">
    ${escapeXml(award.issuer || 'BodegaCatsGC')}
  </text>
</svg>`;

  return svg;
}

export async function uploadSVGToR2(key: string, svg: string): Promise<string> {
  const env = getEnv();
  const logger = getLogger();
  
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    Body: svg,
    ContentType: 'image/svg+xml',
    CacheControl: 'public, max-age=31536000', // 1 year
    Metadata: {
      'generated-by': 'achievements-worker',
      'generated-at': new Date().toISOString(),
    },
  });

  try {
    await getS3Client().send(command);
    
    const publicUrl = `${env.R2_PUBLIC_BASE_URL}/${key}`;
    
    logger.debug({
      key,
      publicUrl,
      svgSize: svg.length,
    }, 'Uploaded SVG to R2');
    
    return publicUrl;
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      key,
      svgSize: svg.length,
    }, 'Failed to upload SVG to R2');
    throw error;
  }
}

export async function generateAndUploadBadge(
  award: Partial<PlayerAward>,
  template?: BadgeTemplate
): Promise<string> {
  const logger = getLogger();
  
  // Generate unique key for the badge
  const playerId = award.player_id || 'unknown';
  const awardId = award.id || uuidv4();
  const key = `badges/${playerId}/${awardId}.svg`;
  
  try {
    // Render the SVG
    const svg = renderBadgeSVG({ award, template: template || DEFAULT_TEMPLATE });
    
    // Upload to R2
    const publicUrl = await uploadSVGToR2(key, svg);
    
    logger.info({
      playerId,
      awardId,
      title: award.title,
      key,
      publicUrl,
    }, 'Generated and uploaded badge');
    
    return publicUrl;
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      playerId,
      awardId,
      title: award.title,
    }, 'Failed to generate and upload badge');
    throw error;
  }
}

function escapeXml(unsafe: string | undefined): string {
  if (!unsafe) return '';
  
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(dateString: string | undefined): string {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export function getTierTemplate(tier: string): BadgeTemplate {
  const baseTemplate = { ...DEFAULT_TEMPLATE };
  
  switch (tier.toLowerCase()) {
    case 'bronze':
      return {
        ...baseTemplate,
        backgroundColor: '#2c1810',
        accentColor: '#cd7f32',
      };
    case 'silver':
      return {
        ...baseTemplate,
        backgroundColor: '#1a1a1a',
        accentColor: '#c0c0c0',
      };
    case 'gold':
      return {
        ...baseTemplate,
        backgroundColor: '#1a1a0e',
        accentColor: '#ffd700',
      };
    case 'platinum':
      return {
        ...baseTemplate,
        backgroundColor: '#0e1a1a',
        accentColor: '#e5e4e2',
      };
    case 'legendary':
      return {
        ...baseTemplate,
        backgroundColor: '#1a0e1a',
        accentColor: '#ff00ff',
      };
    default:
      return baseTemplate;
  }
}
