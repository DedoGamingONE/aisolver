/**
 * Background script for Pearson MyLab AI Solver
 * 
 * This handles communication between content scripts and popup,
 * manages API calls, and preserves state across page navigations.
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

// Initialize extension settings when installed
chrome.runtime.onInstalled.addListener(() => {
  // Set default settings
  chrome.storage.sync.get('settings', (data) => {
    if (!data.settings) {
      chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
    }
  });
});

// Message handler for communication between content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getSolverStatus':
      chrome.storage.sync.get('settings', (data) => {
        sendResponse({ enabled: data.settings?.solver?.enabled || false });
      });
      return true; // Async response
      
    case 'toggleSolver':
      chrome.storage.sync.get('settings', (data) => {
        const settings = data.settings || DEFAULT_SETTINGS;
        settings.solver.enabled = message.enabled;
        chrome.storage.sync.set({ settings });
        // Send status update to all tabs with the content script
        chrome.tabs.query({ 
          url: [
            '*://*.pearson.com/*',
            '*://*.mylab.pearson.com/*',
            '*://*.mylabmastering.pearson.com/*'
          ]
        }, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { 
              action: 'solverStatusChanged', 
              enabled: settings.solver.enabled 
            });
          });
        });
        sendResponse({ success: true });
      });
      return true; // Async response
      
    case 'analyzeQuestion':
      handleQuestionAnalysis(message.questionData, sender.tab.id, sendResponse);
      return true; // Async response
      
    case 'updateStats':
      updateStatistics(message.stats);
      sendResponse({ success: true });
      return true; // Async response
      
    case 'getSettings':
      chrome.storage.sync.get('settings', (data) => {
        sendResponse({ settings: data.settings || DEFAULT_SETTINGS });
      });
      return true; // Async response
      
    case 'checkCurrentPage':
      if (sender.tab) {
        // Check if current page is a Pearson MyLab page with questions
        chrome.tabs.sendMessage(sender.tab.id, { action: 'checkPageForQuestions' });
      }
      return false; // No async response needed
      
    case 'broadcastToFrames':
      // Handle broadcasting to all frames in a tab
      if (message.tabId && message.frameMessage) {
        broadcastToAllFrames(message.tabId, message.frameMessage, (result) => {
          sendResponse(result);
        });
      } else {
        sendResponse({ success: false, error: 'Missing tabId or frameMessage' });
      }
      return true; // Async response
      
    case 'logDebug':
      // Centralized logging for debugging cross-domain issues
      console.log(`[${message.domain || 'unknown'}][${message.level || 'debug'}] ${message.message}`, message.data || '');
      sendResponse({ success: true });
      return false; // No async response needed
  }
});

/**
 * Handles question analysis by calling the AI API
 * 
 * @param {Object} questionData - Data about the question to analyze
 * @param {number} tabId - ID of the tab that sent the request
 * @param {function} sendResponse - Function to send response back
 */
function handleQuestionAnalysis(questionData, tabId, sendResponse) {
  chrome.storage.sync.get('settings', async (data) => {
    const settings = data.settings || DEFAULT_SETTINGS;
    
    if (!settings.apiKey) {
      sendResponse({ 
        success: false, 
        error: 'API key is missing. Please add it in the extension options.'
      });
      return;
    }
    
    try {
      // Update the content script with progress
      chrome.tabs.sendMessage(tabId, { 
        action: 'analysisProgress', 
        progress: 0.2,
        message: 'Processing question...' 
      });
      
      // Create the prompt for the AI based on question type
      const prompt = createPrompt(questionData, settings);
      
      // Update content script with progress
      chrome.tabs.sendMessage(tabId, { 
        action: 'analysisProgress', 
        progress: 0.4,
        message: 'Sending to AI...' 
      });
      
      // Make API call to Claude AI
      const response = await callClaudeApi(prompt, settings);
      
      // Update content script with progress
      chrome.tabs.sendMessage(tabId, { 
        action: 'analysisProgress', 
        progress: 0.8,
        message: 'Processing answer...' 
      });
      
      // Process the AI response
      const processedAnswer = processAiResponse(response, questionData);
      
      // Update statistics
      updateStatistics({ questionsAnalyzed: 1 });
      
      // Send the processed answer back
      sendResponse({ 
        success: true, 
        answer: processedAnswer
      });
    } catch (error) {
      console.error('Error analyzing question:', error);
      sendResponse({ 
        success: false, 
        error: error.message || 'Failed to analyze question'
      });
    }
  });
}

