"use strict";
// --- 1. CONFIGURACIÓN Y ESTADO GLOBAL ---

const DEFAULT_TAB_NAME = "Pestaña 1";

let appState = {
	activeTabId: null,
	tabs: {} // Almacena objetos { id, name, lifeBars: [] }
};

// Estado que rastrea la barra que se está editando.
let currentBarEditState = { bar: null, prop: null }; 

// Estado de Cropper.js
let cropperInstance = null;
let currentBarIdForCrop = null;

// Variable para almacenar el ID del elemento que se está arrastrando
let draggedId = null;

// Estado para la eliminación de pestañas
let tabToDeleteId = null;

// Elementos del DOM
const lifeBarsContainer = document.getElementById('lifeBarsContainer');
const emptyState = document.getElementById('emptyState');
const tabsContainer = document.getElementById('tabsContainer');
const addTabBtn = document.getElementById('addTabBtn');

// Modales y Contenidos
const addBarModal = document.getElementById('addBarModal');
const modalContent = document.getElementById('modalContent');
const addTabModal = document.getElementById('addTabModal');
const addTabModalContent = document.getElementById('addTabModalContent');
const editLifeModal = document.getElementById('editLifeModal');
const editModalContent = document.getElementById('editModalContent');
const cropModal = document.getElementById('cropModal');
const cropModalContent = document.getElementById('cropModalContent');

// Nuevo Modal de Confirmación de Pestaña
const confirmDeleteTabModal = document.getElementById('confirmDeleteTabModal');
const confirmDeleteTabModalContent = document.getElementById('confirmDeleteTabModalContent');
const tabNameToDeleteEl = document.getElementById('tabNameToDelete');
const confirmDeleteTabBtn = document.getElementById('confirmDeleteTabBtn');
const cancelDeleteTabBtn = document.getElementById('cancelDeleteTabBtn');

// Formulario de Agregar Barra
const addBarForm = document.getElementById('addBarForm');

// Formulario de Agregar Pestaña
const addTabForm = document.getElementById('addTabForm');

// Formulario de Editar Vida
const lifeChangeInput = document.getElementById('lifeChangeInput');
const isTempLifeCheckbox = document.getElementById('isTempLife');
const editBarName = document.getElementById('editBarName');
const editModalTitle = document.querySelector('#editLifeModal .modal-content h2');


// --- 2. FUNCIONES DE PERSISTENCIA (localStorage) ---

/** Carga el estado completo de la aplicación desde localStorage. */
function loadAppState() {
	try {
		const data = localStorage.getItem('lifeBarAppState');
		const loadedState = data ? JSON.parse(data) : {};

		if (loadedState.tabs && Object.keys(loadedState.tabs).length > 0) {
			appState = loadedState;
		} else {
			// Inicializar con una pestaña por defecto si no hay datos
			createNewTab(DEFAULT_TAB_NAME, true); 
		}

	} catch (e) {
		console.error("Error al cargar datos de localStorage:", e);
		// Fallback para datos corruptos
		localStorage.removeItem('lifeBarAppState');
		createNewTab(DEFAULT_TAB_NAME, true); 
	}
	renderAll();
}

/** Guarda el estado completo de la aplicación en localStorage. */
function saveAppState() {
	try {
		localStorage.setItem('lifeBarAppState', JSON.stringify(appState));
	} catch (e) {
		console.error("Error al guardar datos en localStorage:", e);
	}
}

/** Devuelve la pestaña activa, o nulo si no hay. */
function getActiveTab() {
	return appState.tabs[appState.activeTabId] || null;
}


// --- 3. FUNCIONES DE MANIPULACIÓN DE TABS ---

/** Abre el modal de confirmación para cerrar la pestaña. */
function openConfirmDeleteTabModal(tabId, tabName) {
	tabToDeleteId = tabId;
	tabNameToDeleteEl.textContent = tabName;
	openModal(confirmDeleteTabModal, confirmDeleteTabModalContent);
}

/** Ejecuta la eliminación real de la pestaña del estado. */
function executeDeleteTab(tabId) {
	const tabIds = Object.keys(appState.tabs);

	if (tabIds.length <= 1) return;
	if (!appState.tabs[tabId]) return;

	delete appState.tabs[tabId];

	// Si eliminamos la pestaña activa, elegimos una nueva
	if (appState.activeTabId === tabId) {
		const remainingIds = Object.keys(appState.tabs);
		const currentIndex = tabIds.indexOf(tabId);
		const nextIndex = Math.min(currentIndex, remainingIds.length - 1);
		appState.activeTabId = remainingIds[nextIndex];
	}

	saveAppState();
	renderAll();
}

