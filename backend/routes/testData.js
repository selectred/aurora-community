const express = require('express')
const router = express.Router()
const { checkProFeature } = require('../middleware/license')
const ctrl = require('../controllers/testDataController')

router.get('/continuum',        checkProFeature, ctrl.listContinuumDatasets)
router.get('/continuum/:id',    checkProFeature, ctrl.getContinuumDataset)
router.get('/',                 checkProFeature, ctrl.listLocalCSV)
router.post('/',            checkProFeature, express.text({ limit: '10mb' }), ctrl.uploadLocalCSV)
router.delete('/:fileId',   checkProFeature, ctrl.deleteLocalCSV)

module.exports = router
