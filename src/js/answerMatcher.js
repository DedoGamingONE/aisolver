/**
 * Answer Matcher module
 * Specialized module for matching AI responses to available answer choices
 */

class AnswerMatcher {
  constructor(confidenceThreshold = 0.85) {
    this.confidenceThreshold = confidenceThreshold;
  }
  
  /**
   * Set the confidence threshold for matching
   * @param {number} threshold - Confidence threshold between 0 and 1
   */
  setConfidenceThreshold(threshold) {
    if (threshold >= 0 && threshold <= 1) {
      this.confidenceThreshold = threshold;
    }
  }
  
  /**
   * Match AI response to available answer choices
   * @param {string} aiResponse - Response from the AI
   * @param {Object} questionData - Question data including choices
   * @returns {Object} Match result with best match and confidence score
   */
  matchResponseToChoices(aiResponse, questionData) {
    if (!aiResponse || !questionData || !questionData.choices || questionData.choices.length === 0) {
      return {
        matchedIndex: -1,
        confidence: 0,
        matchedText: null,
        directMatch: false,
        message: 'No valid choices or AI response provided'
      };
    }
    
    // First, try to find a direct answer number in the AI response
    const directMatch = this.findDirectAnswerNumber(aiResponse, questionData.choices.length);
    
    if (directMatch !== -1) {
      return {
        matchedIndex: directMatch,
        confidence: 1.0,
        matchedText: questionData.choices[directMatch],
        directMatch: true,
        message: 'Direct numerical match found'
      };
    }
    
    // For multiple-choice questions, try semantic matching
    if (questionData.questionType === 'multiple-choice') {
      return this.semanticChoiceMatching(aiResponse, questionData.choices);
    }
    
    // For fill-in-blank questions, extract the potential answer from AI response
    if (questionData.questionType === 'fill-in-blank') {
      return this.extractFillInBlankAnswer(aiResponse, questionData);
    }
    
    // For matching questions, try to match each item
    if (questionData.questionType === 'matching') {
      return this.matchMatchingItems(aiResponse, questionData);
    }
    
    // Generic fallback: just return the AI response as is
    return {
      matchedIndex: -1,
      confidence: 0.5,
      matchedText: aiResponse.trim(),
      directMatch: false,
      message: 'Returning raw AI response'
    };
  }
  
  /**
   * Try to find a direct answer number in the AI response
   * @param {string} aiResponse - Response from the AI
   * @param {number} choiceCount - Number of available choices
   * @returns {number} Matched index or -1 if no direct match
   */
  findDirectAnswerNumber(aiResponse, choiceCount) {
    // Check for simple number answer like "2" or "The answer is 2"
    const numberPattern = /(?:^|answer\s*is\s*|choose\s*|select\s*|option\s*)([1-9][0-9]*)(?:\.|$|\s)/i;
    const match = aiResponse.match(numberPattern);
    
    if (match) {
      const answerNumber = parseInt(match[1], 10);
      // Answer indices are 0-based, but choices are often presented as 1-based
      const index = answerNumber - 1;
      
      if (index >= 0 && index < choiceCount) {
        return index;
      }
    }
    
    // Check for letter answers like "B" or "The answer is B"
    const letterPattern = /(?:^|answer\s*is\s*|choose\s*|select\s*|option\s*)([A-Z])(?:\.|$|\s)/i;
    const letterMatch = aiResponse.match(letterPattern);
    
    if (letterMatch) {
      const answerLetter = letterMatch[1].toUpperCase();
      const index = answerLetter.charCodeAt(0) - 'A'.charCodeAt(0);
      
      if (index >= 0 && index < choiceCount) {
        return index;
      }
    }
    
    return -1;
  }
  
