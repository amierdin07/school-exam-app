// ================= GLOBAL STATE =================
const API_URL = window.location.origin;

let loginRole = 'student'; // 'admin' | 'teacher' | 'student'
let currentUser = null;

// Teacher States
let activeExam = null;
let questionsList = []; // Local questions while building
let activeQuestionIndex = 0;

// Student States
let studentSubmissionId = null;
let studentActiveExamId = null;
let studentAnswers = {};
let studentViolations = 0;
let studentQuestions = [];
let studentAttemptNumber = 1;

// Admin States
let adminClassesList = [];
let adminStudentsList = []; // Full list of students from DB

// Intervals
let examTimerInterval = null;
let monitorInterval = null;
let studentStatusInterval = null;

// Reusable Custom Confirm Callback
let customConfirmCallback = null;

// ================= INITIALIZATION =================
window.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('currentUser');
  let initialScreen = 'screen-choice';
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      if (currentUser.role === 'admin') {
        initialScreen = 'screen-admin-dashboard';
        switchScreen(initialScreen, 'replace');
        switchAdminTab('classes');
      } else if (currentUser.role === 'teacher') {
        initialScreen = 'screen-guru-dashboard';
        switchScreen(initialScreen, 'replace');
        loadTeacherExams();
      } else {
        initialScreen = 'screen-student-dashboard';
        switchScreen(initialScreen, 'replace');
        loadStudentDashboard();
      }
      history.replaceState({ screenId: initialScreen }, '', '#' + initialScreen);
      return;
    } catch(e) {
      console.error("Error restoring session:", e);
      localStorage.removeItem('currentUser');
    }
  }
  switchScreen(initialScreen, 'replace');
  history.replaceState({ screenId: initialScreen }, '', '#' + initialScreen);
});

// ================= CUSTOM MODALS (ALERT & CONFIRM) =================
function showCustomAlert(title, message, type = 'info') {
  const modal = document.getElementById('custom-alert-modal');
  const iconContainer = document.getElementById('custom-alert-icon');
  const titleEl = document.getElementById('custom-alert-title');
  const messageEl = document.getElementById('custom-alert-message');

  // Set colors and icon
  iconContainer.className = `custom-modal-icon ${type}`;
  let iconHtml = '<i class="fa-solid fa-circle-info"></i>';
  if (type === 'success') iconHtml = '<i class="fa-solid fa-circle-check"></i>';
  else if (type === 'warning') iconHtml = '<i class="fa-solid fa-triangle-exclamation"></i>';
  else if (type === 'danger') iconHtml = '<i class="fa-solid fa-ban"></i>';
  iconContainer.innerHTML = iconHtml;

  titleEl.innerText = title;
  messageEl.innerText = message;

  modal.classList.add('active');
}

function closeCustomAlert() {
  document.getElementById('custom-alert-modal').classList.remove('active');
}

function showCustomConfirm(title, message, onConfirm, type = 'warning') {
  const modal = document.getElementById('custom-confirm-modal');
  const iconContainer = document.getElementById('custom-confirm-icon');
  const titleEl = document.getElementById('custom-confirm-title');
  const messageEl = document.getElementById('custom-confirm-message');

  iconContainer.className = `custom-modal-icon ${type}`;
  let iconHtml = '<i class="fa-solid fa-triangle-exclamation"></i>';
  if (type === 'danger') iconHtml = '<i class="fa-solid fa-circle-xmark"></i>';
  iconContainer.innerHTML = iconHtml;

  titleEl.innerText = title;
  messageEl.innerText = message;

  customConfirmCallback = onConfirm;
  modal.classList.add('active');
}

function closeCustomConfirm(isConfirmed) {
  document.getElementById('custom-confirm-modal').classList.remove('active');
  if (isConfirmed && customConfirmCallback) {
    customConfirmCallback();
  }
  customConfirmCallback = null;
}

// ================= SWITCH SCREEN =================
function switchScreen(screenId, historyAction = 'push') {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });

  const targetScreen = document.getElementById(screenId);
  if (targetScreen) {
    targetScreen.classList.add('active');
  }

  renderHeaderNav();

  if (screenId !== 'screen-exam-monitor' && monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  if (screenId !== 'screen-student-exam' && studentStatusInterval) {
    clearInterval(studentStatusInterval);
    studentStatusInterval = null;
  }

  if (historyAction === 'push') {
    history.pushState({ screenId: screenId }, '', '#' + screenId);
  } else if (historyAction === 'replace') {
    history.replaceState({ screenId: screenId }, '', '#' + screenId);
  }
}

// ================= HISTORY BACK BUTTON HANDLING =================
window.addEventListener('popstate', (event) => {
  const state = event.state;
  if (state && state.screenId) {
    const isExamActive = document.getElementById('screen-student-exam').classList.contains('active');
    
    if (isExamActive) {
      // Revert history change to prevent leaving immediately
      history.pushState({ screenId: 'screen-student-exam' }, '', '#screen-student-exam');
      showCustomConfirm(
        'Keluar Ujian?',
        'Apakah Anda yakin ingin keluar dari halaman ujian? Tindakan ini akan dicatat sebagai pelanggaran!',
        () => {
          submitExam(true);
          switchScreen(state.screenId, 'none');
        }
      );
    } else {
      switchScreen(state.screenId, 'none');
    }
  } else {
    // If no state, fall back to choice screen
    const isExamActive = document.getElementById('screen-student-exam').classList.contains('active');
    if (isExamActive) {
      history.pushState({ screenId: 'screen-student-exam' }, '', '#screen-student-exam');
    } else {
      switchScreen('screen-choice', 'none');
    }
  }
});

function renderHeaderNav() {
  const navActions = document.getElementById('nav-actions');
  if (!navActions) return;

  if (currentUser) {
    let roleLabel = 'Siswa';
    if (currentUser.role === 'admin') roleLabel = 'Admin';
    if (currentUser.role === 'teacher') roleLabel = `Guru (${currentUser.subject})`;

    navActions.innerHTML = `
      <div class="nav-user"><i class="fa-solid fa-circle-user"></i> ${currentUser.name} (${roleLabel})</div>
      <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="handleLogout()"><i class="fa-solid fa-right-from-bracket"></i> Keluar</button>
    `;
  } else {
    navActions.innerHTML = '';
  }
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem('currentUser');
  studentSubmissionId = null;
  studentActiveExamId = null;
  studentQuestions = [];
  studentAnswers = {};
  if (examTimerInterval) clearInterval(examTimerInterval);
  if (monitorInterval) clearInterval(monitorInterval);
  if (studentStatusInterval) clearInterval(studentStatusInterval);
  switchScreen('screen-choice', 'replace');
}

// ================= LOGIN ROUTING =================
function openLoginScreen(role) {
  loginRole = role;
  const titleEl = document.getElementById('login-title-role');
  const subEl = document.getElementById('login-subtitle-desc');

  if (role === 'admin') {
    titleEl.innerText = 'Admin';
    subEl.innerText = 'Masuk untuk mengelola master data sekolah';
  } else if (role === 'teacher') {
    titleEl.innerText = 'Guru';
    subEl.innerText = 'Masuk untuk membuat bank soal dan mengawasi ujian';
  } else {
    titleEl.innerText = 'Siswa';
    subEl.innerText = 'Masuk untuk mengerjakan ujian Anda';
  }

  document.getElementById('form-login').reset();
  switchScreen('screen-login');
}

async function handleLogin(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('username').value;
  const passwordInput = document.getElementById('password').value;

  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameInput, password: passwordInput })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login gagal');

    if (data.role !== loginRole) {
      throw new Error(`User ini tidak terdaftar sebagai ${loginRole.toUpperCase()}`);
    }

    currentUser = data;
    localStorage.setItem('currentUser', JSON.stringify(data));

    if (currentUser.role === 'admin') {
      switchScreen('screen-admin-dashboard', 'replace');
      switchAdminTab('classes');
    } else if (currentUser.role === 'teacher') {
      switchScreen('screen-guru-dashboard', 'replace');
      loadTeacherExams();
    } else {
      switchScreen('screen-student-dashboard', 'replace');
      loadStudentDashboard();
    }
  } catch (err) {
    showCustomAlert('Login Gagal', err.message, 'danger');
  }
}

// ================= ================= =================
// =================    ADMIN DASHBOARD CONTROL   =================
// ================= ================= =================
function switchAdminTab(tabName) {
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeTabBtn = document.getElementById(`tab-${tabName}`);
  if (activeTabBtn) activeTabBtn.classList.add('active');

  document.querySelectorAll('.admin-panel-content').forEach(panel => {
    panel.classList.remove('active');
  });
  const activePanel = document.getElementById(`panel-${tabName}`);
  if (activePanel) activePanel.classList.add('active');

  if (tabName === 'classes') {
    loadAdminClasses();
  } else if (tabName === 'teachers') {
    loadAdminTeachers();
  } else if (tabName === 'students') {
    loadAdminStudents();
  } else if (tabName === 'monitor') {
    loadAdminMonitorExams();
  } else if (tabName === 'settings') {
    loadAdminSettings();
  }
}

// 1. ADMIN TAB: CLASSES
async function loadAdminClasses() {
  try {
    const res = await fetch(`${API_URL}/api/admin/classes`);
    const classes = await res.json();
    adminClassesList = classes;
    
    const tbody = document.getElementById('admin-classes-list');
    tbody.innerHTML = '';

    classes.forEach(c => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${c.id}</td>
        <td><strong>${escapeHTML(c.name)}</strong></td>
        <td><button class="btn-danger" style="padding: 6px 12px; font-size: 0.8rem;" onclick="deleteAdminClass(${c.id})"><i class="fa-solid fa-trash"></i> Hapus</button></td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error('Error loading classes:', err);
  }
}

async function handleAddClass(e) {
  e.preventDefault();
  const name = document.getElementById('class-name').value;
  try {
    const res = await fetch(`${API_URL}/api/admin/classes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById('form-add-class').reset();
    loadAdminClasses();
  } catch (err) {
    showCustomAlert('Gagal', err.message, 'danger');
  }
}

function deleteAdminClass(id) {
  showCustomConfirm('Hapus Kelas?', 'Hapus kelas ini? Siswa dan ujian yang terikat pada kelas ini dapat terdampak.', async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/classes/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus kelas');
      loadAdminClasses();
    } catch (err) {
      showCustomAlert('Gagal', err.message, 'danger');
    }
  });
}

// 2. ADMIN TAB: TEACHERS
async function loadAdminTeachers() {
  try {
    const res = await fetch(`${API_URL}/api/admin/teachers`);
    const teachers = await res.json();

    const tbody = document.getElementById('admin-teachers-list');
    tbody.innerHTML = '';

    teachers.forEach(t => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${escapeHTML(t.name)}</strong></td>
        <td><span class="exam-status-tag status-active" style="text-transform:none;">${escapeHTML(t.subject)}</span></td>
        <td><code>${escapeHTML(t.username)}</code></td>
        <td><code>${escapeHTML(t.password)}</code></td>
        <td><button class="btn-danger" style="padding: 6px 12px; font-size: 0.8rem;" onclick="deleteAdminTeacher(${t.id})"><i class="fa-solid fa-trash"></i> Hapus</button></td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error('Error loading teachers:', err);
  }
}

async function handleAddTeacher(e) {
  e.preventDefault();
  const name = document.getElementById('teacher-name').value;
  const subject = document.getElementById('teacher-subject').value;
  const username = document.getElementById('teacher-username').value;
  const password = document.getElementById('teacher-password').value;

  try {
    const res = await fetch(`${API_URL}/api/admin/teachers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, subject, username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById('form-add-teacher').reset();
    loadAdminTeachers();
  } catch (err) {
    showCustomAlert('Gagal', err.message, 'danger');
  }
}

function deleteAdminTeacher(id) {
  showCustomConfirm('Hapus Akun Guru?', 'Apakah Anda yakin ingin menghapus akun guru ini?', async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/teachers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus akun guru');
      loadAdminTeachers();
    } catch (err) {
      showCustomAlert('Gagal', err.message, 'danger');
    }
  });
}

