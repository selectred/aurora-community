const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/environmentsController')
const { authMiddleware } = require('../middleware/auth')

router.use(authMiddleware)

router.get('/', ctrl.list)
router.get('/active', ctrl.getActive)
router.post('/', ctrl.create)
router.put('/:id', ctrl.update)
router.post('/:id/activate', ctrl.activate)
router.post('/:id/deactivate', ctrl.deactivate)
router.delete('/:id', ctrl.remove)

module.exports = router
