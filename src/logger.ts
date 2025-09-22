import pino from 'pino';
import { getEnv } from './env.js';

let logger: pino.Logger;

export function createLogger(): pino.Logger {
  if (logger) {
    return logger;
  }

  const env = getEnv();
  
  logger = pino({
    level: env.NODE_ENV === 'development' ? 'debug' : 'info',
    transport: env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    } : undefined,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      service: 'achievements-worker',
      version: '1.0.0',
    },
  });

  return logger;
}

export function getLogger(): pino.Logger {
  if (!logger) {
    throw new Error('Logger not initialized. Call createLogger() first.');
  }
  return logger;
}