/**
 * Creates an appropriate prompt for the AI based on question type
 * 
 * @param {Object} questionData - Data about the question
 * @param {Object} settings - Extension settings
 * @returns {string} - Formatted prompt for the AI
 */
function createPrompt(questionData, settings) {
  const { questionType, questionText, options, context } = questionData;
  
  // Base prompt template
  let prompt = '';
  
  // Use custom prompt if available and enabled
  if (settings.advanced.customPrompt && settings.advanced.customPrompt.trim()) {
    prompt = settings.advanced.customPrompt
      .replace('{{QUESTION}}', questionText)
      .replace('{{CONTEXT}}', context || 'No context provided')
      .replace('{{OPTIONS}}', formatOptions(options));
  } else {
    // Default prompts based on question type
    switch (questionType) {
      case 'multipleChoice':
        prompt = `You are a helpful AI assistant solving a multiple-choice question from Pearson MyLab.
Question: ${questionText}

${context ? 'Context: ' + context + '\n\n' : ''}Options:
${formatOptions(options)}

Please analyze this question carefully and select the most accurate answer. Provide your answer by indicating the letter of the correct option (e.g., "The answer is B") followed by a brief explanation of why this is correct.`;
        break;
        
      case 'trueFalse':
        prompt = `You are a helpful AI assistant solving a true/false question from Pearson MyLab.
Question: ${questionText}

${context ? 'Context: ' + context + '\n\n' : ''}
Please determine whether this statement is TRUE or FALSE. Provide your answer as "TRUE" or "FALSE" followed by a brief explanation of your reasoning.`;
        break;
        
      case 'fillInBlank':
        prompt = `You are a helpful AI assistant solving a fill-in-the-blank question from Pearson MyLab.
Question: ${questionText}

${context ? 'Context: ' + context + '\n\n' : ''}
Please provide the appropriate word(s) or phrase that should fill in the blank. Make sure your answer is concise and formatted exactly as it should be entered.`;
        break;
        
      case 'matching':
        prompt = `You are a helpful AI assistant solving a matching question from Pearson MyLab.
Question: ${questionText}

${context ? 'Context: ' + context + '\n\n' : ''}Left Column:
${formatMatchingLeft(options.left)}

Right Column:
${formatMatchingRight(options.right)}

Please match each item in the left column with the appropriate item in the right column. Provide your answer as a numbered list where each line contains the number from the left column followed by the letter from the right column (e.g., "1-B, 2-A").`;
        break;
        
      default:
        prompt = `You are a helpful AI assistant solving a question from Pearson MyLab.
Question: ${questionText}

${context ? 'Context: ' + context + '\n\n' : ''}${options ? 'Options:\n' + formatOptions(options) + '\n\n' : ''}
Please provide the correct answer to this question based on the information given.`;
    }
  }
  
  // Add debug information if debug mode is enabled
  if (settings.advanced.debugMode) {
    prompt += `\n\n[Debug Mode: This is a ${questionType} question. Please return your answer in a format that can be easily parsed for automatic answer selection.]`;
  }
  
  return prompt;
}

/**
 * Formats options for multiple choice questions
 * 
 * @param {Array|Object} options - Question options
 * @returns {string} - Formatted options string
 */
function formatOptions(options) {
  if (!options) return '';
  
  if (Array.isArray(options)) {
    return options.map((opt, index) => {
      const letter = String.fromCharCode(65 + index); // A, B, C, etc.
      return `${letter}) ${opt}`;
    }).join('\n');
  }
  
  return '';
}

/**
 * Formats left column for matching questions
 * 
 * @param {Array} leftOptions - Left column options
 * @returns {string} - Formatted left column string
 */
function formatMatchingLeft(leftOptions) {
  if (!leftOptions || !Array.isArray(leftOptions)) return '';
  
  return leftOptions.map((opt, index) => {
    return `${index + 1}) ${opt}`;
  }).join('\n');
}

