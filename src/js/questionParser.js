/**
 * Question Parser module
 * Responsible for analyzing the DOM and extracting question content
 */

class QuestionParser {
  constructor(debug = false) {
    this.debug = debug;
    this.lastExtractedQuestion = null;
  }

  /**
   * Log debug messages if debug mode is enabled
   * @param {string} message - Debug message
   * @param {any} data - Optional data to log
   */
  log(message, data = null) {
    if (this.debug) {
      console.log(`[QuestionParser] ${message}`, data || '');
    }
  }

  /**
   * Main method to extract question data from the page
   * @returns {Object|null} Extracted question data or null if not found
   */
  extractCurrentQuestion() {
    this.log('Extracting current question');
    
    try {
      // First, detect question container
      const questionContainer = this.findQuestionContainer();
      
      if (!questionContainer) {
        this.log('No question container found');
        return null;
      }
      
      // Extract question text
      const questionText = this.extractQuestionText(questionContainer);
      if (!questionText) {
        this.log('No question text found');
        return null;
      }

      // Determine question type and extract accordingly
      const questionType = this.determineQuestionType(questionContainer);
      
      let choices = [];
      let inputFields = [];
      
      switch (questionType) {
        case 'multiple-choice':
          choices = this.extractMultipleChoiceAnswers(questionContainer);
          break;
        case 'fill-in-blank':
          inputFields = this.extractInputFields(questionContainer);
          break;
        case 'matching':
          choices = this.extractMatchingItems(questionContainer);
          break;
        default:
          this.log(`Unhandled question type: ${questionType}`);
          break;
      }
      
      // Extract any images in the question
      const images = this.extractImages(questionContainer);
      
      // Extract any math or formulas
      const mathFormulas = this.extractMathFormulas(questionContainer);
      
      // Determine subject based on page content
      const subject = this.determineSubject();
      
      // Build the result object
      const result = {
        questionType,
        questionText,
        subject,
        choices,
        inputFields,
        images,
        mathFormulas,
        timestamp: new Date().toISOString()
      };
      
      this.lastExtractedQuestion = result;
      this.log('Extracted question data', result);
      return result;
      
    } catch (error) {
      console.error('Error extracting question:', error);
      return null;
    }
  }

  /**
   * Find the container element that holds the question content
   * @returns {Element|null} Question container element or null if not found
   */
  findQuestionContainer() {
    // Common selectors for question containers in Pearson MyLab
    const possibleSelectors = [
      '.question-content',
      '.question-stem',
      '.homework-question',
      '[data-question-content]',
      '.question',
      '[role="main"] .card'
    ];
    
    for (const selector of possibleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        this.log(`Found question container using selector: ${selector}`);
        return element;
      }
    }
    
    // If common selectors fail, try a more adaptive approach
    // Look for elements with "question" in their class or ID
    const questionElements = [...document.querySelectorAll('*')].filter(el => {
      const classNames = el.className ? el.className.toString() : '';
      return (
        (el.id && el.id.toLowerCase().includes('question')) ||
        (classNames && classNames.toLowerCase().includes('question'))
      );
    });
    
    if (questionElements.length > 0) {
      // Choose the most likely container based on content and nesting
      const mostLikelyContainer = questionElements.sort((a, b) => {
        // Prefer elements with more text content
        const textLengthDiff = b.textContent.length - a.textContent.length;
        if (Math.abs(textLengthDiff) > 50) return textLengthDiff;
        
        // If text length is similar, prefer elements with fewer children (more specific)
        return a.children.length - b.children.length;
      })[0];
      
      this.log('Found question container using adaptive search');
      return mostLikelyContainer;
    }
    
