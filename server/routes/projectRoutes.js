const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const authenticateToken = require('../middleware/auth');

router.get('/', authenticateToken, projectController.getProjects);
router.post('/', authenticateToken, projectController.createProject);

module.exports = router;
