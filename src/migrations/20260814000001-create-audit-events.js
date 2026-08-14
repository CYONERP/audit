'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    await queryInterface.createTable('audit_events', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
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
      occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
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
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    const indexes = [
      ['audit_events_tenant_occurred_at', ['tenantId', 'occurredAt']],
      ['audit_events_org_occurred_at', ['organizationId', 'occurredAt']],
      ['audit_events_user_occurred_at', ['userId', 'occurredAt']],
      ['audit_events_entity', ['entityType', 'entityId', 'occurredAt']],
      ['audit_events_event_type', ['eventType', 'occurredAt']],
      ['audit_events_severity', ['severity', 'occurredAt']],
      ['audit_events_session', ['sessionId', 'occurredAt']],
      ['audit_events_occurred_at', ['occurredAt']],
      ['audit_events_retention_until', ['retentionUntil']],
    ];
    for (const [name, fields] of indexes) await queryInterface.addIndex('audit_events', fields, { name });
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX audit_events_legacy_identity
      ON audit_events ("legacySource", "legacyId")
      WHERE "legacySource" IS NOT NULL AND "legacyId" IS NOT NULL;
    `);

    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION reject_audit_event_mutation()
      RETURNS trigger AS $$
      BEGIN
        IF current_setting('app.audit_retention_override', true) IS DISTINCT FROM 'on' THEN
          RAISE EXCEPTION 'audit_events são imutáveis; operação % rejeitada', TG_OP
            USING ERRCODE = '55000';
        END IF;
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER audit_events_immutable_update
      BEFORE UPDATE OR DELETE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS audit_events_immutable_update ON audit_events;');
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS reject_audit_event_mutation();');
    await queryInterface.dropTable('audit_events');
  },
};
