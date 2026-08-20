#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './data/cozy.db';
const db = new Database(DB_PATH);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

(async () => {
  try {
    console.log('\n=== Cozy Admin Setup ===\n');

    const username = await prompt('Admin username: ');
    if (!username || username.length < 3) {
      console.error('❌ Username must be at least 3 characters.');
      process.exit(1);
    }

    const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
    if (existing) {
      console.error(`❌ Admin "${username}" already exists.`);
      process.exit(1);
    }

    const password = await prompt('Admin password (12+ characters): ');
    if (!password || password.length < 12) {
      console.error('❌ Password must be at least 12 characters.');
      process.exit(1);
    }

    const email = await prompt('Admin email (optional, press Enter to skip): ');

    console.log('\n⏳ Hashing password...');
    const passwordHash = await bcrypt.hash(password, 10);

    db.prepare(`
      INSERT INTO admins(username, password_hash, email, role, active)
      VALUES(?, ?, ?, 'admin', 1)
    `).run(username, passwordHash, email || null);

    console.log('\n✅ Admin created successfully!');
    console.log(`   Username: ${username}`);
    console.log(`   Email: ${email || '(none)'}`);
    console.log(`\n📝 You can now login at: http://localhost:3000/admin\n`);

    rl.close();
    db.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    rl.close();
    db.close();
    process.exit(1);
  }
})();
