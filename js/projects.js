const API_BASE = '/api';
let projectsCache = [];
let categoriesCache = [];

function getAuthToken() {
  return localStorage.getItem('ems-token');
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem('ems-token', token);
  } else {
    localStorage.removeItem('ems-token');
  }
}

function clearAuthToken() {
  localStorage.removeItem('ems-token');
}

function hasAuthToken() {
  return Boolean(getAuthToken());
}

async function apiRequest(url, options = {}) {
  const token = getAuthToken();
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const response = await fetch(`${API_BASE}${url}`, {
    credentials: 'include',
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

function ensureAuth() {
  if (!hasAuthToken()) {
    window.location.href = 'index.html';
  }
}

function handleLogout() {
  document.querySelector('[data-logout="true"]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error(error);
    }
    clearAuthToken();
    window.location.href = 'index.html';
  });
}

// Fetch dashboard stats & fill widgets
async function loadDashboardStats() {
  try {
    const stats = await apiRequest('/projects/dashboard');
    
    // Fill counters
    document.getElementById('totalProjects').textContent = stats.totalProjects;
    document.getElementById('activeProjects').textContent = stats.activeProjects;
    document.getElementById('completedProjects').textContent = stats.completedProjects;
    document.getElementById('overdueProjects').textContent = stats.overdueProjects;
    document.getElementById('completionPercentage').textContent = `${stats.completionPercentage}%`;

    // Fill upcoming deadlines
    const deadlinesList = document.getElementById('upcomingDeadlinesList');
    if (stats.upcomingDeadlines.length === 0) {
      deadlinesList.innerHTML = '<li class="list-group-item text-center text-muted small py-3">No upcoming deadlines</li>';
    } else {
      deadlinesList.innerHTML = stats.upcomingDeadlines.map(p => {
        const dueDate = new Date(p.due_date);
        const formattedDate = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const diffTime = dueDate - new Date();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const badgeColor = diffDays < 0 ? 'bg-danger' : (diffDays <= 3 ? 'bg-warning text-dark' : 'bg-secondary');
        
        return `
          <li class="list-group-item d-flex justify-content-between align-items-center px-0 py-2">
            <div>
              <a href="#" class="text-decoration-none fw-bold text-dark view-project-link" data-id="${p.id}">${escapeHtml(p.project_name)}</a>
              <div class="small text-muted">${p.priority} Priority</div>
            </div>
            <span class="badge ${badgeColor}">${formattedDate}</span>
          </li>
        `;
      }).join('');
    }

    // Fill recent activity timeline
    const timeline = document.getElementById('recentActivityTimeline');
    if (stats.recentActivity.length === 0) {
      timeline.innerHTML = '<p class="text-center text-muted small py-3">No recent activities</p>';
    } else {
      timeline.innerHTML = stats.recentActivity.map(act => {
        const dateStr = new Date(act.created_at).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
        return `
          <div class="timeline-item">
            <div class="timeline-text">
              <strong class="text-primary">${escapeHtml(act.project_name)}</strong>: ${escapeHtml(act.update_text)}
            </div>
            <span class="timeline-time">${dateStr}</span>
          </div>
        `;
      }).join('');
    }

    // Rebind view details clicks on the deadline lists
    document.querySelectorAll('.view-project-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        openProjectDetails(link.dataset.id);
      });
    });

  } catch (error) {
    console.error('Error fetching dashboard statistics:', error);
  }
}

// Fetch categories & fill dropdown filter
async function loadCategories(currentProjects) {
  const categories = [...new Set(currentProjects.map(p => p.category).filter(Boolean))];
  const catFilter = document.getElementById('categoryFilter');
  const prevVal = catFilter.value;
  
  catFilter.innerHTML = '<option value="">All Categories</option>' + categories.map(cat => `
    <option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>
  `).join('');
  
  if (categories.includes(prevVal)) {
    catFilter.value = prevVal;
  }
}

