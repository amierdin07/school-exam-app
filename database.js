const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'exam.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    // 1. Table Users (Admin, Guru, Siswa)
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT,
        role TEXT, -- 'admin', 'teacher', 'student'
        subject TEXT, -- for teacher (mapel)
        class_name TEXT -- for student (kelas)
      )
    `);

    // Seed default admin and teacher if they don't exist
    db.run(`
      INSERT OR IGNORE INTO users (username, password, name, role)
      VALUES ('admin', 'admin123', 'Administrator Ujian', 'admin')
    `);

    db.run(`
      INSERT OR IGNORE INTO users (username, password, name, role, subject)
      VALUES ('guru', 'guru123', 'Guru Pengampu', 'teacher', 'Umum')
    `);

    // 2. Table Classes (Admin managed)
    db.run(`
      CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
      )
    `);

    // Seed default classes if empty
    db.get("SELECT COUNT(*) as count FROM classes", (err, row) => {
      if (row && row.count === 0) {
        db.run("INSERT INTO classes (name) VALUES ('X IPA 1')");
        db.run("INSERT INTO classes (name) VALUES ('XI MIPA 2')");
        db.run("INSERT INTO classes (name) VALUES ('XII IPS 3')");
      }
    });

    // 3. Table Exams
    db.run(`
      CREATE TABLE IF NOT EXISTS exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        class_name TEXT,
        duration INTEGER, -- in minutes
        status TEXT DEFAULT 'draft', -- 'draft', 'active', 'finished'
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        timer_type TEXT DEFAULT 'duration', -- 'duration' | 'schedule'
        start_time TEXT,
        end_time TEXT,
        FOREIGN KEY(created_by) REFERENCES users(id)
      )
    `);

    // 4. Table Questions (Supports PG, PG Kompleks, Jodohkan, & Uraian)
    db.run(`
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER,
        question_type TEXT DEFAULT 'pg', -- 'pg' | 'pg_kompleks' | 'jodohkan' | 'uraian'
        question_text TEXT,
        option_a TEXT, -- Stores normal Options or Left items for matching (pipe separated)
        option_b TEXT, -- Stores normal Options or Right items for matching (pipe separated)
        option_c TEXT, -- Stores normal Options
        option_d TEXT, -- Stores normal Options
        correct_option TEXT, -- Stores answer (can be JSON array or JSON mapping object)
        FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE
      )
    `);

    // 5. Table Submissions (with attempt support)
    db.run(`
      CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER,
        student_id INTEGER,
        score REAL DEFAULT 0,
        status TEXT DEFAULT 'started', -- 'started', 'submitted', 'disqualified'
        started_at TEXT,
        submitted_at TEXT,
        violations_count INTEGER DEFAULT 0,
        answers TEXT, -- JSON string of answers
        attempt INTEGER DEFAULT 1, -- track attempts for retakes
        FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE,
        FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 6. Table Cheat Logs
    db.run(`
      CREATE TABLE IF NOT EXISTS cheat_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submission_id INTEGER,
        violation_type TEXT, -- 'blur' (pindah tab), 'minimize' (keluar aplikasi)
        timestamp TEXT,
        FOREIGN KEY(submission_id) REFERENCES submissions(id) ON DELETE CASCADE
      )
    `);

    // 7. Table Settings
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT UNIQUE,
        value TEXT
      )
    `);

    // Safe migration: Add new columns to questions table if they don't exist
    const addColumn = (tableName, columnName, columnType) => {
      db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`, (err) => {
        if (err) {
          if (!err.message.includes("duplicate column name")) {
            console.error(`Error adding column ${columnName}:`, err.message);
          }
        } else {
          console.log(`Column ${columnName} added to ${tableName}.`);
        }
      });
    };

    addColumn('questions', 'question_image', 'TEXT');
    addColumn('questions', 'option_a_image', 'TEXT');
    addColumn('questions', 'option_b_image', 'TEXT');
    addColumn('questions', 'option_c_image', 'TEXT');
    addColumn('questions', 'option_d_image', 'TEXT');
    addColumn('questions', 'points', 'REAL DEFAULT 1');
    addColumn('submissions', 'reset_requested', 'INTEGER DEFAULT 0');
    addColumn('submissions', 'essay_grades', 'TEXT');

    console.log('Database tables verified/initialized.');
  });
}

module.exports = db;
