/**
 * Content script for Pearson MyLab AI Solver
 * 
 * This script runs on Pearson MyLab pages and handles:
 * - Detecting questions on the page
 * - Extracting question content and structure
 * - Communicating with the background script for AI analysis
 * - Displaying results and applying answers
 */

// Global state
const state = {
  enabled: false,
  analyzing: false,
  currentQuestionData: null,
  statusElement: null,
  settings: null
};

// Initialize when the content script loads
initialize();

/**
 * Initialize the content script
 */
function initialize() {
  // Create status indicator UI
  createStatusIndicator();
  
  // Set up cross-domain communication
  setupCrossDomainCommunication();
  
  // Check if solver is enabled
  chrome.runtime.sendMessage({ action: 'getSolverStatus' }, (response) => {
    state.enabled = response?.enabled || false;
    updateStatusIndicator();
  });
  
  // Get settings
  chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
    state.settings = response?.settings;
  });
  
  // Listen for messages from background script or popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'solverStatusChanged':
        state.enabled = message.enabled;
        updateStatusIndicator();
        
        // Propagate status to other frames
        window.sendCrossDomainMessage({
          action: 'updateStatus',
          enabled: message.enabled
        });
        
        if (state.enabled) {
          // Start analyzing if enabled
          analyzeCurrentPage();
        }
        break;
        
      case 'checkPageForQuestions':
        const hasQuestions = checkForQuestions();
        sendResponse({ hasQuestions });
        break;
        
      case 'analysisProgress':
        updateProgressIndicator(message.progress, message.message);
        break;
        
      case 'manualAnalyze':
        if (!state.analyzing) {
          analyzeCurrentPage();
          
          // Propagate manual analyze request to other frames
          window.sendCrossDomainMessage({
            action: 'analyzeQuestion'
          }, {
            retry: true,
            retryCount: 2
          });
        }
        break;
        
      case 'requestQuestionCheck':
        // Another frame is asking if we have questions
        if (checkForQuestions() && state.enabled) {
          // We have questions in this frame, analyze them
          analyzeCurrentPage();
        }
        break;
        
      case 'broadcastInternal':
        // Handle internal broadcasting from background script
        if (message.originalMessage) {
          // Process the original message
          const originalMessage = message.originalMessage;
          
          // Log the broadcast receipt
          console.log('[Pearson AI Solver] Received broadcast:', originalMessage.action);
          
          // Handle based on the original message's action
          switch (originalMessage.action) {
            case 'manualAnalyze':
              if (!state.analyzing) {
                analyzeCurrentPage();
                
                // Also propagate to other frames that might not receive the broadcast directly
                window.sendCrossDomainMessage({
                  action: 'analyzeQuestion',
                  source: 'broadcast'
                }, {
                  retry: true
                });
              }
              break;
              
            // Add other actions as needed
            default:
              console.log('[Pearson AI Solver] Unhandled broadcast action:', originalMessage.action);
          }
          
          // Send the response back
          sendResponse({ received: true });
        }
        break;
    }
    
    // Return true if we need to send a response asynchronously
    return message.action === 'checkPageForQuestions' || message.action === 'broadcastInternal';
  });
  
  // Set up mutation observer to detect page changes
  setupMutationObserver();
  
  // Initially check if we're on a question page
  setTimeout(analyzeCurrentPage, 1000);
}

/**
 * Creates the status indicator element
 */
function createStatusIndicator() {
  if (state.statusElement) return;
  
  // Create container
  const statusElement = document.createElement('div');
  statusElement.className = 'pearson-ai-status';
  statusElement.style.display = 'none';
  
  // Create status icon
  const statusIcon = document.createElement('div');
  statusIcon.className = 'pearson-ai-status-icon';
  
  // Create status text
  const statusText = document.createElement('div');
  statusText.className = 'pearson-ai-status-text';
  statusText.textContent = 'AI Solver ready';
  
  // Create progress bar
  const progressContainer = document.createElement('div');
  progressContainer.className = 'pearson-ai-progress';
  
  const progressBar = document.createElement('div');
  progressBar.className = 'pearson-ai-progress-bar';
  progressContainer.appendChild(progressBar);
  
  // Assemble the elements
  statusElement.appendChild(statusIcon);
  statusElement.appendChild(statusText);
  statusElement.appendChild(progressContainer);
  
  // Add to page
  document.body.appendChild(statusElement);
  state.statusElement = statusElement;
}

/**
 * Updates the status indicator based on current state
 */
function updateStatusIndicator() {
  if (!state.statusElement) return;
  
  const statusElement = state.statusElement;
  const statusText = statusElement.querySelector('.pearson-ai-status-text');
  
  // Remove existing status classes
  statusElement.classList.remove('active', 'success', 'error');
  
  if (!state.enabled) {
    statusElement.style.display = 'none';
    return;
  }
  
  statusElement.style.display = 'flex';
  
  if (state.analyzing) {
    statusElement.classList.add('active');
    statusText.textContent = 'Analyzing question...';
  } else if (state.lastError) {
    statusElement.classList.add('error');
    statusText.textContent = `Error: ${state.lastError}`;
  } else if (state.lastResult) {
    statusElement.classList.add('success');
    statusText.textContent = `Answer found (${Math.round(state.lastResult.confidence * 100)}% confidence)`;
  } else {
    statusText.textContent = 'AI Solver ready';
  }
}

/**
 * Updates the progress indicator
 * 
 * @param {number} progress - Progress value between 0 and 1
 * @param {string} message - Progress message
 */
function updateProgressIndicator(progress, message) {
  if (!state.statusElement) return;
  
  const progressBar = state.statusElement.querySelector('.pearson-ai-progress-bar');
  const statusText = state.statusElement.querySelector('.pearson-ai-status-text');
  
  progressBar.style.width = `${progress * 100}%`;
  
  if (message) {
    statusText.textContent = message;
  }
}

/**
 * Sets up mutation observer to detect page changes
 */
