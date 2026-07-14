const Project = require('../models/projectModel');

// Validation function
function validateProjectPayload(body) {
  const { project_name, start_date, due_date } = body;
  if (!project_name || !project_name.trim()) {
    return 'Project name is required';
  }
  if (!start_date) {
    return 'Start date is required';
  }
  if (!due_date) {
    return 'Due date is required';
  }
  
  // Date validation
  if (new Date(start_date) > new Date(due_date)) {
    return 'Due Date cannot be earlier than Start Date';
  }

  // Progress validation
  if (body.progress !== undefined) {
    const prog = Number(body.progress);
    if (isNaN(prog) || prog < 0 || prog > 100) {
      return 'Progress must be a number between 0 and 100';
    }
  }

  // Priority validation
  const validPriorities = ['Low', 'Medium', 'High'];
  if (body.priority && !validPriorities.includes(body.priority)) {
    return `Priority must be one of: ${validPriorities.join(', ')}`;
  }

  // Status validation
  const validStatuses = ['Not Started', 'In Progress', 'On Hold', 'Completed'];
  if (body.project_status && !validStatuses.includes(body.project_status)) {
    return `Status must be one of: ${validStatuses.join(', ')}`;
  }

  return null;
}

exports.getProjects = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { search = '', status = '', priority = '', category = '', sortBy = 'created_at', order = 'desc', employeeId } = req.query;
    
    const projects = await Project.findAll(adminId, { 
      search, 
      status, 
      priority, 
      category, 
      sortBy, 
      order,
      employeeId: employeeId ? Number(employeeId) : undefined
    });
    res.json(projects);
  } catch (error) {
    console.error('Error in getProjects:', error);
    res.status(500).json({ message: 'Server error while fetching projects' });
  }
};

exports.getProjectsDashboard = async (req, res) => {
  try {
    const adminId = req.user.id;
    const dashboardData = await Project.getDashboardStats(adminId);
    res.json(dashboardData);
  } catch (error) {
    console.error('Error in getProjectsDashboard:', error);
    res.status(500).json({ message: 'Server error while fetching dashboard stats' });
  }
};

exports.getProjectById = async (req, res) => {
  try {
    const adminId = req.user.id;
    const projectId = req.params.id;

    const project = await Project.findById(projectId, adminId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const timeline = await Project.getUpdateLogs(projectId);
    res.json({ ...project, timeline });
  } catch (error) {
    console.error('Error in getProjectById:', error);
    res.status(500).json({ message: 'Server error while fetching project details' });
  }
};

exports.createProject = async (req, res) => {
  try {
    const adminId = req.user.id;
    const validationError = validateProjectPayload(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    // Ensure employee_ids are set and unique
    const payload = {
      ...req.body,
      employee_ids: req.body.employee_ids ? [...new Set(req.body.employee_ids.map(Number))] : []
    };

    const projectId = await Project.create(adminId, payload);
    res.status(201).json({ id: projectId, message: 'Project created successfully' });
  } catch (error) {
    console.error('Error in createProject:', error);
    res.status(400).json({ message: error.message || 'Server error while creating project' });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const adminId = req.user.id;
    const projectId = req.params.id;

    const validationError = validateProjectPayload(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    // Ensure employee_ids are set and unique
    const payload = {
      ...req.body,
      employee_ids: req.body.employee_ids ? [...new Set(req.body.employee_ids.map(Number))] : []
    };

    const updated = await Project.update(projectId, adminId, payload);
    if (!updated) {
      return res.status(404).json({ message: 'Project not found or unauthorized' });
    }

    res.json({ message: 'Project updated successfully' });
  } catch (error) {
    console.error('Error in updateProject:', error);
    res.status(400).json({ message: error.message || 'Server error while updating project' });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const adminId = req.user.id;
    const projectId = req.params.id;

    const deleted = await Project.delete(projectId, adminId);
    if (!deleted) {
      return res.status(404).json({ message: 'Project not found or unauthorized' });
    }

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error in deleteProject:', error);
    res.status(500).json({ message: 'Server error while deleting project' });
  }
};
