"use strict";

const MOSCOW_TIME_ZONE = "Europe/Moscow";
const STORAGE_KEY = 'weekcraft_tasks';
const STORAGE_LOAD_ERROR_MESSAGE = "Не удалось загрузить сохраненные задачи. Данные повреждены или недоступны.";
const ACTIVE_TASK_STATUSES = ["active", "done"];
const DAILY_QUOTE_API_URL = "https://api.allorigins.win/raw?url=http%3A%2F%2Fapi.forismatic.com%2Fapi%2F1.0%2F%3Fmethod%3DgetQuote%26format%3Djson%26lang%3Dru";

const state = {
  tasks: [],
  currentWeekStart: null, // дата понедельника отображаемой недели (YYYY-MM-DD)
  selectedDate: null,     // дата выбранного активного дня (YYYY-MM-DD)
  activeBacklogSection: 'ideas',
  pendingDelete: null
};

const elements = {
  prevWeekBtn: document.getElementById("prevWeekBtn"),
  todayBtn: document.getElementById("todayBtn"),
  nextWeekBtn: document.getElementById("nextWeekBtn"),
  addTaskBtn: document.getElementById("addTaskBtn"),
  reviewWeekBtn: document.getElementById("reviewWeekBtn"),
  addBacklogTaskBtn: document.getElementById("addBacklogTaskBtn"),
  weekPanel: document.getElementById("weekPanel"),
  selectedDayTitle: document.getElementById("selectedDayTitle"),
  dailyReflection: document.getElementById("dailyReflection"),
  timeline: document.getElementById("timeline"),
  backlogList: document.getElementById("backlogList"),
  backlogTabs: document.querySelector(".backlog-tabs"),
  taskModal: document.getElementById("taskModal"),
  reviewModal: document.getElementById("reviewModal"),
  undoToast: document.getElementById("undoToast")
};

const categoryOptions = [
  { value: "task", label: "Задачи" },
  { value: "meeting", label: "Встречи" },
  { value: "report", label: "Отчетность" },
  { value: "personal", label: "Личное" },
  { value: "idea", label: "Идея" }
];
const statusOptions = [
  { value: "active", label: "Активна" },
  { value: "done", label: "Выполнена" }
];
const backlogSectionOptions = [
  { value: "ideas", label: "Идеи" },
  { value: "later", label: "Сделать позже" }
];
const fallbackDailyQuotes = [
  "День становится яснее, когда у него есть один честный приоритет.",
  "План нужен не для контроля над жизнью, а для бережного внимания к важному.",
  "Фокус начинается там, где мы спокойно отказываемся от лишнего.",
  "Отдых не пауза в продуктивности, а часть хорошего ритма.",
  "Маленький шаг, сделанный сегодня, часто сильнее большого намерения на потом.",
  "Тишина между задачами помогает услышать, что действительно требует участия.",
  "Неделя складывается не из идеальных дней, а из возвращений к главному.",
  "Хороший план оставляет место дыханию, людям и неожиданным открытиям.",
  "Завершенность приходит не от количества дел, а от ясности выбора.",
  "Если день перегружен, начни с самого человеческого: воды, воздуха и одного дела.",
  "Рефлексия превращает опыт в направление.",
  "Не каждая задача срочная; некоторые просто ждут подходящего внимания.",
  "Сначала определи смысл, затем время само найдет форму.",
  "Усталость тоже данные. Прислушайся к ним перед новым решением.",
  "Порядок в делах начинается с доброты к себе.",
  "Лучший фокус не сжимает день, а освобождает его от шума.",
  "Перенести задачу можно осознанно; потерять себя в списке не обязательно.",
  "Каждый день просит не всего тебя, а честного присутствия в главном."
];
const dailyQuoteCache = new Map();
let dailyQuoteRequestId = 0;

const weekDayNamesShort = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const weekDayNamesLong = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье"
];
const monthNames = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря"
];

function showStorageLoadError() {
  if (elements.timeline) {
    elements.timeline.innerHTML = `
      <div class="timeline-placeholder">
        <span>!</span>
        <p>${STORAGE_LOAD_ERROR_MESSAGE}</p>
      </div>
    `;
  }

  if (typeof alert === "function") {
    alert(STORAGE_LOAD_ERROR_MESSAGE);
  }
}

function askToClearStorage() {
  if (typeof confirm !== "function") {
    return false;
  }

  return confirm("Очистить поврежденные сохраненные задачи?");
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
}

function loadTasks() {
  let savedTasks = null;

  try {
    savedTasks = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    state.tasks = [];
    showStorageLoadError();
    return;
  }

  if (savedTasks === null) {
    state.tasks = [];
    return;
  }

  try {
    const parsedTasks = JSON.parse(savedTasks);

    if (!Array.isArray(parsedTasks)) {
      throw new Error("Saved tasks must be an array.");
    }

    state.tasks = parsedTasks;
  } catch (error) {
    state.tasks = [];
    showStorageLoadError();

    if (askToClearStorage()) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getStableIndex(value, length) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash) % length;
}

function getFallbackDailyQuote(dateString) {
  return fallbackDailyQuotes[getStableIndex(dateString, fallbackDailyQuotes.length)];
}