    return null;
  }

  /**
   * Extract the main question text from the container
   * @param {Element} container - Question container element
   * @returns {string|null} Extracted question text or null if not found
   */
  extractQuestionText(container) {
    // Try common selectors for question text
    const questionTextSelectors = [
      '.question-content',
      '.question-stem',
      '.question-text',
      '.qtext'
    ];
    
    for (const selector of questionTextSelectors) {
      const element = container.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }
    
    // If no specific question text element found, extract text from the container
    // while excluding answer choices
    const choiceContainers = container.querySelectorAll('.answers, .choices, .options');
    const clonedContainer = container.cloneNode(true);
    
    // Remove answer choices from the cloned container
    for (const choiceContainer of choiceContainers) {
      const correspondingElement = clonedContainer.querySelector(`#${choiceContainer.id}`);
      if (correspondingElement) {
        correspondingElement.remove();
      }
    }
    
    // Clean the text (remove extra whitespace, etc.)
    let text = clonedContainer.textContent.trim();
    text = text.replace(/\s+/g, ' ');
    
    return text || null;
  }

  /**
   * Determine the type of question based on container content and structure
   * @param {Element} container - Question container element
   * @returns {string} Question type identifier
   */
  determineQuestionType(container) {
    // Check for multiple choice indicators
    if (
      container.querySelector('input[type="radio"]') ||
      container.querySelectorAll('.choice, .option, .answer-choice').length > 0
    ) {
      return 'multiple-choice';
    }
    
    // Check for fill-in-the-blank indicators
    if (
      container.querySelector('input[type="text"]') ||
      container.querySelector('textarea') ||
      container.querySelectorAll('.blank, .fill-in').length > 0
    ) {
      return 'fill-in-blank';
    }
    
    // Check for matching question indicators
    if (
      container.querySelectorAll('.match-item, .matching').length > 0 ||
      (container.querySelectorAll('table').length > 0 && 
       container.querySelectorAll('select').length > 0)
    ) {
      return 'matching';
    }
    
    // Default to generic if type cannot be determined
    return 'generic';
  }

  /**
   * Extract multiple-choice answer options
   * @param {Element} container - Question container element
   * @returns {Array<string>} Array of answer choice texts
   */
  extractMultipleChoiceAnswers(container) {
    const choices = [];
    
    // Look for common choice containers
    const choiceElements = container.querySelectorAll(
      '.choice, .option, .answer-choice, .answer-option, li.answer'
    );
    
    if (choiceElements.length > 0) {
      for (const element of choiceElements) {
        const choiceText = element.textContent.trim();
        if (choiceText) {
          choices.push(choiceText);
        }
      }
    } else {
      // Look for radio buttons or checkboxes as alternative indicators
      const inputElements = container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      
      for (const input of inputElements) {
        // Find the label associated with this input
        let label;
        if (input.id) {
          label = container.querySelector(`label[for="${input.id}"]`);
        }
        
        if (!label) {
          // Try to find the closest label parent or sibling
          label = input.closest('label') || input.parentElement;
        }
        
        if (label) {
          const labelText = label.textContent.trim();
          // Remove any option identifiers (A., B., etc.)
          const cleanText = labelText.replace(/^[A-Z]\.\s*/, '');
          choices.push(cleanText);
        }
      }
    }
    
    return choices;
  }

  /**
   * Extract input fields for fill-in-the-blank questions
   * @param {Element} container - Question container element
   * @returns {Array<Object>} Array of input field data
   */
  extractInputFields(container) {
    const inputFields = [];
    
    // Find all input elements for fill-in-the-blank questions
    const inputs = container.querySelectorAll('input[type="text"], textarea');
    
    for (const input of inputs) {
      // Try to find a label or context for this input
      let context = '';
      
      // Check for a label with the for attribute
      if (input.id) {
        const label = container.querySelector(`label[for="${input.id}"]`);
        if (label) {
          context = label.textContent.trim();
        }
      }
      
      // If no labeled context, try to extract surrounding text
      if (!context) {
        const parent = input.parentElement;
        if (parent) {
          // Clone the parent to avoid modifying original DOM
          const parentClone = parent.cloneNode(true);
          
          // Remove the input itself from the clone
          const inputInClone = parentClone.querySelector(`#${input.id}`);
          if (inputInClone) {
            inputInClone.remove();
          }
          
          context = parentClone.textContent.trim();
        }
      }
      
      inputFields.push({
        id: input.id || null,
        name: input.name || null,
        context
      });
    }
    
    return inputFields;
  }

  /**
   * Extract matching question items
   * @param {Element} container - Question container element
   * @returns {Array<Object>} Array of matching items
   */
  extractMatchingItems(container) {
    const matchingItems = [];
    
    // Look for table-based matching questions
    const tables = container.querySelectorAll('table');
    
    if (tables.length > 0) {
      for (const table of tables) {
        const rows = table.querySelectorAll('tr');
        
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          
          if (cells.length >= 2) {
            const leftItem = cells[0].textContent.trim();
            let rightOptions = [];
            
            // Check if the right cell contains a select dropdown
            const select = cells[1].querySelector('select');
            if (select) {
              const options = select.querySelectorAll('option');
              rightOptions = Array.from(options)
                .filter(opt => opt.value && opt.value !== '')
                .map(opt => opt.textContent.trim());
            } else {
              // If no select, just get the text content
              rightOptions.push(cells[1].textContent.trim());
            }
            
            matchingItems.push({
              left: leftItem,
              right: rightOptions
            });
          }
        }
      }
    } else {
      // Look for other matching formats
      const matchItems = container.querySelectorAll('.match-item, .matching-item');
      
      for (const item of matchItems) {
        const leftElement = item.querySelector('.match-left, .match-item-left');
        const rightElement = item.querySelector('.match-right, .match-item-right, select');
        
        if (leftElement) {
          const leftItem = leftElement.textContent.trim();
          let rightOptions = [];
          
          if (rightElement) {
            if (rightElement.tagName === 'SELECT') {
              rightOptions = Array.from(rightElement.querySelectorAll('option'))
                .filter(opt => opt.value && opt.value !== '')
                .map(opt => opt.textContent.trim());
            } else {
              rightOptions.push(rightElement.textContent.trim());
            }
          }
          
          matchingItems.push({
            left: leftItem,
            right: rightOptions
          });
        }
      }
    }
    
    return matchingItems;
  }

  /**
   * Extract images from the question
   * @param {Element} container - Question container element
   * @returns {Array<Object>} Array of image objects with src and alt
   */
  extractImages(container) {
    const images = [];
    const imgElements = container.querySelectorAll('img');
    
    for (const img of imgElements) {
      // Skip tiny images that might be UI elements
      if (img.width < 20 || img.height < 20) continue;
      
      images.push({
        src: img.src,
        alt: img.alt || '',
        width: img.width,
        height: img.height
      });
    }
    
    return images;
  }

  /**
   * Extract mathematical formulas from the question
   * @param {Element} container - Question container element
   * @returns {Array<string>} Array of extracted math formulas
   */
  extractMathFormulas(container) {
    const formulas = [];
    
    // Check for MathJax elements
    const mathJaxElements = container.querySelectorAll('.MathJax');
    for (const element of mathJaxElements) {
      // Try to get the TeX source if available
      const texSource = element.getAttribute('data-mathml') || 
                      element.getAttribute('data-latex') || 
                      element.textContent;
      
      if (texSource) {
        formulas.push(texSource.trim());
      }
    }
    
    // Check for LaTeX delimiters in text
    const text = container.textContent;
    const latexPatterns = [
      /\$\$(.*?)\$\$/g,  // $$...$$
      /\$(.*?)\$/g,      // $...$
      /\\begin\{equation\}(.*?)\\end\{equation\}/gs,  // \begin{equation}...\end{equation}
      /\\begin\{align\}(.*?)\\end\{align\}/gs,        // \begin{align}...\end{align}
      /\\[(.*?)\\]/gs,   // \[...\]
      /\\((.*?)\\)/gs    // \(...\)
    ];
    
    for (const pattern of latexPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && !formulas.includes(match[1].trim())) {
          formulas.push(match[1].trim());
        }
      }
    }
    
    return formulas;
  }

  /**
   * Attempt to determine the subject based on page content
   * @returns {string|null} Subject name or null if not determinable
   */
  determineSubject() {
    // Look for subject indicators in the page
    const pageTitle = document.title;
    const breadcrumbs = document.querySelectorAll('.breadcrumb, .breadcrumbs, .course-name');
    const headings = document.querySelectorAll('h1, h2, h3');
    
    // Check page title
    if (pageTitle) {
      // Common subject patterns in titles
      const subjectPatterns = [
        { pattern: /math|algebra|calculus|statistics|trigonometry/i, subject: 'Mathematics' },
        { pattern: /chem|chemistry/i, subject: 'Chemistry' },
        { pattern: /physics/i, subject: 'Physics' },
        { pattern: /bio|biology|anatomy|physiology/i, subject: 'Biology' },
        { pattern: /econ|economics|finance|accounting/i, subject: 'Economics' },
        { pattern: /psych|psychology/i, subject: 'Psychology' },
        { pattern: /history/i, subject: 'History' },
        { pattern: /english|literature|writing/i, subject: 'English' }
      ];
      
      for (const { pattern, subject } of subjectPatterns) {
        if (pattern.test(pageTitle)) {
          return subject;
        }
      }
    }
    
    // Check breadcrumbs and headings
    const textElements = [...breadcrumbs, ...headings];
    for (const element of textElements) {
      const text = element.textContent.toLowerCase();
      
      if (text.includes('math') || text.includes('algebra') || text.includes('calculus')) {
        return 'Mathematics';
      } else if (text.includes('chem')) {
        return 'Chemistry';
      } else if (text.includes('physics')) {
        return 'Physics';
      } else if (text.includes('bio') || text.includes('anatomy')) {
        return 'Biology';
      } else if (text.includes('econ') || text.includes('finance')) {
        return 'Economics';
      } else if (text.includes('psych')) {
        return 'Psychology';
      } else if (text.includes('history')) {
        return 'History';
      } else if (text.includes('english') || text.includes('writing')) {
        return 'English';
      }
    }
    
    return null;
  }
}

// Export the class for use in other modules
window.QuestionParser = QuestionParser; 