/**
 * Formats right column for matching questions
 * 
 * @param {Array} rightOptions - Right column options
 * @returns {string} - Formatted right column string
 */
function formatMatchingRight(rightOptions) {
  if (!rightOptions || !Array.isArray(rightOptions)) return '';
  
  return rightOptions.map((opt, index) => {
    const letter = String.fromCharCode(65 + index); // A, B, C, etc.
    return `${letter}) ${opt}`;
  }).join('\n');
}

/**
 * Makes an API call to Claude AI
 * 
 * @param {string} prompt - The formatted prompt to send
 * @param {Object} settings - Extension settings
 * @returns {Object} - AI response
 */
async function callClaudeApi(prompt, settings) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'API request failed');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Claude API error:', error);
    throw new Error('Failed to get response from AI: ' + error.message);
  }
}

/**
 * Processes the AI response to extract the answer
 * 
 * @param {Object} aiResponse - Response from the AI
 * @param {Object} questionData - Original question data
 * @returns {Object} - Processed answer with confidence
 */
function processAiResponse(aiResponse, questionData) {
  const { questionType } = questionData;
  
  // Extract text content from the response
  const responseText = aiResponse.content[0].text;
  
  // Process based on question type
  switch (questionType) {
    case 'multipleChoice':
      return extractMultipleChoiceAnswer(responseText, questionData.options);
      
    case 'trueFalse':
      return extractTrueFalseAnswer(responseText);
      
    case 'fillInBlank':
      return extractFillInBlankAnswer(responseText);
      
    case 'matching':
      return extractMatchingAnswer(responseText, questionData.options);
      
    default:
      return {
        rawAnswer: responseText,
        confidence: 0.7
      };
  }
}

/**
 * Extracts multiple choice answer from AI response
 * 
 * @param {string} responseText - Text response from AI
 * @param {Array} options - Question options
 * @returns {Object} - Extracted answer with confidence
 */
function extractMultipleChoiceAnswer(responseText, options) {
  // Look for patterns like "The answer is A" or just "A" at the beginning
  const pattern = /(?:the answer is |answer:|^|\s)([A-E])(?:\W|$)/i;
  const match = responseText.match(pattern);
  
  if (match) {
    const answerLetter = match[1].toUpperCase();
    const answerIndex = answerLetter.charCodeAt(0) - 65; // Convert A->0, B->1, etc.
    
    if (answerIndex >= 0 && answerIndex < options.length) {
      // Higher confidence if a specific pattern was matched
      const confidence = responseText.toLowerCase().includes('the answer is') ? 0.95 : 0.85;
      
      return {
        answerIndex,
        answerText: options[answerIndex],
        answerLetter,
        explanation: extractExplanation(responseText, match[0]),
        confidence
      };
    }
  }
  
  // Fallback: try to match option text directly
  return {
    rawAnswer: responseText,
    confidence: 0.6
  };
}

/**
 * Extracts true/false answer from AI response
 * 
 * @param {string} responseText - Text response from AI
 * @returns {Object} - Extracted answer with confidence
 */
function extractTrueFalseAnswer(responseText) {
  const lowerResponse = responseText.toLowerCase();
  
  // Look for explicit true/false statements
  const isTrueMatch = /(?:^|\W)(true|the answer is true|the statement is true)(?:\W|$)/i.test(lowerResponse);
  const isFalseMatch = /(?:^|\W)(false|the answer is false|the statement is false)(?:\W|$)/i.test(lowerResponse);
  
  if (isTrueMatch && !isFalseMatch) {
    return {
      answer: true,
      answerText: 'True',
      explanation: extractExplanation(responseText, 'true'),
      confidence: 0.9
    };
  } else if (isFalseMatch && !isTrueMatch) {
    return {
      answer: false,
      answerText: 'False',
      explanation: extractExplanation(responseText, 'false'),
      confidence: 0.9
    };
  }
  
  // If both or neither are matched, use a more nuanced approach
  const trueCount = (lowerResponse.match(/true/g) || []).length;
  const falseCount = (lowerResponse.match(/false/g) || []).length;
  
  if (trueCount > falseCount) {
    return {
      answer: true,
      answerText: 'True',
      explanation: extractExplanation(responseText),
      confidence: 0.7
    };
  } else if (falseCount > trueCount) {
    return {
      answer: false,
      answerText: 'False',
      explanation: extractExplanation(responseText),
      confidence: 0.7
    };
  }
  
  // If we can't determine, return the raw response
  return {
    rawAnswer: responseText,
    confidence: 0.5
  };
}

