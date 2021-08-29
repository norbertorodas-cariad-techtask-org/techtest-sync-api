const express = require('express');
const router = express.Router();
const synchronization = require('../services/synchronization');

/* POST synchronization between github and artifactory */
router.post('/', async function(req, res, next) {
  try {
    res.json(await synchronization.handle(req.body));
  } catch (err) {
    console.error(`Error while synchronizing between Github and Artifactory `, err.message);
    next(err);
  }
});

module.exports = router;