/** Crea y activa una nueva pestaña. */
function createNewTab(name, activate = true) {
	const newTabId = crypto.randomUUID();
	const newTab = {
		id: newTabId,
		name: name,
		lifeBars: [] // Array vacío de barras de vida
	};

	appState.tabs[newTabId] = newTab;

	if (activate) {
		appState.activeTabId = newTabId;
	}

	saveAppState();
	renderAll();
}

/** Cambia la pestaña activa. */
function switchTab(tabId) {
	if (appState.tabs[tabId]) {
		appState.activeTabId = tabId;
		saveAppState();
		renderAll();
	}
}

/** * Elimina una pestaña, pidiendo confirmación si no está vacía.
 * Si no es la pestaña activa O si está vacía, la elimina directamente.
 */
function deleteTab(tabId) {
	const tabIds = Object.keys(appState.tabs);

	if (tabIds.length <= 1) return;

	const tab = appState.tabs[tabId];
	if (!tab) return;

	// Si la pestaña a cerrar NO es la activa, o SI está vacía, la eliminamos directamente.
	if (tabId !== appState.activeTabId || tab.lifeBars.length === 0) {
		executeDeleteTab(tabId);
		return;
	}

	// Si es la pestaña activa y NO está vacía, pedimos confirmación.
	openConfirmDeleteTabModal(tabId, tab.name);
}

/** Actualiza el nombre de una pestaña. */
function updateTabName(tabId, newName) {
	if (!appState.tabs[tabId] || newName.trim() === "") return;

	appState.tabs[tabId].name = newName.trim();

	saveAppState();
	renderAll();
}

/** Maneja la edición en línea del nombre de la pestaña. */
function handleTabNameEdit(tab, tabTitleElement, tabButton) {
	// Previene la doble edición
	if (tabTitleElement.querySelector('input')) return;

	const originalName = tab.name;
	const input = document.createElement('input');

	input.type = 'text';
	input.value = originalName;
	input.className = 'tab-name-edit-input'; 
	input.style.width = `${Math.min(150, Math.max(80, originalName.length * 9))}px`; // Ancho dinámico

	tabTitleElement.innerHTML = '';
	tabTitleElement.appendChild(input);
	input.focus();
	input.select();

	// Desactiva temporalmente el listener de cambio de pestaña
	const oldListener = tabButton._tabSwitchListener;
	if (oldListener) {
		tabButton.removeEventListener('click', oldListener);
	}

	const finishEdit = () => {
		// Reactiva el listener de cambio de pestaña
		if (oldListener) {
			tabButton.addEventListener('click', oldListener);
		}

		input.removeEventListener('blur', finishEdit);
		input.removeEventListener('keyup', handleKeypress);

		const newName = input.value.trim();

		if (newName !== originalName && newName !== "") {
			updateTabName(tab.id, newName);
		} else {
			// Re-renderiza solo si no hubo cambio o el nombre estaba vacío para restaurar el estado visual
			renderTabs(); 
		}
	};

	const handleKeypress = (e) => {
		if (e.key === 'Enter') {
			e.preventDefault(); 
			finishEdit();
		}
	};

	input.addEventListener('blur', finishEdit);
	input.addEventListener('keyup', handleKeypress);
}

/** Renderiza los botones de las pestañas. */
function renderTabs() {
	tabsContainer.innerHTML = '';

	const tabIds = Object.keys(appState.tabs);

	tabIds.forEach(id => {
		const tab = appState.tabs[id];
		const isActive = id === appState.activeTabId;

		const tabBtn = document.createElement('button');
		tabBtn.className = `tab-button ${isActive ? 'active' : ''}`;
		tabBtn.setAttribute('data-tab-id', id);

		// Contenedor de texto (Clickable para editar)
		const tabTitle = document.createElement('span');
		tabTitle.textContent = tab.name;
		tabTitle.style.overflow = 'hidden';
		tabTitle.style.textOverflow = 'ellipsis';
		tabTitle.style.cursor = 'text'; // Indica que se puede editar
		tabTitle.title = "Click para editar nombre de la pestaña";

		// Listener para editar el nombre de la pestaña
		tabTitle.addEventListener('click', (e) => {
			e.stopPropagation(); // Evita que el click cambie de pestaña
			handleTabNameEdit(tab, tabTitle, tabBtn);
		});

		tabBtn.appendChild(tabTitle);

		// Define y almacena el listener de cambio de pestaña para poder desactivarlo/activarlo
		const switchListener = () => switchTab(id);
		tabBtn.addEventListener('click', switchListener);
		tabBtn._tabSwitchListener = switchListener; // Guarda la referencia

		// Agregar botón de eliminar si hay más de una pestaña
		if (tabIds.length > 1) {
			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'tab-delete-btn';
			deleteBtn.textContent = '✖'; // Símbolo X
			deleteBtn.title = `Cerrar pestaña: ${tab.name}`;

			// El listener para eliminar se añade al botón de la X
			deleteBtn.addEventListener('click', (e) => {
				e.stopPropagation(); // Evita que se active el switchTab al eliminar
				deleteTab(id);
			});
			tabBtn.appendChild(deleteBtn);
		}


		tabsContainer.appendChild(tabBtn);
	});

	// Asegura que el botón de añadir pestaña esté siempre visible
	addTabBtn.style.display = 'block';
}

