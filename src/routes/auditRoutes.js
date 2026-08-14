const express = require('express');
const controller = require('../controllers/auditEventController');
const { authenticate, requirePermission } = require('../middlewares/auth');

const router = express.Router();
router.use(authenticate);

router.post('/events', requirePermission('audit', 'write'), controller.createEvent);
router.post('/events/batch', requirePermission('audit', 'write'), controller.createBatch);
router.get('/events', requirePermission('audit', 'read'), controller.listEvents);
router.get('/events/:id', requirePermission('audit', 'read'), controller.getEvent);
router.get('/events/entity/:entityType/:entityId', requirePermission('audit', 'read'), controller.entityHistory);
router.get('/events/user/:userId', requirePermission('audit', 'read'), controller.userHistory);
router.get('/events/stats', requirePermission('audit', 'read'), controller.stats);
router.get('/activity/users/:userId', requirePermission('activity', 'read'), controller.userHistory);
router.get('/activity/suspicious', requirePermission('activity', 'read'), controller.suspicious);
router.post('/internal/retention/run', requirePermission('audit', 'retention'), controller.runRetention);

module.exports = router;
