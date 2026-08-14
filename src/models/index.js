const sequelize = require('../config/database');
const AuditEvent = require('./AuditEvent');

module.exports = { sequelize, AuditEvent };
