const express = require('express');
const auditRoutes = require('./auditRoutes');

const router = express.Router();
router.use('/audit-activity', auditRoutes);

module.exports = router;
