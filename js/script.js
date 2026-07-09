const API_BASE = '/api';
let employeesCache = [];

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
  if (!hasAuthToken() && (window.location.pathname.includes('dashboard.html') || window.location.pathname.includes('add-employee.html'))) {
    window.location.href = 'index.html';
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('email')?.value.trim();
  const password = document.getElementById('password')?.value;
  const message = document.getElementById('loginMessage');

  try {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    setAuthToken(data.token);
    window.location.href = 'dashboard.html';
  } catch (error) {
    if (message) {
      message.textContent = error.message;
    }
  }
}

async function populateDashboard() {
  const totalEmployees = document.getElementById('totalEmployees');
  const departmentCount = document.getElementById('departmentCount');
  const newEmployees = document.getElementById('newEmployees');
  const activeEmployees = document.getElementById('activeEmployees');
  const tableBody = document.getElementById('employeeTableBody');
  const searchInput = document.getElementById('searchInput');
  const departmentFilter = document.getElementById('departmentFilter');
  const statusFilter = document.getElementById('statusFilter');

  if (!tableBody) return;

  try {
    const stats = await apiRequest('/dashboard/stats');
    const employees = await apiRequest('/employees');
    employeesCache = employees;

    if (totalEmployees) totalEmployees.textContent = stats.totalEmployees;
    if (departmentCount) departmentCount.textContent = stats.totalDepartments;
    if (newEmployees) newEmployees.textContent = stats.recentlyAddedEmployees;
    if (activeEmployees) activeEmployees.textContent = stats.activeEmployees;

    const departments = [...new Set(employees.map(employee => employee.department))];
    departmentFilter.innerHTML = '<option value="">All Departments</option>' + departments.map(dept => `<option value="${dept}">${dept}</option>`).join('');

    function renderEmployees() {
      const searchValue = searchInput?.value.toLowerCase() || '';
      const selectedDepartment = departmentFilter?.value || '';
      const selectedStatus = statusFilter?.value || '';

      const filteredEmployees = employees.filter(employee => {
        const matchesSearch = employee.name.toLowerCase().includes(searchValue) || employee.employee_id.toLowerCase().includes(searchValue) || employee.email.toLowerCase().includes(searchValue);
        const matchesDepartment = !selectedDepartment || employee.department === selectedDepartment;
        const matchesStatus = !selectedStatus || employee.employment_status === selectedStatus;
        return matchesSearch && matchesDepartment && matchesStatus;
      });

      if (!filteredEmployees.length) {
        tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No employees found.</td></tr>';
        return;
      }

      tableBody.innerHTML = filteredEmployees.map(employee => `
        <tr>
          <td>${employee.employee_id}</td>
          <td>${employee.name}</td>
          <td>${employee.email}</td>
          <td>${employee.phone}</td>
          <td>${employee.department}</td>
          <td>${employee.designation}</td>
          <td>$${employee.salary}</td>
          <td>${employee.joining_date}</td>
          <td>
            <button class="btn btn-warning btn-sm me-2" data-edit="${employee.id}">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-danger btn-sm" data-delete="${employee.id}">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>
      `).join('');
    }

    renderEmployees();
    searchInput?.addEventListener('input', renderEmployees);
    departmentFilter?.addEventListener('change', renderEmployees);
    statusFilter?.addEventListener('change', renderEmployees);

    tableBody.addEventListener('click', async event => {
      const target = event.target.closest('button');
      if (!target) return;

      const employeeId = target.dataset.edit || target.dataset.delete;
      if (target.dataset.edit) {
        sessionStorage.setItem('editEmployeeId', employeeId);
        window.location.href = 'add-employee.html';
      }

      if (target.dataset.delete) {
        try {
          await apiRequest(`/employees/${employeeId}`, { method: 'DELETE' });
          await populateDashboard();
        } catch (error) {
          alert(error.message);
        }
      }
    });
  } catch (error) {
    alert(error.message);
  }
}

async function populateEmployeeForm() {
  const form = document.getElementById('employeeForm');
  if (!form) return;

  const employeeIdToEdit = sessionStorage.getItem('editEmployeeId');
  const heading = document.querySelector('h2');
  const submitButton = form.querySelector('button[type="submit"]');

  if (employeeIdToEdit) {
    try {
      const employee = await apiRequest(`/employees/${employeeIdToEdit}`);
      document.getElementById('name').value = employee.name;
      document.getElementById('employeeId').value = employee.employee_id;
      document.getElementById('email').value = employee.email;
      document.getElementById('phone').value = employee.phone;
      document.getElementById('department').value = employee.department;
      document.getElementById('designation').value = employee.designation;
      document.getElementById('salary').value = employee.salary;
      document.getElementById('joiningDate').value = employee.joining_date;
      document.getElementById('address').value = employee.address;
      document.getElementById('employmentStatus').value = employee.employment_status;
      if (heading) heading.textContent = 'Edit Employee';
      if (submitButton) submitButton.textContent = 'Update Employee';
    } catch (error) {
      alert(error.message);
    }
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    const employeePayload = {
      employee_id: document.getElementById('employeeId').value.trim(),
      name: document.getElementById('name').value.trim(),
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      department: document.getElementById('department').value,
      designation: document.getElementById('designation').value.trim(),
      salary: Number(document.getElementById('salary').value),
      joining_date: document.getElementById('joiningDate').value,
      address: document.getElementById('address').value.trim(),
      employment_status: document.getElementById('employmentStatus').value
    };

    if (!employeePayload.employee_id || !employeePayload.name || !employeePayload.email || !employeePayload.phone || !employeePayload.department || !employeePayload.designation || !employeePayload.salary || !employeePayload.joining_date || !employeePayload.employment_status) {
      alert('Please fill in all required fields.');
      return;
    }

    try {
      if (employeeIdToEdit) {
        await apiRequest(`/employees/${employeeIdToEdit}`, {
          method: 'PUT',
          body: JSON.stringify(employeePayload)
        });
      } else {
        await apiRequest('/employees', {
          method: 'POST',
          body: JSON.stringify(employeePayload)
        });
      }
      sessionStorage.removeItem('editEmployeeId');
      window.location.href = 'dashboard.html';
    } catch (error) {
      alert(error.message);
    }
  });
}

function handleLogout() {
  document.querySelector('[data-logout="true"]')?.addEventListener('click', async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error(error);
    }
    clearAuthToken();
    window.location.href = 'index.html';
  });
}

async function init() {
  const loginForm = document.getElementById('loginForm');

  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
    return;
  }

  ensureAuth();
  handleLogout();
  await populateDashboard();
  await populateEmployeeForm();
}

document.addEventListener('DOMContentLoaded', init);
