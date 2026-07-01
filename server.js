const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, 'exam.db');
const https = require('https');
let db = require('./database');

function reconnectDatabase() {
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error reopening database:', err.message);
    } else {
      console.log('Connected to SQLite database.');
    }
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ================= AUTH API =================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!user) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }
    res.json({ 
      id: user.id, 
      username: user.username, 
      name: user.name, 
      role: user.role,
      subject: user.subject,
      class_name: user.class_name
    });
  });
});

// ================= ADMIN: KELOLA KELAS =================
app.get('/api/admin/classes', (req, res) => {
  db.all('SELECT * FROM classes ORDER BY name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/admin/classes', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nama kelas wajib diisi' });

  db.run('INSERT INTO classes (name) VALUES (?)', [name], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'Kelas sudah terdaftar' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, name });
  });
});

app.delete('/api/admin/classes/:id', (req, res) => {
  db.run('DELETE FROM classes WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ================= ADMIN: KELOLA GURU =================
app.get('/api/admin/teachers', (req, res) => {
  db.all("SELECT id, username, password, name, subject FROM users WHERE role = 'teacher' ORDER BY name ASC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/admin/teachers', (req, res) => {
  const { username, password, name, subject } = req.body;
  if (!username || !password || !name || !subject) {
    return res.status(400).json({ error: 'Semua data guru wajib diisi' });
  }

  db.run(
    "INSERT INTO users (username, password, name, role, subject) VALUES (?, ?, ?, 'teacher', ?)",
    [username, password, name, subject],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'Username sudah digunakan' });
        }
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, username, name, subject });
    }
  );
});

// Impor Massal Guru
app.post('/api/admin/teachers/bulk', (req, res) => {
  const { teachers } = req.body;
  if (!Array.isArray(teachers) || teachers.length === 0) {
    return res.status(400).json({ error: 'Format data guru tidak valid' });
  }

  db.serialize(() => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO users (username, password, name, role, subject)
      VALUES (?, ?, ?, 'teacher', ?)
    `);

    teachers.forEach(t => {
      stmt.run([t.username, t.password, t.name, t.subject]);
    });

    stmt.finalize(err => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: `${teachers.length} akun guru berhasil diimpor!` });
    });
  });
});

app.delete('/api/admin/teachers/:id', (req, res) => {
  db.run("DELETE FROM users WHERE id = ? AND role = 'teacher'", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ================= ADMIN: KELOLA SISWA =================
app.get('/api/admin/students', (req, res) => {
  db.all("SELECT id, username, password, name, class_name FROM users WHERE role = 'student' ORDER BY class_name ASC, name ASC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/admin/students', (req, res) => {
  const { username, password, name, class_name } = req.body;
  if (!username || !password || !name || !class_name) {
    return res.status(400).json({ error: 'Semua data siswa wajib diisi' });
  }

  db.run(
    "INSERT INTO users (username, password, name, role, class_name) VALUES (?, ?, ?, 'student', ?)",
    [username, password, name, class_name],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'Username sudah digunakan' });
        }
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, username, name, class_name });
    }
  );
});

// Impor Massal Siswa
app.post('/api/admin/students/bulk', (req, res) => {
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'Format data siswa tidak valid' });
  }

  db.serialize(() => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO users (username, password, name, role, class_name)
      VALUES (?, ?, ?, 'student', ?)
    `);

    students.forEach(s => {
      stmt.run([s.username, s.password, s.name, s.class_name]);
    });

    stmt.finalize(err => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: `${students.length} akun siswa berhasil diimpor!` });
    });
  });
});