  /**
   * Match AI response to choices using semantic similarity
   * @param {string} aiResponse - Response from the AI
   * @param {Array<string>} choices - Available answer choices
   * @returns {Object} Match result with best match and confidence score
   */
  semanticChoiceMatching(aiResponse, choices) {
    // Clean up and normalize the AI response
    const cleanResponse = this.normalizeText(aiResponse);
    
    // Prepare choices for comparison
    const normalizedChoices = choices.map(choice => this.normalizeText(choice));
    
    // Calculate similarity scores
    const scores = normalizedChoices.map(choice => {
      return {
        similarityScore: this.calculateSimilarity(cleanResponse, choice),
        substringScore: this.calculateSubstringScore(cleanResponse, choice)
      };
    });
    
    // Combine scores and find best match
    const combinedScores = scores.map(score => {
      return 0.7 * score.similarityScore + 0.3 * score.substringScore;
    });
    
    // Find the index of the highest score
    let bestMatchIndex = -1;
    let highestScore = 0;
    
    combinedScores.forEach((score, index) => {
      if (score > highestScore) {
        highestScore = score;
        bestMatchIndex = index;
      }
    });
    
    // If confidence is below threshold, return a low-confidence result
    if (highestScore < this.confidenceThreshold) {
      return {
        matchedIndex: bestMatchIndex,
        confidence: highestScore,
        matchedText: bestMatchIndex !== -1 ? choices[bestMatchIndex] : null,
        directMatch: false,
        message: 'Low confidence match'
      };
    }
    
    return {
      matchedIndex: bestMatchIndex,
      confidence: highestScore,
      matchedText: choices[bestMatchIndex],
      directMatch: false,
      message: 'Semantic match found'
    };
  }
  
  /**
   * Extract answer for fill-in-blank questions
   * @param {string} aiResponse - Response from the AI
   * @param {Object} questionData - Question data
   * @returns {Object} Extracted answer with confidence
   */
  extractFillInBlankAnswer(aiResponse, questionData) {
    // Common patterns that indicate the final answer
    const answerPatterns = [
      /(?:the\s+)?(?:correct\s+)?(?:answer\s+is|result\s+is)(?:\s+:)?\s+(.+?)(?:[,.]\s*|$)/i,
      /(?:^|,\s+)(.+?)\s+is\s+the\s+(?:correct\s+)?answer/i,
      /(?:^|,\s+)(.+?)\s+would\s+be\s+(?:the\s+)?(?:correct\s+)?answer/i
    ];
    
    // Try each pattern
    for (const pattern of answerPatterns) {
      const match = aiResponse.match(pattern);
      if (match && match[1] && match[1].length > 0) {
        return {
          matchedIndex: -1,
          confidence: 0.9,
          matchedText: match[1].trim(),
          directMatch: false,
          message: 'Extracted answer from pattern'
        };
      }
    }
    
    // If no pattern matches, use the first sentence as the answer
    const firstSentence = aiResponse.split(/[.!?](?:\s|$)/)[0].trim();
    
    return {
      matchedIndex: -1,
      confidence: 0.7,
      matchedText: firstSentence,
      directMatch: false,
      message: 'Using first sentence as answer'
    };
  }
  
  /**
   * Match items for matching-type questions
   * @param {string} aiResponse - Response from the AI
   * @param {Object} questionData - Question data
   * @returns {Object} Matching results
   */
  matchMatchingItems(aiResponse, questionData) {
    const matchingResults = [];
    const matchingItems = questionData.choices;
    
    if (!matchingItems || matchingItems.length === 0) {
      return {
        matchedIndex: -1,
        confidence: 0,
        matchedText: null,
        directMatch: false,
        message: 'No matching items provided'
      };
    }
    
    // Look for patterns like "item1 -> match3" or "item1 matches with match3"
    for (const item of matchingItems) {
      const leftItem = item.left;
      const escapedLeftItem = this.escapeRegExp(leftItem);
      
      // Different patterns to detect matches in the AI response
      const patterns = [
        new RegExp(`${escapedLeftItem}\\s*(?:->|→|=|:)\\s*(.+?)(?:[\\.,]|$)`, 'i'),
        new RegExp(`${escapedLeftItem}\\s*(?:matches|pairs|goes|corresponds)\\s*(?:with|to)?\\s*(.+?)(?:[\\.,]|$)`, 'i'),
        new RegExp(`for\\s*${escapedLeftItem}[\\s,]*(?:the answer is|choose|select|pick)\\s*(.+?)(?:[\\.,]|$)`, 'i')
      ];
      
      for (const pattern of patterns) {
        const match = aiResponse.match(pattern);
        if (match && match[1]) {
          const rightText = match[1].trim();
          
          // Compare with available right options
          const rightOptions = item.right;
          let bestMatch = '';
          let bestScore = 0;
          
          for (const option of rightOptions) {
            const score = this.calculateSimilarity(rightText, option);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = option;
            }
          }
          
          if (bestScore > this.confidenceThreshold) {
            matchingResults.push({
              left: leftItem,
              right: bestMatch,
              confidence: bestScore
            });
          }
        }
      }
    }
    