// --- 4. FUNCIONES DE MANIPULACIÓN DE BARRAS DE VIDA (Contextualizadas a la Pestaña Activa) ---

/** Crea una nueva barra de vida en la pestaña activa. */
function createLifeBar(name, maxLife) {
	const activeTab = getActiveTab();
	if (!activeTab) return;

	const newBar = {
		id: crypto.randomUUID(),
		name: name,
		maxLife: maxLife,
		currentLife: maxLife,
		tempLife: 0,
		profileImageBase64: null,
	};

	activeTab.lifeBars.push(newBar);

	saveAppState();
	renderLifeBars();
}

/** Guarda la nueva imagen base64 en la barra de vida especificada. */
function saveProfileImageBase64(barId, base64Image) {
	const activeTab = getActiveTab();
	if (!activeTab) return;

	const barIndex = activeTab.lifeBars.findIndex(bar => bar.id === barId);
	if (barIndex !== -1) {
		activeTab.lifeBars[barIndex].profileImageBase64 = base64Image;
		saveAppState();
		renderLifeBars();
	}
}

/** Actualiza la vida (normal) de una barra. Maneja la aplicación de daño contra vida temporal. */
function updateLife(docId, changeAmount) {
	const activeTab = getActiveTab();
	if (!activeTab) return;

	const barIndex = activeTab.lifeBars.findIndex(bar => bar.id === docId);
	if (barIndex === -1) return;

	let bar = activeTab.lifeBars[barIndex];
	let remainingChange = changeAmount;

	if (changeAmount < 0) {
		let damage = Math.abs(changeAmount);

		if (bar.tempLife > 0) {
			bar.tempLife -= damage;

			if (bar.tempLife < 0) {
				remainingChange = bar.tempLife; 
				bar.tempLife = 0;
			} else {
				remainingChange = 0;
			}
		}
	}

	let newLife = bar.currentLife + remainingChange;
	newLife = Math.min(bar.maxLife, Math.max(0, newLife));

	activeTab.lifeBars[barIndex].currentLife = newLife;

	saveAppState();
	renderLifeBars();
}

/** Aplica vida temporal. Solo acepta valores positivos. */
function applyTempLife(docId, amount) {
	if (amount <= 0) return;
	const activeTab = getActiveTab();
	if (!activeTab) return;

	const barIndex = activeTab.lifeBars.findIndex(bar => bar.id === docId);
	if (barIndex === -1) return;

	let bar = activeTab.lifeBars[barIndex];
	bar.tempLife = Math.max(bar.tempLife, amount);

	saveAppState();
	renderLifeBars();
}

/** Actualiza la vida máxima de una barra de vida. */
function updateMaxLife(docId, changeAmount) {
	const activeTab = getActiveTab();
	if (!activeTab) return;

	const barIndex = activeTab.lifeBars.findIndex(bar => bar.id === docId);
	if (barIndex === -1) return;

	let bar = activeTab.lifeBars[barIndex];
	let newMaxLife = bar.maxLife + changeAmount;

	newMaxLife = Math.max(1, newMaxLife);

	let newCurrentLife = Math.min(bar.currentLife, newMaxLife);

	activeTab.lifeBars[barIndex].maxLife = newMaxLife;
	activeTab.lifeBars[barIndex].currentLife = newCurrentLife; 

	saveAppState();
	renderLifeBars();
}

/** Actualiza el nombre de una barra de vida. */
function updateName(docId, newName) {
	const activeTab = getActiveTab();
	if (!activeTab) return;

	const barIndex = activeTab.lifeBars.findIndex(bar => bar.id === docId);
	if (barIndex === -1 || newName.trim() === "") return;

	activeTab.lifeBars[barIndex].name = newName.trim();

	saveAppState();
	renderLifeBars();
}

/** Elimina una barra de vida. */
function deleteLifeBar(docId) {
	const activeTab = getActiveTab();
	if (!activeTab) return;

	activeTab.lifeBars = activeTab.lifeBars.filter(bar => bar.id !== docId);

	saveAppState();
	renderLifeBars();
}