app.delete('/api/admin/students/:id', (req, res) => {
  db.run("DELETE FROM users WHERE id = ? AND role = 'student'", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});


// ================= EXAM MANAGEMENT (TEACHER) =================

// Get all exams
app.get('/api/exams', (req, res) => {
  db.all('SELECT * FROM exams ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create new exam (Supporting Scheduler)
app.post('/api/exams', (req, res) => {
  const { title, class_name, duration, created_by, timer_type, start_time, end_time } = req.body;
  if (!title || !class_name || !duration) {
    return res.status(400).json({ error: 'Data tidak lengkap' });
  }
  db.run(
    'INSERT INTO exams (title, class_name, duration, created_by, timer_type, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [title, class_name, duration, created_by || 1, timer_type || 'duration', start_time || null, end_time || null],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ 
        id: this.lastID, 
        title, 
        class_name, 
        duration, 
        status: 'draft',
        timer_type,
        start_time,
        end_time
      });
    }
  );
});

// Delete exam
app.delete('/api/exams/:id', (req, res) => {
  const examId = req.params.id;
  db.run('DELETE FROM exams WHERE id = ?', [examId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run('DELETE FROM questions WHERE exam_id = ?', [examId], (err2) => {
      if (err2) console.error('Error deleting questions:', err2);
    });
    res.json({ success: true, message: 'Ujian berhasil dihapus' });
  });
});

// Get single exam details (including questions, joined with teacher name and subject)
app.get('/api/exams/:id', (req, res) => {
  const examId = req.params.id;
  db.get(
    `SELECT e.*, u.name as teacher_name, u.subject as teacher_subject 
     FROM exams e 
     JOIN users u ON e.created_by = u.id 
     WHERE e.id = ?`,
    [examId],
    (err, exam) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

      db.all('SELECT * FROM questions WHERE exam_id = ?', [examId], (err2, questions) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ ...exam, questions });
      });
    }
  );
});