/**
 * Extracts fill-in-the-blank answer from AI response
 * 
 * @param {string} responseText - Text response from AI
 * @returns {Object} - Extracted answer with confidence
 */
function extractFillInBlankAnswer(responseText) {
  // Try to find the answer in quotes or after "Answer:" or at the beginning
  const patterns = [
    /"([^"]+)"/,                       // Text in double quotes
    /Answer:\s*([^\.\n]+)/i,           // Text after "Answer:"
    /^([^\.\n]+)(?:\.|$)/m             // First sentence/line
  ];
  
  for (const pattern of patterns) {
    const match = responseText.match(pattern);
    if (match && match[1]) {
      const answer = match[1].trim();
      if (answer.length > 0) {
        // Confidence depends on which pattern matched
        const confidence = pattern === patterns[0] ? 0.9 : 
                           pattern === patterns[1] ? 0.85 : 0.75;
        
        return {
          answer,
          confidence,
          explanation: extractExplanation(responseText, match[0])
        };
      }
    }
  }
  
  // If no clear answer found, return shortest sentence as best guess
  const sentences = responseText.split(/[.!?]/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 50);
  
  if (sentences.length > 0) {
    sentences.sort((a, b) => a.length - b.length);
    return {
      answer: sentences[0],
      confidence: 0.6,
      explanation: responseText
    };
  }
  
  // Last resort
  return {
    rawAnswer: responseText,
    confidence: 0.5
  };
}

/**
 * Extracts matching answers from AI response
 * 
 * @param {string} responseText - Text response from AI
 * @param {Object} options - Question options
 * @returns {Object} - Extracted answer with confidence
 */
function extractMatchingAnswer(responseText, options) {
  // Look for patterns like "1-A, 2-B, 3-C" or "1: A, 2: B"
  const matches = [];
  const patterns = [
    /(\d+)[\s-:]+([A-Z])/g,          // 1-A or 1: A or 1 A
    /(\d+)[\s-:]*([A-Z])/g           // More lenient pattern
  ];
  
  let matchResults = null;
  let patternIndex = 0;
  
  // Try patterns in order of strictness
  while (patternIndex < patterns.length && (!matchResults || matches.length === 0)) {
    matchResults = [...responseText.matchAll(patterns[patternIndex])];
    
    for (const match of matchResults) {
      const num = parseInt(match[1], 10);
      const letter = match[2];
      
      if (num > 0 && num <= options.left.length) {
        const letterIndex = letter.charCodeAt(0) - 65; // Convert A->0, B->1
        if (letterIndex >= 0 && letterIndex < options.right.length) {
          matches.push({
            leftIndex: num - 1,
            rightIndex: letterIndex,
            leftText: options.left[num - 1],
            rightText: options.right[letterIndex]
          });
        }
      }
    }
    
    patternIndex++;
  }
  
  // Calculate confidence based on the number of matches vs expected
  const expectedMatches = Math.min(options.left.length, options.right.length);
  const confidence = expectedMatches > 0 ? 
    Math.min(0.95, (matches.length / expectedMatches) * 0.95) : 0.7;
  
  return {
    matches,
    confidence,
    explanation: extractExplanation(responseText)
  };
}

/**
 * Extracts explanation from AI response
 * 
 * @param {string} responseText - Text response from AI
 * @param {string} answerPart - Part of text to exclude from explanation
 * @returns {string} - Extracted explanation
 */