/** Reordena el array lifeBars en la pestaña activa. */
function reorderLifeBarsArray(draggedId, targetId) {
	const activeTab = getActiveTab();
	if (!activeTab) return;

	let lifeBars = activeTab.lifeBars;

	const draggedIndex = lifeBars.findIndex(bar => bar.id === draggedId);
	const targetIndex = lifeBars.findIndex(bar => bar.id === targetId);

	if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) return;

	// 1. Quitar el elemento arrastrado
	const [draggedItem] = lifeBars.splice(draggedIndex, 1);

	// 2. Insertar el elemento en la nueva posición
	lifeBars.splice(targetIndex, 0, draggedItem);

	activeTab.lifeBars = lifeBars;

	saveAppState();
}


// --- 5. FUNCIONALIDAD DE INTERFAZ (Modales y Lógica) ---

/** Abre un modal con animación. */
function openModal(modal, contentElement) {
	modal.classList.add('is-visible');
	setTimeout(() => {
		contentElement.classList.add('is-visible');
	}, 10);
}

/** Cierra un modal con animación. */
function closeModal(modal, contentElement) {
	contentElement.classList.remove('is-visible');
	setTimeout(() => {
		modal.classList.remove('is-visible');
	}, 300);
}

/** Muestra el modal de edición de vida. (Solo para Vida Actual/Temporal) */
function openEditModal(bar) {
	currentBarEditState.bar = bar;

	const currentValue = bar.currentLife;
	const tempLife = bar.tempLife;
	const totalLife = currentValue + tempLife;

	editBarName.textContent = bar.name;

	let placeholderText = `+10, -5, o ${totalLife}`;
	if (tempLife > 0) {
			placeholderText += ` (Temp: ${tempLife})`;
	}
	lifeChangeInput.placeholder = placeholderText;

	lifeChangeInput.value = '';
	isTempLifeCheckbox.checked = false;

	openModal(editLifeModal, editModalContent);

	lifeChangeInput.focus();
	lifeChangeInput.select();
}

// --- LÓGICA DE RECORTE (CROPPER.JS) ---
function openCropModal(barId, base64Image) {
	currentBarIdForCrop = barId;

	if (cropperInstance) {
		cropperInstance.destroy();
		cropperInstance = null;
	}

	cropImage.src = base64Image;
	openModal(cropModal, cropModalContent);

	setTimeout(() => {
		cropperInstance = new Cropper(cropImage, {
			aspectRatio: 1,
			viewMode: 1,
			dragMode: 'move',
			background: false,
			autoCropArea: 0.9,
		});
	}, 300);
}

function confirmCrop() {
	if (!cropperInstance || !currentBarIdForCrop) return;

	const croppedBase64 = cropperInstance.getCroppedCanvas({
		width: 256,
		height: 256,
		imageSmoothingQuality: 'high',
	}).toDataURL('image/png');

	saveProfileImageBase64(currentBarIdForCrop, croppedBase64);

	cropperInstance.destroy();
	cropperInstance = null;
	currentBarIdForCrop = null;
	closeModal(cropModal, cropModalContent);
}

function cancelCrop() {
	if (cropperInstance) {
		cropperInstance.destroy();
		cropperInstance = null;
	}
	currentBarIdForCrop = null;
	closeModal(cropModal, cropModalContent);
}

function handleImageSelect(barId, file) {
	if (!file) return;

	const reader = new FileReader();
	reader.onload = (e) => {
		openCropModal(barId, e.target.result);
	};
	reader.onerror = () => {
		console.error("Error al leer el archivo de imagen.");
	};
	reader.readAsDataURL(file);
}

function updateProfileImageVisuals(bar) {
	const container = document.getElementById(`image-container-${bar.id}`);
	const img = document.getElementById(`profile-image-${bar.id}`);
	const placeholder = container ? container.querySelector('.placeholder-emoji') : null;

	if (img && placeholder) {
		if (bar.profileImageBase64) {
			img.src = bar.profileImageBase64;
			img.style.display = 'block';
			placeholder.style.display = 'none';
		} else {
			img.src = ''; 
			img.style.display = 'none';
			placeholder.style.display = 'block';
		}
	}
}

function parseLifeInput(currentValue, maxLife, inputString) {
	inputString = inputString.trim();

	const matchRelative = inputString.match(/^([\+\-]\s*\d+)$/);
	if (matchRelative) {
		return parseInt(matchRelative[1].replace(/\s/g, ''), 10);
	}

	const absoluteValue = parseInt(inputString, 10);
	if (!isNaN(absoluteValue)) {
		return absoluteValue - currentValue;
	}

	return 0;
}


// --- 6. LISTENERS DRAG AND DROP ---

function handleDragStart(e) {
	draggedId = e.target.getAttribute('data-id');
	e.dataTransfer.setData('text/plain', draggedId);
	e.dataTransfer.effectAllowed = 'move';
	setTimeout(() => {
		e.target.style.opacity = '0.5';
	}, 0);
}