// 3. ADMIN TAB: STUDENTS
async function loadAdminStudents() {
  try {
    const classesRes = await fetch(`${API_URL}/api/admin/classes`);
    const classes = await classesRes.json();
    adminClassesList = classes;

    // Populate class selection dropdown for student form
    const classSelect = document.getElementById('student-class-select');
    classSelect.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>';
    classes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.innerText = c.name;
      classSelect.appendChild(opt);
    });

    // Populate class filter dropdown
    const classFilter = document.getElementById('admin-student-class-filter');
    classFilter.innerHTML = '<option value="" selected>-- Pilih Kelas --</option>';
    classes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.innerText = c.name;
      classFilter.appendChild(opt);
    });

    // Reset table visibility
    document.getElementById('admin-student-table-container').style.display = 'none';
    document.getElementById('admin-student-empty-msg').style.display = 'block';

    // Fetch all students in background
    const studentsRes = await fetch(`${API_URL}/api/admin/students`);
    adminStudentsList = await studentsRes.json();

  } catch (err) {
    console.error('Error loading students:', err);
  }
}

function loadAdminStudentsFiltered() {
  const selectedClass = document.getElementById('admin-student-class-filter').value;
  const tbody = document.getElementById('admin-students-list');
  const tableContainer = document.getElementById('admin-student-table-container');
  const emptyMsg = document.getElementById('admin-student-empty-msg');

  tbody.innerHTML = '';

  if (!selectedClass) {
    tableContainer.style.display = 'none';
    emptyMsg.style.display = 'block';
    return;
  }

  const filteredStudents = adminStudentsList.filter(s => s.class_name === selectedClass);

  if (filteredStudents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px 0;">Belum ada siswa terdaftar di kelas ${selectedClass}.</td></tr>`;
  } else {
    filteredStudents.forEach(s => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${escapeHTML(s.name)}</strong></td>
        <td><span class="exam-status-tag status-draft" style="color:#fff; text-transform:none;">${escapeHTML(s.class_name)}</span></td>
        <td><code>${escapeHTML(s.username)}</code></td>
        <td><code>${escapeHTML(s.password)}</code></td>
        <td><button class="btn-danger" style="padding: 6px 12px; font-size: 0.8rem;" onclick="deleteAdminStudent(${s.id})"><i class="fa-solid fa-trash"></i> Hapus</button></td>
      `;
      tbody.appendChild(row);
    });
  }

  tableContainer.style.display = 'block';
  emptyMsg.style.display = 'none';
}

async function handleAddStudent(e) {
  e.preventDefault();
  const name = document.getElementById('student-fullname').value;
  const class_name = document.getElementById('student-class-select').value;
  const username = document.getElementById('student-username').value;
  const password = document.getElementById('student-password').value;

  try {
    const res = await fetch(`${API_URL}/api/admin/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, class_name, username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById('form-add-student').reset();
    
    // Refresh student data
    const studentsRes = await fetch(`${API_URL}/api/admin/students`);
    adminStudentsList = await studentsRes.json();

    // Re-trigger filter rendering
    loadAdminStudentsFiltered();
  } catch (err) {
    showCustomAlert('Gagal', err.message, 'danger');
  }
}

function deleteAdminStudent(id) {
  showCustomConfirm('Hapus Akun Siswa?', 'Hapus siswa ini? Semua nilai ujiannya juga akan terhapus.', async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/students/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus siswa');
      
      // Refresh list
      const studentsRes = await fetch(`${API_URL}/api/admin/students`);
      adminStudentsList = await studentsRes.json();
      loadAdminStudentsFiltered();
    } catch (err) {
      showCustomAlert('Gagal', err.message, 'danger');
    }
  });
}

// 4. ADMIN TAB: ACTIVE EXAMS MONITOR
async function loadAdminMonitorExams() {
  try {
    const res = await fetch(`${API_URL}/api/exams`);
    const exams = await res.json();

    const container = document.getElementById('admin-active-exams-list');
    container.innerHTML = '';

    const activeExams = exams.filter(e => e.status === 'active');

    if (activeExams.length === 0) {
      container.innerHTML = `
        <div class="form-container" style="max-width: 100%; text-align: center; margin: 20px 0;">
          <p style="color: var(--text-secondary);">Saat ini tidak ada ujian kelas yang sedang berjalan di sekolah.</p>
        </div>
      `;
      return;
    }

    activeExams.forEach(exam => {
      const card = document.createElement('div');
      card.className = 'exam-card';
      card.innerHTML = `
        <div>
          <h3>${exam.title}</h3>
          <div class="exam-meta">
            <span><i class="fa-solid fa-school"></i> Kelas: ${exam.class_name}</span>
            <span><i class="fa-regular fa-clock"></i> Durasi: ${exam.duration} Menit</span>
          </div>
          <span class="exam-status-tag status-active"><i class="fa-solid fa-spinner fa-spin"></i> Berlangsung</span>
        </div>
        <div class="exam-card-actions">
          <button class="btn-info btn-block" onclick="openExamMonitor(${exam.id}, '${exam.title}')"><i class="fa-solid fa-tv"></i> Monitor Ujian</button>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading active exams for admin:', err);
  }
}


// ================= ================= =================
// =================    SISWA DASHBOARD FLOW     =================
// ================= ================= =================
async function loadStudentDashboard() {
  document.getElementById('student-dashboard-welcome').innerText = `Selamat datang, ${currentUser.name} (Kelas ${currentUser.class_name})`;
  
  try {
    const res = await fetch(`${API_URL}/api/student/exams/${encodeURIComponent(currentUser.class_name)}`);
    const exams = await res.json();

    const examsList = document.getElementById('student-active-exams-list');
    examsList.innerHTML = '';

    if (exams.length === 0) {
      examsList.innerHTML = `
        <div class="form-container" style="max-width: 100%; text-align: center; margin: 20px 0;">
          <p style="color: var(--text-secondary);">Saat ini tidak ada ujian aktif untuk kelas Anda (${currentUser.class_name}).</p>
        </div>
      `;
      return;
    }

    exams.forEach(exam => {
      const card = document.createElement('div');
      card.className = 'exam-card';
      card.innerHTML = `
        <div>
          <h3>${exam.title}</h3>
          <div class="exam-meta">
            <span><i class="fa-regular fa-clock"></i> Durasi: ${exam.duration} Menit</span>
          </div>
          <span class="exam-status-tag status-active"><i class="fa-solid fa-spinner fa-spin"></i> Ujian Aktif</span>
        </div>
        <div class="exam-card-actions">
          <button class="btn-primary btn-block" onclick="studentJoinExam(${exam.id})">Mulai Mengerjakan <i class="fa-solid fa-circle-play"></i></button>
        </div>
      `;
      examsList.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading student exams:', err);
  }
}

async function studentJoinExam(examId) {
  try {
    const res = await fetch(`${API_URL}/api/student/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exam_id: examId, student_id: currentUser.id })
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 403 && data.locked) {
        showCustomConfirm(
          'Ujian Terkunci',
          `${data.error}\n\nApakah Anda ingin mengirim permintaan izin ujian ulang ke guru sekarang?`,
          async () => {
            try {
              const reqRes = await fetch(`${API_URL}/api/submissions/${data.submission_id}/request-reset`, {
                method: 'POST'
              });
              const reqData = await reqRes.json();
              if (!reqRes.ok) throw new Error(reqData.error);
              showCustomAlert('Sukses', reqData.message, 'success');
            } catch (errReq) {
              showCustomAlert('Gagal', errReq.message, 'danger');
            }
          }
        );
        return;
      }
      throw new Error(data.error);
    }

    studentActiveExamId = examId;
    studentSubmissionId = data.submission_id;
    studentQuestions = data.questions || [];
    studentAnswers = {};
    studentViolations = 0;
    activeQuestionIndex = 0;
    studentAttemptNumber = data.attempt;

    if (studentQuestions.length === 0) {
      throw new Error('Ujian tidak memiliki soal untuk dikerjakan.');
    }

    document.getElementById('student-exam-title').innerText = data.exam_title;
    document.getElementById('student-profile-display').innerHTML = `<i class="fa-solid fa-user"></i> ${currentUser.name} (${currentUser.class_name})`;
    document.getElementById('student-attempt-num').innerText = studentAttemptNumber;

    updateViolationsUI();
    startExamTimer(data.duration);
    buildExamNavGrid();
    renderStudentQuestion(0);
    startStudentStatusLoop();
    activateAntiCheat();

    switchScreen('screen-student-exam');

  } catch (err) {
    showCustomAlert('Gagal', err.message, 'danger');
  }
}

function goToStudentDashboard() {
  switchScreen('screen-student-dashboard');
  loadStudentDashboard();
}

async function retakeActiveExam() {
  if (studentActiveExamId) {
    studentJoinExam(studentActiveExamId);
  } else {
    goToStudentDashboard();
  }
}


