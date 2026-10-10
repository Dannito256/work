import pino from 'pino';
import config from '../config/config.js';

const options = {
  level: config.logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'auth',
      'creds',
      'keys',
      '*.password',
      '*.token',
      '*.apiKey',
      'req.headers.authorization'
    ],
    remove: true
  }
};

if (config.logPretty) {
  options.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  };
}

const logger = pino(options);

export const createLogger = (name) => logger.child({ name });
export default logger;