function handleDragEnd(e) {
	e.target.style.opacity = '1';
	draggedId = null;
	const targets = lifeBarsContainer.querySelectorAll('.drag-over');
	targets.forEach(el => el.classList.remove('drag-over'));
}

function handleDragOver(e) {
	e.preventDefault(); 
	e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
	e.preventDefault();
	const targetCard = e.currentTarget;
	const targetId = targetCard.getAttribute('data-id');

	if (targetId !== draggedId) {
		targetCard.classList.add('drag-over');
	}
}

function handleDragLeave(e) {
	e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
	e.preventDefault();

	const targetCard = e.currentTarget;
	const targetId = targetCard.getAttribute('data-id');

	targetCard.classList.remove('drag-over');

	const droppedId = draggedId || e.dataTransfer.getData('text/plain');

	if (droppedId && droppedId !== targetId) {
		reorderLifeBarsArray(droppedId, targetId);
		renderLifeBars();
	}
}

// --- 7. LISTENERS GENERALES ---
document.getElementById('addLifeBarBtn').addEventListener('click', () => {
	if (getActiveTab()) {
		openModal(addBarModal, modalContent)
	} else {
		// Mensaje informativo, NO usando alert
		console.error("Primero crea una pestaña para añadir barras de vida.");
	}
});

document.getElementById('addTabBtn').addEventListener('click', () => {
	// Usa un nombre por defecto simple para imitar la creación rápida de pestaña de navegador
	const tabName = `Pestaña ${Object.keys(appState.tabs).length + 1}`;
	createNewTab(tabName, true);
});

document.getElementById('closeAddModalBtn').addEventListener('click', () => closeModal(addBarModal, modalContent));
document.getElementById('closeAddTabModalBtn').addEventListener('click', () => closeModal(addTabModal, addTabModalContent));

document.getElementById('closeEditModalBtn').addEventListener('click', () => {
	lifeChangeInput.value = '';
	isTempLifeCheckbox.checked = false;
	closeModal(editLifeModal, editModalContent);
	currentBarEditState.bar = null;
});

confirmCropBtn.addEventListener('click', confirmCrop);
cancelCropBtn.addEventListener('click', cancelCrop);

rotateLeftBtn.addEventListener('click', () => cropperInstance?.rotate(-90));
rotateRightBtn.addEventListener('click', () => cropperInstance?.rotate(90));
zoomInBtn.addEventListener('click', () => cropperInstance?.zoom(0.1));
zoomOutBtn.addEventListener('click', () => cropperInstance?.zoom(-0.1));

// Listeners para el nuevo Modal de Confirmación de Pestaña
confirmDeleteTabBtn.addEventListener('click', () => {
	if (tabToDeleteId) {
		executeDeleteTab(tabToDeleteId);
		tabToDeleteId = null;
		closeModal(confirmDeleteTabModal, confirmDeleteTabModalContent);
	}
});

cancelDeleteTabBtn.addEventListener('click', () => {
	tabToDeleteId = null;
	closeModal(confirmDeleteTabModal, confirmDeleteTabModalContent);
});


// Cierre de Modales haciendo click fuera
[addBarModal, editLifeModal, cropModal, addTabModal, confirmDeleteTabModal].forEach(modal => {
		modal.addEventListener('click', (e) => {
		if (e.target === modal) {
			const contentMap = {
				'addBarModal': modalContent,
				'addTabModal': addTabModalContent,
				'editLifeModal': editModalContent,
				'cropModal': cropModalContent,
				'confirmDeleteTabModal': confirmDeleteTabModalContent 
			};
			const content = contentMap[modal.id];
			closeModal(modal, content);

			if (modal.id === 'editLifeModal') {
				currentBarEditState.bar = null;
				isTempLifeCheckbox.checked = false;
			}
			if (modal.id === 'cropModal') {
				cancelCrop(); 
			}
			if (modal.id === 'confirmDeleteTabModal') {
				tabToDeleteId = null;
			}
		}
	});
});

// Manejar el envío del formulario para crear BARRA
addBarForm.addEventListener('submit', (e) => {
	e.preventDefault();
	const barName = document.getElementById('barName').value.trim();
	const maxLife = Math.max(1, parseInt(document.getElementById('maxLife').value, 10) || 1);

	if (barName) {
		createLifeBar(barName, maxLife);
		addBarForm.reset();
		closeModal(addBarModal, modalContent);
	} else {
		// Usar la validación 'required' del HTML o simplemente no cerrar el modal si falla.
		// console.error("El nombre de la barra no puede estar vacío.");
	}
});