// ================= ================= =================
// =================    GURU DASHBOARD FLOW      =================
// ================= ================= =================
async function loadTeacherExams() {
  try {
    const res = await fetch(`${API_URL}/api/exams`);
    const exams = await res.json();

    const examsListContainer = document.getElementById('exams-list');
    examsListContainer.innerHTML = '';

    if (exams.length === 0) {
      examsListContainer.innerHTML = `
        <div class="form-container" style="max-width: 100%; text-align: center; margin: 20px 0;">
          <p style="color: var(--text-secondary);">Belum ada ujian dibuat. Klik tombol di kanan atas untuk membuat.</p>
        </div>
      `;
      return;
    }

    exams.forEach(exam => {
      let statusClass = 'status-draft';
      let statusLabel = 'Draf';
      if (exam.status === 'active') {
        statusClass = 'status-active';
        statusLabel = 'Berlangsung';
      } else if (exam.status === 'finished') {
        statusClass = 'status-finished';
        statusLabel = 'Selesai';
      }

      let scheduleInfo = '';
      if (exam.timer_type === 'schedule' && exam.start_time && exam.end_time) {
        try {
          const startStr = new Date(exam.start_time).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
          const endStr = new Date(exam.end_time).toLocaleString('id-ID', { timeStyle: 'short' });
          scheduleInfo = ` <span style="font-size:0.8rem; color:var(--text-secondary);">(${startStr} - ${endStr})</span>`;
        } catch(e) {
          console.error(e);
        }
      }

      const card = document.createElement('div');
      card.className = 'exam-card';
      card.innerHTML = `
        <div>
          <h3>${exam.title}</h3>
          <div class="exam-meta">
            <span><i class="fa-solid fa-school"></i> Kelas: ${exam.class_name}</span>
            <span><i class="fa-regular fa-clock"></i> Durasi: ${exam.duration} Menit${scheduleInfo}</span>
            <span><i class="fa-regular fa-calendar"></i> Dibuat: ${new Date(exam.created_at).toLocaleDateString('id-ID')}</span>
          </div>
          <span class="exam-status-tag ${statusClass}">${statusLabel}</span>
        </div>
        <div class="exam-card-actions">
          ${exam.status === 'draft' ? `
            <button class="btn-primary" onclick="openEditQuestions(${exam.id})"><i class="fa-solid fa-list-check"></i> Edit Soal</button>
            <button class="btn-success" onclick="startExam(${exam.id})"><i class="fa-solid fa-play"></i> Mulai</button>
          ` : ''}
          ${exam.status === 'active' ? `
            <button class="btn-info" onclick="openExamMonitor(${exam.id}, '${exam.title}')"><i class="fa-solid fa-tv"></i> Monitor</button>
          ` : ''}
          ${exam.status === 'finished' ? `
            <button class="btn-secondary" onclick="openExamMonitor(${exam.id}, '${exam.title}', true)"><i class="fa-solid fa-chart-simple"></i> Lihat Hasil</button>
          ` : ''}
          <button class="btn-danger" style="flex: 0; padding: 10px 14px;" onclick="deleteExam(${exam.id})"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;
      examsListContainer.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading exams:', err);
  }
}

async function openCreateExamModal() {
  try {
    const res = await fetch(`${API_URL}/api/admin/classes`);
    const classes = await res.json();
    const select = document.getElementById('exam-class-select');
    select.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>';
    classes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.innerText = c.name;
      select.appendChild(opt);
    });

    document.getElementById('modal-create-exam').classList.add('active');
  } catch (err) {
    showCustomAlert('Gagal', 'Gagal memuat daftar kelas: ' + err.message, 'danger');
  }
}

function toggleTimerTypeInputs() {
  const timerType = document.getElementById('exam-timer-type').value;
  const scheduleContainer = document.getElementById('container-schedule-inputs');
  const durationGroup = document.getElementById('group-exam-duration');
  const durationInput = document.getElementById('exam-duration');
  const startTimeInput = document.getElementById('exam-start-time');
  const endTimeInput = document.getElementById('exam-end-time');

  if (timerType === 'schedule') {
    scheduleContainer.style.display = 'flex';
    durationGroup.style.display = 'none';
    durationInput.required = false;
    durationInput.value = '';
    startTimeInput.required = true;
    endTimeInput.required = true;
  } else {
    scheduleContainer.style.display = 'none';
    durationGroup.style.display = 'block';
    durationInput.required = true;
    startTimeInput.required = false;
    endTimeInput.required = false;
    startTimeInput.value = '';
    endTimeInput.value = '';
  }
}

function closeCreateExamModal() {
  document.getElementById('modal-create-exam').classList.remove('active');
  document.getElementById('form-create-exam').reset();
  toggleTimerTypeInputs();
}

async function handleCreateExam(e) {
  e.preventDefault();
  const title = document.getElementById('exam-title').value;
  const class_name = document.getElementById('exam-class-select').value;
  const timer_type = document.getElementById('exam-timer-type').value;
  const start_time = document.getElementById('exam-start-time').value;
  const end_time = document.getElementById('exam-end-time').value;

  let duration = 0;
  if (timer_type === 'schedule') {
    const startMs = new Date(start_time).getTime();
    const endMs = new Date(end_time).getTime();
    duration = Math.floor((endMs - startMs) / 60000);
    
    if (isNaN(duration) || duration <= 0) {
      return showCustomAlert('Gagal', 'Waktu selesai harus setelah waktu mulai.', 'warning');
    }
  } else {
    duration = parseInt(document.getElementById('exam-duration').value);
    if (isNaN(duration) || duration <= 0) {
      return showCustomAlert('Gagal', 'Durasi harus lebih dari 0 menit.', 'warning');
    }
  }

  try {
    const res = await fetch(`${API_URL}/api/exams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        title, 
        class_name, 
        duration, 
        created_by: currentUser.id,
        timer_type,
        start_time: timer_type === 'schedule' ? start_time : null,
        end_time: timer_type === 'schedule' ? end_time : null
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    closeCreateExamModal();
    loadTeacherExams();
    openEditQuestions(data.id);
  } catch (err) {
    showCustomAlert('Gagal', err.message, 'danger');
  }
}

function deleteExam(id) {
  showCustomConfirm('Hapus Ujian?', 'Apakah Anda yakin ingin menghapus ujian ini? Semua data soal dan nilai siswa akan hilang permanen.', async () => {
    try {
      const res = await fetch(`${API_URL}/api/exams/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus ujian');
      loadTeacherExams();
    } catch (err) {
      showCustomAlert('Gagal', err.message, 'danger');
    }
  });
}

// ================= GURU: QUESTION BUILDER =================
async function openEditQuestions(examId) {
  try {
    const res = await fetch(`${API_URL}/api/exams/${examId}`);
    const exam = await res.json();
    if (!res.ok) throw new Error(exam.error);

    activeExam = exam;
    questionsList = exam.questions || [];
    
    document.getElementById('edit-questions-title').innerHTML = `Kelola Soal Ujian: <span class="gradient-text">${exam.title}</span>`;
    resetQuestionForm();
    renderLocalQuestions();
    switchScreen('screen-edit-questions');
  } catch (err) {
    showCustomAlert('Gagal', err.message, 'danger');
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

async function previewImage(input, previewId) {
  const preview = document.getElementById(previewId);
  const file = input.files[0];
  const removeBtnId = 'btn-remove-' + previewId.replace('-preview', '');
  const removeBtn = document.getElementById(removeBtnId);

  if (file) {
    try {
      const base64 = await fileToBase64(file);
      preview.src = base64;
      preview.style.display = 'block';
      if (removeBtn) removeBtn.style.display = 'inline-flex';
    } catch (err) {
      console.error("Error converting file to Base64:", err);
    }
  }
}

function removeImage(inputId, previewId) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  const removeBtnId = 'btn-remove-' + previewId.replace('-preview', '');
  const removeBtn = document.getElementById(removeBtnId);

  if (input) input.value = '';
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  if (removeBtn) removeBtn.style.display = 'none';
}

function toggleQuestionTypeInputs() {
  const type = document.getElementById('q-type').value;
  
  // Hide all sections first
  document.querySelectorAll('.q-type-section').forEach(el => el.style.display = 'none');
  
  if (type === 'pg') {
    document.getElementById('container-pg-inputs').style.display = 'block';
    document.getElementById('container-key-single').style.display = 'block';
    document.getElementById('container-key-multi').style.display = 'none';
  } else if (type === 'pg_kompleks') {
    document.getElementById('container-pg-inputs').style.display = 'block';
    document.getElementById('container-key-single').style.display = 'none';
    document.getElementById('container-key-multi').style.display = 'block';
  } else if (type === 'jodohkan') {
    document.getElementById('container-jodohkan-inputs').style.display = 'block';
  } else if (type === 'uraian') {
    document.getElementById('container-uraian-inputs').style.display = 'block';
  }
}

function renderLocalQuestions() {
  const container = document.getElementById('questions-list-container');
  container.innerHTML = '';
  document.getElementById('q-count').innerText = questionsList.length;

  if (questionsList.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-muted); margin: 20px 0;">Belum ada soal. Gunakan formulir di sebelah kiri atau import Excel/Word.</p>`;
    return;
  }

  questionsList.forEach((q, index) => {
    const card = document.createElement('div');
    card.className = 'q-item-card';
    
    const type = q.question_type || 'pg';
    let typeBadge = '';
    let detailsHTML = '';
    const pointsVal = q.points !== undefined && q.points !== null ? q.points : 1.0;
    const pointsBadge = `<span class="violations-badge warning" style="font-size:0.75rem; padding: 2px 8px; margin-left:8px; border-radius:12px; color:var(--text-primary);"><i class="fa-solid fa-star" style="color:var(--color-warning);"></i> Bobot: ${pointsVal}</span>`;

    const renderOptionMarkup = (labelLetter, optionText, optionImageBase64, isCorrect) => {
      const imgMarkup = optionImageBase64 ? `<img src="${optionImageBase64}" class="opt-image-display" style="max-width:100px; max-height:75px; margin-top:5px; border-radius:4px;">` : '';
      return `
        <div style="display:flex; flex-direction:column; margin-bottom: 6px;" class="${isCorrect ? 'correct' : ''}">
          <span><strong>${labelLetter}.</strong> ${escapeHTML(optionText)}</span>
          ${imgMarkup}
        </div>
      `;
    };

    if (type === 'pg') {
      typeBadge = '<span class="exam-status-tag status-active" style="padding:2px 8px; font-size:0.75rem; text-transform:none;">Pilihan Ganda</span>';
      detailsHTML = `
        <div class="q-item-options" style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
          ${renderOptionMarkup('A', q.option_a, q.option_a_image, q.correct_option === 'A')}
          ${renderOptionMarkup('B', q.option_b, q.option_b_image, q.correct_option === 'B')}
          ${renderOptionMarkup('C', q.option_c, q.option_c_image, q.correct_option === 'C')}
          ${renderOptionMarkup('D', q.option_d, q.option_d_image, q.correct_option === 'D')}
        </div>
      `;
    } 
    else if (type === 'pg_kompleks') {
      typeBadge = '<span class="exam-status-tag status-draft" style="padding:2px 8px; font-size:0.75rem; color:#fff; text-transform:none;">PG Kompleks</span>';
      let correctArr = [];
      try {
        correctArr = (typeof q.correct_option === 'string') ? JSON.parse(q.correct_option || '[]') : (q.correct_option || []);
      } catch(e) {
        correctArr = [];
      }
      detailsHTML = `
        <div class="q-item-options" style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
          ${renderOptionMarkup('A', q.option_a, q.option_a_image, correctArr.includes('A'))}
          ${renderOptionMarkup('B', q.option_b, q.option_b_image, correctArr.includes('B'))}
          ${renderOptionMarkup('C', q.option_c, q.option_c_image, correctArr.includes('C'))}
          ${renderOptionMarkup('D', q.option_d, q.option_d_image, correctArr.includes('D'))}
        </div>
      `;
    } 
    else if (type === 'jodohkan') {
      typeBadge = '<span class="exam-status-tag status-finished" style="padding:2px 8px; font-size:0.75rem; text-transform:none;">Menjodohkan</span>';
      let correctMap = {};
      try {
        correctMap = (typeof q.correct_option === 'string') ? JSON.parse(q.correct_option || '{}') : (q.correct_option || {});
      } catch(e) {
        correctMap = {};
      }
      let pairsList = '';
      Object.keys(correctMap).forEach(key => {
        pairsList += `<li><code>${escapeHTML(key)}</code> <i class="fa-solid fa-right-long" style="color:var(--secondary-color)"></i> <code>${escapeHTML(correctMap[key])}</code></li>`;
      });
      
      const allRights = (q.option_b || '').split('|');
      const correctRightValues = Object.values(correctMap);
      const distractors = allRights.filter(r => !correctRightValues.includes(r));
      let distList = distractors.map(d => `<code>${escapeHTML(d)}</code>`).join(', ') || 'Tidak ada';

      detailsHTML = `
        <div style="font-size:0.85rem; margin-top:10px; border:1px solid var(--panel-border); padding:10px; border-radius:6px; background:rgba(0,0,0,0.1)">
          <strong style="color:var(--color-success)">Kunci Pasangan:</strong>
          <ul style="padding-left:15px; margin-top:5px; display:flex; flex-direction:column; gap:4px; list-style-type:none;">${pairsList}</ul>
          <div style="margin-top:8px;">
            <strong style="color:var(--color-warning)">Pengecoh:</strong> ${distList}
          </div>
        </div>
      `;
    } 
    else if (type === 'uraian') {
      typeBadge = '<span class="exam-status-tag" style="background:#8b5cf6; color:white; padding:2px 8px; font-size:0.75rem; text-transform:none;">Uraian</span>';
      detailsHTML = `
        <div style="font-size:0.85rem; margin-top:10px; color:var(--text-secondary); font-style:italic;">
          * Jawaban esai diisi langsung oleh siswa dalam kotak teks.
        </div>
      `;
    }

    const questionImgMarkup = q.question_image ? `<img src="${q.question_image}" class="q-image-display" style="max-height:150px; margin-top:10px; border-radius:6px;">` : '';

    card.innerHTML = `
      <div class="q-item-header">
        <span>Soal #${index + 1} ${typeBadge} ${pointsBadge}</span>
        <div class="q-item-actions">
          <button onclick="editLocalQuestion(${index})"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
          <button onclick="deleteLocalQuestion(${index})" class="text-danger"><i class="fa-solid fa-trash"></i> Hapus</button>
        </div>
      </div>
      <p class="q-item-text">${escapeHTML(q.question_text)}</p>
      ${questionImgMarkup}
      ${detailsHTML}
    `;
    container.appendChild(card);
  });
}

function handleSaveQuestion(e) {
  e.preventDefault();
  const indexVal = document.getElementById('edit-q-index').value;
  const question_type = document.getElementById('q-type').value;
  const question_text = document.getElementById('q-text').value;

  const qImgEl = document.getElementById('q-image-preview');
  const question_image = qImgEl.style.display !== 'none' ? qImgEl.src : null;

  let option_a = null;
  let option_b = null;
  let option_c = null;
  let option_d = null;
  let option_a_image = null;
  let option_b_image = null;
  let option_c_image = null;
  let option_d_image = null;
  let correct_option = null;

  if (question_type === 'pg' || question_type === 'pg_kompleks') {
    option_a = document.getElementById('opt-a').value.trim();
    option_b = document.getElementById('opt-b').value.trim();
    option_c = document.getElementById('opt-c').value.trim();
    option_d = document.getElementById('opt-d').value.trim();

    if (!option_a || !option_b || !option_c || !option_d) {
      return showCustomAlert('Gagal', 'Semua pilihan A-D wajib diisi untuk pilihan ganda.', 'warning');
    }

    const optAImgEl = document.getElementById('opt-a-image-preview');
    option_a_image = optAImgEl.style.display !== 'none' ? optAImgEl.src : null;
    const optBImgEl = document.getElementById('opt-b-image-preview');
    option_b_image = optBImgEl.style.display !== 'none' ? optBImgEl.src : null;
    const optCImgEl = document.getElementById('opt-c-image-preview');
    option_c_image = optCImgEl.style.display !== 'none' ? optCImgEl.src : null;
    const optDImgEl = document.getElementById('opt-d-image-preview');
    option_d_image = optDImgEl.style.display !== 'none' ? optDImgEl.src : null;

    if (question_type === 'pg') {
      correct_option = document.getElementById('q-correct').value;
      if (!correct_option) {
        return showCustomAlert('Gagal', 'Kunci jawaban belum ditentukan.', 'warning');
      }
    } else {
      const checkedArr = [];
      document.querySelectorAll('input[name="q-correct-multi"]:checked').forEach(chk => {
        checkedArr.push(chk.value);
      });
      if (checkedArr.length === 0) {
        return showCustomAlert('Gagal', 'Harap pilih minimal 1 kunci jawaban benar untuk PG Kompleks.', 'warning');
      }
      correct_option = JSON.stringify(checkedArr);
    }
  } 
  else if (question_type === 'jodohkan') {
    const leftInputs = document.querySelectorAll('.jodohkan-left');
    const rightInputs = document.querySelectorAll('.jodohkan-right');
    const leftArr = [];
    const rightArr = [];
    const correctMap = {};

    for (let i = 0; i < leftInputs.length; i++) {
      const leftVal = leftInputs[i].value.trim();
      const rightVal = rightInputs[i].value.trim();
      if (leftVal && rightVal) {
        leftArr.push(leftVal);
        rightArr.push(rightVal);
        correctMap[leftVal] = rightVal;
      }
    }

    if (leftArr.length === 0) {
      return showCustomAlert('Gagal', 'Harap isi minimal 1 pasangan mencocokkan.', 'warning');
    }

    const distractorInputs = document.querySelectorAll('.jodohkan-distractor');
    distractorInputs.forEach(input => {
      const val = input.value.trim();
      if (val) {
        rightArr.push(val);
      }
    });

    option_a = leftArr.join('|');
    option_b = rightArr.join('|');
    correct_option = JSON.stringify(correctMap);
  } 
  else if (question_type === 'uraian') {
    option_a = '';
    option_b = '';
    option_c = '';
    option_d = '';
    const correctUraianInput = document.getElementById('q-correct-uraian');
    correct_option = correctUraianInput ? correctUraianInput.value.trim() : '';
  }

  const pointsInput = document.getElementById('q-points');
  const points = pointsInput && pointsInput.value !== '' ? parseFloat(pointsInput.value) : 1.0;

  const newQuestion = { 
    question_type, 
    question_text, 
    question_image,
    option_a, 
    option_a_image,
    option_b, 
    option_b_image,
    option_c, 
    option_c_image,
    option_d, 
    option_d_image,
    correct_option,
    points
  };

  if (indexVal !== '') {
    questionsList[parseInt(indexVal)] = newQuestion;
  } else {
    questionsList.push(newQuestion);
  }

  resetQuestionForm();
  renderLocalQuestions();
}

function editLocalQuestion(index) {
  const q = questionsList[index];
  document.getElementById('edit-q-index').value = index;
  document.getElementById('q-text').value = q.question_text;
  
  // Set type dropdown
  const typeSelect = document.getElementById('q-type');
  typeSelect.value = q.question_type || 'pg';
  toggleQuestionTypeInputs();

  // Restore points
  const pointsInput = document.getElementById('q-points');
  if (pointsInput) {
    pointsInput.value = q.points !== undefined && q.points !== null ? q.points : 1.0;
  }

  // Restore Question Image
  if (q.question_image) {
    const qPreview = document.getElementById('q-image-preview');
    if (qPreview) {
      qPreview.src = q.question_image;
      qPreview.style.display = 'block';
    }
    const qRemove = document.getElementById('btn-remove-q-image');
    if (qRemove) qRemove.style.display = 'inline-flex';
  } else {
    removeImage('q-image-input', 'q-image-preview');
  }

  // Restore Options Images
  const optionLetters = ['a', 'b', 'c', 'd'];
  optionLetters.forEach(letter => {
    const imgKey = `option_${letter}_image`;
    const previewId = `opt-${letter}-image-preview`;
    const inputId = `opt-${letter}-image-input`;
    const removeBtnId = `btn-remove-opt-${letter}-image`;
    const preview = document.getElementById(previewId);
    const removeBtn = document.getElementById(removeBtnId);
    
    if (q[imgKey]) {
      if (preview) {
        preview.src = q[imgKey];
        preview.style.display = 'block';
      }
      if (removeBtn) removeBtn.style.display = 'inline-flex';
    } else {
      removeImage(inputId, previewId);
    }
  });

  if (q.question_type === 'pg' || q.question_type === 'pg_kompleks' || !q.question_type) {
    document.getElementById('opt-a').value = q.option_a || '';
    document.getElementById('opt-b').value = q.option_b || '';
    document.getElementById('opt-c').value = q.option_c || '';
    document.getElementById('opt-d').value = q.option_d || '';
    
    if (q.question_type === 'pg_kompleks') {
      let correctArr = [];
      try {
        correctArr = (typeof q.correct_option === 'string') ? JSON.parse(q.correct_option || '[]') : (q.correct_option || []);
      } catch (e) {
        correctArr = [];
      }
      document.getElementsByName('q-correct-multi').forEach(chk => {
        chk.checked = correctArr.includes(chk.value);
      });
    } else {
      document.getElementById('q-correct').value = q.correct_option || '';
    }
  } else if (q.question_type === 'jodohkan') {
    const lefts = (q.option_a || '').split('|');
    const rights = (q.option_b || '').split('|');
    let correctMap = {};
    try {
      correctMap = (typeof q.correct_option === 'string') ? JSON.parse(q.correct_option || '{}') : (q.correct_option || {});
    } catch(e) {
      correctMap = {};
    }

    // Populate Left & Right pairs
    const leftInputs = document.querySelectorAll('.jodohkan-left');
    const rightInputs = document.querySelectorAll('.jodohkan-right');
    
    // Clear inputs first
    leftInputs.forEach(i => i.value = '');
    rightInputs.forEach(i => i.value = '');
    
    lefts.forEach((leftVal, idx) => {
      if (idx < leftInputs.length) {
        leftInputs[idx].value = leftVal;
        rightInputs[idx].value = correctMap[leftVal] || '';
      }
    });

    // Populate distractors (items in rights that are NOT values in correctMap)
    const distractorInputs = document.querySelectorAll('.jodohkan-distractor');
    distractorInputs.forEach(i => i.value = '');
    
    const correctRightValues = Object.values(correctMap);
    const distractors = rights.filter(r => !correctRightValues.includes(r));
    
    distractors.forEach((distVal, idx) => {
      if (idx < distractorInputs.length) {
        distractorInputs[idx].value = distVal;
      }
    });
  } else if (q.question_type === 'uraian') {
    const correctUraianInput = document.getElementById('q-correct-uraian');
    if (correctUraianInput) {
      correctUraianInput.value = q.correct_option || '';
    }
  }

  document.getElementById('question-form-mode').innerText = 'Edit';
  document.getElementById('btn-cancel-edit-q').style.display = 'inline-flex';
}

function deleteLocalQuestion(index) {
  questionsList.splice(index, 1);
  renderLocalQuestions();
  resetQuestionForm();
}

function resetQuestionForm() {
  document.getElementById('form-question').reset();
  
  // Reset points
  const pointsInput = document.getElementById('q-points');
  if (pointsInput) pointsInput.value = 1.0;

  const correctUraianInput = document.getElementById('q-correct-uraian');
  if (correctUraianInput) correctUraianInput.value = '';

  // Clear image previews and file inputs
  removeImage('q-image-input', 'q-image-preview');
  removeImage('opt-a-image-input', 'opt-a-image-preview');
  removeImage('opt-b-image-input', 'opt-b-image-preview');
  removeImage('opt-c-image-input', 'opt-c-image-preview');
  removeImage('opt-d-image-input', 'opt-d-image-preview');
  
  // Clear checkboxes
  document.getElementsByName('q-correct-multi').forEach(chk => chk.checked = false);
  
  // Clear Jodohkan inputs
  document.querySelectorAll('.jodohkan-left').forEach(i => i.value = '');
  document.querySelectorAll('.jodohkan-right').forEach(i => i.value = '');
  document.querySelectorAll('.jodohkan-distractor').forEach(i => i.value = '');

  document.getElementById('edit-q-index').value = '';
  document.getElementById('q-type').value = 'pg';
  toggleQuestionTypeInputs();
  
  document.getElementById('question-form-mode').innerText = 'Tambah';
  document.getElementById('btn-cancel-edit-q').style.display = 'none';
}

async function saveAllQuestionsToServer() {
  if (questionsList.length === 0) {
    return showCustomAlert('Gagal', 'Harap buat minimal 1 soal terlebih dahulu.', 'warning');
  }

  try {
    const res = await fetch(`${API_URL}/api/exams/${activeExam.id}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: questionsList })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showCustomAlert('Sukses', 'Semua soal berhasil disimpan ke server!', 'success');
    backFromQuestions();
  } catch (err) {
    showCustomAlert('Gagal', err.message, 'danger');
  }
}

function startExam(examId) {
  showCustomConfirm('Aktifkan Ujian?', 'Apakah Anda ingin mengaktifkan ujian ini sekarang? Siswa dapat segera masuk mengerjakan.', async () => {
    try {
      const res = await fetch(`${API_URL}/api/exams/${examId}/start`, { method: 'POST' });
      if (!res.ok) throw new Error('Gagal mengaktifkan ujian');
      loadTeacherExams();
    } catch (err) {
      showCustomAlert('Gagal', err.message, 'danger');
    }
  });
}

function backFromQuestions() {
  if (currentUser && currentUser.role === 'admin') {
    switchScreen('screen-admin-dashboard');
    switchAdminTab('classes'); // placeholder fallback
  } else {
    switchScreen('screen-guru-dashboard');
    loadTeacherExams();
  }
}


// ================= MONITOR NAVIGATION FALLBACK =================
function backFromMonitor() {
  if (currentUser && currentUser.role === 'admin') {
    switchScreen('screen-admin-dashboard');
    switchAdminTab('monitor');
  } else {
    switchScreen('screen-guru-dashboard');
    loadTeacherExams();
  }
}

// ================= GURU: MONITOR & REAL-TIME LEADERBOARD =================
// Global leaderboard storage to make export functions work
let lastFetchedLeaderboard = []; 

async function openExamMonitor(examId, title, isFinished = false) {
  try {
    const res = await fetch(`${API_URL}/api/exams/${examId}`);
    const exam = await res.json();
    if (!res.ok) throw new Error(exam.error || 'Gagal memuat detail ujian');
    activeExam = exam;
  } catch (err) {
    console.error('Error fetching exam for monitor:', err);
    activeExam = { id: examId, title, teacher_name: currentUser?.name || 'Guru', teacher_subject: currentUser?.subject || 'Umum' };
  }

  document.getElementById('monitor-title').innerText = activeExam.title;

  const tag = document.getElementById('monitor-status-tag');
  const btnStop = document.getElementById('btn-stop-exam');

  if (isFinished) {
    tag.className = 'exam-status-tag status-finished';
    tag.innerHTML = '<i class="fa-solid fa-circle-check"></i> Sudah Selesai';
    btnStop.style.display = 'none';
  } else {
    tag.className = 'exam-status-tag status-active';
    tag.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sedang Berlangsung';
    btnStop.style.display = 'inline-flex';
  }
  
  switchScreen('screen-exam-monitor');
  
  fetchMonitorData();
  if (!isFinished) {
    if (monitorInterval) clearInterval(monitorInterval);
    monitorInterval = setInterval(fetchMonitorData, 3000);
  }
}

async function fetchMonitorData() {
  if (!activeExam) return;
  try {
    const res = await fetch(`${API_URL}/api/exams/${activeExam.id}/submissions`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const { submissions, leaderboard } = data;
    lastFetchedLeaderboard = leaderboard; // Save global reference

    // RENDER MONITOR LIST (LOG PELANGGARAN)
    let total = submissions.length;
    let active = 0;
    let done = 0;
    let cheated = 0;

    const listContainer = document.getElementById('student-monitor-list');
    listContainer.innerHTML = '';

    submissions.forEach(s => {
      if (s.status === 'started') active++;
      else if (s.status === 'submitted') done++;
      else if (s.status === 'disqualified') cheated++;

      let statusBadge = '';
      if (s.status === 'started') statusBadge = '<span class="student-status-tag started"><i class="fa-solid fa-spinner fa-spin"></i> Aktif</span>';
      else if (s.status === 'submitted') statusBadge = '<span class="student-status-tag submitted"><i class="fa-solid fa-circle-check"></i> Selesai</span>';
      else if (s.status === 'disqualified') statusBadge = '<span class="student-status-tag disqualified"><i class="fa-solid fa-ban"></i> Diskualifikasi</span>';

      let violationClass = '';
      if (s.violations_count >= 1) violationClass = 'danger';

      const violationBadge = `<span class="violations-badge ${violationClass}">${s.violations_count} / 1</span>`;

      let logHTML = '';
      if (s.logs && s.logs.length > 0) {
        logHTML = '<ul class="cheat-logs-list">';
        s.logs.forEach(log => {
          logHTML += `<li>${escapeHTML(log)}</li>`;
        });
        logHTML += '</ul>';
      } else {
        logHTML = '<span style="color: var(--text-muted); font-size: 0.8rem;">Tidak ada</span>';
      }

      let actionHTML = '-';
      if (s.status === 'disqualified') {
        const pulseStyle = s.reset_requested === 1 ? 'box-shadow: 0 0 10px var(--color-warning); animation: pulse 1.5s infinite;' : '';
        const requestLabel = s.reset_requested === 1 ? '<span style="color:var(--color-warning); font-size:0.7rem; font-weight:600; display:block; margin-bottom:4px;"><i class="fa-solid fa-bell"></i> Butuh Izin</span>' : '';
        actionHTML = `
          ${requestLabel}
          <button class="btn-warning btn-sm" onclick="approveStudentReset(${s.id})" style="padding: 4px 8px; font-size: 0.75rem; border-radius: 4px; display:inline-flex; align-items:center; gap:4px; ${pulseStyle}">
            <i class="fa-solid fa-key"></i> Izinkan Ulang
          </button>
        `;
      } else if (s.status === 'submitted') {
        actionHTML = `
          <button class="btn-primary btn-sm" onclick="openGradingModal(${s.id})" style="padding: 4px 8px; font-size: 0.75rem; border-radius: 4px; display:inline-flex; align-items:center; gap:4px; background: var(--secondary-color); border-color: var(--secondary-color);">
            <i class="fa-solid fa-edit"></i> Koreksi Uraian
          </button>
        `;
      }

      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${escapeHTML(s.student_name)}</strong></td>
        <td style="text-align:center;">${s.attempt}</td>
        <td>${statusBadge}</td>
        <td>${violationBadge}</td>
        <td>${logHTML}</td>
        <td>${actionHTML}</td>
      `;
      listContainer.appendChild(row);
    });

    document.getElementById('monitor-total-students').innerText = total;
    document.getElementById('monitor-active-students').innerText = active;
    document.getElementById('monitor-done-students').innerText = done;
    document.getElementById('monitor-cheat-students').innerText = cheated;

    // RENDER LEADERBOARD (RANKINGS BASED ON MAX SCORE)
    const leaderboardContainer = document.getElementById('student-leaderboard-list');
    leaderboardContainer.innerHTML = '';

    if (leaderboard.length === 0) {
      leaderboardContainer.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding: 20px 0;">Belum ada siswa yang mengumpulkan.</td></tr>';
    } else {
      leaderboard.forEach((rank, index) => {
        let rankBadge = `${index + 1}`;
        if (index === 0) rankBadge = '<i class="fa-solid fa-medal medal-gold"></i> Juara 1';
        else if (index === 1) rankBadge = '<i class="fa-solid fa-medal medal-silver"></i> Juara 2';
        else if (index === 2) rankBadge = '<i class="fa-solid fa-medal medal-bronze"></i> Juara 3';

        let statusClass = 'student-status-tag submitted';
        let statusText = 'Selesai';
        if (rank.latest_status === 'disqualified') {
          statusClass = 'student-status-tag disqualified';
          statusText = 'Diskualifikasi';
        }

        // Show note if they worked more than once
        let attemptNote = `${rank.total_attempts}x`;
        if (rank.total_attempts > 1) {
          attemptNote = `<span style="color: var(--primary-color); font-weight:600;"><i class="fa-solid fa-rotate-left"></i> ${rank.total_attempts}x (Mengulang)</span>`;
        }

        const row = document.createElement('tr');
        row.innerHTML = `
          <td><strong>${rankBadge}</strong></td>
          <td><strong>${escapeHTML(rank.student_name)}</strong></td>
          <td>${escapeHTML(rank.student_class)}</td>
          <td style="text-align:center;">${attemptNote}</td>
          <td><span class="${statusClass}" style="font-size:0.9rem; font-weight:700; padding:6px 12px;">${rank.best_score}</span></td>
        `;
        leaderboardContainer.appendChild(row);
      });
    }

  } catch (err) {
    console.error('Error fetching monitor data:', err);
  }
}

function finishExamFromMonitor() {
  showCustomConfirm('Akhiri Ujian?', 'Apakah Anda ingin menutup ujian ini secara permanen? Semua siswa yang sedang mengerjakan akan otomatis dikumpulkan paksa.', async () => {
    try {
      const res = await fetch(`${API_URL}/api/exams/${activeExam.id}/finish`, { method: 'POST' });
      if (!res.ok) throw new Error('Gagal menghentikan ujian');
      
      if (monitorInterval) clearInterval(monitorInterval);
      showCustomAlert('Sukses', 'Ujian berhasil diselesaikan!', 'success');
      backFromMonitor();
    } catch (err) {
      showCustomAlert('Gagal', err.message, 'danger');
    }
  });
}


// ================= ================= =================
// =================    SISWA EXAM RUNNING LOGIC  =================
// ================= ================= =================
function startExamTimer(minutes) {
  let secondsRemaining = minutes * 60;
  
  if (examTimerInterval) clearInterval(examTimerInterval);

  function updateTimerUI() {
    const h = Math.floor(secondsRemaining / 3600);
    const m = Math.floor((secondsRemaining % 3600) / 60);
    const s = secondsRemaining % 60;

    const formattedTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    const timerValEl = document.getElementById('timer-val');
    timerValEl.innerText = formattedTime;

    if (secondsRemaining < 300) {
      document.getElementById('exam-timer').classList.add('hurry');
    } else {
      document.getElementById('exam-timer').classList.remove('hurry');
    }

    if (secondsRemaining <= 0) {
      clearInterval(examTimerInterval);
      showCustomAlert('Waktu Habis', 'Waktu ujian telah habis! Jawaban Anda akan otomatis dikumpulkan.', 'warning');
      submitExam(true);
    }

    secondsRemaining--;
  }

  updateTimerUI();
  examTimerInterval = setInterval(updateTimerUI, 1000);
}

function buildExamNavGrid() {
  const grid = document.getElementById('exam-nav-grid');
  grid.innerHTML = '';

  studentQuestions.forEach((_, index) => {
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.id = `nav-btn-${index}`;
    btn.innerText = index + 1;
    btn.onclick = () => renderStudentQuestion(index);
    grid.appendChild(btn);
  });
}

function updateNavBtnStatus(index, isAnswered) {
  const btn = document.getElementById(`nav-btn-${index}`);
  if (btn) {
    if (isAnswered) {
      btn.classList.add('answered');
    } else {
      btn.classList.remove('answered');
    }
  }
}

function renderStudentQuestion(index) {
  activeQuestionIndex = index;

  document.querySelectorAll('.nav-btn').forEach((btn, idx) => {
    btn.classList.remove('active');
    const questionId = studentQuestions[idx].id;
    if (studentAnswers[questionId]) {
      btn.classList.add('answered');
    } else {
      btn.classList.remove('answered');
    }
  });
  
  const activeBtn = document.getElementById(`nav-btn-${index}`);
  if (activeBtn) activeBtn.classList.add('active');

  const q = studentQuestions[index];
  document.getElementById('active-q-num').innerText = index + 1;
  document.getElementById('active-q-text').innerText = q.question_text;

  // Render question image
  const activeQImg = document.getElementById('active-q-image');
  if (activeQImg) {
    if (q.question_image) {
      activeQImg.src = q.question_image;
      activeQImg.style.display = 'block';
    } else {
      activeQImg.src = '';
      activeQImg.style.display = 'none';
    }
  }

  const optionsListContainer = document.querySelector('.options-list');
  optionsListContainer.innerHTML = ''; // clear

  const type = q.question_type || 'pg';

  if (type === 'pg') {
    const options = [
      { key: 'A', text: q.option_a },
      { key: 'B', text: q.option_b },
      { key: 'C', text: q.option_c },
      { key: 'D', text: q.option_d }
    ];

    options.forEach(opt => {
      const label = document.createElement('label');
      label.className = 'option-item';
      label.htmlFor = `ans-${opt.key}`;
      
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'student-ans';
      input.id = `ans-${opt.key}`;
      input.value = opt.key;
      
      if (studentAnswers[q.id] === opt.key) {
        input.checked = true;
      }
      
      input.onchange = () => {
        studentAnswers[q.id] = opt.key;
        updateNavBtnStatus(index, true);
      };

      label.appendChild(input);
      
      const lblSpan = document.createElement('span');
      lblSpan.className = 'option-lbl';
      lblSpan.innerText = opt.key;
      label.appendChild(lblSpan);

      const contentWrapper = document.createElement('div');
      contentWrapper.style.display = 'flex';
      contentWrapper.style.flexDirection = 'column';
      contentWrapper.style.gap = '6px';

      const textSpan = document.createElement('span');
      textSpan.className = 'option-text';
      textSpan.innerText = opt.text;
      contentWrapper.appendChild(textSpan);

      const imgKey = `option_${opt.key.toLowerCase()}_image`;
      if (q[imgKey]) {
        const optImg = document.createElement('img');
        optImg.src = q[imgKey];
        optImg.className = 'opt-image-display';
        contentWrapper.appendChild(optImg);
      }

      label.appendChild(contentWrapper);

      optionsListContainer.appendChild(label);
    });
  } 
  else if (type === 'pg_kompleks') {
    const options = [
      { key: 'A', text: q.option_a },
      { key: 'B', text: q.option_b },
      { key: 'C', text: q.option_c },
      { key: 'D', text: q.option_d }
    ];

    let savedAnswersArr = [];
    if (studentAnswers[q.id]) {
      savedAnswersArr = Array.isArray(studentAnswers[q.id]) 
        ? studentAnswers[q.id] 
        : JSON.parse(studentAnswers[q.id] || '[]');
    }

    options.forEach(opt => {
      const label = document.createElement('label');
      label.className = 'option-item';
      label.htmlFor = `ans-complex-${opt.key}`;
      
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'student-ans-complex';
      input.id = `ans-complex-${opt.key}`;
      input.value = opt.key;
      
      if (savedAnswersArr.includes(opt.key)) {
        input.checked = true;
      }
      
      input.onchange = () => {
        const checkedList = [];
        document.querySelectorAll('input[name="student-ans-complex"]:checked').forEach(c => {
          checkedList.push(c.value);
        });
        
        if (checkedList.length > 0) {
          studentAnswers[q.id] = checkedList;
          updateNavBtnStatus(index, true);
        } else {
          delete studentAnswers[q.id];
          updateNavBtnStatus(index, false);
        }
      };

      label.appendChild(input);
      
      const lblSpan = document.createElement('span');
      lblSpan.className = 'option-lbl';
      lblSpan.innerText = opt.key;
      label.appendChild(lblSpan);

      const contentWrapper = document.createElement('div');
      contentWrapper.style.display = 'flex';
      contentWrapper.style.flexDirection = 'column';
      contentWrapper.style.gap = '6px';

      const textSpan = document.createElement('span');
      textSpan.className = 'option-text';
      textSpan.innerText = opt.text;
      contentWrapper.appendChild(textSpan);

      const imgKey = `option_${opt.key.toLowerCase()}_image`;
      if (q[imgKey]) {
        const optImg = document.createElement('img');
        optImg.src = q[imgKey];
        optImg.className = 'opt-image-display';
        contentWrapper.appendChild(optImg);
      }

      label.appendChild(contentWrapper);

      optionsListContainer.appendChild(label);
    });
  } 
  else if (type === 'uraian') {
    const textarea = document.createElement('textarea');
    textarea.className = 'essay-textarea';
    textarea.placeholder = 'Ketikkan jawaban uraian Anda di sini...';
    textarea.value = studentAnswers[q.id] || '';
    
    textarea.oninput = (e) => {
      const val = e.target.value.trim();
      if (val) {
        studentAnswers[q.id] = val;
        updateNavBtnStatus(index, true);
      } else {
        delete studentAnswers[q.id];
        updateNavBtnStatus(index, false);
      }
    };

    optionsListContainer.appendChild(textarea);
  } 
  else if (type === 'jodohkan') {
    const leftItems = (q.option_a || '').split('|');
    const rightItemsIncludingDistractors = (q.option_b || '').split('|');

    let savedMapping = {};
    if (studentAnswers[q.id]) {
      savedMapping = typeof studentAnswers[q.id] === 'object' 
        ? studentAnswers[q.id] 
        : JSON.parse(studentAnswers[q.id] || '{}');
    }

    const matchingWrapper = document.createElement('div');
    matchingWrapper.className = 'matching-container';

    // Left Slots Column
    const slotsCol = document.createElement('div');
    slotsCol.className = 'matching-slots';
    slotsCol.innerHTML = '<h4 style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:5px;"><i class="fa-solid fa-left-long"></i> Pasangkan Soal Ini:</h4>';

    // Right Cards Column
    const poolCol = document.createElement('div');
    poolCol.className = 'matching-cards-pool-container';
    poolCol.style.flex = '1';
    poolCol.innerHTML = '<h4 style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:5px;"><i class="fa-solid fa-list-check"></i> Pilihan Jawaban:</h4>';
    
    const pool = document.createElement('div');
    pool.className = 'matching-cards-pool';
    poolCol.appendChild(pool);

    const placedCards = Object.values(savedMapping);
    let selectedRightCardValue = null;

    // Seeded shuffle to make left items (questions) stable per question
    const shuffledLeftItems = [...leftItems];
    let seedLeft = q.id + 17;
    for (let i = shuffledLeftItems.length - 1; i > 0; i--) {
      const j = Math.floor((seedLeft * 9301 + 49297) % 233280) % (i + 1);
      seedLeft = j;
      const temp = shuffledLeftItems[i];
      shuffledLeftItems[i] = shuffledLeftItems[j];
      shuffledLeftItems[j] = temp;
    }

    // Seeded shuffle to make card layout stable per question
    const shuffledRightItems = [...rightItemsIncludingDistractors];
    let seed = q.id;
    for (let i = shuffledRightItems.length - 1; i > 0; i--) {
      const j = Math.floor((seed * 9301 + 49297) % 233280) % (i + 1);
      seed = j;
      const temp = shuffledRightItems[i];
      shuffledRightItems[i] = shuffledRightItems[j];
      shuffledRightItems[j] = temp;
    }

    function renderCardsPool() {
      pool.innerHTML = '';
      shuffledRightItems.forEach(rightVal => {
        const card = document.createElement('div');
        card.className = 'matching-card';
        card.innerText = rightVal;
        card.draggable = true;

        const isPlaced = placedCards.includes(rightVal);
        if (isPlaced) {
          card.classList.add('matched');
        }

        // Drag events for Desktop
        card.ondragstart = (e) => {
          e.dataTransfer.setData('text/plain', rightVal);
          card.classList.add('selected-card');
        };

        card.ondragend = () => {
          card.classList.remove('selected-card');
        };

        // Click/Tap events for Mobile Fallback
        card.onclick = () => {
          if (isPlaced) return;
          
          if (selectedRightCardValue === rightVal) {
            selectedRightCardValue = null;
            card.classList.remove('selected-card');
          } else {
            document.querySelectorAll('.matching-card').forEach(c => c.classList.remove('selected-card'));
            selectedRightCardValue = rightVal;
            card.classList.add('selected-card');
          }
        };

        pool.appendChild(card);
      });
    }

    renderCardsPool();

    // Render Left Slots
    shuffledLeftItems.forEach(leftVal => {
      const slotItem = document.createElement('div');
      slotItem.className = 'matching-slot-item';

      const label = document.createElement('div');
      label.className = 'matching-label';
      label.innerText = leftVal;
      slotItem.appendChild(label);

      const dropZone = document.createElement('div');
      dropZone.className = 'matching-drop-zone';
      
      const currentMatchedValue = savedMapping[leftVal];

      if (currentMatchedValue) {
        const matchedCard = document.createElement('div');
        matchedCard.className = 'matching-card';
        matchedCard.innerText = currentMatchedValue;
        
        const ejectBtn = document.createElement('button');
        ejectBtn.className = 'matching-eject-btn';
        ejectBtn.innerHTML = '&times;';
        ejectBtn.onclick = (e) => {
          e.stopPropagation();
          delete savedMapping[leftVal];
          saveAndRefreshMatching();
        };

        matchedCard.appendChild(ejectBtn);
        dropZone.appendChild(matchedCard);
      } else {
        dropZone.innerText = 'Drop/Tap di sini';
      }

      // Drag and drop event handlers
      dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.classList.add('active-drag');
      };

      dropZone.ondragleave = () => {
        dropZone.classList.remove('active-drag');
      };

      dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('active-drag');
        const cardVal = e.dataTransfer.getData('text/plain');
        if (!cardVal) return;

        // If card was already matched to another slot, delete it from there
        Object.keys(savedMapping).forEach(k => {
          if (savedMapping[k] === cardVal) {
            delete savedMapping[k];
          }
        });

        savedMapping[leftVal] = cardVal;
        saveAndRefreshMatching();
      };

      // Click event for Mobile Fallback
      dropZone.onclick = () => {
        if (selectedRightCardValue) {
          Object.keys(savedMapping).forEach(k => {
            if (savedMapping[k] === selectedRightCardValue) {
              delete savedMapping[k];
            }
          });

          savedMapping[leftVal] = selectedRightCardValue;
          selectedRightCardValue = null;
          saveAndRefreshMatching();
        } else if (currentMatchedValue) {
          delete savedMapping[leftVal];
          saveAndRefreshMatching();
        }
      };

      slotItem.appendChild(dropZone);
      slotsCol.appendChild(slotItem);
    });

    function saveAndRefreshMatching() {
      Object.keys(savedMapping).forEach(k => {
        if (!savedMapping[k]) delete savedMapping[k];
      });

      const keysCount = Object.keys(savedMapping).length;
      if (keysCount > 0) {
        studentAnswers[q.id] = savedMapping;
        updateNavBtnStatus(index, true);
      } else {
        delete studentAnswers[q.id];
        updateNavBtnStatus(index, false);
      }

      renderStudentQuestion(index);
    }

    matchingWrapper.appendChild(slotsCol);
    matchingWrapper.appendChild(poolCol);
    optionsListContainer.appendChild(matchingWrapper);
  }

  document.getElementById('btn-prev-q').style.visibility = index === 0 ? 'hidden' : 'visible';
  
  if (index === studentQuestions.length - 1) {
    document.getElementById('btn-next-q').style.display = 'none';
    document.getElementById('btn-submit-exam').style.display = 'inline-flex';
  } else {
    document.getElementById('btn-next-q').style.display = 'inline-flex';
    document.getElementById('btn-submit-exam').style.display = 'none';
  }
}

function navigateQuestion(direction) {
  const newIndex = activeQuestionIndex + direction;
  if (newIndex >= 0 && newIndex < studentQuestions.length) {
    renderStudentQuestion(newIndex);
  }
}

// ================= ANTI-CHEAT SYSTEM =================
function examBeforeUnloadHandler(e) {
  e.preventDefault();
  e.returnValue = '';
  return '';
}

function activateAntiCheat() {
  window.addEventListener('blur', handleStudentCheat);
  document.addEventListener('visibilitychange', handleStudentCheat);
  window.addEventListener('beforeunload', examBeforeUnloadHandler);
}

function deactivateAntiCheat() {
  window.removeEventListener('blur', handleStudentCheat);
  document.removeEventListener('visibilitychange', handleStudentCheat);
  window.removeEventListener('beforeunload', examBeforeUnloadHandler);
}

async function handleStudentCheat() {
  if (!studentSubmissionId) return;

  if (document.visibilityState === 'hidden' || !document.hasFocus()) {
    try {
      const res = await fetch(`${API_URL}/api/student/violate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          submission_id: studentSubmissionId, 
          violation_type: document.visibilityState === 'hidden' ? 'minimize/tab-exit' : 'window-blur'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      studentViolations = data.violations_count;
      updateViolationsUI();

      if (data.status === 'disqualified') {
        deactivateAntiCheat();
        clearInterval(examTimerInterval);
        clearInterval(studentStatusInterval);

        lastDisqualifiedSubmissionId = studentSubmissionId;

        document.getElementById('result-icon-container').className = 'result-icon danger';
        document.getElementById('result-icon-container').innerHTML = '<i class="fa-solid fa-ban"></i>';
        document.getElementById('result-title').innerText = 'Didiskualifikasi!';
        document.getElementById('result-message').innerHTML = `Anda telah didiskualifikasi karena keluar dari halaman ujian.<br><span style="color: var(--color-danger); font-weight:600;">Nilai Anda dibekukan. Silakan minta izin ujian ulang kepada guru Anda.</span>`;
        document.getElementById('result-score-box').style.display = 'none';
        
        document.getElementById('btn-retake-exam').style.display = 'none';
        document.getElementById('btn-request-reset-exam').style.display = 'inline-flex';

        switchScreen('screen-exam-result', 'replace');
        studentSubmissionId = null;
      } else {
        showCustomAlert('Pelanggaran Terdeteksi', `PERINGATAN KECURANGAN!\nJangan keluar dari aplikasi/tab ujian. Jika Anda keluar ${1 - studentViolations} kali lagi, ujian Anda akan otomatis didiskualifikasi.`, 'warning');
      }

    } catch (err) {
      console.error('Error logging violation:', err);
    }
  }
}

function updateViolationsUI() {
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById(`violation-${i}`);
    if (dot) {
      if (i <= studentViolations) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    }
  }
}

function startStudentStatusLoop() {
  if (studentStatusInterval) clearInterval(studentStatusInterval);
  
  studentStatusInterval = setInterval(async () => {
    if (!studentSubmissionId) return;
    try {
      const res = await fetch(`${API_URL}/api/student/status/${studentSubmissionId}`);
      const data = await res.json();
      if (res.ok) {
        if (data.exam_status === 'finished') {
          deactivateAntiCheat();
          clearInterval(examTimerInterval);
          clearInterval(studentStatusInterval);
          showCustomAlert('Ujian Selesai', 'Ujian telah diakhiri oleh guru. Jawaban terakhir Anda berhasil disimpan.', 'info');
          submitExam(true);
        }
      }
    } catch (err) {
      console.error('Status loop error:', err);
    }
  }, 5000);
}

function submitExamConfirmation() {
  const unansweredCount = studentQuestions.length - Object.keys(studentAnswers).length;
  let confirmMsg = 'Apakah Anda yakin ingin mengumpulkan ujian ini?';
  if (unansweredCount > 0) {
    confirmMsg = `Peringatan: Masih ada ${unansweredCount} soal yang belum Anda jawab! Apakah Anda tetap ingin mengumpulkan?`;
  }

  showCustomConfirm('Kumpulkan Ujian?', confirmMsg, () => {
    submitExam(false);
  });
}

async function submitExam(forced = false) {
  deactivateAntiCheat();
  if (examTimerInterval) clearInterval(examTimerInterval);
  if (studentStatusInterval) clearInterval(studentStatusInterval);

  try {
    const res = await fetch(`${API_URL}/api/student/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submission_id: studentSubmissionId, answers: studentAnswers })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById('result-icon-container').className = 'result-icon success';
    document.getElementById('result-icon-container').innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    document.getElementById('result-title').innerText = 'Ujian Berhasil Dikumpulkan!';
    document.getElementById('result-message').innerText = forced 
      ? 'Ujian telah dihentikan secara otomatis oleh sistem (waktu habis atau guru mengakhiri ujian). Nilai Anda berhasil disimpan.'
      : 'Jawaban Anda telah berhasil disimpan secara aman di database server.';
    
    document.getElementById('student-score-val').innerText = data.score;
    document.getElementById('result-score-box').style.display = 'block';
    
    document.getElementById('btn-retake-exam').style.display = 'inline-flex';
    document.getElementById('btn-request-reset-exam').style.display = 'none';

    switchScreen('screen-exam-result', 'replace');
  } catch (err) {
    showCustomAlert('Gagal Mengumpulkan', 'Gagal mengumpulkan ujian: ' + err.message, 'danger');
  } finally {
    studentSubmissionId = null;
  }
}


// ================= ================= =================
// =================   EXCEL GENERATION & EXPORT   =================
// ================= ================= =================

function downloadExcelTemplate(type) {
  let headers = [];
  let sampleData = [];
  let filename = '';

  if (type === 'teacher') {
    headers = ['Nama', 'Mapel', 'Username', 'Password'];
    sampleData = [
      ['Rudi Hermawan, M.Pd.', 'Matematika', 'rudi_math', 'guru123'],
      ['Siti Aminah, S.Pd.', 'Fisika', 'siti_physics', 'siti456']
    ];
    filename = 'Templat_Impor_Guru.xlsx';
  } else if (type === 'student') {
    headers = ['Nama', 'Kelas', 'Username', 'Password'];
    sampleData = [
      ['Budi Santoso', 'XII IPA 1', 'budi_ipa1', 'siswa123'],
      ['Lestari Rahayu', 'X RPL 3', 'lestari_rpl3', 'lestari456']
    ];
    filename = 'Templat_Impor_Siswa.xlsx';
  } else if (type === 'question') {
    headers = ['Pertanyaan', 'Pilihan_A', 'Pilihan_B', 'Pilihan_C', 'Pilihan_D', 'Kunci_Jawaban', 'Tipe_Soal'];
    sampleData = [
      ['Berapakah hasil dari 5 x 5?', '15', '20', '25', '30', 'C', 'pg'],
      ['Pilihlah negara yang berada di benua Asia!', 'Indonesia', 'Prancis', 'Jepang', 'Jerman', '["A","C"]', 'pg_kompleks'],
      ['Cocokkan negara dengan ibukotanya!', 'Indonesia|Prancis|Jepang', 'Jakarta|Paris|Tokyo|London|Madrid', '', '', '{"Indonesia":"Jakarta","Prancis":"Paris","Jepang":"Tokyo"}', 'jodohkan'],
      ['Jelaskan secara singkat apa itu gaya gravitasi bumi!', '', '', '', '', '', 'uraian']
    ];
    filename = 'Templat_Impor_Soal.xlsx';
  }

  const wsData = [headers, ...sampleData];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");

  XLSX.writeFile(wb, filename);
}

function handleExcelImport(event, type) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length <= 1) {
        throw new Error('Berkas Excel kosong atau tidak memiliki data.');
      }

      const headers = jsonData[0];
      const rows = jsonData.slice(1);

      if (type === 'teacher') {
        const teachers = rows.map(r => ({
          name: r[0],
          subject: r[1],
          username: r[2],
          password: r[3]
        })).filter(t => t.name && t.username && t.password);

        if (teachers.length === 0) throw new Error('Data guru tidak valid atau kosong.');

        const res = await fetch(`${API_URL}/api/admin/teachers/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teachers })
        });
        const resData = await res.json();
        if (!res.ok) throw new Error(resData.error);
        showCustomAlert('Sukses', resData.message, 'success');
        loadAdminTeachers();

      } else if (type === 'student') {
        const students = rows.map(r => ({
          name: r[0],
          class_name: r[1],
          username: r[2],
          password: r[3]
        })).filter(s => s.name && s.class_name && s.username && s.password);

        if (students.length === 0) throw new Error('Data siswa tidak valid atau kosong.');

        const res = await fetch(`${API_URL}/api/admin/students/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ students })
        });
        const resData = await res.json();
        if (!res.ok) throw new Error(resData.error);
        showCustomAlert('Sukses', resData.message, 'success');
        
        // Refresh list
        const studentsRes = await fetch(`${API_URL}/api/admin/students`);
        adminStudentsList = await studentsRes.json();
        loadAdminStudentsFiltered();

      } else if (type === 'question') {
        const questions = rows.map(r => {
          let qType = String(r[6] || 'pg').trim().toLowerCase();
          if (!['pg', 'pg_kompleks', 'jodohkan', 'uraian'].includes(qType)) {
            qType = 'pg';
          }
          let correct = String(r[5] || '').trim();
          if (qType === 'pg') {
            correct = correct.toUpperCase();
          }
          return {
            question_type: qType,
            question_text: String(r[0] || '').trim(),
            option_a: String(r[1] || ''),
            option_b: String(r[2] || ''),
            option_c: String(r[3] || ''),
            option_d: String(r[4] || ''),
            correct_option: correct
          };
        }).filter(q => q.question_text);

        if (questions.length === 0) throw new Error('Format soal tidak valid.');

        questionsList = [...questionsList, ...questions];
        renderLocalQuestions();
        showCustomAlert('Sukses', `Berhasil menambahkan ${questions.length} soal ke daftar draf! Jangan lupa klik tombol "Simpan Semua Soal ke Server" setelah selesai.`, 'success');
      }

    } catch (err) {
      showCustomAlert('Gagal Impor', 'Error saat mengimpor Excel: ' + err.message, 'danger');
    } finally {
      event.target.value = '';
    }
  };

  reader.readAsArrayBuffer(file);
}