    // If we found matches, return them
    if (matchingResults.length > 0) {
      return {
        matchedIndex: -1,
        confidence: Math.min(...matchingResults.map(r => r.confidence)),
        matchedText: JSON.stringify(matchingResults),
        matches: matchingResults,
        directMatch: false,
        message: 'Matched matching items'
      };
    }
    
    // Fallback: return raw AI response
    return {
      matchedIndex: -1,
      confidence: 0.5,
      matchedText: aiResponse,
      directMatch: false,
      message: 'Failed to extract matching pairs'
    };
  }
  
  /**
   * Normalize text for comparison
   * @param {string} text - Text to normalize
   * @returns {string} Normalized text
   */
  normalizeText(text) {
    if (!text) return '';
    
    // Convert to lowercase
    let normalized = text.toLowerCase();
    
    // Remove punctuation and extra whitespace
    normalized = normalized.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ');
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    // Remove common filler words
    const fillerWords = ['the', 'a', 'an', 'that', 'this', 'these', 'those', 'is', 'are', 'was', 'were'];
    for (const word of fillerWords) {
      const wordPattern = new RegExp(`\\b${word}\\b`, 'g');
      normalized = normalized.replace(wordPattern, '');
    }
    
    return normalized;
  }
  
  /**
   * Calculate similarity between two texts
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {number} Similarity score between 0 and 1
   */
  calculateSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    
    // Simple implementation of cosine similarity using word frequency
    const words1 = text1.split(/\s+/);
    const words2 = text2.split(/\s+/);
    
    // Count word frequencies
    const freq1 = {};
    const freq2 = {};
    
    for (const word of words1) {
      freq1[word] = (freq1[word] || 0) + 1;
    }
    
    for (const word of words2) {
      freq2[word] = (freq2[word] || 0) + 1;
    }
    
    // Find all unique words
    const uniqueWords = new Set([...Object.keys(freq1), ...Object.keys(freq2)]);
    
    // Calculate dot product
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;
    
    for (const word of uniqueWords) {
      const count1 = freq1[word] || 0;
      const count2 = freq2[word] || 0;
      
      dotProduct += count1 * count2;
      magnitude1 += count1 * count1;
      magnitude2 += count2 * count2;
    }
    
    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);
    
    // Avoid division by zero
    if (magnitude1 === 0 || magnitude2 === 0) return 0;
    
    // Calculate cosine similarity
    return dotProduct / (magnitude1 * magnitude2);
  }
  
  /**
   * Calculate substring matching score
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {number} Substring score between 0 and 1
   */
  calculateSubstringScore(text1, text2) {
    if (!text1 || !text2) return 0;
    
    // Check if one text is a substring of the other
    if (text1.includes(text2)) {
      return text2.length / text1.length;
    }
    
    if (text2.includes(text1)) {
      return text1.length / text2.length;
    }
    
    // Calculate the longest common substring length
    const lcs = this.longestCommonSubstring(text1, text2);
    const maxLength = Math.max(text1.length, text2.length);
    
    return lcs / maxLength;
  }
  
  /**
   * Find the length of the longest common substring
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {number} Length of longest common substring
   */
  longestCommonSubstring(text1, text2) {
    if (!text1 || !text2) return 0;
    
    const m = text1.length;
    const n = text2.length;
    let maxLength = 0;
    
    // Create a table to store lengths of longest common suffixes
    const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));
    
    // Fill the table
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (text1[i - 1] === text2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
          maxLength = Math.max(maxLength, dp[i][j]);
        }
      }
    }
    
    return maxLength;
  }
  
  /**
   * Escape special characters in string for use in regex
   * @param {string} string - String to escape
   * @returns {string} Escaped string
   */
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Export the class for use in other modules
window.AnswerMatcher = AnswerMatcher; 