function setupMutationObserver() {
  // Create an observer to watch for page content changes
  const observer = new MutationObserver((mutations) => {
    // Check if the mutations indicate a new question has loaded
    const significantChange = mutations.some(mutation => {
      // Look for added nodes that might contain questions
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if this element or its children might contain a question
            if (node.querySelector) {
              const hasQuestionElements = node.querySelector('.question-content') ||
                                          node.querySelector('[data-question-id]') ||
                                          node.querySelector('.questionBody');
              if (hasQuestionElements) return true;
            }
          }
        }
      }
      return false;
    });
    
    if (significantChange && state.enabled) {
      // Wait a bit for the page to finish rendering
      setTimeout(analyzeCurrentPage, 500);
    }
  });
  
  // Start observing the entire document
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * Checks if the current page contains questions
 * 
 * @returns {boolean} - Whether questions were found
 */
function checkForQuestions() {
  // Look for common question elements in Pearson MyLab
  const selectors = [
    // Standard question containers
    '.question-content',
    '[data-question-id]',
    '.questionBody',
    '.assignment-view-question',
    
    // Other common question elements
    '.question-html',
    '.questionText',
    '.matching-question',
    '.true-false-options',
    
    // Input elements that might indicate questions
    'input[type="radio"][name*="question"]',
    'input[type="text"][name*="question"]',
    'select.matching-select'
  ];
  
  // Check each selector
  for (const selector of selectors) {
    if (document.querySelector(selector)) {
      console.log('Question element found:', selector);
      return true;
    }
  }
  
  // Check for specific Pearson question patterns
  const bodyText = document.body.textContent.toLowerCase();
  const questionIndicators = [
    'choose the correct answer',
    'select the correct option',
    'true or false',
    'fill in the blank',
    'match each item'
  ];
  
  for (const indicator of questionIndicators) {
    if (bodyText.includes(indicator)) {
      console.log('Question indicator found in text:', indicator);
      return true;
    }
  }
  
  // Check for specific URL patterns
  const currentUrl = window.location.href.toLowerCase();
  if (currentUrl.includes('question') || 
      currentUrl.includes('problem') || 
      currentUrl.includes('assignment')) {
    // Additional check to avoid false positives - look for input elements
    const hasInputs = document.querySelectorAll('input, select, textarea').length > 0;
    if (hasInputs) {
      console.log('Question likely based on URL pattern and input elements');
      return true;
    }
  }
  
  console.log('No questions found on this page/frame');
  return false;
}

/**
 * Analyzes the current page for questions
 */
function analyzeCurrentPage() {
  if (!state.enabled || state.analyzing) return;
  
  // Check if we're on a question page
  if (!checkForQuestions()) {
    // If we're in an iframe or have a parent frame, send message to try checking in other frames
    if (window.parent && window.parent !== window) {
      window.sendCrossDomainMessage({ action: 'requestQuestionCheck' });
    }
    return;
  }
  
  state.analyzing = true;
  state.lastError = null;
  state.lastResult = null;
  updateStatusIndicator();
  updateProgressIndicator(0.1, 'Extracting question...');
  
  try {
    // Extract question data
    const questionData = extractQuestionData();
    
    if (!questionData) {
      state.analyzing = false;
      state.lastError = 'Could not identify question format';
      updateStatusIndicator();
      return;
    }
    
    // Store the current question data for later use
    state.currentQuestionData = questionData;
    
    // Send the question data to the background script for AI analysis
    updateProgressIndicator(0.3, 'Sending to AI...');
    
    chrome.runtime.sendMessage(
      { action: 'analyzeQuestion', questionData },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending question for analysis:', chrome.runtime.lastError);
          state.analyzing = false;
          state.lastError = 'Error communicating with AI';
          updateStatusIndicator();
          return;
        }
        
        if (!response || !response.success) {
          state.analyzing = false;
          state.lastError = response?.error || 'Failed to analyze question';
          updateStatusIndicator();
          return;
        }
        
        // Notify other frames about successful analysis
        window.sendCrossDomainMessage({ 
          action: 'questionAnalyzed', 
          success: true 
        });
        
        // Process the answer
        updateProgressIndicator(0.9, 'Applying answer...');
        handleAnswer(response.answer);
        
        // Update state
        state.analyzing = false;
        state.lastResult = response.answer;
        updateStatusIndicator();
      }
    );
  } catch (error) {
    console.error('Error analyzing question:', error);
    state.analyzing = false;
    state.lastError = error.message || 'Failed to analyze question';
    updateStatusIndicator();
  }
}

/**
 * Extracts question data from the current page
 * 
 * @returns {Object|null} - Extracted question data or null if not found
 */
function extractQuestionData() {
  // Try different methods of question extraction based on page format
  const questionData = extractPearsonAssessmentQuestion() || 
                       extractPearsonMyLabQuestion() || 
                       extractGenericQuestion();
  
  return questionData;
}

/**
 * Extracts question data from Pearson Assessment format
 * 
 * @returns {Object|null} - Extracted question data or null if not in this format
 */
function extractPearsonAssessmentQuestion() {
  // Look for assessment question container
  const questionContainer = document.querySelector('.question-content');
  if (!questionContainer) return null;
  
  // Extract question ID
  const questionId = questionContainer.closest('[data-question-id]')?.getAttribute('data-question-id');
  
  // Extract question text
  const questionTextElement = questionContainer.querySelector('.question-html') || 
                             questionContainer.querySelector('.questionText');
  if (!questionTextElement) return null;
  
  const questionText = cleanText(questionTextElement.textContent);
  
  // Detect question type and extract options
  let questionType = 'unknown';
  let options = null;
  
  // Check for multiple choice
  const multipleChoiceOptions = questionContainer.querySelectorAll('input[type="radio"]');
  if (multipleChoiceOptions.length > 0) {
    questionType = 'multipleChoice';
    options = Array.from(multipleChoiceOptions).map(radio => {
      const labelElement = radio.closest('label') || 
                          document.querySelector(`label[for="${radio.id}"]`);
      return cleanText(labelElement?.textContent || '');
    }).filter(text => text.length > 0);
  }
  
  // Check for true/false
  const trueFalseContainer = questionContainer.querySelector('.true-false-options');
  if (trueFalseContainer) {
    questionType = 'trueFalse';
  }
  
  // Check for fill in the blank
  const fillBlankInput = questionContainer.querySelector('input[type="text"], .fillinblank-input');
  if (fillBlankInput) {
    questionType = 'fillInBlank';
  }
  
  // Check for matching
  const matchingContainer = questionContainer.querySelector('.matching-question');
  if (matchingContainer) {
    questionType = 'matching';
    // Extract matching columns
    const leftItems = Array.from(matchingContainer.querySelectorAll('.matching-left-item')).map(item => 
      cleanText(item.textContent)
    );
    const rightItems = Array.from(matchingContainer.querySelectorAll('.matching-right-item')).map(item => 
      cleanText(item.textContent)
    );
    options = { left: leftItems, right: rightItems };
  }
  
  // Extract context if available (e.g., a passage above the question)
  const contextElement = document.querySelector('.passage-content, .question-context');
  const context = contextElement ? cleanText(contextElement.textContent) : null;
  
  return {
    questionId,
    questionText,
    questionType,
    options,
    context,
    pageType: 'assessment'
  };
}