// ================= ================= =================
// =================  COPY-PASTE RAW TEXT PARSER    =================
// ================= ================= =================

function openCopyPasteModal() {
  document.getElementById('modal-copy-paste-questions').classList.add('active');
  document.getElementById('raw-questions-text').value = '';
}

function closeCopyPasteModal() {
  document.getElementById('modal-copy-paste-questions').classList.remove('active');
}

function parseRawTextQuestions(text) {
  const questionBlocks = text.split(/\n\s*(?=\d+[\.\)\-\s])/);
  const parsedQuestions = [];

  questionBlocks.forEach(block => {
    if (!block.trim()) return;

    const qMatch = block.match(/^\s*\d+[\.\)\-\s]+([\s\S]+?)(?=\n\s*[A-D][\.\)\-\s])/i);
    if (!qMatch) return;
    const questionText = qMatch[1].trim();

    const aMatch = block.match(/\n\s*A[\.\)\-\s]+([\s\S]+?)(?=\n\s*B[\.\)\-\s])/i);
    const bMatch = block.match(/\n\s*B[\.\)\-\s]+([\s\S]+?)(?=\n\s*C[\.\)\-\s])/i);
    const cMatch = block.match(/\n\s*C[\.\)\-\s]+([\s\S]+?)(?=\n\s*D[\.\)\-\s])/i);
    const dMatch = block.match(/\n\s*D[\.\)\-\s]+([\s\S]+?)(?=\n\s*(?:Kunci|Key|Jawaban)[\s\S]*|$)/i);

    const keyMatch = block.match(/(?:Kunci|Key|Jawaban)\s*:\s*([A-D])/i);

    if (questionText && aMatch && bMatch && cMatch && dMatch && keyMatch) {
      parsedQuestions.push({
        question_text: questionText,
        option_a: aMatch[1].trim().split('\n')[0].trim(),
        option_b: bMatch[1].trim().split('\n')[0].trim(),
        option_c: cMatch[1].trim().split('\n')[0].trim(),
        option_d: dMatch[1].trim().split('\n')[0].trim(),
        correct_option: keyMatch[1].toUpperCase()
      });
    }
  });

  return parsedQuestions;
}

