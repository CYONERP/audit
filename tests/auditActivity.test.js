const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME || 'operaon_audit_test';
process.env.SERVICE_API_KEY = 'audit-test-service-key';
process.env.JWT_SECRET = 'audit-test-jwt-secret-change-me';
process.env.JWT_AUDIENCE = 'operaon-api,operaon-identity,operaon-audit';

const app = require('../src/app');
const env = require('../src/config/env');
const { sequelize, AuditEvent } = require('../src/models');

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const token = (overrides = {}) => jwt.sign({
  sub: userA,
  tokenType: 'access',
  tenantId: tenantA,
  permissions: ['audit:read', 'audit:write', 'activity:read'],
  roles: ['configured-role'],
  ...overrides,
}, env.jwt.secret, { issuer: env.jwt.issuer, audience: 'operaon-api', expiresIn: '10m' });

const headers = (bearer = token()) => ({
  Authorization: `Bearer ${bearer}`,
  'X-Service-Key': env.serviceApiKey,
});

describe('Audit & Activity standalone contract', () => {
  beforeAll(async () => { await sequelize.authenticate(); });
  afterEach(async () => {
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query("SET LOCAL app.audit_retention_override = 'on'", { transaction });
      await AuditEvent.destroy({ where: {}, transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  });
  afterAll(async () => { await sequelize.close(); });

  test('exige X-Service-Key e JWT simultaneamente', async () => {
    const response = await request(app).get('/api/audit-activity/events').set('Authorization', `Bearer ${token()}`);
    expect(response.status).toBe(401);

    const missingBearer = await request(app).get('/api/audit-activity/events').set('X-Service-Key', env.serviceApiKey);
    expect(missingBearer.status).toBe(401);
  });

  test('ingere evento e não devolve segredos', async () => {
    const response = await request(app).post('/api/audit-activity/events').set(headers()).send({
      sourceService: 'test-service', eventType: 'security', action: 'login', tenantId: tenantA, userId: userA,
      metadata: { nested: { password: 'must-hide', visible: 'ok' }, authorization: 'Bearer secret' },
      newValues: { refreshToken: 'must-hide', status: 'success' },
    });
    expect(response.status).toBe(201);
    expect(response.body.data.metadata.nested.password).toBe('[REDACTED]');
    expect(response.body.data.metadata.authorization).toBe('[REDACTED]');
    expect(response.body.data.newValues.refreshToken).toBe('[REDACTED]');
    expect(response.body.data.legacyId).toBeUndefined();
  });

  test('impede escrita fora do tenant do token', async () => {
    const response = await request(app).post('/api/audit-activity/events').set(headers()).send({
      sourceService: 'test-service', eventType: 'audit', tenantId: tenantB,
    });
    expect(response.status).toBe(403);
  });

  test('lista somente eventos do escopo e suporta atividade suspeita', async () => {
    await AuditEvent.create({ sourceService: 'test', eventType: 'activity', action: 'data_access', tenantId: tenantA, userId: userA, severity: 'low', metadata: {} });
    await AuditEvent.create({ sourceService: 'test', eventType: 'security', action: 'anomaly_detected', tenantId: tenantB, userId: userA, severity: 'high', isAnomaly: true, metadata: {} });
    const list = await request(app).get('/api/audit-activity/events').set(headers());
    expect(list.status).toBe(200);
    expect(list.body.data.total).toBe(1);
    const suspicious = await request(app).get('/api/audit-activity/activity/suspicious').set(headers());
    expect(suspicious.status).toBe(200);
    expect(suspicious.body.data.total).toBe(0);
  });

  test('rejeita update e delete por trigger de imutabilidade', async () => {
    const event = await AuditEvent.create({ sourceService: 'test', eventType: 'audit', tenantId: tenantA, userId: userA, metadata: {} });
    await expect(event.update({ description: 'tamper' })).rejects.toThrow();
    await expect(AuditEvent.destroy({ where: { id: event.id } })).rejects.toThrow();
  });
});