// Manejar el envío del formulario para crear PESTAÑA (solo usado por el modal si se abre)
addTabForm.addEventListener('submit', (e) => {
	e.preventDefault();
	const tabName = document.getElementById('tabName').value.trim();

	if (tabName) {
		createNewTab(tabName, true);
		addTabForm.reset();
		closeModal(addTabModal, addTabModalContent);
	} else {
		// console.error("El nombre de la pestaña no puede estar vacío.");
	}
});

// Manejar el envío del formulario para editar la vida (Normal o Temporal)
editLifeForm.addEventListener('submit', (e) => {
	e.preventDefault();

	const { bar } = currentBarEditState;
	if (!bar) return; 

	const inputValue = lifeChangeInput.value.trim();
	const isTempLifeChecked = isTempLifeCheckbox.checked;

	if (!inputValue) {
			isTempLifeCheckbox.checked = false; 
			closeModal(editLifeModal, editModalContent);
			return;
	}

	if (isTempLifeChecked) {
		const valueMatch = inputValue.match(/^([\+\-]?)\s*(\d+)$/);

		if (valueMatch) {
			const amountToApply = parseInt(valueMatch[2], 10);
			if (amountToApply > 0) {
				applyTempLife(bar.id, amountToApply);
			}
		} else {
			// Mensaje informativo, NO usando alert
			console.error("Para Vida Temporal, ingresa solo un valor positivo (ej: 20 o +20).");
			return;
		}

	} else {
		const normalCurrentValue = bar.currentLife;
		const changeAmount = parseLifeInput(normalCurrentValue, bar.maxLife, inputValue);

		if (changeAmount !== 0) {
			updateLife(bar.id, changeAmount);
		}
	}

	isTempLifeCheckbox.checked = false;
	lifeChangeInput.value = '';
	currentBarEditState.bar = null;
	closeModal(editLifeModal, editModalContent);
});


// --- 8. RENDERIZADO DEL DOM (Mantenido de la versión anterior) ---

function handleNameEdit(bar, nameElement) {
	if (nameElement.querySelector('input')) return;

	const originalName = bar.name;
	const input = document.createElement('input');

	input.type = 'text';
	input.value = originalName;
	input.className = 'name-edit-input';

	nameElement.innerHTML = '';
	nameElement.appendChild(input);
	input.focus();

	const finishEdit = () => {
		input.removeEventListener('blur', finishEdit);
		input.removeEventListener('keyup', handleKeypress);

		const newName = input.value.trim();

		if (newName !== originalName && newName !== "") {
			updateName(bar.id, newName);
		} else {
			renderLifeBars();
		}
	};

	const handleKeypress = (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			finishEdit();
		}
	};

	input.addEventListener('blur', finishEdit);
	input.addEventListener('keyup', handleKeypress);
}

function handleMaxLifeEdit(bar, maxLifeElement) {

	if (maxLifeElement.querySelector('input')) return;

	const originalMaxLife = bar.maxLife;
	const input = document.createElement('input');

	input.type = 'text';
	input.value = originalMaxLife;
	input.className = 'name-edit-input';

	input.style.textAlign = 'center';
	input.style.width = '6rem';
	input.style.display = 'inline-block';
	input.style.color = '#60a5fa';

	maxLifeElement.innerHTML = '';
	maxLifeElement.appendChild(input);
	input.focus();
	input.select();

	const finishEdit = () => {
		input.removeEventListener('blur', finishEdit);
		input.removeEventListener('keyup', handleKeypress);

		const inputValue = input.value.trim();

		if (!inputValue) {
			renderLifeBars();
			return;
		}

		const changeAmount = parseLifeInput(originalMaxLife, originalMaxLife, inputValue);

		if (changeAmount !== 0) {
			updateMaxLife(bar.id, changeAmount);
		} else {
			renderLifeBars();
		}
	};

	const handleKeypress = (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			finishEdit();
		}
	};

	input.addEventListener('blur', finishEdit);
	input.addEventListener('keyup', handleKeypress);
}