/**
 * Extracts question data from Pearson MyLab format
 * 
 * @returns {Object|null} - Extracted question data or null if not in this format
 */
function extractPearsonMyLabQuestion() {
  // Look for MyLab question container
  const questionContainer = document.querySelector('.questionBody, .assignment-view-question');
  if (!questionContainer) return null;
  
  // Extract question text
  const questionTextElement = questionContainer.querySelector('.questionTextWrapper, .question-content');
  if (!questionTextElement) return null;
  
  const questionText = cleanText(questionTextElement.textContent);
  
  // Detect question type and extract options
  let questionType = 'unknown';
  let options = null;
  
  // Check for multiple choice
  const multipleChoiceOptions = questionContainer.querySelectorAll('.answerchoice, input[type="radio"]');
  if (multipleChoiceOptions.length > 0) {
    questionType = 'multipleChoice';
    options = Array.from(multipleChoiceOptions).map(element => {
      // Extract from radio buttons or div elements
      if (element.tagName === 'INPUT') {
        const label = element.closest('label') || document.querySelector(`label[for="${element.id}"]`);
        return cleanText(label?.textContent || '');
      } else {
        return cleanText(element.textContent);
      }
    }).filter(text => text.length > 0);
  }
  
  // Check for true/false
  const trueFalseOptions = questionContainer.querySelectorAll('.true-false-option, .tfChoice');
  if (trueFalseOptions.length > 0) {
    questionType = 'trueFalse';
  }
  
  // Check for fill in the blank
  const fillBlankInput = questionContainer.querySelector('input.fillBlank, input[type="text"]');
  if (fillBlankInput) {
    questionType = 'fillInBlank';
  }
  
  // Check for matching
  const matchingTable = questionContainer.querySelector('.matching-table, .matching-question');
  if (matchingTable) {
    questionType = 'matching';
    // Extract matching columns
    const rows = matchingTable.querySelectorAll('tr');
    const leftItems = [];
    const rightItems = [];
    
    // First row might be headers
    const startIndex = rows[0].querySelector('th') ? 1 : 0;
    
    for (let i = startIndex; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td');
      if (cells.length >= 2) {
        leftItems.push(cleanText(cells[0].textContent));
        rightItems.push(cleanText(cells[1].textContent));
      }
    }
    
    options = { left: leftItems, right: rightItems };
  }
  
  // Extract context if available
  const contextElement = questionContainer.previousElementSibling?.querySelector('.context, .passage');
  const context = contextElement ? cleanText(contextElement.textContent) : null;
  
  return {
    questionText,
    questionType,
    options,
    context,
    pageType: 'mylab'
  };
}

/**
 * Extracts question data using generic fallback extraction
 * 
 * @returns {Object|null} - Extracted question data or null if extraction fails
 */
function extractGenericQuestion() {
  // Look for any element that might contain a question
  const possibleQuestionElements = document.querySelectorAll('.question, .problem, .exercise, .questionBody');
  if (possibleQuestionElements.length === 0) return null;
  
  // Use the first element that looks like a question container
  const questionContainer = possibleQuestionElements[0];
  const questionText = cleanText(questionContainer.textContent);
  
  // Try to detect question type based on form elements
  let questionType = 'unknown';
  let options = null;
  
  // Check for multiple choice (radio buttons)
  const radioButtons = document.querySelectorAll('input[type="radio"]');
  if (radioButtons.length > 0) {
    questionType = 'multipleChoice';
    
    // Group radio buttons by name
    const radioGroups = {};
    radioButtons.forEach(radio => {
      if (!radioGroups[radio.name]) {
        radioGroups[radio.name] = [];
      }
      radioGroups[radio.name].push(radio);
    });
    
    // Use the largest group
    let largestGroup = [];
    for (const name in radioGroups) {
      if (radioGroups[name].length > largestGroup.length) {
        largestGroup = radioGroups[name];
      }
    }
    
    // Extract option text
    options = largestGroup.map(radio => {
      const label = radio.closest('label') || document.querySelector(`label[for="${radio.id}"]`);
      return cleanText(label?.textContent || '');
    }).filter(text => text.length > 0);
  }
  
  // Check for true/false
  if (!options && (questionText.toLowerCase().includes('true or false') || 
      document.querySelectorAll('.true, .false, .true-false').length > 0)) {
    questionType = 'trueFalse';
  }
  
  // Check for fill in the blank
  const textInputs = document.querySelectorAll('input[type="text"]');
  if (!options && textInputs.length > 0) {
    questionType = 'fillInBlank';
  }
  
  return {
    questionText,
    questionType,
    options,
    pageType: 'generic'
  };
}

/**
 * Cleans text by removing extra whitespace and normalizing
 * 
 * @param {string} text - Text to clean
 * @returns {string} - Cleaned text
 */
function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Handles the answer received from the AI
 * 
 * @param {Object} answer - Processed answer from the AI
 */
function handleAnswer(answer) {
  if (!answer || !state.currentQuestionData) return;
  
  const { questionType } = state.currentQuestionData;
  
  // Handle answer based on question type
  switch (questionType) {
    case 'multipleChoice':
      handleMultipleChoiceAnswer(answer);
      break;
    
    case 'trueFalse':
      handleTrueFalseAnswer(answer);
      break;
    
    case 'fillInBlank':
      handleFillInBlankAnswer(answer);
      break;
    
    case 'matching':
      handleMatchingAnswer(answer);
      break;
    
    default:
      // For unknown types, just log the answer
      console.log('AI Answer:', answer);
  }
  
  // Show the tooltip with the answer explanation
  if (answer.explanation) {
    showExplanationTooltip(answer.explanation);
  }
}