function handleProcessRawQuestions(e) {
  e.preventDefault();
  const rawText = document.getElementById('raw-questions-text').value;
  
  try {
    const parsed = parseRawTextQuestions(rawText);
    
    if (parsed.length === 0) {
      throw new Error('Tidak ada soal yang berhasil diurai. Harap periksa kembali format teks Anda.');
    }

    questionsList = [...questionsList, ...parsed];
    renderLocalQuestions();
    closeCopyPasteModal();
    showCustomAlert('Sukses', `Berhasil mengurai dan menambahkan ${parsed.length} soal secara instan! Klik "Simpan Semua Soal ke Server" untuk menyimpan.`, 'success');
  } catch (err) {
    showCustomAlert('Format Salah', err.message, 'danger');
  }
}

// ================= ================= =================
// =================   REKAPITULASI EXPORTS (EXCEL & PDF)  =================
// ================= ================= =================

function exportLeaderboardToExcel() {
  if (!activeExam || lastFetchedLeaderboard.length === 0) {
    return showCustomAlert('Gagal Ekspor', 'Belum ada data nilai terkumpul untuk diekspor.', 'warning');
  }

  const dateStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

  // Metadata rows for Excel Kop
  const metaRows = [
    ['REKAPITULASI HASIL UJIAN - AL UMMAH EXAM'],
    [`Judul Ujian: ${activeExam.title}`],
    [`Mata Pelajaran: ${activeExam.teacher_subject || 'Umum'}`],
    [`Guru Pengampu: ${activeExam.teacher_name || 'Guru'}`],
    [`Kelas Sasaran: ${activeExam.class_name || 'Semua Kelas'}`],
    [`Tanggal Ekspor: ${dateStr}`],
    [] // Spacer
  ];

  const headers = ['Peringkat', 'Nama Siswa', 'Kelas', 'Jumlah Percobaan', 'Nilai Akhir (Nilai Terbaik)'];
  const rows = lastFetchedLeaderboard.map((rank, index) => {
    return [
      index + 1,
      rank.student_name,
      rank.student_class,
      `${rank.total_attempts}x pengerjaan`,
      rank.best_score
    ];
  });

  const wsData = [...metaRows, headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rekap Nilai");

  const filename = `Rekap_Nilai_${activeExam.title.replace(/\s+/g, '_')}.xlsx`;
  XLSX.writeFile(wb, filename);
}

function exportLeaderboardToPDF() {
  if (!activeExam || lastFetchedLeaderboard.length === 0) {
    return showCustomAlert('Gagal Ekspor', 'Belum ada data nilai terkumpul untuk diekspor.', 'warning');
  }

  const dateStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

  // Create temporary container
  const element = document.createElement('div');
  element.className = 'pdf-export-wrapper';

  let rowsHTML = '';
  lastFetchedLeaderboard.forEach((rank, index) => {
    let attemptText = `${rank.total_attempts}x pengerjaan`;
    if (rank.total_attempts > 1) {
      attemptText = `${rank.total_attempts}x (Mengulang)`;
    }
    rowsHTML += `
      <tr>
        <td style="text-align:center;">${index + 1}</td>
        <td><strong>${escapeHTML(rank.student_name)}</strong></td>
        <td>${escapeHTML(rank.student_class)}</td>
        <td style="text-align:center;">${attemptText}</td>
        <td style="text-align:center; font-weight:bold; color: #10b981;">${rank.best_score}</td>
      </tr>
    `;
  });

  element.innerHTML = `
    <div class="pdf-title" style="text-align:center; font-size:18pt; font-weight:bold; color:#0f1524; margin-bottom:5px; font-family:Arial,sans-serif;">REKAPITULASI HASIL UJIAN</div>
    <div style="text-align:center; font-size:11pt; font-weight:bold; margin-bottom:25px; color:#ec4899; font-family:Arial,sans-serif;">AL UMMAH EXAM</div>
    
    <table class="pdf-meta-table" style="width:100%; margin-bottom:20px; font-family:Arial,sans-serif; font-size:10pt; border-collapse:collapse;">
      <tr>
        <td style="padding:6px 0; font-weight:bold; width:150px; border:none; color:#333;">Judul Ujian</td>
        <td style="padding:6px 0; border:none; color:#333;">: ${escapeHTML(activeExam.title)}</td>
        <td style="padding:6px 0; font-weight:bold; width:150px; border:none; color:#333;">Kelas Sasaran</td>
        <td style="padding:6px 0; border:none; color:#333;">: ${escapeHTML(activeExam.class_name || 'Semua Kelas')}</td>
      </tr>
      <tr>
        <td style="padding:6px 0; font-weight:bold; border:none; color:#333;">Mata Pelajaran</td>
        <td style="padding:6px 0; border:none; color:#333;">: ${escapeHTML(activeExam.teacher_subject || 'Umum')}</td>
        <td style="padding:6px 0; font-weight:bold; border:none; color:#333;">Guru Pengampu</td>
        <td style="padding:6px 0; border:none; color:#333;">: ${escapeHTML(activeExam.teacher_name || 'Guru')}</td>
      </tr>
      <tr>
        <td style="padding:6px 0; font-weight:bold; border:none; color:#333;">Tanggal Ekspor</td>
        <td colspan="3" style="padding:6px 0; border:none; color:#333;">: ${dateStr}</td>
      </tr>
    </table>

    <table class="pdf-table" style="width:100%; border-collapse:collapse; font-family:Arial,sans-serif; margin-top:10px;">
      <thead>
        <tr style="background:#f2f2f2;">
          <th style="border:1px solid #ddd; padding:10px; font-size:10pt; text-align:center; width:70px; color:#333;">Peringkat</th>
          <th style="border:1px solid #ddd; padding:10px; font-size:10pt; text-align:left; color:#333;">Nama Siswa</th>
          <th style="border:1px solid #ddd; padding:10px; font-size:10pt; text-align:left; color:#333;">Kelas</th>
          <th style="border:1px solid #ddd; padding:10px; font-size:10pt; text-align:center; width:150px; color:#333;">Jumlah Percobaan</th>
          <th style="border:1px solid #ddd; padding:10px; font-size:10pt; text-align:center; width:110px; color:#333;">Nilai Terbaik</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHTML}
      </tbody>
    </table>
  `;

  const opt = {
    margin:       15,
    filename:     `Rekap_Nilai_${activeExam.title.replace(/\s+/g, '_')}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2 },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(element).save();
}

// ================= HELPERS =================
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

let lastDisqualifiedSubmissionId = null;

async function requestResetExam() {
  if (!lastDisqualifiedSubmissionId) {
    return showCustomAlert('Gagal', 'Sesi ujian tidak terdeteksi.', 'warning');
  }
  try {
    const res = await fetch(`${API_URL}/api/submissions/${lastDisqualifiedSubmissionId}/request-reset`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showCustomAlert('Sukses', data.message, 'success');
    document.getElementById('btn-request-reset-exam').style.display = 'none'; // hide after success
  } catch (err) {
    showCustomAlert('Gagal', err.message, 'danger');
  }
}

async function approveStudentReset(submissionId) {
  showCustomConfirm(
    'Izinkan Ujian Ulang?',
    'Apakah Anda ingin memberikan izin kepada siswa ini untuk mengulang ujian? Semua riwayat kecurangan untuk percobaan ini akan dihapus dan siswa dapat masuk kembali.',
    async () => {
      try {
        const res = await fetch(`${API_URL}/api/submissions/${submissionId}/approve-reset`, {
          method: 'POST'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showCustomAlert('Sukses', data.message, 'success');
        fetchMonitorData();
      } catch (err) {
        showCustomAlert('Gagal', err.message, 'danger');
      }
    }
  );
}

// =========================================================================
// ==================== SETTINGS & AI GRADING LOGIC ========================
// =========================================================================

let currentGradingSubmissionId = null;
let currentGradingQuestions = [];

async function loadAdminSettings() {
  try {
    const res = await fetch(`${API_URL}/api/settings`);
    if (!res.ok) throw new Error('Gagal mengambil pengaturan');
    const settings = await res.json();
    
    // Find gemini_keys setting
    const geminiKeysSetting = settings.find(s => s.key === 'gemini_keys');
    const textarea = document.getElementById('gemini-keys');
    if (textarea) {
      textarea.value = geminiKeysSetting ? geminiKeysSetting.value : '';
    }
  } catch (err) {
    showCustomAlert('Gagal', err.message, 'danger');
  }
}

async function handleSettingsSave(e) {
  e.preventDefault();
  const keysValue = document.getElementById('gemini-keys').value;
  
  try {
    const res = await fetch(`${API_URL}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'gemini_keys', value: keysValue })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menyimpan pengaturan');
    
    showCustomAlert('Sukses', 'Pengaturan berhasil disimpan!', 'success');
  } catch (err) {
    showCustomAlert('Gagal', err.message, 'danger');
  }
}

