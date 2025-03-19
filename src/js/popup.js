/**
 * Popup script for Pearson MyLab AI Solver
 * 
 * Handles user interactions in the popup interface and communicates with
 * the background script to control the solver.
 */

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
  // Get references to UI elements
  const solverToggle = document.getElementById('solverToggle');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const testCurrentBtn = document.getElementById('testCurrentBtn');
  const resetStatsBtn = document.getElementById('resetStatsBtn');
  const openOptionsBtn = document.getElementById('openOptions');
  const configureApiKeyLink = document.getElementById('configureApiKey');
  const apiKeyNotice = document.getElementById('apiKeyNotice');
  const openDocsLink = document.getElementById('openDocs');
  
  // Stats elements
  const questionsAnalyzedElement = document.getElementById('questionsAnalyzed');
  const questionsAnsweredElement = document.getElementById('questionsAnswered');
  const correctAnswersElement = document.getElementById('correctAnswers');
  const successRateElement = document.getElementById('successRate');

  // Debug panel elements
  const debugPanel = document.getElementById('debugPanel');
  const flowStatus = document.getElementById('flowStatus');
  const messagesSent = document.getElementById('messagesSent');
  const messagesReceived = document.getElementById('messagesReceived');
  const messageLoops = document.getElementById('messageLoops');
  const analyzeMessageFlowBtn = document.getElementById('analyzeMessageFlowBtn');
  const resetDebugStatsBtn = document.getElementById('resetDebugStatsBtn');
  const toggleDebugBtn = document.getElementById('toggleDebugBtn');

  // Load current settings and update UI
  loadSettings();

  // Set up event listeners
  solverToggle.addEventListener('change', toggleSolver);
  testCurrentBtn.addEventListener('click', testCurrentQuestion);
  resetStatsBtn.addEventListener('click', resetStats);
  openOptionsBtn.addEventListener('click', openOptions);
  configureApiKeyLink.addEventListener('click', openOptions);
  openDocsLink.addEventListener('click', openDocs);

  // Set up debug panel event listeners
  if (state.settings?.advanced?.debugMode) {
    showDebugPanel();
  }

  document.addEventListener('keydown', function(e) {
    // Show debug panel when Ctrl+Shift+D is pressed
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      toggleDebugPanel();
    }
  });

  // Add event listeners for debug buttons
  if (analyzeMessageFlowBtn) {
    analyzeMessageFlowBtn.addEventListener('click', analyzeMessageFlow);
  }

  if (resetDebugStatsBtn) {
    resetDebugStatsBtn.addEventListener('click', resetDebugStats);
  }

  if (toggleDebugBtn) {
    toggleDebugBtn.addEventListener('click', toggleDebugPanel);
  }

  /**
   * Loads settings from storage and updates the UI
   */
  function loadSettings() {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
      if (response && response.settings) {
        const settings = response.settings;
        
        // Update solver toggle
        solverToggle.checked = settings.solver.enabled;
        updateStatusIndicator(settings.solver.enabled);
        
        // Show API key notice if needed
        if (!settings.apiKey) {
          apiKeyNotice.style.display = 'flex';
        } else {
          apiKeyNotice.style.display = 'none';
        }
        
        // Update statistics
        updateStats(settings.stats);
      }
    });
  }

  /**
   * Toggles the solver on/off
   */
  function toggleSolver() {
    const enabled = solverToggle.checked;
    
    // Update UI immediately for responsiveness
    updateStatusIndicator(enabled);
    
    // Send message to background script
    chrome.runtime.sendMessage(
      { action: 'toggleSolver', enabled }, 
      () => {
        // Optional callback if needed
      }
    );
  }

  /**
   * Updates the status indicator in the UI
   * 
   * @param {boolean} enabled - Whether the solver is enabled
   */
  function updateStatusIndicator(enabled) {
    if (enabled) {
      statusDot.classList.remove('inactive');
      statusDot.classList.add('active');
      statusText.textContent = 'Solver is active';
    } else {
      statusDot.classList.remove('active');
      statusDot.classList.add('inactive');
      statusText.textContent = 'Solver is inactive';
    }
  }

  /**
   * Updates statistics in the UI
   * 
   * @param {Object} stats - Statistics object
   */
  function updateStats(stats) {
    questionsAnalyzedElement.textContent = stats.questionsAnalyzed || 0;
    questionsAnsweredElement.textContent = stats.questionsAnswered || 0;
    correctAnswersElement.textContent = stats.correctAnswers || 0;
    
    // Calculate success rate
    const answeredCount = stats.questionsAnswered || 0;
    const correctCount = stats.correctAnswers || 0;
    const successRate = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
    successRateElement.textContent = `${successRate}%`;
  }

  /**
   * Tests the current question by sending a manual analyze request
   * with improved error handling for cross-domain scenarios
   */
  function testCurrentQuestion() {
    // Disable the button temporarily to prevent multiple clicks
    testCurrentBtn.disabled = true;
    testCurrentBtn.textContent = 'Analyzing...';

    // Show a quick notice
    const originalStatus = statusText.textContent;
    statusText.textContent = 'Sending request...';
    
    // Get the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        const tabId = tabs[0].id;
        
        // First try to directly send the message to the content script
        chrome.tabs.sendMessage(
          tabId, 
          { action: 'manualAnalyze', source: 'popup' },
          (response) => {
            const hasError = chrome.runtime.lastError;
            
            // If direct messaging failed, try another approach through the background script
            if (hasError) {
              console.log('Direct message failed, using background script relay:', chrome.runtime.lastError.message);
              
              // Ask the background script to try broadcasting to all frames
              chrome.runtime.sendMessage({ 
                action: 'broadcastToFrames', 
                tabId: tabId, 
                frameMessage: { action: 'manualAnalyze', source: 'popup', broadcast: true }
              });
            }
            
            // Reset button state after a delay (regardless of outcome)
            setTimeout(() => {
              testCurrentBtn.disabled = false;
              testCurrentBtn.textContent = 'Solve Current Question';
              statusText.textContent = originalStatus;
            }, 1500);
          }
        );
      } else {
        // No active tab found - should be rare
        console.error('No active tab found');
        testCurrentBtn.disabled = false;
        testCurrentBtn.textContent = 'Solve Current Question';
        statusText.textContent = originalStatus;
      }
    });
  }

  /**
   * Resets statistics
   */
  function resetStats() {
    // Only proceed if user confirms
    if (confirm('Are you sure you want to reset all statistics?')) {
      chrome.runtime.sendMessage(
        { 
          action: 'updateStats', 
          stats: { 
            questionsAnalyzed: -9999999, // Use a large negative number to reset to 0
            questionsAnswered: -9999999, 
            correctAnswers: -9999999 
          } 
        }, 
        () => {
          // Reload settings to update UI
          loadSettings();
        }
      );
    }
  }

  /**
   * Opens the options page
   */
  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  /**
   * Opens documentation
   */
  function openDocs() {
    // Open GitHub README or documentation
    chrome.tabs.create({ url: 'https://github.com/username/pearson-mylab-ai-solver' });
  }

  /**
   * Show or hide the debug panel
   */
  function toggleDebugPanel() {
    if (debugPanel.style.display === 'none') {
      showDebugPanel();
    } else {
      hideDebugPanel();
    }
  }

  /**
   * Show the debug panel and update its content
   */
  function showDebugPanel() {
    debugPanel.style.display = 'block';
    updateDebugPanel();
  }

  /**
   * Hide the debug panel
   */
  function hideDebugPanel() {
    debugPanel.style.display = 'none';
  }

  /**
   * Update the debug panel with current stats
   */
  function updateDebugPanel() {
    // Get the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        // Execute script to get debug info from content script
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          function: () => {
            return window.PearsonAiDebug ? window.PearsonAiDebug.getMessageStatsReport() : null;
          }
        }).then(result => {
          if (result && result[0] && result[0].result) {
            const stats = result[0].result;
            
            // Update the UI with statistics
            messagesSent.textContent = stats.summary.sent || 0;
            messagesReceived.textContent = stats.summary.received || 0;
            messageLoops.textContent = stats.loops || 0;
            
            // Update flow status
            const flowAnalysis = window.PearsonAiDebug.analyzeMessageFlow();
            flowStatus.textContent = flowAnalysis.flowRating.toUpperCase();
            flowStatus.style.color = 
              flowAnalysis.flowRating === 'normal' ? 'green' : 
              flowAnalysis.flowRating === 'concerning' ? 'orange' : 'red';
          }
        }).catch(err => {
          console.error('Error fetching debug info:', err);
        });
      }
    });
  }

  /**
   * Analyze message flow in the current tab
   */
  function analyzeMessageFlow() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          function: () => {
            return window.PearsonAiDebug ? window.PearsonAiDebug.dumpDebugInfo() : null;
          }
        }).then(() => {
          updateDebugPanel();
        });
      }
    });
  }

  /**
   * Reset debug statistics in the current tab
   */
  function resetDebugStats() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          function: () => {
            if (window.PearsonAiDebug) {
              window.PearsonAiDebug.resetDebugStats();
              return true;
            }
            return false;
          }
        }).then(() => {
          updateDebugPanel();
        });
      }
    });
  }
}); 