function updateLifeText(lifeTextElement, barData) {
	let currentLifeColor;
	if (barData.currentLife <= barData.maxLife * 0.25) {
		currentLifeColor = 'var(--accent-red)';
	} else if (barData.currentLife <= barData.maxLife * 0.5) {
		currentLifeColor = '#facc15';
	} else {
		currentLifeColor = '#4ade80';
	}

	let maxLifeColor = '#60a5fa';
	let totalCurrentLife = barData.currentLife + barData.tempLife;

	let lifeDisplay;
	if (barData.tempLife > 0) {
		lifeDisplay = `
			<span id="currentLifeValue-${barData.id}" data-prop="currentLife" style="color: ${currentLifeColor};">
				${totalCurrentLife}
			</span>
			<span style="color: #a5b4fc; font-weight: 400; font-size: 0.9em; margin-right: 0.25rem;">
				(${barData.currentLife} +
				<span style="color: var(--temp-life-blue);">${barData.tempLife}</span>)
			</span>
			/
			<span id="maxLifeValue-${barData.id}" class="life-editable-value" data-prop="maxLife" style="color: ${maxLifeColor}; cursor: pointer;" title="Click para editar vida máxima (En línea)">
				${barData.maxLife}
			</span>
		`;
	} else {
			lifeDisplay = `
			<span id="currentLifeValue-${barData.id}" data-prop="currentLife" style="color: ${currentLifeColor};">
				${barData.currentLife}
			</span>
			/
			<span id="maxLifeValue-${barData.id}" class="life-editable-value" data-prop="maxLife" style="color: ${maxLifeColor}; cursor: pointer;" title="Click para editar vida máxima (En línea)">
				${barData.maxLife}
			</span>
		`;
	}

	lifeTextElement.innerHTML = lifeDisplay;

	const maxLifeSpan = lifeTextElement.querySelector(`#maxLifeValue-${barData.id}`);

	if (maxLifeSpan) {
		maxLifeSpan.addEventListener('click', (e) => {
			handleMaxLifeEdit(barData, maxLifeSpan);
			e.stopPropagation();
		}, { once: true });
	}
}

function updateBarVisuals(bar) {
	const normalFillDiv = document.getElementById(`normal-fill-${bar.id}`);
	const lifeBarContainer = document.getElementById(`bar-${bar.id}`)?.querySelector('.life-bar-container');

	if (!normalFillDiv || !lifeBarContainer) return;

	const normalPercentage = (bar.currentLife / bar.maxLife) * 100;
	let lifeFillColor;
	if (bar.currentLife <= bar.maxLife * 0.25) {
		lifeFillColor = 'var(--accent-red)';
	} else if (bar.currentLife <= bar.maxLife * 0.5) {
		lifeFillColor = '#facc15';
	} else {
		lifeFillColor = '#4ade80';
	}

	normalFillDiv.style.width = `${Math.min(100, normalPercentage)}%`;
	normalFillDiv.style.backgroundColor = lifeFillColor;

	let tempFillDiv = document.getElementById(`temp-fill-${bar.id}`);

	if (bar.tempLife > 0) {
		const spaceRemaining = bar.maxLife - bar.currentLife;
		const effectiveTempLife = Math.min(bar.tempLife, spaceRemaining);
		const effectiveTempPercentage = (effectiveTempLife / bar.maxLife) * 100;

		const finalLeft = `${Math.min(100, normalPercentage)}%`;
		const finalWidth = `${effectiveTempPercentage}%`;

		let wasNewlyCreated = false;

		if (!tempFillDiv) {
			tempFillDiv = document.createElement('div');
			tempFillDiv.className = 'temp-life-fill';
			tempFillDiv.id = `temp-fill-${bar.id}`;
			tempFillDiv.style.width = '0%';
			tempFillDiv.style.left = finalLeft;
			lifeBarContainer.appendChild(tempFillDiv);
			wasNewlyCreated = true;
		}

		if (wasNewlyCreated) {
			void tempFillDiv.offsetWidth;
			tempFillDiv.style.width = finalWidth;
			tempFillDiv.style.left = finalLeft;
		} else {
			tempFillDiv.style.width = finalWidth;
			tempFillDiv.style.left = finalLeft;
		}

		if (effectiveTempPercentage > 0) {
			normalFillDiv.style.borderRadius = '8px 0 0 8px';
			tempFillDiv.style.borderRadius = '0 8px 8px 0';
			if (normalPercentage === 0) {
				tempFillDiv.style.borderRadius = '8px';
				normalFillDiv.style.borderRadius = '0';
			}
		} else {
			if (tempFillDiv && lifeBarContainer.contains(tempFillDiv)) {
				tempFillDiv.style.width = '0%'; 
				setTimeout(() => {
						if (lifeBarContainer.contains(tempFillDiv)) {
						lifeBarContainer.removeChild(tempFillDiv);
						}
				}, 500); 
			}
			normalFillDiv.style.borderRadius = '8px';
		}

	} else {
		if (tempFillDiv) {
			tempFillDiv.style.width = '0%';

			setTimeout(() => {
					if (lifeBarContainer.contains(tempFillDiv)) {
					lifeBarContainer.removeChild(tempFillDiv);
					}
			}, 500);
		}
		normalFillDiv.style.borderRadius = '8px';
	}
}


