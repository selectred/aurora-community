const express = require('express');
const router = express.Router();
const terminalController = require('../controllers/terminalController');
const { authMiddleware, managerMiddleware } = require('../middleware/auth');

// All routes require authentication and manager/admin access
router.use(authMiddleware);
router.use(managerMiddleware);

// Session management
router.post('/sessions', terminalController.createSession);
router.get('/sessions/:sessionId', terminalController.getSession);

// Agent actions
router.post('/probe', terminalController.probe);
router.post('/plan', terminalController.plan);
router.post('/generate', terminalController.generate);
router.post('/run', terminalController.run);
router.post('/heal', terminalController.heal);

module.exports = router;
