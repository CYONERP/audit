const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditEvent = sequelize.define('AuditEvent', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: true },
  organizationId: { type: DataTypes.UUID, allowNull: true },
  userId: { type: DataTypes.UUID, allowNull: true },
  sessionId: { type: DataTypes.UUID, allowNull: true },
  sourceService: { type: DataTypes.STRING(120), allowNull: false },
  eventType: { type: DataTypes.STRING(80), allowNull: false },
  action: { type: DataTypes.STRING(80), allowNull: true },
  entityType: { type: DataTypes.STRING(160), allowNull: true },
  entityId: { type: DataTypes.UUID, allowNull: true },
  severity: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'low' },
  description: { type: DataTypes.TEXT, allowNull: true },
  method: { type: DataTypes.STRING(12), allowNull: true },
  endpoint: { type: DataTypes.STRING(500), allowNull: true },
  statusCode: { type: DataTypes.INTEGER, allowNull: true },
  ipAddress: { type: DataTypes.STRING(128), allowNull: true },
  userAgent: { type: DataTypes.TEXT, allowNull: true },
  requestId: { type: DataTypes.STRING(180), allowNull: true },
  correlationId: { type: DataTypes.STRING(180), allowNull: true },
  occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  changes: { type: DataTypes.JSONB, allowNull: true },
  oldValues: { type: DataTypes.JSONB, allowNull: true },
  newValues: { type: DataTypes.JSONB, allowNull: true },
  isAnomaly: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  anomalyScore: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  legacySource: { type: DataTypes.STRING(80), allowNull: true },
  legacyId: { type: DataTypes.UUID, allowNull: true },
  legalHold: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  retentionUntil: { type: DataTypes.DATE, allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'audit_events',
  timestamps: false,
});

module.exports = AuditEvent;