function normalizeQuote(rawQuote) {
  return String(rawQuote || "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchDailyQuote(dateString = state.selectedDate) {
  if (dailyQuoteCache.has(dateString)) {
    return dailyQuoteCache.get(dateString);
  }

  let timeoutId = null;

  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(DAILY_QUOTE_API_URL, {
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Daily quote request failed.");
    }

    const quoteData = await response.json();
    const quote = normalizeQuote(quoteData.quoteText);

    if (!quote) {
      throw new Error("Daily quote is empty.");
    }

    dailyQuoteCache.set(dateString, quote);
    return quote;
  } catch (error) {
    const fallbackQuote = getFallbackDailyQuote(dateString);
    dailyQuoteCache.set(dateString, fallbackQuote);

    return fallbackQuote;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function renderDailyReflection() {
  const dateString = state.selectedDate;
  const requestId = dailyQuoteRequestId + 1;
  dailyQuoteRequestId = requestId;
  elements.dailyReflection.textContent = "Настраиваемся на день...";
  elements.dailyReflection.setAttribute("aria-busy", "true");

  const quote = await fetchDailyQuote(dateString);

  if (requestId !== dailyQuoteRequestId || dateString !== state.selectedDate) {
    return;
  }

  elements.dailyReflection.textContent = quote;
  elements.dailyReflection.setAttribute("aria-busy", "false");
}

function getTaskCategoriesForDate(dateString) {
  const pendingDeleteId = state.pendingDelete?.task.id;

  return [...new Set(
    state.tasks
      .filter((task) => (
        task.date === dateString &&
        task.location === "calendar" &&
        task.id !== pendingDeleteId &&
        ACTIVE_TASK_STATUSES.includes(task.status)
      ))
      .map((task) => task.category)
  )];
}

function getTasksForSelectedDate() {
  const pendingDeleteId = state.pendingDelete?.task.id;

  return state.tasks
    .filter((task) => (
      task.date === state.selectedDate &&
      task.location === "calendar" &&
      task.id !== pendingDeleteId &&
      ACTIVE_TASK_STATUSES.includes(task.status)
    ))
    .sort((firstTask, secondTask) => {
      if (firstTask.time !== secondTask.time) {
        return firstTask.time.localeCompare(secondTask.time);
      }

      return firstTask.createdAt.localeCompare(secondTask.createdAt);
    });
}

function getBacklogTasks() {
  const pendingDeleteId = state.pendingDelete?.task.id;

  return state.tasks
    .filter((task) => (
      task.location === "backlog" &&
      task.backlogSection === state.activeBacklogSection &&
      task.id !== pendingDeleteId &&
      ACTIVE_TASK_STATUSES.includes(task.status)
    ))
    .sort((firstTask, secondTask) => firstTask.createdAt.localeCompare(secondTask.createdAt));
}

function getTimeOptionsHtml() {
  return Array.from({ length: 13 }, (_, index) => {
    const hour = String(index + 9).padStart(2, "0");
    const time = `${hour}:00`;

    return `<option value="${time}">${time}</option>`;
  }).join("");
}

function getCategoryOptionsHtml() {
  return categoryOptions
    .map((category) => `<option value="${category.value}">${category.label}</option>`)
    .join("");
}

function getNullableCategoryOptionsHtml(selectedCategory = "") {
  return categoryOptions
    .map((category) => `
      <option value="${category.value}" ${category.value === selectedCategory ? "selected" : ""}>
        ${category.label}
      </option>
    `)
    .join("");
}

function getBacklogSectionOptionsHtml(selectedSection = state.activeBacklogSection) {
  return backlogSectionOptions
    .map((section) => `
      <option value="${section.value}" ${section.value === selectedSection ? "selected" : ""}>
        ${section.label}
      </option>
    `)
    .join("");
}

function getStatusOptionsHtml(selectedStatus) {
  return statusOptions
    .map((status) => `
      <option value="${status.value}" ${status.value === selectedStatus ? "selected" : ""}>
        ${status.label}
      </option>
    `)
    .join("");
}

function getTaskById(taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

function getCategoryLabel(categoryValue) {
  return categoryOptions.find((category) => category.value === categoryValue)?.label ?? "Без категории";
}

function getBacklogSectionLabel(sectionValue) {
  return backlogSectionOptions.find((section) => section.value === sectionValue)?.label ?? sectionValue;
}

function renderTaskModal(task = null) {
  const isEditing = Boolean(task);
  const modalContent = elements.taskModal.querySelector(".modal__content");

  modalContent.innerHTML = `
    <form class="task-form" id="taskForm" data-mode="${isEditing ? "edit" : "create"}" data-task-id="${task?.id ?? ""}" novalidate>
      <div class="modal__header">
        <h2 id="taskModalTitle">${isEditing ? "Редактировать задачу" : "Новая задача"}</h2>
        <button class="modal__close" type="button" id="cancelTaskBtn" aria-label="Закрыть">×</button>
      </div>

      <div class="form-field">
        <label for="taskTitleInput">Текст задачи</label>
        <input id="taskTitleInput" name="title" type="text" value="${escapeHtml(task?.title ?? "")}" autocomplete="off">
        <p class="form-error" id="taskTitleError"></p>
      </div>

      ${isEditing ? `
        <div class="form-field">
          <label for="taskDateInput">Дата</label>
          <input id="taskDateInput" name="date" type="date" value="${task.date}">
          <p class="form-error" id="taskDateError"></p>
        </div>
      ` : ""}

      <div class="form-field">
        <label for="taskTimeSelect">Время</label>
        <select id="taskTimeSelect" name="time">
          <option value="">Выберите время</option>
          ${getTimeOptionsHtml().replace(`value="${task?.time ?? ""}"`, `value="${task?.time ?? ""}" selected`)}
        </select>
        <p class="form-error" id="taskTimeError"></p>
      </div>

      <div class="form-field">
        <label for="taskCategorySelect">Категория</label>
        <select id="taskCategorySelect" name="category">
          <option value="">Выберите категорию</option>
          ${getCategoryOptionsHtml().replace(`value="${task?.category ?? ""}"`, `value="${task?.category ?? ""}" selected`)}
        </select>
        <p class="form-error" id="taskCategoryError"></p>
      </div>

      ${isEditing ? `
        <div class="form-field">
          <label for="taskStatusSelect">Статус</label>
          <select id="taskStatusSelect" name="status">
            ${getStatusOptionsHtml(task.status)}
          </select>
        </div>
      ` : ""}

      <div class="modal__actions">
        <button class="btn btn--secondary" type="button" id="cancelTaskFormBtn">Отмена</button>
        <button class="btn btn--primary" type="submit">Сохранить</button>
      </div>
    </form>
  `;

  document.getElementById("taskForm").addEventListener("submit", handleTaskFormSubmit);
  document.getElementById("cancelTaskBtn").addEventListener("click", closeTaskModal);
  document.getElementById("cancelTaskFormBtn").addEventListener("click", closeTaskModal);
}

function renderBacklogTaskModal(task = null) {
  const isEditing = Boolean(task);
  const modalContent = elements.taskModal.querySelector(".modal__content");

  modalContent.innerHTML = `
    <form class="task-form" id="taskForm" data-mode="${isEditing ? "edit-backlog" : "create-backlog"}" data-task-id="${task?.id ?? ""}" novalidate>
      <div class="modal__header">
        <h2 id="taskModalTitle">${isEditing ? "Редактировать задачу бэклога" : "Новая задача в бэклоге"}</h2>
        <button class="modal__close" type="button" id="cancelTaskBtn" aria-label="Закрыть">×</button>
      </div>

      <div class="form-field">
        <label for="taskTitleInput">Текст</label>
        <input id="taskTitleInput" name="title" type="text" value="${escapeHtml(task?.title ?? "")}" autocomplete="off">
        <p class="form-error" id="taskTitleError"></p>
      </div>

      <div class="form-field">
        <label for="backlogSectionSelect">Раздел бэклога</label>
        <select id="backlogSectionSelect" name="backlogSection">
          <option value="">Выберите раздел</option>
          ${getBacklogSectionOptionsHtml(task?.backlogSection ?? state.activeBacklogSection)}
        </select>
        <p class="form-error" id="taskBacklogSectionError"></p>
      </div>

      <div class="form-field">
        <label for="taskCategorySelect">Категория</label>
        <select id="taskCategorySelect" name="category">
          <option value="" ${task?.category ? "" : "selected"}>Без категории</option>
          ${getNullableCategoryOptionsHtml(task?.category ?? "")}
        </select>
        <p class="form-error" id="taskCategoryError"></p>
      </div>

      ${isEditing ? `
        <div class="form-field">
          <label for="taskStatusSelect">Статус</label>
          <select id="taskStatusSelect" name="status">
            ${getStatusOptionsHtml(task.status)}
          </select>
        </div>
      ` : ""}

      <div class="modal__actions">
        <button class="btn btn--secondary" type="button" id="cancelTaskFormBtn">Отмена</button>
        <button class="btn btn--primary" type="submit">Сохранить</button>
      </div>
    </form>
  `;

  document.getElementById("taskForm").addEventListener("submit", handleTaskFormSubmit);
  document.getElementById("cancelTaskBtn").addEventListener("click", closeTaskModal);
  document.getElementById("cancelTaskFormBtn").addEventListener("click", closeTaskModal);
}

function renderMoveToBacklogModal(task) {
  const modalContent = elements.taskModal.querySelector(".modal__content");

  modalContent.innerHTML = `
    <form class="task-form" id="taskForm" data-mode="move-to-backlog" data-task-id="${task.id}" novalidate>
      <div class="modal__header">
        <h2 id="taskModalTitle">Переместить в бэклог</h2>
        <button class="modal__close" type="button" id="cancelTaskBtn" aria-label="Закрыть">×</button>
      </div>

      <div class="form-field">
        <label for="backlogSectionSelect">Раздел бэклога</label>
        <select id="backlogSectionSelect" name="backlogSection">
          <option value="">Выберите раздел</option>
          ${getBacklogSectionOptionsHtml("ideas")}
        </select>
        <p class="form-error" id="taskBacklogSectionError"></p>
      </div>

      <div class="modal__actions">
        <button class="btn btn--secondary" type="button" id="cancelTaskFormBtn">Отмена</button>
        <button class="btn btn--primary" type="submit">Переместить</button>
      </div>
    </form>
  `;

  document.getElementById("taskForm").addEventListener("submit", handleTaskFormSubmit);
  document.getElementById("cancelTaskBtn").addEventListener("click", closeTaskModal);
  document.getElementById("cancelTaskFormBtn").addEventListener("click", closeTaskModal);
}

function renderMoveToCalendarModal(task, targetDate) {
  const modalContent = elements.taskModal.querySelector(".modal__content");

  modalContent.innerHTML = `
    <form class="task-form" id="taskForm" data-mode="move-to-calendar" data-task-id="${task.id}" novalidate>
      <div class="modal__header">
        <h2 id="taskModalTitle">Перенести в календарь</h2>
        <button class="modal__close" type="button" id="cancelTaskBtn" aria-label="Закрыть">×</button>
      </div>

      <div class="form-field">
        <label for="taskTitleInput">Текст задачи</label>
        <input id="taskTitleInput" name="title" type="text" value="${escapeHtml(task.title)}" autocomplete="off">
        <p class="form-error" id="taskTitleError"></p>
      </div>

      <div class="form-field">
        <label for="taskDateInput">Дата</label>
        <input id="taskDateInput" name="date" type="date" value="${targetDate}">
        <p class="form-error" id="taskDateError"></p>
      </div>

      <div class="form-field">
        <label for="taskTimeSelect">Время</label>
        <select id="taskTimeSelect" name="time">
          <option value="">Выберите время</option>
          ${getTimeOptionsHtml()}
        </select>
        <p class="form-error" id="taskTimeError"></p>
      </div>

      <div class="form-field">
        <label for="taskCategorySelect">Категория</label>
        <select id="taskCategorySelect" name="category">
          <option value="" ${task.category ? "" : "selected"}>Выберите категорию</option>
          ${getNullableCategoryOptionsHtml(task.category ?? "")}
        </select>
        <p class="form-error" id="taskCategoryError"></p>
      </div>

      <div class="modal__actions">
        <button class="btn btn--secondary" type="button" id="cancelTaskFormBtn">Отмена</button>
        <button class="btn btn--primary" type="submit">Сохранить</button>
      </div>
    </form>
  `;

  document.getElementById("taskForm").addEventListener("submit", handleTaskFormSubmit);
  document.getElementById("cancelTaskBtn").addEventListener("click", closeTaskModal);
  document.getElementById("cancelTaskFormBtn").addEventListener("click", closeTaskModal);
}

function openTaskModal(task = null) {
  renderTaskModal(task);
  elements.taskModal.style.display = "block";
  elements.taskModal.setAttribute("aria-hidden", "false");
  document.getElementById("taskTitleInput").focus();
}

function openBacklogTaskModal(task = null) {
  renderBacklogTaskModal(task);
  elements.taskModal.style.display = "block";
  elements.taskModal.setAttribute("aria-hidden", "false");
  document.getElementById("taskTitleInput").focus();
}

function openEditTaskModal(taskId) {
  const task = getTaskById(taskId);

  if (!task) {
    return;
  }

  if (task.location === "backlog") {
    openBacklogTaskModal(task);
    return;
  }

  openTaskModal(task);
}

function openMoveToBacklogModal(taskId) {
  const task = getTaskById(taskId);

  if (!task) {
    return;
  }

  renderMoveToBacklogModal(task);
  elements.taskModal.style.display = "block";
  elements.taskModal.setAttribute("aria-hidden", "false");
}

function openMoveToCalendarModal(taskId, targetDate) {
  const task = getTaskById(taskId);

  if (!task) {
    return;
  }

  renderMoveToCalendarModal(task, targetDate);
  elements.taskModal.style.display = "block";
  elements.taskModal.setAttribute("aria-hidden", "false");
  document.getElementById("taskTitleInput").focus();
}

function closeTaskModal() {
  elements.taskModal.style.display = "none";
  elements.taskModal.setAttribute("aria-hidden", "true");
}

function closeReviewModal() {
  elements.reviewModal.style.display = "none";
  elements.reviewModal.setAttribute("aria-hidden", "true");
}

function setFormError(elementId, message) {
  document.getElementById(elementId).textContent = message;
}

function validateTaskForm(formData) {
  const errors = {
    title: "",
    date: "",
    time: "",
    category: ""
  };

  if (!formData.title.trim()) {
    errors.title = "Введите текст задачи.";
  } else if (formData.title.trim().length > 120) {
    errors.title = "Максимальная длина задачи - 120 символов.";
  }

  if (!formData.time) {
    errors.time = "Выберите время задачи.";
  }

  if (!formData.category) {
    errors.category = "Выберите категорию задачи.";
  }

  if (formData.date !== undefined && !formData.date) {
    errors.date = "Выберите дату задачи.";
  }

  return errors;
}

function validateTaskTitle(title) {
  if (!title.trim()) {
    return "Введите текст задачи.";
  }

  if (title.trim().length > 120) {
    return "Максимальная длина задачи - 120 символов.";
  }

  return "";
}

function saveBacklogTask(form, formData) {
  const now = new Date().toISOString();
  const editingTask = form.dataset.mode === "edit-backlog"
    ? getTaskById(form.dataset.taskId)
    : null;

  if (editingTask) {
    editingTask.title = formData.title.trim();
    editingTask.date = null;
    editingTask.time = null;
    editingTask.category = formData.category || null;
    editingTask.status = formData.status;
    editingTask.location = 'backlog';
    editingTask.backlogSection = formData.backlogSection;
    editingTask.updatedAt = now;
  } else {
    state.tasks.push({
      id: `task-${Date.now()}`,
      title: formData.title.trim(),
      date: null,
      time: null,
      category: formData.category || null,
      status: 'active',
      location: 'backlog',
      backlogSection: formData.backlogSection,
      createdAt: now,
      updatedAt: now
    });
  }

  state.activeBacklogSection = formData.backlogSection;
  saveTasks();
  closeTaskModal();
  rerenderTaskViews();
}

function moveTaskToBacklog(taskId, backlogSection) {
  const task = getTaskById(taskId);

  if (!task) {
    return;
  }

  task.date = null;
  task.time = null;
  task.location = 'backlog';
  task.backlogSection = backlogSection;
  task.updatedAt = new Date().toISOString();
  state.activeBacklogSection = backlogSection;

  saveTasks();
  rerenderTaskViews();
}

function moveTaskToCalendar(taskId, formData) {
  const task = getTaskById(taskId);

  if (!task) {
    return;
  }

  task.title = formData.title.trim();
  task.date = formData.date;
  task.time = formData.time;
  task.category = formData.category;
  task.location = 'calendar';
  task.backlogSection = null;
  task.updatedAt = new Date().toISOString();

  saveTasks();
  rerenderTaskViews();
}

function moveCalendarTaskToDate(taskId, targetDate) {
  const task = getTaskById(taskId);

  if (!task) {
    return;
  }

  task.date = targetDate;
  task.updatedAt = new Date().toISOString();

  saveTasks();
  rerenderTaskViews();
}

function getCurrentWeekDateSet() {
  return new Set(getWeekDays(state.currentWeekStart));
}

function getUnfinishedCurrentWeekTasks() {
  const weekDates = getCurrentWeekDateSet();

  return state.tasks
    .filter((task) => (
      task.location === 'calendar' &&
      task.status === 'active' &&
      weekDates.has(task.date)
    ))
    .sort((firstTask, secondTask) => {
      if (firstTask.date !== secondTask.date) {
        return firstTask.date.localeCompare(secondTask.date);
      }

      if (firstTask.time !== secondTask.time) {
        return firstTask.time.localeCompare(secondTask.time);
      }

      return firstTask.createdAt.localeCompare(secondTask.createdAt);
    });
}

function renderReviewTask(task) {
  return `
    <article class="review-item" data-task-id="${task.id}">
      <div class="review-item__summary">
        <h3>${escapeHtml(task.title)}</h3>
        <p>${formatSelectedDayTitle(task.date)} · ${task.time} · ${getCategoryLabel(task.category)}</p>
      </div>

      <div class="form-field">
        <label for="reviewAction-${task.id}">Действие</label>
        <select id="reviewAction-${task.id}" class="review-action" name="reviewAction">
          <option value="keep">Оставить как есть</option>
          <option value="reschedule">Назначить новый срок</option>
          <option value="backlog">Переместить в бэклог</option>
          <option value="done">Отметить выполненной</option>
        </select>
      </div>

      <div class="review-extra review-extra--reschedule" hidden>
        <div class="form-field">
          <label for="reviewDate-${task.id}">Новая дата</label>
          <input id="reviewDate-${task.id}" class="review-date" type="date" value="${task.date}">
        </div>
        <div class="form-field">
          <label for="reviewTime-${task.id}">Новое время</label>
          <select id="reviewTime-${task.id}" class="review-time">
            <option value="">Выберите время</option>
            ${getTimeOptionsHtml().replace(`value="${task.time}"`, `value="${task.time}" selected`)}
          </select>
        </div>
      </div>

      <div class="review-extra review-extra--backlog" hidden>
        <div class="form-field">
          <label for="reviewBacklog-${task.id}">Раздел бэклога</label>
          <select id="reviewBacklog-${task.id}" class="review-backlog-section">
            ${getBacklogSectionOptionsHtml("ideas")}
          </select>
        </div>
      </div>

      <p class="form-error review-error"></p>
    </article>
  `;
}

function renderReviewModal() {
  const unfinishedTasks = getUnfinishedCurrentWeekTasks();
  const modalContent = elements.reviewModal.querySelector(".modal__content");

  modalContent.innerHTML = `
    <form class="review-form" id="reviewForm" novalidate>
      <div class="modal__header">
        <h2 id="reviewModalTitle">Разбор недели</h2>
        <button class="modal__close" type="button" id="closeReviewBtn" aria-label="Закрыть">×</button>
      </div>

      ${unfinishedTasks.length === 0 ? `
        <div class="review-empty">За эту неделю нет невыполненных задач.</div>
      ` : `
        <div class="review-list">
          ${unfinishedTasks.map(renderReviewTask).join("")}
        </div>
      `}

      <div class="modal__actions">
        <button class="btn btn--secondary" type="button" id="cancelReviewBtn">Отмена</button>
        <button class="btn btn--primary" type="submit">Готово</button>
      </div>
    </form>
  `;

  document.getElementById("reviewForm").addEventListener("submit", handleReviewSubmit);
  document.getElementById("reviewForm").addEventListener("change", handleReviewActionChange);
  document.getElementById("closeReviewBtn").addEventListener("click", closeReviewModal);
  document.getElementById("cancelReviewBtn").addEventListener("click", closeReviewModal);
}

function openReviewModal() {
  renderReviewModal();
  elements.reviewModal.style.display = "block";
  elements.reviewModal.setAttribute("aria-hidden", "false");
}

function handleReviewActionChange(event) {
  if (!event.target.classList.contains("review-action")) {
    return;
  }

  const reviewItem = event.target.closest(".review-item");
  const action = event.target.value;

  reviewItem.querySelector(".review-extra--reschedule").hidden = action !== "reschedule";
  reviewItem.querySelector(".review-extra--backlog").hidden = action !== "backlog";
  reviewItem.querySelector(".review-error").textContent = "";
}

function validateReviewItem(reviewItem) {
  const action = reviewItem.querySelector(".review-action").value;
  const errorElement = reviewItem.querySelector(".review-error");

  errorElement.textContent = "";

  if (action !== "reschedule") {
    return true;
  }

  const date = reviewItem.querySelector(".review-date").value;
  const time = reviewItem.querySelector(".review-time").value;

  if (!date || !time) {
    errorElement.textContent = "Выберите новую дату и время.";
    return false;
  }

  return true;
}

function applyReviewAction(reviewItem) {
  const task = getTaskById(reviewItem.dataset.taskId);
  const action = reviewItem.querySelector(".review-action").value;

  if (!task || action === "keep") {
    return;
  }

  const now = new Date().toISOString();

  if (action === "reschedule") {
    const date = reviewItem.querySelector(".review-date").value;
    const time = reviewItem.querySelector(".review-time").value;

    task.date = date;
    task.time = time;
    task.status = 'active';
    task.updatedAt = now;
    return;
  }

  if (action === "backlog") {
    const backlogSection = reviewItem.querySelector(".review-backlog-section").value;

    task.date = null;
    task.time = null;
    task.location = 'backlog';
    task.backlogSection = backlogSection;
    task.updatedAt = now;
    state.activeBacklogSection = backlogSection;
    return;
  }

  if (action === "done") {
    task.status = 'done';
    task.updatedAt = now;
  }
}

function handleReviewSubmit(event) {
  event.preventDefault();

  const reviewItems = Array.from(elements.reviewModal.querySelectorAll(".review-item"));
  let canClose = true;

  reviewItems.forEach((reviewItem) => {
    if (!validateReviewItem(reviewItem)) {
      canClose = false;
    }
  });

  if (!canClose) {
    return;
  }

  reviewItems.forEach(applyReviewAction);
  saveTasks();
  closeReviewModal();
  rerenderTaskViews();
}

function cleanupDoneTasksForCurrentWeek() {
  const weekDates = getCurrentWeekDateSet();
  const initialLength = state.tasks.length;

  state.tasks = state.tasks.filter((task) => !(
    task.location === 'calendar' &&
    task.status === 'done' &&
    weekDates.has(task.date)
  ));

  if (state.tasks.length !== initialLength) {
    saveTasks();
  }
}

function handleTaskFormSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const mode = form.dataset.mode;
  const formData = {
    title: form.elements.title?.value ?? "",
    date: form.elements.date?.value,
    time: form.elements.time?.value,
    category: form.elements.category?.value ?? "",
    status: form.elements.status?.value,
    backlogSection: form.elements.backlogSection?.value
  };

  if (mode === "move-to-backlog") {
    if (!formData.backlogSection) {
      setFormError("taskBacklogSectionError", "Выберите раздел бэклога.");
      return;
    }

    moveTaskToBacklog(form.dataset.taskId, formData.backlogSection);
    closeTaskModal();
    return;
  }

  if (mode === "move-to-calendar") {
    const errors = validateTaskForm(formData);

    setFormError("taskTitleError", errors.title);
    setFormError("taskDateError", errors.date);
    setFormError("taskTimeError", errors.time);
    setFormError("taskCategoryError", errors.category);

    if (errors.title || errors.date || errors.time || errors.category) {
      return;
    }

    moveTaskToCalendar(form.dataset.taskId, formData);
    closeTaskModal();
    return;
  }

  if (mode === "create-backlog" || mode === "edit-backlog") {
    const titleError = validateTaskTitle(formData.title);
    const sectionError = formData.backlogSection ? "" : "Выберите раздел бэклога.";

    setFormError("taskTitleError", titleError);
    setFormError("taskBacklogSectionError", sectionError);

    if (titleError || sectionError) {
      return;
    }

    saveBacklogTask(form, formData);
    return;
  }

  const errors = validateTaskForm(formData);

  setFormError("taskTitleError", errors.title);
  if (form.elements.date) {
    setFormError("taskDateError", errors.date);
  }
  setFormError("taskTimeError", errors.time);
  setFormError("taskCategoryError", errors.category);

  if (errors.title || errors.date || errors.time || errors.category) {
    return;
  }

  const now = new Date().toISOString();
  const editingTask = form.dataset.mode === "edit"
    ? getTaskById(form.dataset.taskId)
    : null;

  if (editingTask) {
    editingTask.title = formData.title.trim();
    editingTask.date = formData.date;
    editingTask.time = formData.time;
    editingTask.category = formData.category;
    editingTask.status = formData.status;
    editingTask.updatedAt = now;

    saveTasks();
    closeTaskModal();
    rerenderTaskViews();
    return;
  }

  const task = {
    id: `task-${Date.now()}`,
    title: formData.title.trim(),
    date: state.selectedDate,
    time: formData.time,
    category: formData.category,
    status: 'active',
    location: 'calendar',
    backlogSection: null,
    createdAt: now,
    updatedAt: now
  };

  state.tasks.push(task);
  saveTasks();
  closeTaskModal();
  rerenderTaskViews();
}

function rerenderTaskViews() {
  renderWeekPanel();
  renderTimeline();
  renderBacklog();
}

function toggleTaskStatus(taskId, isDone) {
  const task = getTaskById(taskId);

  if (!task) {
    return;
  }

  task.status = isDone ? "done" : "active";
  task.updatedAt = new Date().toISOString();
  saveTasks();
  rerenderTaskViews();
}

function hideUndoToast() {
  elements.undoToast.style.display = "none";
  elements.undoToast.innerHTML = "";
}

function finalizePendingDelete() {
  if (!state.pendingDelete) {
    return;
  }

  const deletedTaskId = state.pendingDelete.task.id;

  state.tasks = state.tasks.filter((task) => task.id !== deletedTaskId);
  state.pendingDelete = null;
  saveTasks();
  hideUndoToast();
  rerenderTaskViews();
}

function undoDeleteTask() {
  if (!state.pendingDelete) {
    return;
  }

  clearTimeout(state.pendingDelete.timeoutId);
  state.pendingDelete = null;
  hideUndoToast();
  rerenderTaskViews();
}

function showUndoToast() {
  elements.undoToast.innerHTML = `
    <span>Задача удалена.</span>
    <button class="undo-toast__button" type="button" id="undoDeleteBtn">Отменить</button>
  `;
  elements.undoToast.style.display = "flex";
  document.getElementById("undoDeleteBtn").addEventListener("click", undoDeleteTask);
}

function deleteTaskWithUndo(taskId) {
  const task = getTaskById(taskId);

  if (!task) {
    return;
  }

  if (state.pendingDelete) {
    clearTimeout(state.pendingDelete.timeoutId);
    finalizePendingDelete();
  }

  const timeoutId = setTimeout(finalizePendingDelete, 5000);
  state.pendingDelete = {
    task: { ...task },
    timeoutId
  };

  showUndoToast();
  rerenderTaskViews();
}

function handleTimelineChange(event) {
  if (!event.target.classList.contains("task-card__checkbox")) {
    return;
  }

  const taskCard = event.target.closest(".task-card");
  toggleTaskStatus(taskCard.dataset.taskId, event.target.checked);
}

function handleTimelineClick(event) {
  const actionButton = event.target.closest("[data-action]");

  if (!actionButton) {
    return;
  }

  const taskCard = actionButton.closest(".task-card");
  const taskId = taskCard.dataset.taskId;
  const action = actionButton.dataset.action;

  if (action === "edit") {
    openEditTaskModal(taskId);
  }

  if (action === "delete") {
    deleteTaskWithUndo(taskId);
  }

  if (action === "move-to-backlog") {
    openMoveToBacklogModal(taskId);
  }
}

function handleBacklogTabClick(event) {
  const tabButton = event.target.closest("[data-section]");

  if (!tabButton) {
    return;
  }

  state.activeBacklogSection = tabButton.dataset.section;
  renderBacklog();
}

function handleTaskDragStart(event) {
  const taskCard = event.target.closest(".task-card");

  if (!taskCard || !event.dataTransfer) {
    return;
  }

  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", taskCard.dataset.taskId);
  event.dataTransfer.setData("application/x-weekcraft-task", taskCard.dataset.taskId);
  taskCard.classList.add("is-dragging");
}

function handleTaskDragEnd(event) {
  const taskCard = event.target.closest(".task-card");

  if (taskCard) {
    taskCard.classList.remove("is-dragging");
  }
}

function handleWeekPanelDragOver(event) {
  if (!event.target.closest(".day-card")) {
    return;
  }

  event.preventDefault();

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
}

function handleWeekPanelDrop(event) {
  const dayCard = event.target.closest(".day-card");

  if (!dayCard) {
    return;
  }

  event.preventDefault();

  const taskId = event.dataTransfer?.getData("application/x-weekcraft-task") ||
    event.dataTransfer?.getData("text/plain");
  const targetDate = dayCard.dataset.date;
  const task = getTaskById(taskId);

  if (!task || !targetDate) {
    return;
  }

  if (task.location === "backlog") {
    openMoveToCalendarModal(task.id, targetDate);
    return;
  }

  moveCalendarTaskToDate(task.id, targetDate);
}

function getMoscowDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOSCOW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const dateParts = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

function parseDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(dateString, dayCount) {
  const date = parseDate(dateString);
  date.setUTCDate(date.getUTCDate() + dayCount);

  return formatDate(date);
}

function getWeekStart(date) {
  const parsedDate = parseDate(date);
  const dayOfWeek = parsedDate.getUTCDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  parsedDate.setUTCDate(parsedDate.getUTCDate() - daysFromMonday);

  return formatDate(parsedDate);
}

function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function getWeekDayIndex(dateString) {
  const dayOfWeek = parseDate(dateString).getUTCDay();

  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}

function formatDayMonth(dateString) {
  const date = parseDate(dateString);

  return `${date.getUTCDate()} ${monthNames[date.getUTCMonth()]}`;
}

function formatSelectedDayTitle(dateString) {
  const weekday = weekDayNamesLong[getWeekDayIndex(dateString)];

  return `${weekday}, ${formatDayMonth(dateString)}`;
}

function renderWeekPanel() {
  const today = getMoscowDate();
  const weekDays = getWeekDays(state.currentWeekStart);

  elements.weekPanel.innerHTML = "";

  weekDays.forEach((dateString, index) => {
    const dayButton = document.createElement("button");
    dayButton.className = "week-day day-card";
    dayButton.type = "button";
    dayButton.dataset.date = dateString;
    dayButton.setAttribute("aria-label", formatSelectedDayTitle(dateString));

    if (dateString === today) {
      dayButton.classList.add("is-today");
    }

    if (dateString === state.selectedDate) {
      dayButton.classList.add("is-selected");
      dayButton.setAttribute("aria-current", "date");
    }

    const indicatorsHtml = getTaskCategoriesForDate(dateString)
      .map((category) => `<span class="week-day__dot week-day__dot--${category}" aria-hidden="true"></span>`)
      .join("");

    dayButton.innerHTML = `
      <span class="week-day__name">${weekDayNamesShort[index]}</span>
      <strong class="week-day__date">${formatDayMonth(dateString)}</strong>
      <span class="week-day__indicators" aria-label="Категории задач">${indicatorsHtml}</span>
    `;

    dayButton.addEventListener("click", () => {
      state.selectedDate = dateString;
      renderWeekPanel();
      renderTimeline();
    });

    elements.weekPanel.append(dayButton);
  });

  elements.selectedDayTitle.textContent = formatSelectedDayTitle(state.selectedDate);
  renderDailyReflection();
}

function renderTaskCard(task) {
  const categoryClass = task.category ? `task-card--${task.category}` : "task-card--none";
  const categoryLabel = getCategoryLabel(task.category);
  const moveButtonHtml = task.location === "calendar"
    ? `<button class="task-card__action task-card__action--move" type="button" data-action="move-to-backlog" aria-label="Переместить в бэклог">В бэклог</button>`
    : "";

  return `
    <article class="task-card ${categoryClass} ${task.status === "done" ? "is-done" : ""}" data-task-id="${task.id}" draggable="true">
      <label class="task-card__check">
        <input class="task-card__checkbox" type="checkbox" ${task.status === "done" ? "checked" : ""} aria-label="Отметить выполнение">
      </label>
      <div class="task-card__body">
        <span class="task-card__category">${escapeHtml(categoryLabel)}</span>
        <h3>${escapeHtml(task.title)}</h3>
      </div>
      <div class="task-card__actions">
        ${moveButtonHtml}
        <button class="task-card__action" type="button" data-action="edit" aria-label="Редактировать задачу">✎</button>
        <button class="task-card__action task-card__action--delete" type="button" data-action="delete" aria-label="Удалить задачу">×</button>
      </div>
    </article>
  `;
}

function renderTimeline() {
  const dayTasks = getTasksForSelectedDate();

  elements.timeline.innerHTML = "";

  if (dayTasks.length === 0) {
    elements.timeline.innerHTML = `
      <div class="timeline-empty">
        На этот день задач нет.
      </div>
    `;
    return;
  }

  const tasksByTime = dayTasks.reduce((groups, task) => {
    if (!groups.has(task.time)) {
      groups.set(task.time, []);
    }

    groups.get(task.time).push(task);
    return groups;
  }, new Map());

  tasksByTime.forEach((tasks, time) => {
    const timeBlock = document.createElement("section");
    timeBlock.className = "timeline-hour";
    timeBlock.innerHTML = `
      <div class="timeline-hour__time">${time}</div>
      <div class="timeline-hour__tasks">
        ${tasks.map(renderTaskCard).join("")}
      </div>
    `;

    elements.timeline.append(timeBlock);
  });
}

function renderBacklogTabs() {
  elements.backlogTabs.querySelectorAll("[data-section]").forEach((tabButton) => {
    const isActive = tabButton.dataset.section === state.activeBacklogSection;
    tabButton.classList.toggle("is-active", isActive);
    tabButton.setAttribute("aria-selected", String(isActive));
  });
}

function renderBacklog() {
  const backlogTasks = getBacklogTasks();

  renderBacklogTabs();
  elements.backlogList.innerHTML = "";

  if (backlogTasks.length === 0) {
    elements.backlogList.innerHTML = `
      <div class="backlog-empty">
        В этом разделе задач нет.
      </div>
    `;
    return;
  }

  elements.backlogList.innerHTML = backlogTasks.map(renderTaskCard).join("");
}

function goToPreviousWeek() {
  state.currentWeekStart = addDays(state.currentWeekStart, -7);
  state.selectedDate = state.currentWeekStart;
  rerenderTaskViews();
}

function goToNextWeek() {
  cleanupDoneTasksForCurrentWeek();
  state.currentWeekStart = addDays(state.currentWeekStart, 7);
  state.selectedDate = state.currentWeekStart;
  rerenderTaskViews();
}

function goToToday() {
  const today = getMoscowDate();

  state.currentWeekStart = getWeekStart(today);
  state.selectedDate = today;
  rerenderTaskViews();
}

function initApp() {
  const today = getMoscowDate();

  state.currentWeekStart = getWeekStart(today);
  state.selectedDate = today;
  loadTasks();

  elements.prevWeekBtn.addEventListener("click", goToPreviousWeek);
  elements.todayBtn.addEventListener("click", goToToday);
  elements.nextWeekBtn.addEventListener("click", goToNextWeek);
  elements.addTaskBtn.addEventListener("click", () => openTaskModal());
  elements.reviewWeekBtn.addEventListener("click", openReviewModal);
  elements.addBacklogTaskBtn.addEventListener("click", () => openBacklogTaskModal());
  elements.timeline.addEventListener("change", handleTimelineChange);
  elements.timeline.addEventListener("click", handleTimelineClick);
  elements.timeline.addEventListener("dragstart", handleTaskDragStart);
  elements.timeline.addEventListener("dragend", handleTaskDragEnd);
  elements.backlogList.addEventListener("change", handleTimelineChange);
  elements.backlogList.addEventListener("click", handleTimelineClick);
  elements.backlogList.addEventListener("dragstart", handleTaskDragStart);
  elements.backlogList.addEventListener("dragend", handleTaskDragEnd);
  elements.backlogTabs.addEventListener("click", handleBacklogTabClick);
  elements.weekPanel.addEventListener("dragover", handleWeekPanelDragOver);
  elements.weekPanel.addEventListener("drop", handleWeekPanelDrop);

  renderWeekPanel();
  renderTimeline();
  renderBacklog();
}

initApp();
