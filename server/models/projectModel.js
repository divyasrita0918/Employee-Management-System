const pool = require('../config/db');

const Project = {
  async create(adminId, projectData) {
    const { project_name, description, category, priority, project_status, start_date, due_date, progress, tags, notes, employee_ids } = projectData;
    
    // Validate inactive employees
    if (employee_ids && employee_ids.length > 0) {
      const [empRows] = await pool.query('SELECT id, name, employment_status FROM employees WHERE id IN (?)', [employee_ids]);
      const inactiveEmps = empRows.filter(e => e.employment_status !== 'Active');
      if (inactiveEmps.length > 0) {
        throw new Error(`Cannot assign inactive employee(s) to new projects: ${inactiveEmps.map(e => e.name).join(', ')}`);
      }
    }

    let actualProgress = progress || 0;
    let completionDate = null;
    if (project_status === 'Completed') {
      actualProgress = 100;
      completionDate = new Date();
    }

    const [result] = await pool.query(
      `INSERT INTO projects (admin_id, project_name, description, category, priority, project_status, start_date, due_date, progress, tags, notes, completion_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [adminId, project_name, description || null, category || null, priority || 'Medium', project_status || 'Not Started', start_date, due_date, actualProgress, tags || null, notes || null, completionDate]
    );
    const projectId = result.insertId;
    
    // Log creation
    await this.addUpdateLog(projectId, 'Project created');
    if (project_status === 'Completed') {
      await this.addUpdateLog(projectId, 'Project Completed');
    }

    // Save assignments
    if (employee_ids && employee_ids.length > 0) {
      const uniqueEmployeeIds = [...new Set(employee_ids)];
      const values = uniqueEmployeeIds.map(empId => [projectId, empId]);
      await pool.query('INSERT INTO project_employees (project_id, employee_id) VALUES ?', [values]);

      // Log assignments
      const [assignedEmps] = await pool.query('SELECT name FROM employees WHERE id IN (?)', [uniqueEmployeeIds]);
      for (const emp of assignedEmps) {
        await this.addUpdateLog(projectId, `Assigned employee '${emp.name}' to the project`);
      }
    }
    
    return projectId;
  },

  async findAll(adminId, { search, status, priority, category, sortBy, order, employeeId }) {
    let query = 'SELECT * FROM projects WHERE admin_id = ?';
    const params = [adminId];

    if (search) {
      query += ' AND (project_name LIKE ? OR description LIKE ? OR category LIKE ? OR tags LIKE ?)';
      const likeVal = `%${search}%`;
      params.push(likeVal, likeVal, likeVal, likeVal);
    }

    if (status) {
      query += ' AND project_status = ?';
      params.push(status);
    }

    if (priority) {
      query += ' AND priority = ?';
      params.push(priority);
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    if (employeeId) {
      query += ' AND id IN (SELECT project_id FROM project_employees WHERE employee_id = ?)';
      params.push(employeeId);
    }

    // Sort mapping
    let sortCol = 'created_at';
    if (sortBy === 'deadline' || sortBy === 'due_date') {
      sortCol = 'due_date';
    } else if (sortBy === 'name') {
      sortCol = 'project_name';
    } else if (sortBy === 'progress') {
      sortCol = 'progress';
    } else if (sortBy === 'priority') {
      // Custom ordering can be handled in JS or using field sorting, sorting by column is fine for now
      sortCol = 'priority';
    } else if (sortBy === 'status' || sortBy === 'project_status') {
      sortCol = 'project_status';
    }

    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortCol} ${sortOrder}`;

    const [projects] = await pool.query(query, params);

    if (projects.length === 0) return [];

    // Fetch all employee assignments for the returned projects (efficient single query)
    const projectIds = projects.map(p => p.id);
    const [assignments] = await pool.query(`
      SELECT pe.project_id, e.id, e.name, e.email, e.department, e.employment_status 
      FROM project_employees pe 
      JOIN employees e ON pe.employee_id = e.id 
      WHERE pe.project_id IN (?)
    `, [projectIds]);

    // Map assignments to projects
    projects.forEach(p => {
      p.assigned_employees = assignments.filter(a => a.project_id === p.id);
    });

    return projects;
  },

  async findById(id, adminId) {
    const [rows] = await pool.query('SELECT * FROM projects WHERE id = ? AND admin_id = ?', [id, adminId]);
    const project = rows[0];
    if (!project) return null;

    // Fetch assigned employees
    const [employees] = await pool.query(`
      SELECT e.id, e.name, e.email, e.department, e.employment_status 
      FROM project_employees pe 
      JOIN employees e ON pe.employee_id = e.id 
      WHERE pe.project_id = ?
    `, [id]);

    project.assigned_employees = employees;
    return project;
  },

  async update(id, adminId, projectData) {
    const { project_name, description, category, priority, project_status, start_date, due_date, progress, tags, notes, employee_ids } = projectData;
    
    // Fetch old project details for comparisons
    const oldProject = await this.findById(id, adminId);
    if (!oldProject) return false;

    const oldEmployeeIds = oldProject.assigned_employees.map(e => e.id);
    const newEmployeeIds = employee_ids ? [...new Set(employee_ids.map(Number))] : [];

    // Verify that newly added employees are Active (allow historically assigned inactive ones)
    const addedEmployeeIds = newEmployeeIds.filter(empId => !oldEmployeeIds.includes(empId));
    if (addedEmployeeIds.length > 0) {
      const [empRows] = await pool.query('SELECT id, name, employment_status FROM employees WHERE id IN (?)', [addedEmployeeIds]);
      const inactiveEmps = empRows.filter(e => e.employment_status !== 'Active');
      if (inactiveEmps.length > 0) {
        throw new Error(`Cannot assign inactive employee(s): ${inactiveEmps.map(e => e.name).join(', ')}`);
      }
    }

    let actualProgress = Number(progress);
    let completionDate = oldProject.completion_date;

    if (project_status === 'Completed' && oldProject.project_status !== 'Completed') {
      actualProgress = 100;
      completionDate = new Date();
    } else if (project_status !== 'Completed' && oldProject.project_status === 'Completed') {
      completionDate = null;
    }

    await pool.query(
      `UPDATE projects 
       SET project_name = ?, description = ?, category = ?, priority = ?, project_status = ?, start_date = ?, due_date = ?, progress = ?, tags = ?, notes = ?, completion_date = ?
       WHERE id = ? AND admin_id = ?`,
      [project_name, description || null, category || null, priority, project_status, start_date, due_date, actualProgress, tags || null, notes || null, completionDate, id, adminId]
    );

    // Sync assignments
    await pool.query('DELETE FROM project_employees WHERE project_id = ?', [id]);
    if (newEmployeeIds.length > 0) {
      const values = newEmployeeIds.map(empId => [id, empId]);
      await pool.query('INSERT INTO project_employees (project_id, employee_id) VALUES ?', [values]);
    }

    // Logging changes
    const logs = [];
    if (oldProject.project_status !== project_status) {
      logs.push(`Status updated from '${oldProject.project_status}' to '${project_status}'`);
      if (project_status === 'Completed') {
        logs.push('Project Completed');
      }
    }
    if (oldProject.progress !== actualProgress) {
      logs.push(`Progress updated from ${oldProject.progress}% to ${actualProgress}%`);
    }
    if (oldProject.priority !== priority) {
      logs.push(`Priority changed to ${priority}`);
    }
    if (oldProject.project_name !== project_name) {
      logs.push(`Project renamed to '${project_name}'`);
    }

    // Assignment updates logging
    const removedEmployeeIds = oldEmployeeIds.filter(empId => !newEmployeeIds.includes(empId));
    if (addedEmployeeIds.length > 0) {
      const [addedEmps] = await pool.query('SELECT name FROM employees WHERE id IN (?)', [addedEmployeeIds]);
      for (const emp of addedEmps) {
        logs.push(`Assigned employee '${emp.name}' to the project`);
      }
    }
    if (removedEmployeeIds.length > 0) {
      const [removedEmps] = await pool.query('SELECT name FROM employees WHERE id IN (?)', [removedEmployeeIds]);
      for (const emp of removedEmps) {
        logs.push(`Removed employee '${emp.name}' from the project`);
      }
    }

    for (const logText of logs) {
      await this.addUpdateLog(id, logText);
    }

    return true;
  },

  async delete(id, adminId) {
    const [result] = await pool.query('DELETE FROM projects WHERE id = ? AND admin_id = ?', [id, adminId]);
    return result.affectedRows > 0;
  },

  async getDashboardStats(adminId) {
    const [totalRows] = await pool.query('SELECT COUNT(*) AS total FROM projects WHERE admin_id = ?', [adminId]);
    const total = totalRows[0].total;

    const [completedRows] = await pool.query('SELECT COUNT(*) AS completed FROM projects WHERE admin_id = ? AND project_status = "Completed"', [adminId]);
    const completed = completedRows[0].completed;

    const pending = total - completed;

    const [overdueRows] = await pool.query(
      'SELECT COUNT(*) AS overdue FROM projects WHERE admin_id = ? AND project_status != "Completed" AND due_date < CURDATE()',
      [adminId]
    );
    const overdue = overdueRows[0].overdue;

    const completionPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    const [activeRows] = await pool.query('SELECT COUNT(*) AS active FROM projects WHERE admin_id = ? AND project_status = "In Progress"', [adminId]);
    const active = activeRows[0].active;

    // 1. Total unique employees assigned across all projects
    const [assignedEmpRows] = await pool.query(
      `SELECT COUNT(DISTINCT pe.employee_id) AS count 
       FROM project_employees pe 
       JOIN projects p ON pe.project_id = p.id 
       WHERE p.admin_id = ?`,
      [adminId]
    );
    const totalAssignedEmployees = assignedEmpRows[0].count;

    // 2. Projects Without Assigned Employees
    const [unassignedProjRows] = await pool.query(
      `SELECT COUNT(*) AS count 
       FROM projects 
       WHERE admin_id = ? AND id NOT IN (SELECT DISTINCT project_id FROM project_employees)`,
      [adminId]
    );
    const unassignedProjects = unassignedProjRows[0].count;

    // 3. Recently Updated Projects (limit 5)
    const [recentlyUpdated] = await pool.query(
      'SELECT id, project_name, updated_at, project_status, progress FROM projects WHERE admin_id = ? ORDER BY updated_at DESC LIMIT 5',
      [adminId]
    );

    // 4. Upcoming deadlines: not completed, sorted by due_date ASC
    const [upcoming] = await pool.query(
      'SELECT id, project_name, due_date, project_status, priority FROM projects WHERE admin_id = ? AND project_status != "Completed" ORDER BY due_date ASC LIMIT 5',
      [adminId]
    );

    // 5. Recent activity: join updates table with projects
    const [recentLogs] = await pool.query(
      `SELECT u.id, u.project_id, p.project_name, u.update_text, u.created_at 
       FROM project_updates u 
       JOIN projects p ON u.project_id = p.id 
       WHERE p.admin_id = ? 
       ORDER BY u.created_at DESC LIMIT 10`,
      [adminId]
    );

    // 6. Chart data: Projects by Status
    const [statusChartData] = await pool.query(
      'SELECT project_status AS status, COUNT(*) AS count FROM projects WHERE admin_id = ? GROUP BY project_status',
      [adminId]
    );

    // 7. Chart data: Projects by Priority
    const [priorityChartData] = await pool.query(
      'SELECT priority, COUNT(*) AS count FROM projects WHERE admin_id = ? GROUP BY priority',
      [adminId]
    );

    // 8. Chart data: Employee Workload (projects count per employee)
    const [workloadChartData] = await pool.query(
      `SELECT e.name, COUNT(pe.project_id) AS count 
       FROM employees e 
       JOIN project_employees pe ON e.id = pe.employee_id 
       JOIN projects p ON pe.project_id = p.id 
       WHERE p.admin_id = ? 
       GROUP BY e.id, e.name 
       ORDER BY count DESC LIMIT 10`,
      [adminId]
    );

    return {
      totalProjects: total,
      activeProjects: active,
      completedProjects: completed,
      pendingProjects: pending,
      overdueProjects: overdue,
      completionPercentage,
      totalAssignedEmployees,
      unassignedProjects,
      recentlyUpdatedProjects: recentlyUpdated,
      upcomingDeadlines: upcoming,
      recentActivity: recentLogs,
      charts: {
        status: statusChartData,
        priority: priorityChartData,
        workload: workloadChartData
      }
    };
  },

  async addUpdateLog(projectId, text) {
    await pool.query('INSERT INTO project_updates (project_id, update_text) VALUES (?, ?)', [projectId, text]);
  },

  async getUpdateLogs(projectId) {
    const [rows] = await pool.query('SELECT * FROM project_updates WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
    return rows;
  }
};

module.exports = Project;
