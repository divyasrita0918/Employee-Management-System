const pool = require('../config/db');

exports.getDashboardStats = async (req, res) => {
  try {
    const [employeeRows] = await pool.query('SELECT COUNT(*) AS totalEmployees, SUM(CASE WHEN employment_status = "Active" THEN 1 ELSE 0 END) AS activeEmployees, SUM(CASE WHEN employment_status = "Inactive" THEN 1 ELSE 0 END) AS inactiveEmployees FROM employees');
    const [departmentRows] = await pool.query('SELECT COUNT(DISTINCT department) AS totalDepartments FROM employees');
    const [projectRows] = await pool.query('SELECT COUNT(*) AS totalProjects FROM projects');
    const [recentRows] = await pool.query('SELECT COUNT(*) AS recentlyAdded FROM employees WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)');
    const employeesWithProjects = 0;

    res.json({
      totalEmployees: employeeRows[0].totalEmployees,
      activeEmployees: employeeRows[0].activeEmployees,
      inactiveEmployees: employeeRows[0].inactiveEmployees,
      totalDepartments: departmentRows[0].totalDepartments,
      totalProjects: projectRows[0].totalProjects,
      recentlyAddedEmployees: recentRows[0].recentlyAdded,
      employeesWithProjects: employeesWithProjects
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch dashboard statistics' });
  }
};