// Add questions to an exam (Supporting multiple question types)
app.post('/api/exams/:id/questions', (req, res) => {
  const examId = req.params.id;
  const { questions } = req.body;

  if (!Array.isArray(questions)) {
    return res.status(400).json({ error: 'Format questions harus array' });
  }

  db.serialize(() => {
    // Delete existing questions first to overwrite
    db.run('DELETE FROM questions WHERE exam_id = ?', [examId]);

    const stmt = db.prepare(`
      INSERT INTO questions (exam_id, question_type, question_text, option_a, option_b, option_c, option_d, correct_option, question_image, option_a_image, option_b_image, option_c_image, option_d_image, points)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    questions.forEach((q) => {
      stmt.run([
        examId, 
        q.question_type || 'pg', 
        q.question_text, 
        q.option_a || null, 
        q.option_b || null, 
        q.option_c || null, 
        q.option_d || null, 
        q.correct_option || null,
        q.question_image || null,
        q.option_a_image || null,
        q.option_b_image || null,
        q.option_c_image || null,
        q.option_d_image || null,
        q.points !== undefined && q.points !== null ? parseFloat(q.points) : 1.0
      ]);
    });

    stmt.finalize((err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: 'Soal berhasil disimpan' });
    });
  });
});

// Start Exam (Set Active)
app.post('/api/exams/:id/start', (req, res) => {
  const examId = req.params.id;
  db.run("UPDATE exams SET status = 'active' WHERE id = ?", [examId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, status: 'active' });
  });
});

// Finish Exam (Set Finished)
app.post('/api/exams/:id/finish', (req, res) => {
  const examId = req.params.id;
  db.run("UPDATE exams SET status = 'finished' WHERE id = ?", [examId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    
    // Auto-submit all started student submissions that are not finished
    db.run(
      "UPDATE submissions SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP WHERE exam_id = ? AND status = 'started'",
      [examId],
      (err2) => {
        if (err2) console.error('Error auto-submitting student exams:', err2);
      }
    );

    res.json({ success: true, status: 'finished' });
  });
});

// Get submissions & violations for teacher dashboard (WITH REAL-TIME LEADERBOARD RANKING)
app.get('/api/exams/:id/submissions', (req, res) => {
  const examId = req.params.id;

  // 1. Fetch all attempts for monitoring
  db.all(
    `SELECT s.*, u.name as student_name, u.class_name as student_class,
            (SELECT GROUP_CONCAT(violation_type || ' at ' || timestamp, ' | ') 
             FROM cheat_logs WHERE submission_id = s.id) as logs
     FROM submissions s 
     JOIN users u ON s.student_id = u.id
     WHERE s.exam_id = ? 
     ORDER BY s.attempt DESC, s.started_at DESC`,
    [examId],
    (err, submissions) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const formattedSubmissions = submissions.map(r => ({
        ...r,
        logs: r.logs ? r.logs.split(' | ') : []
      }));

      // 2. Fetch Leaderboard (Rankings based on MAX score for each student)
      db.all(
        `SELECT u.name as student_name, u.class_name as student_class, 
                MAX(s.score) as best_score, 
                MAX(s.attempt) as total_attempts,
                (SELECT status FROM submissions WHERE student_id = u.id AND exam_id = ? ORDER BY attempt DESC LIMIT 1) as latest_status
         FROM submissions s
         JOIN users u ON s.student_id = u.id
         WHERE s.exam_id = ? AND s.status != 'started'
         GROUP BY s.student_id
         ORDER BY best_score DESC`,
        [examId, examId],
        (err2, leaderboard) => {
          if (err2) return res.status(500).json({ error: err2.message });
          
          res.json({
            submissions: formattedSubmissions,
            leaderboard: leaderboard
          });
        }
      );
    }
  );
});


// ================= STUDENT EXAM FLOW =================

// Filter exams matching student's class
app.get('/api/student/exams/:class_name', (req, res) => {
  db.all(
    "SELECT * FROM exams WHERE class_name = ? AND status = 'active' ORDER BY created_at DESC",
    [req.params.class_name],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Student join exam (Handles schedule time validation and retakes)
app.post('/api/student/join', (req, res) => {
  const { exam_id, student_id } = req.body;
  if (!exam_id || !student_id) {
    return res.status(400).json({ error: 'Data tidak lengkap' });
  }

  // Check if exam is active
  db.get('SELECT * FROM exams WHERE id = ?', [exam_id], (err, exam) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan' });
    if (exam.status !== 'active') {
      return res.status(400).json({ error: 'Ujian tidak aktif atau sudah selesai' });
    }

    let durationOverride = exam.duration;

    // Scheduler validation
    if (exam.timer_type === 'schedule') {
      const now = new Date();
      const startTime = new Date(exam.start_time);
      const endTime = new Date(exam.end_time);

      if (now < startTime) {
        const formattedStart = startTime.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
        return res.status(400).json({ error: `Ujian belum dimulai. Jadwal ujian dimulai pada ${formattedStart}` });
      }

      if (now > endTime) {
        return res.status(400).json({ error: `Ujian sudah berakhir. Jadwal ujian telah selesai.` });
      }

      // Calculate remaining minutes
      const remainingMs = endTime - now;
      const remainingMinutes = Math.floor(remainingMs / 60000);
      
      if (remainingMinutes <= 0) {
        return res.status(400).json({ error: `Ujian sudah berakhir.` });
      }

      // Cut full duration if student logged in late
      durationOverride = Math.min(exam.duration, remainingMinutes);
    }

    // Get student's previous submissions to track attempt count
    db.all(
      'SELECT * FROM submissions WHERE exam_id = ? AND student_id = ? ORDER BY attempt DESC',
      [exam_id, student_id],
      (err2, previousSubmissions) => {
        if (err2) return res.status(500).json({ error: err2.message });

        if (previousSubmissions.length > 0) {
          const latestSub = previousSubmissions[0];
          
          if (latestSub.status === 'disqualified') {
            return res.status(403).json({ 
              error: 'Ujian Anda terkunci karena didiskualifikasi. Silakan hubungi guru Anda untuk meminta izin ujian ulang.',
              locked: true,
              submission_id: latestSub.id
            });
          }

          if (latestSub.status === 'started') {
            return fetchQuestionsForStudent(exam, latestSub.id, latestSub.attempt, durationOverride, res);
          }
          
          const newAttemptNumber = latestSub.attempt + 1;
          createNewSubmission(exam, student_id, newAttemptNumber, durationOverride, res);
        } else {
          createNewSubmission(exam, student_id, 1, durationOverride, res);
        }
      }
    );
  });
});

function createNewSubmission(exam, studentId, attemptNumber, durationOverride, res) {
  db.run(
    `INSERT INTO submissions (exam_id, student_id, started_at, status, attempt) 
     VALUES (?, ?, CURRENT_TIMESTAMP, 'started', ?)`,
    [exam.id, studentId, attemptNumber],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      fetchQuestionsForStudent(exam, this.lastID, attemptNumber, durationOverride, res);
    }
  );
}

function fetchQuestionsForStudent(exam, submissionId, attemptNumber, durationOverride, res) {
  // Returns questions without correct answers. Include question_type
  db.all(
    'SELECT id, question_type, question_text, option_a, option_b, option_c, option_d, question_image, option_a_image, option_b_image, option_c_image, option_d_image, points FROM questions WHERE exam_id = ?',
    [exam.id],
    (err, questions) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        submission_id: submissionId,
        exam_title: exam.title,
        duration: durationOverride, // sends recalculated time
        attempt: attemptNumber,
        questions: questions
      });
    }
  );
}

// Student logs violation (Anti-Cheat)
app.post('/api/student/violate', (req, res) => {
  const { submission_id, violation_type } = req.body;
  if (!submission_id || !violation_type) {
    return res.status(400).json({ error: 'Data tidak lengkap' });
  }

  db.get('SELECT * FROM submissions WHERE id = ?', [submission_id], (err, sub) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!sub) return res.status(404).json({ error: 'Submission tidak ditemukan' });
    if (sub.status !== 'started') {
      return res.json({ status: sub.status, message: 'Ujian sudah diserahkan/selesai' });
    }

    const newViolationsCount = sub.violations_count + 1;
    let newStatus = 'started';

    if (newViolationsCount >= 1) {
      newStatus = 'disqualified';
    }

    db.run(
      'UPDATE submissions SET violations_count = ?, status = ? WHERE id = ?',
      [newViolationsCount, newStatus, submission_id],
      (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });

        db.run(
          'INSERT INTO cheat_logs (submission_id, violation_type, timestamp) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [submission_id, violation_type],
          (err3) => {
            if (err3) console.error('Error inserting cheat log:', err3);
          }
        );

        res.json({ 
          success: true, 
          violations_count: newViolationsCount, 
          status: newStatus,
          message: newStatus === 'disqualified' 
            ? 'Anda didiskualifikasi karena keluar dari halaman ujian!' 
            : `Peringatan! Anda keluar dari halaman ujian. (${newViolationsCount}/1)`
        });
      }
    );
  });
});

// Student submits exam & Auto-grades PG, PG Kompleks, and Jodohkan
app.post('/api/student/submit', (req, res) => {
  const { submission_id, answers } = req.body; // answers: { [questionId]: answerValue }
  
  if (!submission_id || !answers) {
    return res.status(400).json({ error: 'Data tidak lengkap' });
  }

  db.get(
    `SELECT s.*, e.id as exam_id, e.status as exam_status 
     FROM submissions s 
     JOIN exams e ON s.exam_id = e.id 
     WHERE s.id = ?`,
    [submission_id],
    (err, sub) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!sub) return res.status(404).json({ error: 'Sesi ujian tidak ditemukan' });
      if (sub.status !== 'started') {
        return res.status(400).json({ error: 'Ujian sudah pernah dikumpulkan' });
      }

      db.all('SELECT * FROM questions WHERE exam_id = ?', [sub.exam_id], (err2, questions) => {
        if (err2) return res.status(500).json({ error: err2.message });

        let totalPoints = 0;
        let earnedPoints = 0;
        let hasGradable = false;

        questions.forEach((q) => {
          if (q.question_type === 'uraian') {
            return;
          }

          hasGradable = true;
          const qPoints = q.points !== undefined && q.points !== null ? parseFloat(q.points) : 1.0;
          totalPoints += qPoints;

          const studentAns = answers[q.id];
          if (!studentAns) return;

          let isCorrect = false;

          if (q.question_type === 'pg') {
            if (String(studentAns).toUpperCase() === String(q.correct_option).toUpperCase()) {
              isCorrect = true;
            }
          } 
          else if (q.question_type === 'pg_kompleks') {
            try {
              const correctArr = JSON.parse(q.correct_option || '[]');
              const studentArr = Array.isArray(studentAns) ? studentAns : JSON.parse(studentAns || '[]');
              
              const sortedCorrect = [...correctArr].sort().join(',');
              const sortedStudent = [...studentArr].sort().join(',');

              if (sortedCorrect.toUpperCase() === sortedStudent.toUpperCase()) {
                isCorrect = true;
              }
            } catch (e) {
              console.error('Error parsing PG Kompleks answer:', e);
            }
          } 
          else if (q.question_type === 'jodohkan') {
            try {
              const correctMap = JSON.parse(q.correct_option || '{}');
              const studentMap = (typeof studentAns === 'object') ? studentAns : JSON.parse(studentAns || '{}');
              
              let isMatch = true;
              const keys = Object.keys(correctMap);
              
              if (keys.length === 0) isMatch = false;

              for (let key of keys) {
                if (correctMap[key] !== studentMap[key]) {
                  isMatch = false;
                  break;
                }
              }

              if (isMatch) {
                isCorrect = true;
              }
            } catch (e) {
              console.error('Error parsing matching answer:', e);
            }
          }

          if (isCorrect) {
            earnedPoints += qPoints;
          }
        });

        const score = earnedPoints;

        db.run(
          `UPDATE submissions 
           SET score = ?, status = 'submitted', submitted_at = CURRENT_TIMESTAMP, answers = ? 
           WHERE id = ?`,
          [score.toFixed(2), JSON.stringify(answers), submission_id],
          (err3) => {
            if (err3) return res.status(500).json({ error: err3.message });
            res.json({ success: true, score: score.toFixed(2) });
          }
        );
      });
    }
  );
});

// Check real-time exam status for student
app.get('/api/student/status/:submission_id', (req, res) => {
  const subId = req.params.submission_id;
  db.get(
    `SELECT s.status as student_status, e.status as exam_status 
     FROM submissions s 
     JOIN exams e ON s.exam_id = e.id 
     WHERE s.id = ?`,
    [subId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Sesi tidak ditemukan' });
      res.json(row);
    }
  );
});

// Request reset/permission for disqualified exam
app.post('/api/submissions/:id/request-reset', (req, res) => {
  const subId = req.params.id;
  db.run(
    "UPDATE submissions SET reset_requested = 1 WHERE id = ? AND status = 'disqualified'",
    [subId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: 'Permintaan izin ujian ulang berhasil dikirim ke guru.' });
    }
  );
});

// Approve reset/permission (Reset submission status to started, clear violations & answers)
app.post('/api/submissions/:id/approve-reset', (req, res) => {
  const subId = req.params.id;
  db.serialize(() => {
    db.run(
      "UPDATE submissions SET status = 'started', violations_count = 0, answers = NULL, score = 0, reset_requested = 0 WHERE id = ?",
      [subId],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        
        db.run('DELETE FROM cheat_logs WHERE submission_id = ?', [subId], (err2) => {
          if (err2) console.error('Error clearing cheat logs:', err2);
        });

        res.json({ success: true, message: 'Izin diberikan. Ujian siswa telah di-reset.' });
      }
    );
  });
});

// ================= SUBMISSION DETAILS & GRADING API =================

app.get('/api/submissions/:id/details', (req, res) => {
  const subId = req.params.id;
  db.get(
    `SELECT s.*, u.name as student_name 
     FROM submissions s
     JOIN users u ON s.student_id = u.id
     WHERE s.id = ?`,
    [subId],
    (err, sub) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!sub) return res.status(404).json({ error: 'Submission tidak ditemukan' });

      db.all(
        'SELECT * FROM questions WHERE exam_id = ?',
        [sub.exam_id],
        (err2, questions) => {
          if (err2) return res.status(500).json({ error: err2.message });

          res.json({
            student_name: sub.student_name,
            answers: JSON.parse(sub.answers || '{}'),
            essay_grades: JSON.parse(sub.essay_grades || '{}'),
            questions: questions
          });
        }
      );
    }
  );
});

app.post('/api/submissions/:submission_id/grade-essay-ai/:question_id', (req, res) => {
  const { submission_id, question_id } = req.params;
  
  db.get('SELECT * FROM submissions WHERE id = ?', [submission_id], (err, sub) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!sub) return res.status(404).json({ error: 'Submission tidak ditemukan' });

    db.get('SELECT * FROM questions WHERE id = ?', [question_id], async (err2, q) => {
      if (err2) return res.status(500).json({ error: err2.message });
      if (!q) return res.status(404).json({ error: 'Pertanyaan tidak ditemukan' });

      const answers = JSON.parse(sub.answers || '{}');
      const studentAnswer = answers[question_id] || '';

      if (!studentAnswer.trim()) {
        return res.json({
          percentage: 0,
          recommended_score: 0,
          explanation: 'Siswa tidak menjawab pertanyaan ini.'
        });
      }

      // Helper function to get gemini keys
      const keysStr = await new Promise((resolve) => {
        db.get("SELECT value FROM settings WHERE key = 'gemini_keys'", [], (errSettings, row) => {
          resolve(row ? row.value : '');
        });
      });

      const keys = (keysStr || '').split('\n').map(k => k.trim()).filter(Boolean);
      if (keys.length === 0) {
        return res.status(400).json({ error: 'API Key Gemini belum dikonfigurasi di menu Pengaturan oleh Admin.' });
      }

      const qPoints = q.points !== undefined && q.points !== null ? parseFloat(q.points) : 1.0;
      const keyJawaban = q.correct_option || 'Tidak ditentukan';

      const prompt = `Anda adalah seorang guru sekolah yang bertugas menilai jawaban uraian siswa secara adil dan objektif.
Pertanyaan: ${q.question_text}
Kunci Jawaban / Pedoman Penilaian: ${keyJawaban} (Catatan: Jika nilainya adalah 'Tidak ditentukan' atau kosong, harap gunakan pengetahuan umum Anda dan standar akademis yang relevan untuk menilai kesesuaian jawaban siswa terhadap pertanyaan tersebut).
Bobot Nilai Maksimal: ${qPoints}
Jawaban Siswa: ${studentAnswer}

Tolong nilai jawaban siswa tersebut. Berikan rekomendasi nilai dalam bentuk persentase kelayakan (0 hingga 100) berdasarkan keakuratan dan kecocokan dengan pedoman penilaian.
Berikan penjelasan ringkas (1-2 kalimat) mengapa Anda memberikan nilai tersebut dalam Bahasa Indonesia.

Format output HARUS berupa JSON murni dengan skema berikut tanpa markdown block atau teks tambahan:
{
  "percentage": 85,
  "explanation": "Jawaban siswa sangat baik dan menjelaskan konsep dengan tepat, namun kurang sedikit detail pada bagian akhir."
}`;

      let successResult = null;
      let lastError = null;

      for (let key of keys) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: "application/json"
              }
            })
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API Error (status ${response.status}): ${errText}`);
          }

          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) throw new Error('API returned an empty content');
          
          successResult = JSON.parse(text);
          break; // Success, break loop!
        } catch (e) {
          console.error(`Error with Gemini Key ${key.substring(0,8)}...:`, e.message);
          lastError = e;
        }
      }

      if (successResult) {
        const percentage = successResult.percentage !== undefined ? parseFloat(successResult.percentage) : 0;
        const recommendedScore = Math.round((percentage / 100) * qPoints * 10) / 10; // Round to 1 decimal place
        res.json({
          percentage,
          recommended_score: recommendedScore,
          explanation: successResult.explanation || 'Penilaian berhasil dilakukan.'
        });
      } else {
        res.status(500).json({ 
          error: 'Gagal menghubungi semua API Key Gemini yang disediakan.', 
          details: lastError ? lastError.message : 'Unknown error' 
        });
      }
    });
  });
});

