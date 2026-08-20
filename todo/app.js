class TodoApp {
  constructor() {
    this.tasks = [];
    this.currentFilter = 'all';
    this.currentSearch = '';
    this.editingId = null;
    this.draggedItem = null;
    this.storageKey = 'todoAppTasks';
    this.init();
  }

  // Initialization
  init() {
    this.loadTasks();
    this.setupEventListeners();
    this.loadTheme();
    this.render();
  }

  setupEventListeners() {
    // Form submission
    document.getElementById('addTaskForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.addTask();
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentFilter = e.target.dataset.filter;
        this.render();
      });
    });

    // Search input
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.currentSearch = e.target.value.toLowerCase();
      this.render();
    });

    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    });

    // Export/Import/Clear
    document.getElementById('exportBtn').addEventListener('click', () => this.exportTasks());
    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', (e) => this.importTasks(e));
    document.getElementById('clearBtn').addEventListener('click', () => this.clearAllTasks());

    // Modal
    document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
    document.getElementById('cancelEditBtn').addEventListener('click', () => this.closeModal());
    document.getElementById('editForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveEdit();
    });

    // Close modal on background click
    document.getElementById('editModal').addEventListener('click', (e) => {
      if (e.target.id === 'editModal') this.closeModal();
    });
  }

  // Task Management
  addTask() {
    const input = document.getElementById('taskInput');
    const category = document.getElementById('categorySelect');
    const dueDate = document.getElementById('dueDateInput');

    if (!input.value.trim()) return;

    const task = {
      id: Date.now(),
      text: input.value.trim(),
      category: category.value,
      dueDate: dueDate.value || null,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    this.tasks.unshift(task);
    this.saveTasks();
    this.render();

    // Reset form
    input.value = '';
    dueDate.value = '';
    input.focus();
  }

  deleteTask(id) {
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.saveTasks();
    this.render();
  }

  toggleComplete(id) {
    const task = this.tasks.find((t) => t.id === id);
    if (task) {
      task.completed = !task.completed;
      this.saveTasks();
      this.render();
    }
  }

  openEditModal(id) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return;

    this.editingId = id;
    document.getElementById('editTaskInput').value = task.text;
    document.getElementById('editCategorySelect').value = task.category;
    document.getElementById('editDueDateInput').value = task.dueDate || '';
    document.getElementById('editModal').classList.add('active');
    document.getElementById('editTaskInput').focus();
  }

  closeModal() {
    document.getElementById('editModal').classList.remove('active');
    this.editingId = null;
  }

  saveEdit() {
    if (!this.editingId) return;

    const task = this.tasks.find((t) => t.id === this.editingId);
    if (!task) return;

    task.text = document.getElementById('editTaskInput').value.trim() || task.text;
    task.category = document.getElementById('editCategorySelect').value;
    task.dueDate = document.getElementById('editDueDateInput').value || null;

    this.saveTasks();
    this.render();
    this.closeModal();
  }

  clearAllTasks() {
    if (this.tasks.length === 0) {
      alert('No tasks to clear!');
      return;
    }
    if (confirm('Are you sure you want to delete all tasks? This cannot be undone.')) {
      this.tasks = [];
      this.saveTasks();
      this.render();
    }
  }

  // Filtering & Searching
  getFilteredTasks() {
    let filtered = this.tasks;

    // Apply filter
    if (this.currentFilter === 'active') {
      filtered = filtered.filter((t) => !t.completed);
    } else if (this.currentFilter === 'completed') {
      filtered = filtered.filter((t) => t.completed);
    }

    // Apply search
    if (this.currentSearch) {
      filtered = filtered.filter((t) => t.text.toLowerCase().includes(this.currentSearch));
    }

    return filtered;
  }

  // Storage
  saveTasks() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.tasks));
  }

  loadTasks() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      this.tasks = stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Failed to load tasks:', e);
      this.tasks = [];
    }
  }

  exportTasks() {
    const dataStr = JSON.stringify(this.tasks, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `todos-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  importTasks(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result);
        if (Array.isArray(imported)) {
          if (confirm(`Import ${imported.length} task(s)? This will merge with existing tasks.`)) {
            this.tasks = [...this.tasks, ...imported];
            this.saveTasks();
            this.render();
            alert('Tasks imported successfully!');
          }
        } else {
          alert('Invalid format. Please provide a JSON array of tasks.');
        }
      } catch (err) {
        alert('Failed to import tasks. Invalid JSON format.');
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset file input
  }

  // Theme
  loadTheme() {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
    }
  }

  // Utilities
  getDateStatus(dueDate) {
    if (!dueDate) return null;

    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);

    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { type: 'overdue', text: `Overdue by ${Math.abs(diffDays)} day(s)` };
    if (diffDays === 0) return { type: 'today', text: 'Due Today' };
    if (diffDays <= 7) return { type: 'upcoming', text: `Due in ${diffDays} day(s)` };
    return { type: 'upcoming', text: `Due ${dueDate}` };
  }

  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Rendering
  render() {
    this.renderTasks();
    this.updateStats();
  }

  renderTasks() {
    const tasksList = document.getElementById('tasksList');
    const emptyState = document.getElementById('emptyState');
    const filtered = this.getFilteredTasks();

    if (filtered.length === 0) {
      tasksList.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    tasksList.innerHTML = filtered
      .map(
        (task) => `
      <div class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}">
        <input
          type="checkbox"
          class="task-checkbox"
          ${task.completed ? 'checked' : ''}
          onchange="app.toggleComplete(${task.id})"
        />
        <div class="task-content">
          <div class="task-text">${this.escapeHtml(task.text)}</div>
          <div class="task-meta">
            <span class="task-category ${task.category}">${task.category}</span>
            ${task.dueDate ? `<div class="task-date ${this.getDateStatus(task.dueDate)?.type || ''}">
              📅 ${this.getDateStatus(task.dueDate)?.text || ''}
            </div>` : ''}
          </div>
        </div>
        <div class="task-actions">
          <button class="task-btn" onclick="app.openEditModal(${task.id})" title="Edit">✏️</button>
          <button class="task-btn delete" onclick="app.deleteTask(${task.id})" title="Delete">🗑️</button>
        </div>
      </div>
    `
      )
      .join('');
  }

  updateStats() {
    const total = this.tasks.length;
    const active = this.tasks.filter((t) => !t.completed).length;
    const completed = this.tasks.filter((t) => t.completed).length;

    document.getElementById('totalTasks').textContent = total;
    document.getElementById('activeTasks').textContent = active;
    document.getElementById('completedTasks').textContent = completed;
  }

  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}

// Initialize app when DOM is ready
let app;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    app = new TodoApp();
  });
} else {
  app = new TodoApp();
}
