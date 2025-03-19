/**
 * Options page script for Pearson MyLab AI Solver
 * 
 * Handles saving and loading extension settings
 */

// Default settings for the extension
const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'claude-3-haiku-20240307',
  solver: {
    enabled: false,
    confidence: 0.75,
    speed: 'normal',
    autoNavigate: false
  },
  questionTypes: {
    multipleChoice: true,
    trueFalse: true,
    fillInBlank: true,
    matching: true,
    ordering: true
  },
  advanced: {
    debugMode: false,
    customPrompt: ''
  },
  stats: {
    questionsAnalyzed: 0,
    questionsAnswered: 0,
    correctAnswers: 0
  }
};

// DOM elements
const elements = {
  // API Configuration
  apiKey: document.getElementById('apiKey'),
  model: document.getElementById('model'),
  
  // Solver Settings
  solverEnabled: document.getElementById('solverEnabled'),
  autoNavigate: document.getElementById('autoNavigate'),
  confidenceThreshold: document.getElementById('confidenceThreshold'),
  confidenceValue: document.getElementById('confidenceValue'),
  solverSpeed: document.getElementById('solverSpeed'),
  
  // Question Types
  multipleChoice: document.getElementById('multipleChoice'),
  trueFalse: document.getElementById('trueFalse'),
  fillInBlank: document.getElementById('fillInBlank'),
  matching: document.getElementById('matching'),
  ordering: document.getElementById('ordering'),
  
  // Advanced Settings
  debugMode: document.getElementById('debugMode'),
  customPrompt: document.getElementById('customPrompt'),
  
  // Buttons
  saveBtn: document.getElementById('saveBtn'),
  resetBtn: document.getElementById('resetBtn'),
  
  // Status Message
  statusMessage: document.getElementById('status-message')
};

// Initialize the page
function initializePage() {
  // Load current settings
  loadSettings();
  
  // Set up event listeners
  setUpEventListeners();
}

// Load settings from storage
function loadSettings() {
  chrome.storage.sync.get('settings', (data) => {
    const settings = data.settings || DEFAULT_SETTINGS;
    
    // API Configuration
    elements.apiKey.value = settings.apiKey || '';
    elements.model.value = settings.model || DEFAULT_SETTINGS.model;
    
    // Solver Settings
    elements.solverEnabled.checked = settings.solver?.enabled || false;
    elements.autoNavigate.checked = settings.solver?.autoNavigate || false;
    elements.confidenceThreshold.value = settings.solver?.confidence || 0.75;
    elements.confidenceValue.textContent = settings.solver?.confidence || 0.75;
    elements.solverSpeed.value = settings.solver?.speed || 'normal';
    
    // Question Types
    elements.multipleChoice.checked = settings.questionTypes?.multipleChoice !== false;
    elements.trueFalse.checked = settings.questionTypes?.trueFalse !== false;
    elements.fillInBlank.checked = settings.questionTypes?.fillInBlank !== false;
    elements.matching.checked = settings.questionTypes?.matching !== false;
    elements.ordering.checked = settings.questionTypes?.ordering !== false;
    
    // Advanced Settings
    elements.debugMode.checked = settings.advanced?.debugMode || false;
    elements.customPrompt.value = settings.advanced?.customPrompt || '';
  });
}

// Set up event listeners
function setUpEventListeners() {
  // Confidence threshold slider
  elements.confidenceThreshold.addEventListener('input', (e) => {
    elements.confidenceValue.textContent = e.target.value;
  });
  
  // Save button
  elements.saveBtn.addEventListener('click', saveSettings);
  
  // Reset button
  elements.resetBtn.addEventListener('click', resetSettings);
}

// Save settings to storage
function saveSettings() {
  const settings = {
    // API Configuration
    apiKey: elements.apiKey.value.trim(),
    model: elements.model.value,
    
    // Solver Settings
    solver: {
      enabled: elements.solverEnabled.checked,
      confidence: parseFloat(elements.confidenceThreshold.value),
      speed: elements.solverSpeed.value,
      autoNavigate: elements.autoNavigate.checked
    },
    
    // Question Types
    questionTypes: {
      multipleChoice: elements.multipleChoice.checked,
      trueFalse: elements.trueFalse.checked,
      fillInBlank: elements.fillInBlank.checked,
      matching: elements.matching.checked,
      ordering: elements.ordering.checked
    },
    
    // Advanced Settings
    advanced: {
      debugMode: elements.debugMode.checked,
      customPrompt: elements.customPrompt.value.trim()
    }
  };
  
  // Get current stats to preserve them
  chrome.storage.sync.get('settings', (data) => {
    if (data.settings && data.settings.stats) {
      settings.stats = data.settings.stats;
    } else {
      settings.stats = DEFAULT_SETTINGS.stats;
    }
    
    // Save updated settings
    chrome.storage.sync.set({ settings }, () => {
      // Show success message
      showStatusMessage('Settings saved successfully!', 'success');
    });
  });
}

// Reset settings to defaults
function resetSettings() {
  if (confirm('Are you sure you want to reset all settings to defaults?')) {
    // Keep only API key from current settings
    chrome.storage.sync.get('settings', (data) => {
      const apiKey = data.settings?.apiKey || '';
      const stats = data.settings?.stats || DEFAULT_SETTINGS.stats;
      
      const defaultSettingsCopy = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      defaultSettingsCopy.apiKey = apiKey;
      defaultSettingsCopy.stats = stats;
      
      chrome.storage.sync.set({ settings: defaultSettingsCopy }, () => {
        // Reload the form
        loadSettings();
        
        // Show success message
        showStatusMessage('Settings reset to defaults!', 'success');
      });
    });
  }
}

// Show status message
function showStatusMessage(message, type = 'success') {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `alert alert-${type}`;
  elements.statusMessage.style.display = 'block';
  
  // Hide after 3 seconds
  setTimeout(() => {
    elements.statusMessage.style.display = 'none';
  }, 3000);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializePage); 