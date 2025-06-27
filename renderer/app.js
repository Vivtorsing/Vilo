const { ipcRenderer } = require('electron');

let currentBoard = null;
let boards = [];
let promptCallback = null;
let selectedTask = null;
let selectedSectionId = null;
let taskDragIndex = null;
let taskDragSectionId = null;
let draggedSectionIndex = null;

async function loadBoards() {
  boards = await ipcRenderer.invoke('load-boards');
  renderBoards();
}
function saveBoards() {
  ipcRenderer.invoke('save-boards', boards);
}
loadBoards();

function showPrompt(callback) {
  promptCallback = callback;
  document.getElementById('promptInput').value = '';
  document.getElementById('promptOverlay').classList.remove('hidden');
}

function submitPrompt() {
  const value = document.getElementById('promptInput').value;
  closePrompt();
  if(promptCallback) promptCallback(value);
}

function closePrompt() {
  document.getElementById('promptOverlay').classList.add('hidden');
}

function createBoard() {
  showPrompt((name) => {
    if(name) {
      const board = { id: Date.now(), name, sections: [] };
      boards.push(board);
      saveBoards();
      renderBoards();
    }
  });
}

function renderBoards() {
    const container = document.getElementById('boardsContainer');
    container.innerHTML = '';
    boards.forEach(board => {
        const div = document.createElement('div');
        div.className = 'board';
        div.innerHTML = `
          <h2>${board.name}</h2>
          <button onclick="openBoard(${board.id})">Open</button>
          <button onclick="deleteBoard(${board.id})" class="deleteBtn">Delete</button>
        `;
        container.appendChild(div);
    })
}

function openBoard(id) {
  currentBoard = boards.find(b => b.id === id);
  if(!currentBoard) return;

  document.getElementById('boardListView').classList.add('hidden');
  document.getElementById('boardView').classList.remove('hidden');
  document.getElementById('boardTitle').textContent = currentBoard.name;

  renderSections();
}

function goBack() {
  currentBoard = null;
  document.getElementById('boardListView').classList.remove('hidden');
  document.getElementById('boardView').classList.add('hidden');
}

function deleteBoard(boardId) {
  const confirmed = confirm('Are you sure you want to delete this board?');
  if(confirmed) {
    boards = boards.filter(b => b.id !== boardId);
    saveBoards();
    renderBoards();
  }
}

