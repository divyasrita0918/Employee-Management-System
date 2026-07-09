const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const pool = require('./db');

async function initializeDatabase() {
  const dbName = process.env.DB_NAME || 'employee_management_system';
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  } finally {
    await connection.end();
  }

  const schemaPath = path.join(__dirname, '..', 'sql', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schemaSql);

  const defaultAdminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@ems.com';
  const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
  const defaultAdminName = process.env.DEFAULT_ADMIN_NAME || 'System Admin';

  try {
    const passwordHash = await bcrypt.hash(defaultAdminPassword, 10);
    await pool.query(
      'INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)',
      [defaultAdminName, defaultAdminEmail, passwordHash]
    );
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') {
      throw error;
    }
  }
}

module.exports = initializeDatabase;
