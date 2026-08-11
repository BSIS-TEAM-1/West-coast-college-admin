const express = require('express');
const router = express.Router();
const TransmutationTableController = require('../controllers/transmutationTableController');
const { requireAnyRole } = require('../authorization');

// All transmutation table routes require admin or registrar access.
router.use(requireAnyRole('admin', 'registrar'));

router.get('/', TransmutationTableController.listTables);
router.get('/active', TransmutationTableController.getActiveTable);
router.get('/transmute', (req, res, next) => {
  // GET version for quick lookup: ?rawScore=89
  req.body = { rawScore: Number(req.query.rawScore) };
  next();
}, TransmutationTableController.transmuteScore);
router.post('/transmute', TransmutationTableController.transmuteScore);
router.get('/:id', TransmutationTableController.getTable);
router.post('/', TransmutationTableController.createTable);
router.put('/:id', TransmutationTableController.updateTable);
router.delete('/:id', TransmutationTableController.deleteTable);
router.post('/:id/activate', TransmutationTableController.activateTable);

module.exports = router;
