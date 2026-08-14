require('dotenv').config();
const app = require('./app');
const env = require('./config/env');
const sequelize = require('./config/database');
const logger = require('./config/logger');

let server;

const start = async () => {
  await sequelize.authenticate();
  server = app.listen(env.port, () => logger.info({ port: env.port }, 'Audit & Activity listening'));
  return server;
};

const shutdown = async (signal) => {
  logger.info({ signal }, 'Audit & Activity shutdown requested');
  if (server) await new Promise((resolve) => server.close(resolve));
  await sequelize.close();
  process.exit(0);
};

if (require.main === module) {
  start().catch((error) => { logger.error({ err: error }, 'Audit & Activity failed to start'); process.exit(1); });
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { start, shutdown };