async function openGradingModal(submissionId) {
  currentGradingSubmissionId = submissionId;
  const modal = document.getElementById('modal-grading');
  const container = document.getElementById('grading-questions-container');
  const nameSpan = document.getElementById('grading-student-name');
  
  nameSpan.innerText = 'Memuat...';
  container.innerHTML = '<div style="text-align:center; padding: 30px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:var(--primary-color);"></i><p style="margin-top:10px;">Mengambil data jawaban siswa...</p></div>';
  modal.classList.add('active');
  
  try {
    const res = await fetch(`${API_URL}/api/submissions/${submissionId}/details`);
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Gagal memuat detail jawaban');
    }
    const data = await res.json();
    
    nameSpan.innerText = data.student_name;
    
    const essayQuestions = data.questions.filter(q => q.question_type === 'uraian');
    currentGradingQuestions = essayQuestions;
    
    if (essayQuestions.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-secondary);"><i class="fa-solid fa-triangle-exclamation fa-2x" style="color:var(--color-warning); margin-bottom:10px;"></i><p>Ujian ini tidak memiliki soal uraian.</p></div>';
      return;
    }
    
    container.innerHTML = '';
    
    essayQuestions.forEach((q, idx) => {
      const studentAns = data.answers[q.id] || '<span style="color:var(--text-muted); font-style:italic;">Siswa tidak menjawab pertanyaan ini.</span>';
      const qPoints = q.points !== undefined && q.points !== null ? parseFloat(q.points) : 1.0;
      
      const savedGrade = data.essay_grades[q.id] || {};
      const finalScore = savedGrade.score !== undefined ? savedGrade.score : '';
      const aiFeedback = savedGrade.feedback || '';
      const aiPct = savedGrade.percentage || '';
      
      const card = document.createElement('div');
      card.className = 'panel-section';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '12px';
      card.style.border = '1px solid var(--panel-border)';
      card.style.background = 'rgba(255,255,255,0.02)';
      card.style.padding = '15px';
      card.style.borderRadius = 'var(--border-radius-md)';
      
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
          <h4 style="margin:0; font-size:1rem; color:var(--primary-color);">Soal #${idx + 1} (Uraian)</h4>
          <span style="font-size:0.8rem; background:rgba(255,255,255,0.05); padding:2px 8px; border-radius:12px; font-weight:600;"><i class="fa-solid fa-star" style="color:var(--color-warning);"></i> Bobot Soal: ${qPoints}</span>
        </div>
        
        <div style="font-size:0.95rem; line-height:1.4; color:var(--text-primary);">
          <strong>Pertanyaan:</strong>
          <div style="margin-top:4px; white-space:pre-line;">${escapeHTML(q.question_text)}</div>
        </div>

        <div style="font-size:0.95rem; line-height:1.4; background:rgba(0,0,0,0.15); padding:10px; border-radius:6px; border-left:3px solid var(--primary-color);">
          <strong>Jawaban Siswa:</strong>
          <div style="margin-top:6px; font-family:monospace; white-space:pre-line;">${escapeHTML(studentAns)}</div>
        </div>
        
        <div id="ai-section-${q.id}" style="background:rgba(139, 92, 246, 0.05); border:1px dashed rgba(139, 92, 246, 0.3); padding:12px; border-radius:6px; margin-top:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:600; color:#c084fc; font-size:0.85rem;"><i class="fa-solid fa-robot"></i> Rekomendasi AI Gemini</span>
            <button type="button" class="btn-primary" id="btn-ai-${q.id}" onclick="runAIGrading(${submissionId}, ${q.id})" style="padding:4px 10px; font-size:0.75rem; border-radius:4px; display:inline-flex; align-items:center; gap:4px; background:#8b5cf6; border-color:#8b5cf6;">
              <i class="fa-solid fa-wand-magic-sparkles"></i> Nilai dengan AI
            </button>
          </div>
          <div id="ai-result-${q.id}" style="margin-top: 8px; font-size:0.85rem; line-height:1.4; display: ${aiFeedback ? 'block' : 'none'};">
            <div><strong>Rekomendasi Skor:</strong> <span id="ai-score-${q.id}" style="color:var(--color-warning); font-weight:700;">${aiPct}% (Skor: ${finalScore}/${qPoints})</span></div>
            <div style="margin-top:4px; color:var(--text-secondary); font-style:italic;">"${escapeHTML(aiFeedback)}"</div>
          </div>
        </div>
        
        <div style="display:flex; align-items:center; gap:10px; margin-top:8px; border-top:1px solid rgba(255,255,255,0.05); padding-top:8px;">
          <label for="score-${q.id}" style="font-weight:600; font-size:0.9rem;">Nilai Akhir Guru:</label>
          <input type="number" id="score-${q.id}" min="0" max="${qPoints}" step="0.1" value="${finalScore}" placeholder="Masukkan nilai (maks: ${qPoints})" required style="max-width:200px; padding:6px 10px; border-radius:var(--border-radius-sm); border:1px solid var(--panel-border); background:rgba(0,0,0,0.2); color:var(--text-primary);">
        </div>
      `;
      container.appendChild(card);
    });

    // Automatically trigger AI grading for questions that don't have a grade yet
    essayQuestions.forEach((q) => {
      const savedGrade = data.essay_grades[q.id] || {};
      if (savedGrade.score === undefined) {
        runAIGrading(submissionId, q.id);
      }
    });
    
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-danger);"><i class="fa-solid fa-circle-xmark fa-2x" style="margin-bottom:10px;"></i><p>${err.message}</p></div>`;
  }
}

