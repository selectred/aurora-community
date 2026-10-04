const express = require('express')
const router = express.Router()
const featuresController = require('../controllers/featuresController')
const { authMiddleware, managerMiddleware } = require('../middleware/auth')

router.get('/',     authMiddleware, featuresController.getFeatures)
router.get('/:id/health', authMiddleware, featuresController.getFeatureHealth)
router.get('/:id/report', authMiddleware, featuresController.getFeatureReport)
router.get('/:id',  authMiddleware, featuresController.getFeatureById)
router.post('/',    authMiddleware, managerMiddleware, featuresController.createFeature)
router.put('/:id',  authMiddleware, managerMiddleware, featuresController.updateFeature)
router.delete('/:id', authMiddleware, managerMiddleware, featuresController.deleteFeature)

module.exports = router