function createNewBarElement(bar) {
	const card = document.createElement('div');
	card.className = 'life-bar-card';
	card.id = `bar-${bar.id}`;
	card.setAttribute('data-id', bar.id);

	// --- Lógica de Drag and Drop ---
	card.draggable = true;
	card.addEventListener('dragstart', handleDragStart);
	card.addEventListener('dragend', handleDragEnd);
	card.addEventListener('dragover', handleDragOver);
	card.addEventListener('dragenter', handleDragEnter);
	card.addEventListener('dragleave', handleDragLeave);
	card.addEventListener('drop', handleDrop);

	// Contenido Wrapper
	const contentWrapper = document.createElement('div');
	contentWrapper.className = 'life-bar-card-content';

	// 1. Elementos de Imagen de Perfil
	const imageContainer = document.createElement('div');
	imageContainer.className = 'profile-image-container';
	imageContainer.title = "Haz clic para cambiar la imagen de perfil";
	imageContainer.id = `image-container-${bar.id}`;

	const profileImage = document.createElement('img');
	profileImage.id = `profile-image-${bar.id}`;
	profileImage.className = 'w-full h-full object-cover';
	profileImage.alt = `Perfil de ${bar.name}`;

	const placeholder = document.createElement('span');
	placeholder.className = 'placeholder-emoji';
	placeholder.textContent = '👤';

	imageContainer.appendChild(profileImage);
	imageContainer.appendChild(placeholder);

	// Input de Archivo Oculto
	const fileInput = document.createElement('input');
	fileInput.type = 'file';
	fileInput.id = `file-upload-${bar.id}`;
	fileInput.accept = 'image/*';
	fileInput.style.display = 'none';
	card.appendChild(fileInput);

	// 2. Contenedor de Texto y Stats
	const header = document.createElement('div');
	header.className = 'life-bar-header';

	const nameElement = document.createElement('h3');
	nameElement.className = 'life-bar-name';
	nameElement.title = "Click para editar nombre";
	nameElement.textContent = bar.name;

	const statsContainer = document.createElement('div');
	statsContainer.className = 'life-bar-stats';

	const lifeText = document.createElement('p');
	lifeText.className = 'life-bar-text';
	lifeText.id = `life-text-${bar.id}`;

	const deleteBtn = document.createElement('button');
	deleteBtn.className = 'button button-delete';
	deleteBtn.textContent = '❌';

	// Armar el header
	statsContainer.appendChild(lifeText);
	header.appendChild(nameElement);
	header.appendChild(statsContainer);

	// Armar el contentWrapper (Imagen + Texto/Header)
	// contentWrapper.appendChild(imageContainer);
	contentWrapper.appendChild(header);

	// Contenedor de la barra de vida visual
	const lifeBarContainer = document.createElement('div');
	lifeBarContainer.className = 'life-bar-container';
	lifeBarContainer.title = `Vida Normal: ${bar.currentLife}. Vida Temporal: ${bar.tempLife}. Haz click para modificar vida actual.`;

	// Normal Fill
	const normalFillDiv = document.createElement('div');
	normalFillDiv.className = 'life-fill';
	normalFillDiv.id = `normal-fill-${bar.id}`;
	normalFillDiv.style.left = '0';
	lifeBarContainer.appendChild(normalFillDiv);

	// Armar la tarjeta final
	card.appendChild(imageContainer)
	card.appendChild(contentWrapper);
	card.appendChild(deleteBtn);
	contentWrapper.appendChild(lifeBarContainer);

	// --- Listeners de Interacción ---
	imageContainer.addEventListener('click', () => {
		fileInput.click();
	});
	fileInput.addEventListener('change', (e) => {
		handleImageSelect(bar.id, e.target.files[0]);
		e.target.value = null;
	});

	nameElement.addEventListener('click', () => handleNameEdit(bar, nameElement));
	lifeBarContainer.addEventListener('click', () => openEditModal(bar));
	deleteBtn.addEventListener('click', () => deleteLifeBar(bar.id));

	updateLifeText(lifeText, bar); 

	return card;
}


/**
 * Renderiza la lista de barras de vida de la PESTAÑA ACTIVA.
 */
function renderLifeBars() {
	lifeBarsContainer.innerHTML = '';
	const activeTab = getActiveTab();

	if (!activeTab || activeTab.lifeBars.length === 0) {
		emptyState.style.display = 'block';
		return;
	}

	activeTab.lifeBars.forEach(bar => {
		const newCard = createNewBarElement(bar);

		lifeBarsContainer.appendChild(newCard);

		// Aplicar visuales y estado de imagen
		updateBarVisuals(bar);
		updateProfileImageVisuals(bar);
	});

	emptyState.style.display = 'none';
}

/** Renderiza todas las partes de la aplicación (Tabs + Barras). */
function renderAll() {
	renderTabs();
	renderLifeBars();
}

// Inicialización: Cargar estado al cargar la ventana
window.onload = loadAppState;