/**
 * Handles multiple choice answer
 * 
 * @param {Object} answer - Processed answer
 */
function handleMultipleChoiceAnswer(answer) {
  if (!answer.answerIndex && answer.answerIndex !== 0) return;
  
  // Find the radio buttons
  const radioButtons = document.querySelectorAll('input[type="radio"]');
  if (radioButtons.length === 0) return;
  
  // Group radio buttons by name
  const radioGroups = {};
  radioButtons.forEach(radio => {
    if (!radioGroups[radio.name]) {
      radioGroups[radio.name] = [];
    }
    radioGroups[radio.name].push(radio);
  });
  
  // Use the largest group
  let largestGroup = [];
  for (const name in radioGroups) {
    if (radioGroups[name].length > largestGroup.length) {
      largestGroup = radioGroups[name];
    }
  }
  
  // Select the answer if the index is valid
  if (answer.answerIndex < largestGroup.length) {
    const targetRadio = largestGroup[answer.answerIndex];
    
    // Highlight the answer in the UI
    const label = targetRadio.closest('label') || 
                 document.querySelector(`label[for="${targetRadio.id}"]`);
                 
    if (label) {
      label.classList.add('pearson-ai-highlight');
    }
    
    // If auto-selection is enabled, select the answer
    if (state.settings?.solver?.autoSelect) {
      targetRadio.checked = true;
      
      // Fire change event to trigger any page scripts
      const event = new Event('change', { bubbles: true });
      targetRadio.dispatchEvent(event);
    }
  }
}

/**
 * Handles true/false answer
 * 
 * @param {Object} answer - Processed answer
 */
function handleTrueFalseAnswer(answer) {
  if (typeof answer.answer !== 'boolean') return;
  
  // Find true/false options
  const trueOption = document.querySelector('input[value="true"], input[value="True"], input[value="T"]');
  const falseOption = document.querySelector('input[value="false"], input[value="False"], input[value="F"]');
  
  if (!trueOption || !falseOption) return;
  
  // Select the correct option
  const targetOption = answer.answer ? trueOption : falseOption;
  
  // Highlight the answer in the UI
  const label = targetOption.closest('label') || 
               document.querySelector(`label[for="${targetOption.id}"]`);
               
  if (label) {
    label.classList.add('pearson-ai-highlight');
  }
  
  // If auto-selection is enabled, select the answer
  if (state.settings?.solver?.autoSelect) {
    targetOption.checked = true;
    
    // Fire change event to trigger any page scripts
    const event = new Event('change', { bubbles: true });
    targetOption.dispatchEvent(event);
  }
}

/**
 * Handles fill-in-the-blank answer
 * 
 * @param {Object} answer - Processed answer
 */
function handleFillInBlankAnswer(answer) {
  if (!answer.answer) return;
  
  // Find the input field
  const inputField = document.querySelector('input[type="text"], .fillinblank-input');
  if (!inputField) return;
  
  // Highlight the input field
  inputField.classList.add('pearson-ai-highlight');
  
  // If auto-fill is enabled, fill in the answer
  if (state.settings?.solver?.autoSelect) {
    inputField.value = answer.answer;
    
    // Fire input and change events to trigger any page scripts
    const inputEvent = new Event('input', { bubbles: true });
    const changeEvent = new Event('change', { bubbles: true });
    inputField.dispatchEvent(inputEvent);
    inputField.dispatchEvent(changeEvent);
  }
}

/**
 * Handles matching answer
 * 
 * @param {Object} answer - Processed answer
 */
function handleMatchingAnswer(answer) {
  if (!answer.matches || answer.matches.length === 0) return;
  
  // Find the matching dropdowns or selects
  const selects = document.querySelectorAll('select.matching-select');
  
  // If we found select elements, use those
  if (selects.length > 0) {
    answer.matches.forEach(match => {
      if (match.leftIndex < selects.length) {
        const select = selects[match.leftIndex];
        
        // Highlight the select
        select.classList.add('pearson-ai-highlight');
        
        // If auto-select is enabled, select the answer
        if (state.settings?.solver?.autoSelect) {
          // Find the option with the matching right value
          const options = Array.from(select.options);
          const matchingOption = options.find(option => 
            option.textContent.includes(match.rightText)
          );
          
          if (matchingOption) {
            select.value = matchingOption.value;
            
            // Fire change event
            const event = new Event('change', { bubbles: true });
            select.dispatchEvent(event);
          }
        }
      }
    });
  } else {
    // If no select elements, try to highlight the matching pairs
    const leftItems = document.querySelectorAll('.matching-left-item');
    const rightItems = document.querySelectorAll('.matching-right-item');
    
    answer.matches.forEach(match => {
      if (match.leftIndex < leftItems.length && match.rightIndex < rightItems.length) {
        leftItems[match.leftIndex].classList.add('pearson-ai-highlight');
        rightItems[match.rightIndex].classList.add('pearson-ai-highlight');
      }
    });
  }
}

/**
 * Shows a tooltip with the answer explanation
 * 
 * @param {string} explanation - The explanation to show
 */
