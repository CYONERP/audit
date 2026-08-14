const { z } = require('zod');

const uuid = z.string().uuid();
const nullableUuid = uuid.nullable().optional();
const severity = z.enum(['low', 'medium', 'high', 'critical']).default('low');

const eventSchema = z.object({
  tenantId: nullableUuid,
  organizationId: nullableUuid,
  userId: nullableUuid,
  sessionId: nullableUuid,
  sourceService: z.string().trim().min(1).max(120),
  eventType: z.string().trim().min(1).max(80),
  action: z.string().trim().max(80).nullable().optional(),
  entityType: z.string().trim().max(160).nullable().optional(),
  entityId: nullableUuid,
  severity,
  description: z.string().max(12000).nullable().optional(),
  method: z.string().trim().max(12).nullable().optional(),
  endpoint: z.string().trim().max(500).nullable().optional(),
  statusCode: z.number().int().min(100).max(599).nullable().optional(),
  ipAddress: z.string().trim().max(128).nullable().optional(),
  userAgent: z.string().max(2000).nullable().optional(),
  requestId: z.string().trim().max(180).nullable().optional(),
  correlationId: z.string().trim().max(180).nullable().optional(),
  occurredAt: z.coerce.date().optional(),
  metadata: z.record(z.any()).optional(),
  changes: z.record(z.any()).nullable().optional(),
  oldValues: z.record(z.any()).nullable().optional(),
  newValues: z.record(z.any()).nullable().optional(),
  isAnomaly: z.boolean().optional(),
  anomalyScore: z.number().min(0).max(100).nullable().optional(),
  legalHold: z.boolean().optional(),
  retentionUntil: z.coerce.date().nullable().optional(),
  legacySource: z.string().trim().max(80).nullable().optional(),
  legacyId: nullableUuid,
}).strict();

const querySchema = z.object({
  tenantId: nullableUuid,
  organizationId: nullableUuid,
  userId: nullableUuid,
  sessionId: nullableUuid,
  eventType: z.string().trim().max(80).optional(),
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(160).optional(),
  entityId: uuid.optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  sourceService: z.string().trim().max(120).optional(),
  isAnomaly: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
}).strict();

const batchSchema = z.object({ events: z.array(eventSchema).min(1).max(500) }).strict();
const retentionSchema = z.object({ before: z.coerce.date().optional(), limit: z.coerce.number().int().min(1).max(10000).default(1000) }).strict();

module.exports = { eventSchema, batchSchema, querySchema, retentionSchema };