function renderSections() {
  const container = document.getElementById('sectionsContainer');
  container.innerHTML = '';

  currentBoard.sections.forEach((section, sectionIndex) => {
    const div = document.createElement('div');
    div.className = 'section';
    div.setAttribute('draggable', 'true');
    div.dataset.index = sectionIndex;

    div.addEventListener('dragstart', () => {
      if(taskDragIndex == null) {
        draggedSectionIndex = sectionIndex;
        div.classList.add('dragging-section');
      }
    });

    div.addEventListener('dragend', () => {
      draggedSectionIndex = null;
      div.classList.remove('dragging-section');
    });

    div.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    div.addEventListener('drop', (e) => {
      e.preventDefault();

      if(taskDragIndex !== null || taskDragSectionId !== null) return;

      const targetIndex = parseInt(div.dataset.index);
      if(draggedSectionIndex !== null && draggedSectionIndex !== targetIndex) {
        const moved = currentBoard.sections.splice(draggedSectionIndex, 1)[0];
        currentBoard.sections.splice(targetIndex, 0, moved);
        saveBoards();
        renderSections();
      }
    });

    const input = document.createElement('input');
    input.className = 'sectionTitle';
    input.value = section.name;
    input.onchange = () => renameSection(section.id, input.value);
    div.appendChild(input);

    const tasksContainer = document.createElement('div');
    tasksContainer.className = 'tasks';
    tasksContainer.dataset.sectionId = section.id;
    div.appendChild(tasksContainer);

    const addTaskBtn = document.createElement('button');
    addTaskBtn.textContent = '+ Add Task';
    addTaskBtn.onclick = () => addTask(section.id);
    div.appendChild(addTaskBtn);

    const deleteSectionBtn = document.createElement('button');
    deleteSectionBtn.textContent = '🗑 Delete Section';
    deleteSectionBtn.className = 'deleteBtn';
    deleteSectionBtn.onclick = () => deleteSection(section.id);
    div.appendChild(deleteSectionBtn);

    section.tasks.forEach((task, taskIndex) => {
      const taskEl = document.createElement('div');
      taskEl.className = 'task';
      taskEl.setAttribute('draggable', 'true');
      taskEl.dataset.taskIndex = taskIndex;
      taskEl.dataset.sectionId = section.id;
   
      taskEl.innerHTML = '';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = task.name;
      nameSpan.classList.add('taskName');
      taskEl.appendChild(nameSpan);

      //progress bar
      const total = task.checklist?.length || 0;
      const done = task.checklist?.filter(i => i.checked).length || 0;
      const percent = total > 0 ? Math.round((done / total) * 100) : 0;

      const progressBar = document.createElement('div');
      progressBar.className = 'progressBar';
      progressBar.innerHTML = `
        <div class="progressTrack">
          <div class="progressFill" style="width: ${percent}%;"></div>
        </div>
        <span class="progressText">${percent}%</span>
      `;

      taskEl.appendChild(progressBar);

      //delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '🗑';
      deleteBtn.classList.add('deleteTaskBtn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTask(section.id, task.id);
      });
      taskEl.appendChild(deleteBtn);

      taskEl.addEventListener('click', () => openTask(section.id, task.id));

      taskEl.addEventListener('dragstart', () => {
        taskDragIndex = taskIndex;
        taskDragSectionId = section.id;
        taskEl.classList.add('dragging-task');
      });

      taskEl.addEventListener('dragend', () => {
        taskEl.classList.remove('dragging-task');
        taskDragIndex = null;
        taskDragSectionId = null;
      });

      tasksContainer.appendChild(taskEl);
    });

    tasksContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      const draggingEl = document.querySelector('.dragging-task');
      if(!draggingEl) return;

      const afterElement = getDragAfterElement(tasksContainer, e.clientY);
      if(afterElement == null) {
        tasksContainer.appendChild(draggingEl);
      } else {
        tasksContainer.insertBefore(draggingEl, afterElement);
      }
    });

    tasksContainer.addEventListener('drop', (e) => {
      e.preventDefault();

      if(taskDragIndex === null || taskDragSectionId === null) return;

      const dropSectionId = parseInt(tasksContainer.dataset.sectionId);
      const section = currentBoard.sections.find(s => s.id === dropSectionId);
      const originalSection = currentBoard.sections.find(s => s.id === taskDragSectionId);
      if(!section || !originalSection) return;

      const movedTask = originalSection.tasks.splice(taskDragIndex, 1)[0];

      const afterElement = getDragAfterElement(tasksContainer, e.clientY);
      const newIndex = afterElement
        ? Array.from(tasksContainer.children).indexOf(afterElement)
        : section.tasks.length;

      section.tasks.splice(newIndex, 0, movedTask);

      saveBoards();
      renderSections();
    });

    container.appendChild(div);
  });
}

function renameSection(sectionId, newName) {
  const section = currentBoard.sections.find(s => s.id === sectionId);
  if(section) {
    section.name = newName;
    saveBoards();
  }
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.task:not(.dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if(offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: -Infinity }).element;
}

function addSection() {
  showPrompt(name => {
    if(name) {
      const section = { id: Date.now(), name, tasks: [] };
      currentBoard.sections.push(section);
      saveBoards();
      renderSections();
    }
  });
}

let draggedIndex = null;

function handleDragStart(e) {
  draggedIndex = Number(e.currentTarget.getAttribute('data-index'));
}

function handleDragOver(e) {
  e.preventDefault();
}

function handleDrop(e) {
  const targetIndex = Number(e.currentTarget.getAttribute('data-index'));
  if(draggedIndex === null || draggedIndex === targetIndex) return;

  const moved = currentBoard.sections.splice(draggedIndex, 1)[0];
  currentBoard.sections.splice(targetIndex, 0, moved);

  saveBoards();
  renderSections();
}

function addTask(sectionId) {
  const section = currentBoard.sections.find(s => s.id === sectionId);
  if(!section) return;

  showPrompt(taskName => {
    if(taskName) {
      const task = {
        id: Date.now(),
        name: taskName,
        description: '',
        checklist: []
      };
      section.tasks.push(task);
      saveBoards();
      renderSections();
    }
  });
}

