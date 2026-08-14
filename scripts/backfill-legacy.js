#!/usr/bin/env node

require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');
const env = require('../src/config/env');
const { AuditEvent, sequelize: targetSequelize } = require('../src/models');
const { redact } = require('../src/utils/redaction');

const apply = process.argv.includes('--apply');
const pageSize = Number(process.env.BACKFILL_PAGE_SIZE || 500);

const legacySequelize = env.legacyDatabase.url
  ? new Sequelize(env.legacyDatabase.url, { dialect: 'postgres', logging: false })
  : new Sequelize(env.legacyDatabase.name, env.legacyDatabase.user, env.legacyDatabase.password, {
      dialect: 'postgres', host: env.legacyDatabase.host, port: env.legacyDatabase.port, logging: false,
    });

const mapAudit = (row) => ({
  tenantId: row.tenantId,
  userId: row.userId,
  sourceService: 'legacy-api',
  eventType: 'audit',
  action: row.action,
  entityType: row.entityType,
  entityId: row.entityId,
  severity: 'medium',
  ipAddress: row.ipAddress,
  userAgent: row.userAgent,
  occurredAt: row.createdAt,
  metadata: {},
  changes: redact(row.changes),
  oldValues: redact(row.oldValues),
  newValues: redact(row.newValues),
  legacySource: 'audit_trails',
  legacyId: row.id,
  retentionUntil: null,
});

const mapActivity = (row) => ({
  tenantId: row.tenantId,
  userId: row.userId,
  sessionId: row.sessionId,
  sourceService: 'legacy-api',
  eventType: ['failed_login', 'suspicious_activity', 'anomaly_detected'].includes(row.activityType) ? 'security' : 'activity',
  action: row.activityType,
  severity: row.severity || 'low',
  description: row.description,
  method: row.method,
  endpoint: row.endpoint,
  statusCode: row.statusCode,
  ipAddress: row.ipAddress,
  userAgent: row.userAgent,
  occurredAt: row.createdAt,
  metadata: redact({ country: row.country, city: row.city }),
  changes: redact(row.changes),
  isAnomaly: Boolean(row.isAnomaly),
  anomalyScore: row.anomalyScore,
  legacySource: 'activity_logs',
  legacyId: row.id,
  retentionUntil: null,
});

const importRows = async (table, mapper) => {
  let offset = 0;
  let total = 0;
  let inserted = 0;
  while (true) {
    const rows = await legacySequelize.query(
      `SELECT * FROM "${table}" ORDER BY "createdAt" ASC, id ASC LIMIT :limit OFFSET :offset`,
      { replacements: { limit: pageSize, offset }, type: QueryTypes.SELECT },
    );
    if (!rows.length) break;
    total += rows.length;
    if (apply) {
      for (const row of rows) {
        const [event, created] = await AuditEvent.findOrCreate({
          where: { legacySource: table, legacyId: row.id },
          defaults: mapper(row),
        });
        if (created) inserted += 1;
        void event;
      }
    }
    offset += rows.length;
    if (rows.length < pageSize) break;
  }
  return { total, inserted };
};

(async () => {
  try {
    await legacySequelize.authenticate();
    if (apply) await targetSequelize.authenticate();
    const audit = await importRows('audit_trails', mapAudit);
    const activity = await importRows('activity_logs', mapActivity);
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', audit, activity }, null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([legacySequelize.close(), targetSequelize.close()]);
  }
})();
