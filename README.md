# Employee Management System Full Stack

## What changed
- Converted the app from localStorage to a Node.js + Express + MySQL backend.
- Added MVC structure with routes, controllers, middleware, and database configuration.
- Added admin authentication with bcrypt + JWT.
- Added employee CRUD, search/filter, and project table support.
- Connected the existing HTML/CSS/JS frontend to the backend using Fetch API.

## Database setup
1. Create a MySQL database.
2. Update the values in [.env](.env) with your local MySQL credentials.
3. Run the SQL schema in [server/sql/schema.sql](server/sql/schema.sql).

Example:
```sql
CREATE DATABASE employee_management_system;
```

## Install dependencies
```bash
npm install
```

## Run the app
```bash
node server/app.js
```

## Default admin login
- Email: admin@ems.com
- Password: admin123

## API endpoints
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- GET /api/employees
- POST /api/employees
- GET /api/employees/:id
- PUT /api/employees/:id
- DELETE /api/employees/:id
- GET /api/dashboard/stats
- GET /api/projects
- POST /api/projects