function showExplanationTooltip(explanation) {
  // Remove any existing tooltip
  const existingTooltip = document.querySelector('.pearson-ai-explanation-tooltip');
  if (existingTooltip) {
    existingTooltip.remove();
  }
  
  // Create tooltip element
  const tooltip = document.createElement('div');
  tooltip.className = 'pearson-ai-explanation-tooltip';
  tooltip.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    max-width: 400px;
    background-color: rgba(255, 255, 255, 0.95);
    border: 1px solid #e1e1e1;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    padding: 15px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 9998;
    max-height: 300px;
    overflow-y: auto;
  `;
  
  // Add heading
  const heading = document.createElement('h4');
  heading.textContent = 'Explanation';
  heading.style.cssText = `
    margin: 0 0 10px 0;
    font-size: 16px;
    font-weight: bold;
  `;
  tooltip.appendChild(heading);
  
  // Add explanation text
  const text = document.createElement('p');
  text.textContent = explanation;
  text.style.cssText = `
    margin: 0;
    line-height: 1.5;
  `;
  tooltip.appendChild(text);
  
  // Add close button
  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.cssText = `
    position: absolute;
    top: 5px;
    right: 5px;
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #666;
  `;
  closeButton.onclick = () => tooltip.remove();
  tooltip.appendChild(closeButton);
  
  // Add to page
  document.body.appendChild(tooltip);
  
  // Remove after 30 seconds
  setTimeout(() => {
    if (tooltip.parentNode) {
      tooltip.remove();
    }
  }, 30000);
}

/**
 * Determine which Pearson domain we're on to better handle cross-domain communication
 * @returns {string} - Identified domain type or 'unknown'
 */
function detectPearsonDomain() {
  const url = window.location.href;
  const hostname = window.location.hostname;
  
  // Create a mapping of domain patterns to domain identifiers
  const domainPatterns = [
    { pattern: /mylab\.pearson\.com/i, id: 'mylab' },
    { pattern: /mylabmastering\.pearson\.com/i, id: 'mylabmastering' },
    { pattern: /pearsonmylabandmastering\.com/i, id: 'mylabandmastering' },
    { pattern: /mathxl\.com/i, id: 'mathxl' },
    { pattern: /pearsoncmg\.com/i, id: 'pearsoncmg' },
    { pattern: /pearson\.com/i, id: 'pearson' }
  ];
  
  // Check each pattern against both URL and hostname for maximum flexibility
  for (const { pattern, id } of domainPatterns) {
    if (pattern.test(url) || pattern.test(hostname)) {
      return id;
    }
  }
  
  // If we can't determine the specific domain but it's Pearson-related
  if (hostname.includes('pearson')) {
    return 'pearson-other';
  }
  
  // Log when we encounter an unknown domain for debugging purposes
  console.log('[Pearson AI Solver] Unknown domain detected:', hostname);
  return 'unknown';
}

/**
 * Safely handle cross-domain iframe communication
 * This function addresses the postMessage origin mismatch between
 * mylab.pearson.com and mylabmastering.pearson.com
 */
function setupCrossDomainCommunication() {
  const currentDomain = detectPearsonDomain();
  console.log('[Pearson AI Solver] Setting up cross-domain communication for domain:', currentDomain, window.location.origin);
  
  // Define allowed origins for safer communication
  // Using wildcard patterns to match all Pearson subdomains
  const PEARSON_DOMAIN_PATTERNS = [
    /^https?:\/\/.*?\.?pearson\.com$/,         // Any pearson.com subdomain
    /^https?:\/\/.*?\.?pearsoncmg\.com$/,      // Any pearsoncmg.com subdomain
    /^https?:\/\/.*?\.?pearsonmylabandmastering\.com$/  // Any mylabandmastering subdomain
  ];
  
  /**
   * Checks if an origin is from a trusted Pearson domain
   * @param {string} origin - The origin to check
   * @returns {boolean} - Whether the origin is trusted
   */
  function isPearsonOrigin(origin) {
    // Fast check for common subdomains
    if (origin.includes('mylab.pearson.com') || 
        origin.includes('mylabmastering.pearson.com') ||
        origin === window.location.origin) {
      return true;
    }
    
    // Regex pattern matching for other Pearson subdomains
    return PEARSON_DOMAIN_PATTERNS.some(pattern => pattern.test(origin));
  }
  
  /**
   * Creates a debug log entry with timestamp for troubleshooting
   * Also tracks message statistics when relevant
   * 
   * @param {string} level - Log level (log, warn, error, debug)
   * @param {string} message - Log message
   * @param {any} data - Optional data to log
   */
  function debugLog(level, message, data) {
    const timestamp = new Date().toISOString();
    const currentDomain = detectPearsonDomain();
    const prefix = `[Pearson AI Solver][${timestamp}][${currentDomain}]`;
    
    // Extract action for message tracking
    let action = null;
    let category = null;
    
    // Try to determine if this is message-related and what type/category
    if (message.includes('Sending') && message.includes('message')) {
      category = 'sent';
      if (data && data.action) {
        action = data.action;
      }
    } else if (message.includes('Received') && message.includes('message')) {
      category = 'received';
      if (data && data.action) {
        action = data.action;
      }
    } else if (message.includes('Rate limiting')) {
      category = 'throttled';
      // Extract action from the message
      const actionMatch = message.match(/Rate limiting message '([^']+)'/);
      if (actionMatch && actionMatch[1]) {
        action = actionMatch[1];
      }
    } else if (message.includes('localStorage') && message.includes('message')) {
      if (message.includes('Sent')) {
        category = 'localStorage.sent';
        if (typeof data === 'string') {
          action = data;
        }
      } else if (message.includes('Received')) {
        category = 'localStorage.received';
        if (typeof data === 'string') {
          action = data;
        }
      }
    }
    
    // Record message stats if we identified a relevant category and action
    if (window.PearsonAiDebug && category && action) {
      window.PearsonAiDebug.recordMessageStat(category, action, 
        typeof data === 'object' ? data : { message });
      
      // Check for circular paths in 'sent' messages with path data
      if (category === 'sent' && data && data.path && Array.isArray(data.path)) {
        window.PearsonAiDebug.detectMessageLoop(data.path);
      }
    }
    
    // Log to console
    if (data !== undefined) {
      console[level](`${prefix} ${message}`, data);
    } else {
      console[level](`${prefix} ${message}`);
    }
    
    // If this is an error or warning, also log to background script for centralized debugging
    if (level === 'error' || level === 'warn') {
      try {
        chrome.runtime.sendMessage({
          action: 'logDebug',
          level,
          message,
          domain: currentDomain,
          data: data ? JSON.parse(JSON.stringify(data)) : null // Make serializable
        });
      } catch (e) {
        // Ignore errors in debug logging
      }
    }
  }
  
  // Listen for messages from any domain, but filter based on origin
  window.addEventListener('message', (event) => {
    // First check the origin for security
    if (!isPearsonOrigin(event.origin)) {
      // Only log detailed info in debug mode to avoid console clutter
      if (state.settings?.advanced?.debugMode) {
        debugLog('debug', `Ignoring message from non-Pearson origin: ${event.origin}`);
      }
      return;
    }
    
    try {
      // Try to parse the data if it's a string (JSON)
      let data = event.data;
      
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (jsonError) {
          // Not JSON or malformed JSON, ignore silently unless debugging
          if (state.settings?.advanced?.debugMode) {
            debugLog('debug', 'Received non-JSON message:',
              typeof data === 'string' ? data.substring(0, 100) : typeof data);
          }
          return;
        }
      }
      
      // Only process messages meant for our extension
      if (data && data.source === 'pearson_ai_solver') {
        // 1. MESSAGE RECEIVED LOGGING
        // -----------------------------------------------------------
        // Log received message (abbreviated to avoid cluttering the console)
        debugLog('debug', 'Received message:', { 
          action: data.action, 
          from: data.from, 
          id: data.messageId?.substring(0, 10) + '...' 
        });
        
        // 2. MESSAGE DEDUPLICATION
        // -----------------------------------------------------------
        // Initialize received message tracking
        window.receivedMessageIds = window.receivedMessageIds || [];
        
        // Check if we've already processed this exact message ID
        if (data.messageId && window.receivedMessageIds.includes(data.messageId)) {
          debugLog('debug', `Ignoring already processed message: ${data.messageId}`);
          return;
        }
        
        // Add to processed messages list
        if (data.messageId) {
          window.receivedMessageIds.push(data.messageId);
          
          // Keep the list manageable
          if (window.receivedMessageIds.length > 100) {
            window.receivedMessageIds = window.receivedMessageIds.slice(-100);
          }
        }
        
        // 3. LOOP DETECTION
        // -----------------------------------------------------------
        // Check for potential message loops by examining the path
        if (data.path && data.path.length > 5) {
          debugLog('warn', `Possible message loop detected! Path length: ${data.path.length}`, data.path);
          // If the same domain appears 3+ times in the path, it's likely a loop
          const domainCounts = {};
          data.path.forEach(domain => {
            domainCounts[domain] = (domainCounts[domain] || 0) + 1;
          });
          
          const currentDomain = detectPearsonDomain();
          if (domainCounts[currentDomain] >= 3) {
            debugLog('error', `Message loop detected and blocked. Domain ${currentDomain} appears ${domainCounts[currentDomain]} times in path.`);
            return; // Break the loop by not processing this message
          }
        }
        
        // Make sure we don't process our own messages (prevent echo)
        const isSameOrigin = data.from === detectPearsonDomain() && 
                             data.timestamp && 
                             (Date.now() - data.timestamp < 1000);
                            
        if (isSameOrigin && data.messageId && window.sentMessageIds?.includes(data.messageId)) {
          debugLog('debug', 'Ignoring echo of our own message');
          return;
        }
        
        // 4. MESSAGE PROCESSING
        // -----------------------------------------------------------
        // Handle different message types
        switch (data.action) {
          case 'analyzeQuestion':
            debugLog('log', 'Received analyzeQuestion request');
            // Don't re-analyze if we're already analyzing
            if (!state.analyzing) {
              analyzeCurrentPage();
            } else {
              debugLog('debug', 'Ignoring analyzeQuestion because already analyzing');
            }
            break;
            
          case 'updateStatus':
            debugLog('log', `Received updateStatus request, enabled: ${data.enabled}`);
            // Only update if the status actually changed
            if (state.enabled !== data.enabled) {
              state.enabled = data.enabled;
              updateStatusIndicator();
              
              // Only forward if it came from a different frame (avoid loops)
              if (data.from !== detectPearsonDomain() && data.path?.length < 3) {
                // Forward with controlled propagation (limited path length)
                window.sendCrossDomainMessage({
                  action: 'updateStatus',
                  enabled: data.enabled,
                  path: data.path || []
                });
              }
            } else {
              debugLog('debug', 'Ignoring updateStatus because state unchanged');
            }
            break;
            
          case 'requestQuestionCheck':
            debugLog('log', 'Received requestQuestionCheck request');
            const hasQuestions = checkForQuestions();
            
            if (hasQuestions && state.enabled) {
              debugLog('log', 'Questions found in this frame, analyzing...');
              // Add a small delay to prevent race conditions with multiple frames responding
              setTimeout(() => {
                if (!state.analyzing) {
                  analyzeCurrentPage();
                }
              }, Math.random() * 500); // Random delay between 0-500ms
            } else {
              debugLog('debug', 'No questions found in this frame');
            }
            break;
            
          case 'questionAnalyzed':
            debugLog('log', 'Question was analyzed successfully in another frame');
            // If we're analyzing, we can stop since another frame handled it
            if (state.analyzing) {
              debugLog('log', 'Canceling our analysis since another frame handled it');
              state.analyzing = false;
              updateStatusIndicator();
            }
            break;
            
          case 'ping':
            // Reply to ping requests to help with frame discovery
            // But don't propagate pings to avoid loops
            debugLog('debug', 'Received ping, sending pong');
            sendCrossDomainMessage({
              action: 'pong',
              replyTo: data.messageId,
              hasQuestions: checkForQuestions()
            }, {
              skipDuplicateCheck: true, // Always respond to pings
              skipRateLimiting: true    // Don't rate limit pong responses
            });
            break;
            
          case 'pong':
            // Process pong responses (used by frame discovery)
            if (window.pendingPings && data.replyTo) {
              const pendingPing = window.pendingPings[data.replyTo];
              if (pendingPing) {
                debugLog('debug', 'Received pong response', data);
                // Call the callback if provided
                if (pendingPing.callback) {
                  pendingPing.callback(data);
                }
                // Clean up
                delete window.pendingPings[data.replyTo];
              }
            }
            break;
            
          default:
            debugLog('debug', `Unknown message action: ${data.action}`);
        }
      }
    } catch (error) {
      debugLog('error', 'Error processing cross-domain message:', error);
    }
  });
  
  // Initialize message tracking to prevent loops
  window.sentMessageIds = window.sentMessageIds || [];
  window.pendingPings = window.pendingPings || {};
  
  /**
   * Safely sends a message to parent and child frames with improved deduplication and rate limiting
   * @param {Object} data - The message data to send
   * @param {Object} options - Options for sending the message
   * @param {boolean} options.retry - Whether to retry sending the message
   * @param {number} options.retryCount - Number of times to retry (default: 1)
   * @param {number} options.retryDelay - Delay between retries in ms (default: 500)
   * @param {Function} options.callback - Callback function for ping responses
   * @returns {string|null} - The messageId of the sent message or null if throttled
   */
  window.sendCrossDomainMessage = (data, options = {}) => {
    const { 
      retry = false, 
      retryCount = 1, 
      retryDelay = 500,
      callback = null,
      // New options for message control
      skipDuplicateCheck = false,
      skipRateLimiting = false
    } = options;
    
    // Generate unique ID for this message
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 1. THROTTLING: Rate limiting to prevent message storms
    // -----------------------------------------------------------
    // Initialize throttle timestamps if needed
    window.messageThrottleTimestamps = window.messageThrottleTimestamps || {};
    
    // Check if we should throttle this message type
    const actionKey = data.action || 'unknown';
    const now = Date.now();
    const lastSentTime = window.messageThrottleTimestamps[actionKey] || 0;
    const minInterval = 500; // Minimum time between messages of the same type (ms)
    
    if (!skipRateLimiting && (now - lastSentTime) < minInterval) {
      debugLog('warn', `Rate limiting message '${actionKey}', too many sent recently`);
      return null; // Skip sending this message due to rate limiting
    }
    
    // Update the timestamp for this action type
    window.messageThrottleTimestamps[actionKey] = now;
    
    // 2. DEDUPLICATION: Track sent messages to prevent loops
    // -----------------------------------------------------------
    // Initialize message tracking if needed
    window.sentMessageIds = window.sentMessageIds || [];
    window.sentMessageHashes = window.sentMessageHashes || {};
    window.pendingPings = window.pendingPings || {};
    
    // Create a hash of the message content to detect duplicate messages
    const messageHash = JSON.stringify({
      action: data.action,
      // Only include relevant fields for deduplication
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.hasQuestions !== undefined ? { hasQuestions: data.hasQuestions } : {})
    });
    
    // Check for duplicate messages (same content sent recently)
    if (!skipDuplicateCheck && window.sentMessageHashes[messageHash]) {
      const lastSentTimeForHash = window.sentMessageHashes[messageHash];
      // Only consider it a duplicate if sent in the last 2 seconds
      if ((now - lastSentTimeForHash) < 2000) {
        debugLog('debug', `Skipping duplicate message: ${data.action}`);
        return null;
      }
    }
    
    // Track this message hash and when it was sent
    window.sentMessageHashes[messageHash] = now;
    
    // Add message ID to tracking list
    window.sentMessageIds.push(messageId);
    
    // Keep the list manageable (max 100 entries)
    if (window.sentMessageIds.length > 100) {
      window.sentMessageIds = window.sentMessageIds.slice(-100);
    }
    
    // Clean up old message hashes (older than 10 seconds)
    Object.keys(window.sentMessageHashes).forEach(hash => {
      if ((now - window.sentMessageHashes[hash]) > 10000) {
        delete window.sentMessageHashes[hash];
      }
    });
    
    // 3. LOGGING AND TRACKING
    // -----------------------------------------------------------
    debugLog('log', 'Sending cross-domain message:', { 
      action: data.action, 
      messageId,
      hash: messageHash.substr(0, 20) + '...'
    });
    
    // For ping messages, track them for responses
    if (data.action === 'ping' && callback) {
      window.pendingPings[messageId] = {
        timestamp: now,
        callback
      };
      
      // Clean up pings after 5 seconds if no response
      setTimeout(() => {
        if (window.pendingPings[messageId]) {
          debugLog('debug', `Ping ${messageId} timed out`);
          delete window.pendingPings[messageId];
        }
      }, 5000);
    }
    
    // 4. MESSAGE PREPARATION
    // -----------------------------------------------------------
    // Add source identifier and metadata to message
    const message = {
      ...data,
      source: 'pearson_ai_solver',
      from: detectPearsonDomain(),
      timestamp: now,
      messageId,
      // Track message path to debug loops
      path: data.path ? [...data.path, detectPearsonDomain()] : [detectPearsonDomain()]
    };
    
    // Stringify the message to ensure proper JSON format
    const messageString = JSON.stringify(message);
    
    // 5. MESSAGE SENDING
    // -----------------------------------------------------------
    try {
      // Send to parent frame if we're in an iframe
      if (window.parent && window.parent !== window) {
        try {
          debugLog('debug', 'Sending to parent frame');
          window.parent.postMessage(messageString, '*');
        } catch (err) {
          debugLog('error', 'Error sending to parent frame:', err);
        }
      }
      
      // Send to all child iframes
      const iframes = document.querySelectorAll('iframe');
      if (iframes.length > 0) {
        debugLog('debug', `Sending to ${iframes.length} child iframes`);
        iframes.forEach(iframe => {
          try {
            if (iframe.contentWindow) {
              iframe.contentWindow.postMessage(messageString, '*');
            }
          } catch (err) {
            // Some iframes may be cross-origin and inaccessible
            debugLog('debug', 'Error sending to iframe:', err);
          }
        });
      }
      
      // 6. RETRY LOGIC
      // -----------------------------------------------------------
      // Set up retry mechanism for important messages
      if (retry && retryCount > 0) {
        setTimeout(() => {
          try {
            debugLog('debug', `Retrying message ${messageId}, ${retryCount} attempts left`);
            // When retrying, skip duplicate checks since we want to send again
            sendCrossDomainMessage(data, {
              retry: true,
              retryCount: retryCount - 1,
              retryDelay: retryDelay,
              callback,
              skipDuplicateCheck: true,
              skipRateLimiting: true  // Don't rate limit retries
            });
          } catch (error) {
            debugLog('error', 'Error in retry send:', error);
          }
        }, retryDelay);
      }
      
      return messageId;
    } catch (error) {
      debugLog('error', 'Critical error sending cross-domain message:', error);
      return null;
    }
  };
  
  /**
   * Discovers active frames that can receive our messages
   * @param {Function} callback - Callback with array of frame info objects
   */
  window.discoverFrames = (callback) => {
    debugLog('log', 'Starting frame discovery');
    
    // Send ping to all frames and collect responses
    const pingId = sendCrossDomainMessage({ 
      action: 'ping',
      discoveryPing: true
    }, {
      retry: true,
      retryCount: 2,
      callback: (response) => {
        debugLog('debug', 'Frame discovered:', response);
      }
    });
    
    // Wait for responses and call the callback
    setTimeout(() => {
      const discoveredFrames = Object.values(window.pendingPings)
        .filter(ping => ping.response)
        .map(ping => ping.response);
        
      debugLog('log', `Frame discovery complete, found ${discoveredFrames.length} frames`);
      
      if (callback) {
        callback(discoveredFrames);
      }
    }, 2000); // Wait 2 seconds for responses
  };
  
  // Run an initial ping to discover frames
  setTimeout(() => {
    window.sendCrossDomainMessage({ action: 'ping' }, { retry: true });
  }, 1000);
  
  // Set up fallback communication if normal postMessage fails
  setupFallbackCommunication();
}

/**
 * Sets up fallback communication mechanisms when postMessage fails
 * This uses localStorage events as a backup channel with
 * improved deduplication and rate limiting
 */
function setupFallbackCommunication() {
  const PREFIX = 'pearson_ai_solver_msg_';
  const currentDomain = detectPearsonDomain();
  
  // Track processed localStorage messages to prevent duplicates
  const processedStorageMessages = new Set();
  // Keep only the last 100 messages to prevent memory leaks
  const MAX_PROCESSED_MESSAGES = 100;
  
  // Rate limiting for localStorage communication
  const lastStorageMessageTimes = {};
  const MIN_STORAGE_MESSAGE_INTERVAL = 1000; // 1 second between messages of same type
  
  // Listen for localStorage events
  window.addEventListener('storage', (event) => {
    // Check if this is one of our messages
    if (event.key && event.key.startsWith(PREFIX)) {
      try {
        const data = JSON.parse(event.newValue);
        
        // Only process if it's our message format
        if (data && data.source === 'pearson_ai_solver') {
          // 1. DEDUPLICATION
          // --------------------------------
          // Create unique identifier for this message
          const messageSignature = `${data.action}_${data.messageId || event.key}`;
          
          // Skip if we've already processed this message
          if (processedStorageMessages.has(messageSignature)) {
            debugLog('debug', 'Skipping already processed localStorage message', data.action);
            return;
          }
          
          // Add to processed set
          processedStorageMessages.add(messageSignature);
          
          // Manage the size of our processed messages set
          if (processedStorageMessages.size > MAX_PROCESSED_MESSAGES) {
            // Convert to array, remove oldest entries, convert back to set
            const messagesArray = Array.from(processedStorageMessages);
            processedStorageMessages.clear();
            messagesArray.slice(-MAX_PROCESSED_MESSAGES).forEach(msg => {
              processedStorageMessages.add(msg);
            });
          }
          
          // 2. RATE LIMITING
          // --------------------------------
          const now = Date.now();
          const actionKey = data.action || 'unknown';
          const lastTime = lastStorageMessageTimes[actionKey] || 0;
          
          // Check if we should rate limit
          if ((now - lastTime) < MIN_STORAGE_MESSAGE_INTERVAL) {
            debugLog('debug', `Rate limiting localStorage message: ${actionKey}`);
            return;
          }
          
          // Update timestamp for this action
          lastStorageMessageTimes[actionKey] = now;
          
          // 3. PROCESSING
          // --------------------------------
          debugLog('log', '[Fallback] Received message via localStorage:', data.action);
          
          // Check if message has been bouncing around too much
          if (data.path && data.path.length > 3) {
            debugLog('warn', 'Ignoring localStorage message with too many hops', data.path);
            return;
          }
          
          // Process the message based on action
          switch (data.action) {
            case 'analyzeQuestion':
              if (!state.analyzing) {
                analyzeCurrentPage();
              }
              break;
              
            case 'updateStatus':
              if (state.enabled !== data.enabled) {
                state.enabled = data.enabled;
                updateStatusIndicator();
              }
              break;
              
            case 'requestQuestionCheck':
              if (checkForQuestions() && state.enabled && !state.analyzing) {
                // Delay to prevent all frames responding simultaneously
                setTimeout(() => analyzeCurrentPage(), Math.random() * 300);
              }
              break;
              
            // Add other actions as needed
          }
        }
      } catch (error) {
        console.error('[Pearson AI Solver] Error processing localStorage message:', error);
      }
    }
  });
  
  // Add a fallback method to the main send function
  const originalSend = window.sendCrossDomainMessage;
  window.sendCrossDomainMessage = (data, options = {}) => {
    // Only use fallback for certain important message types
    const shouldUseFallback = ['analyzeQuestion', 'updateStatus', 'requestQuestionCheck'].includes(data.action);
    
    // Try the normal postMessage method first
    const messageId = originalSend(data, options);
    
    // If the message was throttled or we shouldn't use fallback, don't use localStorage
    if (messageId === null || !shouldUseFallback) {
      return messageId;
    }
    
    // For important messages, also use localStorage as fallback
    // But only if not too many of the same message type have been sent recently
    const now = Date.now();
    const storageLastSent = window.storageLastSentTimes || {};
    window.storageLastSentTimes = storageLastSent;
    
    const actionKey = data.action || 'unknown';
    const lastTime = storageLastSent[actionKey] || 0;
    const minInterval = 2000; // Only use localStorage fallback every 2 seconds per message type
    
    if ((now - lastTime) < minInterval) {
      debugLog('debug', `Skipping localStorage fallback for ${actionKey} (rate limited)`);
      return messageId;
    }
    
    // Update the timestamp
    storageLastSent[actionKey] = now;
    
    try {
      // Create a unique key for this message
      const key = `${PREFIX}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Add metadata
      const message = {
        ...data,
        source: 'pearson_ai_solver',
        from: currentDomain,
        timestamp: now,
        fallback: true,
        messageId: messageId || `fallback_${Date.now()}`
      };
      
      // Store in localStorage to trigger storage event in other frames
      localStorage.setItem(key, JSON.stringify(message));
      
      // Clean up after a short delay
      setTimeout(() => {
        localStorage.removeItem(key);
      }, 1000);
      
      debugLog('log', 'Sent fallback message via localStorage:', data.action);
    } catch (error) {
      debugLog('error', 'Fallback communication failed:', error);
    }
    
    return messageId;
  };
} 