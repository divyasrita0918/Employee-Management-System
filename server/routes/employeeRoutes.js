const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const authenticateToken = require('../middleware/auth');

router.get('/', authenticateToken, employeeController.getAllEmployees);
router.post('/', authenticateToken, employeeController.createEmployee);
router.get('/:id', authenticateToken, employeeController.getEmployeeById);
router.put('/:id', authenticateToken, employeeController.updateEmployee);
router.delete('/:id', authenticateToken, employeeController.deleteEmployee);

module.exports = router;