app.post('/api/submissions/:id/save-essay-grades', (req, res) => {
  const subId = req.params.id;
  const { grades } = req.body; // grades: { [questionId]: { score: number, feedback: string } }

  if (!grades) {
    return res.status(400).json({ error: 'Data grades diperlukan' });
  }

  db.get('SELECT * FROM submissions WHERE id = ?', [subId], (err, sub) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!sub) return res.status(404).json({ error: 'Submission tidak ditemukan' });

    db.all('SELECT * FROM questions WHERE exam_id = ?', [sub.exam_id], (err2, questions) => {
      if (err2) return res.status(500).json({ error: err2.message });

      const answers = JSON.parse(sub.answers || '{}');
      
      // Calculate new total score
      let newScore = 0;
      questions.forEach((q) => {
        if (q.question_type === 'uraian') {
          const essayGrade = grades[q.id];
          if (essayGrade && essayGrade.score !== undefined) {
            newScore += parseFloat(essayGrade.score);
          }
        } else {
          // Re-grade MC questions
          const qPoints = q.points !== undefined && q.points !== null ? parseFloat(q.points) : 1.0;
          const studentAns = answers[q.id];
          if (!studentAns) return;

          let isCorrect = false;
          if (q.question_type === 'pg') {
            if (String(studentAns).toUpperCase() === String(q.correct_option).toUpperCase()) {
              isCorrect = true;
            }
          } else if (q.question_type === 'pg_kompleks') {
            try {
              const correctArr = JSON.parse(q.correct_option || '[]');
              const studentArr = Array.isArray(studentAns) ? studentAns : JSON.parse(studentAns || '[]');
              const sortedCorrect = [...correctArr].sort().join(',');
              const sortedStudent = [...studentArr].sort().join(',');
              if (sortedCorrect.toUpperCase() === sortedStudent.toUpperCase()) isCorrect = true;
            } catch (e) {}
          } else if (q.question_type === 'jodohkan') {
            try {
              const correctMap = JSON.parse(q.correct_option || '{}');
              const studentMap = (typeof studentAns === 'object') ? studentAns : JSON.parse(studentAns || '{}');
              let isMatch = true;
              const keys = Object.keys(correctMap);
              if (keys.length === 0) isMatch = false;
              for (let key of keys) {
                if (correctMap[key] !== studentMap[key]) {
                  isMatch = false;
                  break;
                }
              }
              if (isMatch) isCorrect = true;
            } catch (e) {}
          }

          if (isCorrect) {
            newScore += qPoints;
          }
        }
      });

      db.run(
        'UPDATE submissions SET essay_grades = ?, score = ? WHERE id = ?',
        [JSON.stringify(grades), newScore.toFixed(2), subId],
        (err3) => {
          if (err3) return res.status(500).json({ error: err3.message });
          res.json({ success: true, score: newScore.toFixed(2) });
        }
      );
    });
  });
});

// ================= SETTINGS API =================
app.get('/api/settings', (req, res) => {
  db.all('SELECT key, value FROM settings', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/settings', (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'Key required' });
  db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    [key, value],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, key, value });
    }
  );
});

// Fallback to React static single-page app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running publicly on port ${PORT}`);
});