// Fetch projects list & render
async function loadProjectsList() {
  const search = document.getElementById('projectSearch').value.trim();
  const status = document.getElementById('statusFilter').value;
  const priority = document.getElementById('priorityFilter').value;
  const category = document.getElementById('categoryFilter').value;
  const sortBy = document.getElementById('sortBy').value;

  try {
    const url = `/projects?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&priority=${encodeURIComponent(priority)}&category=${encodeURIComponent(category)}&sortBy=${encodeURIComponent(sortBy)}`;
    const projects = await apiRequest(url);
    projectsCache = projects;

    // Fill category filters if not done
    loadCategories(projects);

    const grid = document.getElementById('projectsGrid');
    const noProjects = document.getElementById('noProjectsMessage');

    if (projects.length === 0) {
      grid.innerHTML = '';
      noProjects.classList.remove('d-none');
      return;
    }

    noProjects.classList.add('d-none');
    grid.innerHTML = projects.map(p => {
      const priorityClass = p.priority.toLowerCase();
      
      let statusClass = 'not-started';
      if (p.project_status === 'In Progress') statusClass = 'in-progress';
      else if (p.project_status === 'On Hold') statusClass = 'on-hold';
      else if (p.project_status === 'Completed') statusClass = 'completed';

      const tagsHtml = p.tags ? p.tags.split(',').map(tag => `<span class="project-tag">${escapeHtml(tag.trim())}</span>`).join('') : '';
      const descriptionExcerpt = p.description ? (p.description.length > 90 ? p.description.substring(0, 90) + '...' : p.description) : 'No description provided.';
      
      return `
        <div class="col">
          <div class="card project-card p-3 h-100 d-flex flex-column justify-content-between cursor-pointer" data-id="${p.id}">
            <div>
              <div class="d-flex justify-content-between align-items-start mb-2">
                <span class="badge-priority ${priorityClass}">${p.priority}</span>
                <span class="badge-status ${statusClass}">${p.project_status}</span>
              </div>
              <h5 class="fw-bold mb-1 text-dark">${escapeHtml(p.project_name)}</h5>
              <span class="text-primary small fw-semibold d-block mb-2">${escapeHtml(p.category || 'Uncategorized')}</span>
              <p class="text-muted small mb-3">${escapeHtml(descriptionExcerpt)}</p>
            </div>
            
            <div>
              <div class="mb-2">${tagsHtml}</div>
              <div class="d-flex justify-content-between align-items-center small text-muted mb-1">
                <span>Progress</span>
                <span class="fw-bold">${p.progress}%</span>
              </div>
              <div class="progress-bar-wrapper mb-2">
                <div class="progress-bar-inner" style="width: ${p.progress}%;"></div>
              </div>
              <div class="d-flex justify-content-between align-items-center small text-muted pt-2 border-top mt-2">
                <span><i class="bi bi-calendar me-1"></i>Due: ${p.due_date}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Bind cards clicks to open detail modals
    document.querySelectorAll('#projectsGrid .project-card').forEach(card => {
      card.addEventListener('click', () => {
        openProjectDetails(card.dataset.id);
      });
    });

  } catch (error) {
    console.error('Error fetching projects list:', error);
  }
}

// Fetch single project details & timeline, fill details modal
async function openProjectDetails(id) {
  try {
    const project = await apiRequest(`/projects/${id}`);
    
    // Fill elements
    document.getElementById('detailCategory').textContent = project.category || 'General';
    
    const prioritySpan = document.getElementById('detailPriority');
    prioritySpan.textContent = `${project.priority} Priority`;
    prioritySpan.className = `badge-priority ${project.priority.toLowerCase()}`;

    const statusSpan = document.getElementById('detailStatus');
    statusSpan.textContent = project.project_status;
    let statusClass = 'not-started';
    if (project.project_status === 'In Progress') statusClass = 'in-progress';
    else if (project.project_status === 'On Hold') statusClass = 'on-hold';
    else if (project.project_status === 'Completed') statusClass = 'completed';
    statusSpan.className = `badge-status ${statusClass}`;

    document.getElementById('detailName').textContent = project.project_name;
    document.getElementById('detailDescription').textContent = project.description || 'No description available.';
    document.getElementById('detailProgressText').textContent = `${project.progress}%`;
    document.getElementById('detailProgressBar').style.width = `${project.progress}%`;
    
    // Quick progress inputs
    document.getElementById('quickProgressRange').value = project.progress;
    
    document.getElementById('detailStartDate').textContent = project.start_date;
    document.getElementById('detailDueDate').textContent = project.due_date;
    
    // Tags
    const tagsContainer = document.getElementById('detailTagsContainer');
    if (project.tags) {
      tagsContainer.innerHTML = project.tags.split(',').map(t => `<span class="project-tag fs-6 py-1 px-2 mb-1">${escapeHtml(t.trim())}</span>`).join('');
    } else {
      tagsContainer.innerHTML = '<span class="text-muted small">No tags</span>';
    }

    document.getElementById('detailNotes').textContent = project.notes || 'No notes available.';

    // Timeline
    const timeline = document.getElementById('projectTimeline');
    if (project.timeline.length === 0) {
      timeline.innerHTML = '<p class="text-muted small">No updates log found.</p>';
    } else {
      timeline.innerHTML = project.timeline.map(item => {
        const timeStr = new Date(item.created_at).toLocaleString();
        return `
          <div class="timeline-item">
            <div class="timeline-text">${escapeHtml(item.update_text)}</div>
            <span class="timeline-time">${timeStr}</span>
          </div>
        `;
      }).join('');
    }

    // Bind footer action buttons
    document.getElementById('updateProgressBtn').onclick = () => updateProjectProgress(id);
    document.getElementById('detailEditBtn').onclick = () => {
      bootstrap.Modal.getInstance(document.getElementById('projectDetailsModal')).hide();
      openEditProjectModal(project);
    };
    document.getElementById('detailDeleteBtn').onclick = () => deleteProject(id);

    // Show details modal
    const detailsModal = new bootstrap.Modal(document.getElementById('projectDetailsModal'));
    detailsModal.show();

  } catch (error) {
    alert('Failed to load project details: ' + error.message);
  }
}

// Quick progress bar updater
async function updateProjectProgress(id) {
  const newProgress = Number(document.getElementById('quickProgressRange').value);
  const detailsModal = bootstrap.Modal.getInstance(document.getElementById('projectDetailsModal'));
  
  try {
    // We must fetch full details to submit to PUT update (excluding database logs, they auto insert)
    const project = await apiRequest(`/projects/${id}`);
    project.progress = newProgress;
    
    // If progress reaches 100%, let's change status to Completed for convenience
    if (newProgress === 100) {
      project.project_status = 'Completed';
    }

    await apiRequest(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(project)
    });

    detailsModal.hide();
    await loadProjectsList();
    await loadDashboardStats();
    
    // Re-open with new values
    setTimeout(() => openProjectDetails(id), 400);
  } catch (error) {
    alert('Failed to update progress: ' + error.message);
  }
}

// Open modal for editing prefilled project
function openEditProjectModal(project) {
  document.getElementById('projectModalLabel').textContent = 'Edit Project';
  document.getElementById('saveProjectBtn').textContent = 'Update Project';
  document.getElementById('projectIdInput').value = project.id;
  document.getElementById('projectName').value = project.project_name;
  document.getElementById('projectDescription').value = project.description || '';
  document.getElementById('projectCategory').value = project.category || '';
  document.getElementById('projectPriority').value = project.priority;
  document.getElementById('projectStatus').value = project.project_status;
  document.getElementById('projectProgressRange').value = project.progress;
  document.getElementById('projectProgressNumber').value = project.progress;
  
  // Format dates for HTML input yyyy-mm-dd
  document.getElementById('projectStartDate').value = project.start_date;
  document.getElementById('projectDueDate').value = project.due_date;
  
  document.getElementById('projectTags').value = project.tags || '';
  document.getElementById('projectNotes').value = project.notes || '';

  const modal = new bootstrap.Modal(document.getElementById('projectModal'));
  modal.show();
}

// Open modal for adding new empty project
document.getElementById('addProjectBtn').addEventListener('click', () => {
  document.getElementById('projectModalLabel').textContent = 'Add New Project';
  document.getElementById('saveProjectBtn').textContent = 'Save Project';
  document.getElementById('projectIdInput').value = '';
  document.getElementById('projectForm').reset();
  
  // Default dates to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('projectStartDate').value = today;
  document.getElementById('projectDueDate').value = today;
  document.getElementById('projectProgressRange').value = 0;
  document.getElementById('projectProgressNumber').value = 0;
});

// Delete project
async function deleteProject(id) {
  if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
    return;
  }
  
  const detailsModal = bootstrap.Modal.getInstance(document.getElementById('projectDetailsModal'));
  
  try {
    await apiRequest(`/projects/${id}`, { method: 'DELETE' });
    detailsModal.hide();
    await loadProjectsList();
    await loadDashboardStats();
  } catch (error) {
    alert('Failed to delete project: ' + error.message);
  }
}

// Form submit handler (creates or updates project)
document.getElementById('projectForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = document.getElementById('projectIdInput').value;
  const projectPayload = {
    project_name: document.getElementById('projectName').value.trim(),
    description: document.getElementById('projectDescription').value.trim(),
    category: document.getElementById('projectCategory').value.trim(),
    priority: document.getElementById('projectPriority').value,
    project_status: document.getElementById('projectStatus').value,
    progress: Number(document.getElementById('projectProgressNumber').value),
    start_date: document.getElementById('projectStartDate').value,
    due_date: document.getElementById('projectDueDate').value,
    tags: document.getElementById('projectTags').value.trim(),
    notes: document.getElementById('projectNotes').value.trim()
  };

  const modalElement = document.getElementById('projectModal');
  const modal = bootstrap.Modal.getInstance(modalElement);

  try {
    if (id) {
      // Update
      await apiRequest(`/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify(projectPayload)
      });
    } else {
      // Create
      await apiRequest('/projects', {
        method: 'POST',
        body: JSON.stringify(projectPayload)
      });
    }
    
    modal.hide();
    await loadProjectsList();
    await loadDashboardStats();
  } catch (error) {
    alert('Failed to save project: ' + error.message);
  }
});

// Setup filters events
function setupFilters() {
  document.getElementById('projectSearch').addEventListener('input', debounce(loadProjectsList, 300));
  document.getElementById('statusFilter').addEventListener('change', loadProjectsList);
  document.getElementById('priorityFilter').addEventListener('change', loadProjectsList);
  document.getElementById('categoryFilter').addEventListener('change', loadProjectsList);
  document.getElementById('sortBy').addEventListener('change', loadProjectsList);
}

// Utility debounce
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Utility HTML escape
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Fetch welcome user info
async function fetchUserInfo() {
  try {
    const data = await apiRequest('/auth/me');
    if (data.admin && data.admin.name) {
      document.getElementById('userName').textContent = data.admin.name;
    }
  } catch (error) {
    console.error('Failed to fetch user welcome details:', error);
  }
}

async function init() {
  ensureAuth();
  handleLogout();
  await fetchUserInfo();
  await loadDashboardStats();
  await loadProjectsList();
  setupFilters();
}

document.addEventListener('DOMContentLoaded', init);