function extractExplanation(responseText, answerPart = '') {
  // Remove the answer part if provided
  let explanation = responseText;
  if (answerPart) {
    explanation = explanation.replace(answerPart, '').trim();
  }
  
  // Look for explanation after "because", "as", "explanation:", etc.
  const explanationPatterns = [
    /(?:because|since|as)([^.!?]+[.!?])/i,
    /explanation:([^]+)/i,
    /reasoning:([^]+)/i
  ];
  
  for (const pattern of explanationPatterns) {
    const match = explanation.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // If no pattern matches, return the whole text minus the answer
  return explanation;
}

/**
 * Updates extension statistics
 * 
 * @param {Object} newStats - New statistics to add
 */
function updateStatistics(newStats) {
  chrome.storage.sync.get('settings', (data) => {
    const settings = data.settings || DEFAULT_SETTINGS;
    
    // Update stats
    Object.keys(newStats).forEach(key => {
      if (settings.stats.hasOwnProperty(key)) {
        settings.stats[key] += newStats[key];
      }
    });
    
    // Save updated settings
    chrome.storage.sync.set({ settings });
  });
}

/**
 * Broadcasts a message to all frames in a tab
 * This is especially useful for cross-domain scenarios where direct messaging may fail
 * 
 * @param {number} tabId - ID of the tab to broadcast to
 * @param {Object} message - Message to broadcast to all frames
 * @param {Function} [callback] - Optional callback
 */
function broadcastToAllFrames(tabId, message, callback) {
  console.log(`Broadcasting message to all frames in tab ${tabId}:`, message);
  
  // First attempt to send to all frames using the chrome API
  chrome.tabs.sendMessage(tabId, {
    action: 'broadcastInternal',
    originalMessage: message
  }, { frameId: 0 }); // Target main frame first
  
  // Also inject a content script that will use our fallback approach
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (messageData) => {
      // Broadcast using both postMessage and localStorage as fallbacks
      const message = messageData.message;
      
      // Define a prefix for localStorage messaging
      const PREFIX = 'pearson_ai_solver_msg_';
      
      // Function to broadcast using localStorage as a backup channel
      function broadcastViaLocalStorage(data) {
        try {
          // Create a unique key
          const key = `${PREFIX}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          // Prepare message with required fields
          const messageWithMeta = {
            ...data,
            source: 'pearson_ai_solver',
            timestamp: Date.now(),
            broadcast: true
          };
          
          // Store in localStorage to trigger events in all frames
          localStorage.setItem(key, JSON.stringify(messageWithMeta));
          
          // Clean up after a short delay
          setTimeout(() => {
            localStorage.removeItem(key);
          }, 2000);
          
          console.log('[Broadcast Helper] Sent via localStorage:', data.action);
          return true;
        } catch (error) {
          console.error('[Broadcast Helper] localStorage broadcast failed:', error);
          return false;
        }
      }
      
      // Try postMessage for all windows
      try {
        // Broadcast to parent and all child frames
        const broadcastMessage = JSON.stringify({
          ...message,
          source: 'pearson_ai_solver',
          broadcast: true,
          timestamp: Date.now()
        });
        
        // Send to parent if we're in an iframe
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(broadcastMessage, '*');
        }
        
        // Send to all iframes
        const frames = document.querySelectorAll('iframe');
        console.log(`[Broadcast Helper] Broadcasting to ${frames.length} frames via postMessage`);
        frames.forEach(frame => {
          try {
            frame.contentWindow.postMessage(broadcastMessage, '*');
          } catch (e) {
            // Ignore errors for cross-origin frames
          }
        });
        
        // Also use localStorage as a fallback
        broadcastViaLocalStorage(message);
        
        console.log('[Broadcast Helper] Broadcast completed');
      } catch (error) {
        console.error('[Broadcast Helper] Error during broadcast:', error);
        // Try localStorage as fallback
        broadcastViaLocalStorage(message);
      }
    },
    args: [{ message }]
  }).catch(error => {
    console.error('Failed to execute broadcast script:', error);
    
    // Fallback - try sending to frame 0 directly
    chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, () => {
      // Ignore error since we don't know which frame has our content script
      if (chrome.runtime.lastError) {
        console.log('Expected error during fallback:', chrome.runtime.lastError.message);
      }
    });
    
    if (callback) callback({ success: false, error: error.message });
  });
  
  if (callback) callback({ success: true });
} 