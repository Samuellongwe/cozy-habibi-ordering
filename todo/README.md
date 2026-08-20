# 📝 Todo App — Local Storage Edition

A modern, fully-featured todo application with local storage, categories, due dates, and dark mode.

## Features

✅ **Add, Edit, Delete Tasks** — Full CRUD operations  
✅ **Categories** — Organize tasks by Work, Personal, Shopping, Health, Other  
✅ **Due Dates** — Set deadlines and track overdue/upcoming tasks  
✅ **Search** — Find tasks by keyword in real-time  
✅ **Filter** — View all, active, or completed tasks  
✅ **Dark Mode** — Toggle between light and dark themes  
✅ **Local Storage** — All tasks persist across browser sessions  
✅ **Export/Import** — Backup tasks as JSON, restore from file  
✅ **Stats Dashboard** — Track total, active, and completed tasks  
✅ **Responsive Design** — Works perfectly on mobile, tablet, desktop  
✅ **Animations** — Smooth transitions and visual feedback  
✅ **Accessibility** — Keyboard navigation, semantic HTML  

## Getting Started

### Quick Start
1. Open `index.html` in your web browser
2. Start adding tasks!
3. All data is automatically saved to your browser's local storage

### No Installation Required
- No build process
- No dependencies
- No server needed
- Just open and use!

## Usage

### Adding a Task
1. Enter task name in the input field
2. (Optional) Select a category from the dropdown
3. (Optional) Choose a due date
4. Click "Add Task" or press Enter

### Managing Tasks
- **Mark Complete** — Click the checkbox next to a task
- **Edit Task** — Click the ✏️ icon to open the edit modal
- **Delete Task** — Click the 🗑️ icon
- **Search** — Type in the search box to filter tasks by name

### Filtering
- **All** — Show all tasks
- **Active** — Show only incomplete tasks
- **Completed** — Show only completed tasks

### Theme
Click the 🌙 icon in the header to toggle dark mode. Your preference is saved.

### Backup & Restore
- **Export** — Download all tasks as a JSON file
- **Import** — Upload a previously exported JSON file
- **Clear All** — Delete all tasks at once (with confirmation)

## Data Storage

All tasks are stored in your browser's **localStorage** under the key `todoAppTasks`.

### Task Object Structure
```json
{
  "id": 1234567890,
  "text": "Buy groceries",
  "category": "Shopping",
  "dueDate": "2024-08-25",
  "completed": false,
  "createdAt": "2024-08-20T10:30:00.000Z"
}
```

### Accessing Tasks Programmatically
```javascript
// Get all tasks from local storage
const tasks = JSON.parse(localStorage.getItem('todoAppTasks') || '[]');

// Modify and save
local Storage.setItem('todoAppTasks', JSON.stringify(tasks));
```

## Browser Support

✅ Chrome/Edge 90+  
✅ Firefox 88+  
✅ Safari 14+  
✅ Opera 76+  
✅ Mobile browsers (iOS Safari, Chrome Android)  

## Color Categories

| Category | Color | Use Case |
|----------|-------|----------|
| 🔵 Work | Blue | Work tasks and projects |
| 🟣 Personal | Purple | Personal errands and habits |
| 🌸 Shopping | Pink | Shopping lists and groceries |
| 🟢 Health | Green | Health, fitness, and wellness |
| ⚫ Other | Gray | Everything else |

## Keyboard Shortcuts

- `Enter` — Submit new task from input field
- `Escape` — Close edit modal
- `Tab` — Navigate through form fields

## Tips & Tricks

### Organize by Due Date
Tasks show their due date status:
- 🔴 **Overdue** — Task is past its due date (red)
- 🟡 **Due Today** — Task is due today (orange)
- 🟢 **Upcoming** — Task is due within 7 days (green)

### Bulk Export
Use the Export feature to:
- Backup your tasks
- Share tasks with others
- Migrate to another device
- Archive completed tasks

### Clear Browser Data
⚠️ If you clear your browser's local storage, all tasks will be deleted. Always export first if you want to keep them!

## Limitations & Notes

- Tasks are stored **per browser/device** (not synced across devices)
- Maximum task length: 100 characters
- Tasks are stored in plaintext in local storage
- Clearing browser cache will delete all tasks
- No cloud sync or login required (privacy-first!)

## Privacy

✅ **All data stays on your device**  
✅ No tracking or analytics  
✅ No server calls  
✅ No cookies or accounts needed  
✅ Open source and auditable  

## Development

### Project Structure
```
todo/
├── index.html      # HTML markup
├── styles.css      # Styling and theming
├── app.js          # Application logic
└── README.md       # This file
```

### Class: TodoApp

The `TodoApp` class manages all functionality:

```javascript
const app = new TodoApp();

// Methods
app.addTask()
 app.deleteTask(id)
app.toggleComplete(id)
app.openEditModal(id)
app.saveEdit()
app.exportTasks()
app.importTasks(event)
app.clearAllTasks()
```

### Custom Styling

Modify CSS variables in `styles.css` to customize colors:

```css
:root {
  --primary-color: #3b82f6;  /* Main color */
  --secondary-color: #10b981;  /* Success/secondary */
  --danger-color: #ef4444;   /* Delete button */
  --bg-color: #ffffff;        /* Background */
  --text-color: #1f2937;      /* Text */
}
```

## Future Enhancements

- [ ] Recurring tasks
- [ ] Task priority levels
- [ ] Subtasks/nested tasks
- [ ] Task tags/labels
- [ ] Time-based notifications
- [ ] Cloud sync (optional)
- [ ] Collaborative lists
- [ ] Integration with calendar apps

## License

Open source — feel free to use, modify, and distribute!

## Support

Have a question or found a bug? Feel free to open an issue on GitHub.

---

**Made with ❤️ for productivity**
