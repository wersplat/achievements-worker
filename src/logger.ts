import pino from 'pino';
import { getEnv } from './env.js';

let logger: pino.Logger;

export function createLogger(): pino.Logger {
  if (logger) {
    return logger;
  }

  const env = getEnv();
  
  const loggerOptions: any = {
    level: env.NODE_ENV === 'development' ? 'debug' : 'info',
    formatters: {
      level: (label: string) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      service: 'achievements-worker',
      version: '1.0.0',
    },
  };

  if (env.NODE_ENV === 'development') {
    loggerOptions.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    };
  }

  logger = pino(loggerOptions);

  return logger;
}

export function getLogger(): pino.Logger {
  if (!logger) {
    throw new Error('Logger not initialized. Call createLogger() first.');
  }
  return logger;
}