function closeGradingModal() {
  document.getElementById('modal-grading').classList.remove('active');
  currentGradingSubmissionId = null;
  currentGradingQuestions = [];
}

async function runAIGrading(submissionId, questionId) {
  const btn = document.getElementById(`btn-ai-${questionId}`);
  const resultDiv = document.getElementById(`ai-result-${questionId}`);
  const scoreSpan = document.getElementById(`ai-score-${questionId}`);
  const feedbackDiv = resultDiv.querySelector('div:last-child');
  const finalScoreInput = document.getElementById(`score-${questionId}`);
  
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menilai...';
  
  try {
    const res = await fetch(`${API_URL}/api/submissions/${submissionId}/grade-essay-ai/${questionId}`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    // Show AI results
    scoreSpan.innerText = `${data.percentage}% (Rekomendasi: ${data.recommended_score})`;
    feedbackDiv.innerText = `"${data.explanation}"`;
    resultDiv.style.display = 'block';
    
    // Auto fill final score input
    finalScoreInput.value = data.recommended_score;
    
  } catch (err) {
    showCustomAlert('Gagal', err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function saveGradingResult() {
  if (!currentGradingSubmissionId) return;
  
  const grades = {};
  let isValid = true;
  
  for (let q of currentGradingQuestions) {
    const input = document.getElementById(`score-${q.id}`);
    const scoreVal = input ? input.value.trim() : '';
    const qPoints = q.points !== undefined && q.points !== null ? parseFloat(q.points) : 1.0;
    
    if (scoreVal === '') {
      showCustomAlert('Gagal', 'Harap isi nilai akhir guru untuk semua pertanyaan uraian.', 'warning');
      isValid = false;
      break;
    }
    
    const parsedScore = parseFloat(scoreVal);
    if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > qPoints) {
      showCustomAlert('Gagal', `Nilai untuk salah satu soal tidak valid (harus antara 0 dan ${qPoints}).`, 'warning');
      isValid = false;
      break;
    }
    
    // Retrieve AI feedback if available
    const resultDiv = document.getElementById(`ai-result-${q.id}`);
    const feedbackDiv = resultDiv ? resultDiv.querySelector('div:last-child') : null;
    const aiText = feedbackDiv && resultDiv.style.display !== 'none' ? feedbackDiv.innerText.replace(/"/g, '') : '';
    
    // Extract percentage
    const scoreSpan = document.getElementById(`ai-score-${q.id}`);
    let percentage = '';
    if (scoreSpan && resultDiv.style.display !== 'none') {
      const match = scoreSpan.innerText.match(/^(\d+)%/);
      if (match) {
        percentage = match[1];
      }
    }
    
    grades[q.id] = {
      score: parsedScore,
      feedback: aiText || 'Dinilai secara manual oleh Guru.',
      percentage: percentage
    };
  }
  
  if (!isValid) return;
  
  try {
    const res = await fetch(`${API_URL}/api/submissions/${currentGradingSubmissionId}/save-essay-grades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grades })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    showCustomAlert('Sukses', 'Nilai uraian berhasil disimpan dan skor ujian telah diperbarui.', 'success');
    closeGradingModal();
    fetchMonitorData(); // Refresh monitor to show updated scores
  } catch (err) {
    showCustomAlert('Gagal', err.message, 'danger');
  }
}
