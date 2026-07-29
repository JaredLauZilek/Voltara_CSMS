import { pino, type Logger } from 'pino';

export type { Logger };

export function createLogger(level: string): Logger {
  return pino({
    name: 'ocpp-gateway',
    level,
    // Credentials must never reach the log, whatever a caller passes in.
    redact: {
      paths: [
        'password',
        '*.password',
        'authorizationKey',
        '*.authorizationKey',
        'auth_key_hash',
        '*.auth_key_hash',
      ],
      censor: '[redacted]',
    },
  });
}
