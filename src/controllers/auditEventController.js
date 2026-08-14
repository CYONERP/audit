const service = require('../services/auditEventService');
const { eventSchema, batchSchema, querySchema, retentionSchema } = require('../validators');
const { ValidationError, NotFoundError } = require('../utils/errors');

const parse = (schema, value) => {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError('Payload inválido', 'VALIDATION_ERROR', result.error.flatten());
  return result.data;
};

const createEvent = async (req, res, next) => {
  try {
    const event = await service.createEvent(parse(eventSchema, req.body), req.context);
    res.status(201).json({ success: true, data: service.publicEvent(event) });
  } catch (error) { next(error); }
};

const createBatch = async (req, res, next) => {
  try {
    const { events } = parse(batchSchema, req.body);
    const created = await service.createBatch(events, req.context);
    res.status(201).json({ success: true, data: { events: created.map(service.publicEvent), count: created.length } });
  } catch (error) { next(error); }
};

const listEvents = async (req, res, next) => {
  try {
    const result = await service.listEvents(parse(querySchema, req.query), req.context);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
};

const getEvent = async (req, res, next) => {
  try {
    const event = await service.getEvent(req.params.id, req.context);
    if (!event) throw new NotFoundError('Evento não encontrado');
    res.json({ success: true, data: event });
  } catch (error) { next(error); }
};

const entityHistory = async (req, res, next) => {
  try {
    const filters = parse(querySchema, { ...req.query, entityType: req.params.entityType, entityId: req.params.entityId });
    const result = await service.listEvents(filters, req.context);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
};

const userHistory = async (req, res, next) => {
  try {
    const filters = parse(querySchema, { ...req.query, userId: req.params.userId });
    const result = await service.listEvents(filters, req.context);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
};

const suspicious = async (req, res, next) => {
  try {
    const filters = parse(querySchema, { ...req.query, isAnomaly: 'true' });
    const result = await service.listEvents(filters, req.context);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
};

const stats = async (req, res, next) => {
  try {
    const filters = parse(querySchema, req.query);
    const result = await service.stats(filters, req.context);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
};

const runRetention = async (req, res, next) => {
  try {
    const result = await service.runRetention(parse(retentionSchema, req.body || {}));
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
};

module.exports = { createEvent, createBatch, listEvents, getEvent, entityHistory, userHistory, suspicious, stats, runRetention };
