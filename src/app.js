const express = require('express');
const { collectMetrics } = require('./middlewares/observabilityMetrics');
const observabilityMetricsController = require('./controllers/observabilityMetricsController');
const helmet = require('helmet');
const cors = require('cors');
const routes = require('./routes');
const { requestContext, authRateLimiter, errorHandler } = require('./middlewares/operational');
const sequelize = require('./config/database');

const { communicationContext } = require('./middlewares/communicationContext');

const app = express();
app.use(communicationContext);
app.use(collectMetrics);
app.get('/metrics', observabilityMetricsController.metrics);
app.disable('x-powered-by');
app.use(helmet());
const allowedCorsOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin && origin !== '*');
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedCorsOrigins.includes(origin)),
  credentials: allowedCorsOrigins.length > 0,
}));
app.use(express.json({ limit: '256kb' }));
app.use(requestContext);
app.use(authRateLimiter);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'operaon-audit', timestamp: new Date().toISOString() }));
app.get('/ready', async (_req, res, next) => {
  try { await sequelize.authenticate(); res.json({ status: 'ready', service: 'operaon-audit' }); } catch (error) { next(error); }
});
app.use('/api', routes);
app.use((_req, res) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rota não encontrada' } }));
app.use(errorHandler);

module.exports = app;
