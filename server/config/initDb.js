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

  // Migration logic: check if the old projects table (with employee_id) exists
  try {
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'employee_id'
    `, [dbName]);
    
    if (columns.length > 0) {
      console.log('Detected old projects table schema with employee_id. Dropping old table...');
      await pool.query('DROP TABLE IF EXISTS projects');
    }

    // Check if completion_date column is missing from projects
    const [compDateCol] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'completion_date'
    `, [dbName]);

    if (compDateCol.length === 0) {
      // Check if table projects actually exists before trying to alter
      const [tableExists] = await pool.query(`
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'projects'
      `, [dbName]);
      if (tableExists.length > 0) {
        console.log('Adding completion_date column to projects table...');
        await pool.query('ALTER TABLE projects ADD COLUMN completion_date DATE AFTER notes');
      }
    }
  } catch (error) {
    console.error('Error checking for table migration:', error);
  }

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
