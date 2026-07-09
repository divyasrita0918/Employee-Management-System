const pool = require('../config/db');

exports.getProjects = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT p.*, e.name as employee_name FROM projects p LEFT JOIN employees e ON p.employee_id = e.id ORDER BY p.created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch projects' });
  }
};

exports.createProject = async (req, res) => {
  try {
    const { project_name, project_description, client_name, start_date, end_date, project_status, priority, assigned_by, remarks, employee_id } = req.body;

    if (!project_name || !client_name || !start_date || !employee_id) {
      return res.status(400).json({ message: 'Project name, client name, start date, and employee are required' });
    }

    const [result] = await pool.query(
      'INSERT INTO projects (project_name, project_description, client_name, start_date, end_date, project_status, priority, assigned_by, remarks, employee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [project_name, project_description, client_name, start_date, end_date, project_status, priority, assigned_by, remarks, employee_id]
    );

    res.status(201).json({ id: result.insertId, message: 'Project created successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to create project' });
  }
};
