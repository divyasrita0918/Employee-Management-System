const pool = require('../config/db');

function validateEmployeePayload(body) {
  const requiredFields = ['employee_id', 'name', 'email', 'phone', 'department', 'designation', 'salary', 'joining_date', 'address', 'employment_status'];
  for (const field of requiredFields) {
    if (!body[field]) {
      return `${field} is required`;
    }
  }

  return null;
}

module.exports.validateEmployeePayload = validateEmployeePayload;

exports.getAllEmployees = async (req, res) => {
  try {
    const { search = '', department = '', status = '' } = req.query;
    let query = 'SELECT * FROM employees WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (name LIKE ? OR employee_id LIKE ? OR email LIKE ? OR department LIKE ?)';
      const likeValue = `%${search}%`;
      params.push(likeValue, likeValue, likeValue, likeValue);
    }

    if (department) {
      query += ' AND department = ?';
      params.push(department);
    }

    if (status) {
      query += ' AND employment_status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch employees' });
  }
};

exports.createEmployee = async (req, res) => {
  try {
    const error = validateEmployeePayload(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const { employee_id, name, email, phone, department, designation, salary, joining_date, address, employment_status } = req.body;
    const [result] = await pool.query(
      'INSERT INTO employees (employee_id, name, email, phone, department, designation, salary, joining_date, address, employment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [employee_id, name, email, phone, department, designation, salary, joining_date, address, employment_status]
    );

    res.status(201).json({ id: result.insertId, message: 'Employee created successfully' });
  } catch (error) {
    console.error(error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Employee ID or email already exists' });
    }
    res.status(500).json({ message: 'Failed to create employee' });
  }
};

exports.getEmployeeById = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch employee' });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const error = validateEmployeePayload(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const { employee_id, name, email, phone, department, designation, salary, joining_date, address, employment_status } = req.body;
    await pool.query(
      'UPDATE employees SET employee_id = ?, name = ?, email = ?, phone = ?, department = ?, designation = ?, salary = ?, joining_date = ?, address = ?, employment_status = ? WHERE id = ?',
      [employee_id, name, email, phone, department, designation, salary, joining_date, address, employment_status, req.params.id]
    );

    res.json({ message: 'Employee updated successfully' });
  } catch (error) {
    console.error(error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Employee ID or email already exists' });
    }
    res.status(500).json({ message: 'Failed to update employee' });
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    await pool.query('DELETE FROM employees WHERE id = ?', [req.params.id]);
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to delete employee' });
  }
};
