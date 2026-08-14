const { Op, fn, col, literal } = require('sequelize');
const { AuditEvent, sequelize } = require('../models');
const env = require('../config/env');
const { redact, publicEvent } = require('../utils/redaction');

const addDays = (date, days) => new Date(new Date(date).getTime() + days * 24 * 60 * 60 * 1000);

const normalizeEvent = (payload) => {
  const value = redact(payload || {});
  const now = new Date();
  return {
    ...value,
    metadata: value.metadata || {},
    severity: value.severity || 'low',
    isAnomaly: Boolean(value.isAnomaly),
    occurredAt: value.occurredAt || now,
    retentionUntil: value.retentionUntil || addDays(value.occurredAt || now, env.retention.defaultDays),
  };
};

const assertWriteScope = (payload, context) => {
  if (context?.isService) return;
  if (payload.tenantId && context?.tenantId && payload.tenantId !== context.tenantId) {
    const error = new Error('Contexto de tenant inconsistente');
    error.statusCode = 403;
    error.code = 'TENANT_CONTEXT_MISMATCH';
    throw error;
  }
  if (payload.organizationId && context?.organizationIds?.length && !context.organizationIds.includes(payload.organizationId)) {
    const error = new Error('Contexto de organização inconsistente');
    error.statusCode = 403;
    error.code = 'ORGANIZATION_CONTEXT_MISMATCH';
    throw error;
  }
};

const applyContextScope = (where, context, filters = {}) => {
  if (context?.isService) return where;
  if (context?.tenantId) where.tenantId = context.tenantId;
  else if (context?.userId) where.userId = context.userId;

  if (context?.organizationIds?.length) {
    where.organizationId = { [Op.in]: context.organizationIds };
  }
  if (filters.userId && context?.userId && filters.userId !== context.userId && !context.isService) {
    const error = new Error('Usuário fora do escopo permitido');
    error.statusCode = 403;
    error.code = 'USER_SCOPE_DENIED';
    throw error;
  }
  return where;
};

const createEvent = async (payload, context = {}, options = {}) => {
  assertWriteScope(payload, context);
  const normalized = normalizeEvent({
    ...payload,
    tenantId: payload.tenantId || context.tenantId || null,
    organizationId: payload.organizationId || null,
    userId: payload.userId || context.userId || null,
    requestId: payload.requestId || context.requestId || null,
  });

  if (options.idempotent && normalized.legacySource && normalized.legacyId) {
    const [event] = await AuditEvent.findOrCreate({
      where: { legacySource: normalized.legacySource, legacyId: normalized.legacyId },
      defaults: normalized,
    });
    return event;
  }
  return AuditEvent.create(normalized);
};

const createBatch = async (events, context = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const created = [];
    for (const payload of events) {
      assertWriteScope(payload, context);
      const normalized = normalizeEvent({
        ...payload,
        tenantId: payload.tenantId || context.tenantId || null,
        organizationId: payload.organizationId || null,
        userId: payload.userId || context.userId || null,
        requestId: payload.requestId || context.requestId || null,
      });
      if (normalized.legacySource && normalized.legacyId) {
        const [event] = await AuditEvent.findOrCreate({
          where: { legacySource: normalized.legacySource, legacyId: normalized.legacyId },
          defaults: normalized,
          transaction,
        });
        created.push(event);
      } else {
        created.push(await AuditEvent.create(normalized, { transaction }));
      }
    }
    await transaction.commit();
    return created;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const buildWhere = (filters = {}, context = {}) => {
  const where = {};
  const keys = ['id', 'tenantId', 'organizationId', 'userId', 'sessionId', 'eventType', 'action', 'entityType', 'entityId', 'severity', 'sourceService', 'isAnomaly'];
  for (const key of keys) if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') where[key] = filters[key];
  if (filters.startDate || filters.endDate) {
    where.occurredAt = {};
    if (filters.startDate) where.occurredAt[Op.gte] = filters.startDate;
    if (filters.endDate) where.occurredAt[Op.lte] = filters.endDate;
  }
  return applyContextScope(where, context, filters);
};

const listEvents = async (filters = {}, context = {}) => {
  const { limit = 50, offset = 0, ...query } = filters;
  const { count, rows } = await AuditEvent.findAndCountAll({
    where: buildWhere(query, context),
    order: [['occurredAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });
  return { events: rows.map(publicEvent), total: count, limit, offset };
};

const getEvent = async (id, context = {}) => {
  const event = await AuditEvent.findOne({ where: buildWhere({ id }, context) });
  return event ? publicEvent(event) : null;
};

const stats = async (filters = {}, context = {}) => {
  const where = buildWhere(filters, context);
  const [byType, bySeverity, byAction] = await Promise.all([
    AuditEvent.findAll({ attributes: ['eventType', [fn('COUNT', col('id')), 'count']], where, group: ['eventType'], order: [[literal('count'), 'DESC']], raw: true }),
    AuditEvent.findAll({ attributes: ['severity', [fn('COUNT', col('id')), 'count']], where, group: ['severity'], order: [[literal('count'), 'DESC']], raw: true }),
    AuditEvent.findAll({ attributes: ['action', [fn('COUNT', col('id')), 'count']], where, group: ['action'], order: [[literal('count'), 'DESC']], raw: true }),
  ]);
  return { byEventType: byType, bySeverity, byAction };
};

const runRetention = async ({ before, limit = env.retention.batchSize } = {}) => {
  if (!env.retention.enabled) {
    const error = new Error('Retenção desabilitada por configuração');
    error.statusCode = 409;
    error.code = 'RETENTION_DISABLED';
    throw error;
  }
  const cutoff = before || new Date();
  const transaction = await sequelize.transaction();
  try {
    await sequelize.query("SET LOCAL app.audit_retention_override = 'on'", { transaction });
    const rows = await AuditEvent.findAll({
      attributes: ['id'],
      where: { retentionUntil: { [Op.lte]: cutoff }, legalHold: false },
      order: [['retentionUntil', 'ASC']],
      limit,
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
    });
    const ids = rows.map((row) => row.id);
    const deleted = ids.length ? await AuditEvent.destroy({ where: { id: { [Op.in]: ids } }, transaction }) : 0;
    await transaction.commit();
    return { deleted, cutoff };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

module.exports = { createEvent, createBatch, listEvents, getEvent, stats, runRetention, buildWhere, publicEvent };