function openTask(sectionId, taskId) {
  selectedSectionId = sectionId;
  const section = currentBoard.sections.find(s => s.id === sectionId);
  if(!section) return;

  selectedTask = section.tasks.find(t => t.id === taskId);
  if(!selectedTask) return;

  document.getElementById('taskTitle').value = selectedTask.name || '';
  document.getElementById('taskDescription').value = selectedTask.description || '';
  renderChecklist(selectedTask.checklist || []);

  document.getElementById('taskOverlay').classList.remove('hidden');
}

let checklistDragIndex = null;

function renderChecklist(task) {
  const container = document.getElementById('checklistItems');
  if(!container) return;

  //progress bar
  const total = task.length;
  const done = task.filter(i => i.checked).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  const checklistContainer = document.getElementById('checklist');
  checklistContainer.innerHTML = `
    <div class="progressBar">
      <div class="progressTrack">
        <div class="progressFill" style="width: ${percent}%;"></div>
      </div>
      <span class="progressText">${percent}%</span>
    </div>
  `;

  container.innerHTML = '';

  task.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'checklistItem';
    div.draggable = true;
    div.dataset.index = index;

    div.innerHTML = `
      <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleChecklistItem(${index})" />
      <input type="text" value="${item.text}" onchange="editChecklistItem(${index}, this.value)" />
      <button onclick="removeChecklistItem(${index})">🗑</button>
    `;

    div.addEventListener('dragstart', (e) => {
      checklistDragIndex = index;
      div.classList.add('dragging');
    });

    div.addEventListener('dragend', () => {
      div.classList.remove('dragging');
      checklistDragIndex = null;
    });

    div.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    div.addEventListener('drop', (e) => {
      e.preventDefault();
      const dropIndex = parseInt(div.dataset.index);
      if(checklistDragIndex !== null && checklistDragIndex !== dropIndex) {
        const moved = task.splice(checklistDragIndex, 1)[0];
        task.splice(dropIndex, 0, moved);
        renderChecklist(task);
        saveBoards();
      }
    });
  
    container.appendChild(div);
  });
}

document.getElementById('taskOverlay').addEventListener('mousedown', (e) => {
  const box = document.querySelector('.taskBox');
  const isInside = box.contains(e.target);

  if(!isInside) {
    setTimeout(() => {
      saveTaskChanges();
      closeTaskOverlay();
    }, 100);
  }
});


function addChecklistItem() {
  if(!selectedTask.checklist) selectedTask.checklist = [];
  selectedTask.checklist.push({ text: '', checked: false });
  renderChecklist(selectedTask.checklist);
}

function removeChecklistItem(index) {
  selectedTask.checklist.splice(index, 1);
  renderChecklist(selectedTask.checklist);
}

function editChecklistItem(index, value) {
  selectedTask.checklist[index].text = value;
}

function toggleChecklistItem(index) {
  selectedTask.checklist[index].checked = !selectedTask.checklist[index].checked;
  saveBoards();
  renderChecklist(selectedTask.checklist);
  renderSections();
}

function saveTaskChanges() {
  if(!selectedTask) return;

  selectedTask.name = document.getElementById('taskTitle').value;
  selectedTask.description = document.getElementById('taskDescription').value;

  saveBoards();
  renderSections();
  closeTaskOverlay();
}

function closeTaskOverlay() {
  document.getElementById('taskOverlay').classList.add('hidden');
  selectedTask = null;
  selectedSectionId = null;
}

function deleteTask(sectionId, taskId) {
  const confirmed = confirm('Are you sure you want to delete this task?');
  if(confirmed) {
    const section = currentBoard.sections.find(s => s.id === sectionId);
    if(!section) return;

    section.tasks = section.tasks.filter(t => t.id !== taskId);
    saveBoards();
    renderSections();
  }
}

function deleteSection(sectionId) {
  const confirmed = confirm('Are you sure you want to delete this section?');
  if(!confirmed) return;

  currentBoard.sections = currentBoard.sections.filter(s => s.id !== sectionId);
  saveBoards();
  renderSections();
}

renderBoards();