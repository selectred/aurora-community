const express = require('express')
const router = express.Router()
const evidenceController = require('../controllers/evidenceController')
const { authMiddleware } = require('../middleware/auth')

router.use(authMiddleware)

router.get('/:evidenceDir/download', evidenceController.downloadEvidenceBundle)
router.get('/:evidenceDir/pdf', evidenceController.getEvidencePdf)
router.get('/:evidenceDir/:filename', evidenceController.getEvidenceFile)

module.exports = router
