/**
 * Math Handler module
 * Specialized module for handling mathematical notation and equations
 */

class MathHandler {
  constructor() {
    this.mathjaxAvailable = typeof MathJax !== 'undefined';
  }
  
  /**
   * Process math elements in the extracted question
   * @param {Object} questionData - Extracted question data
   * @returns {Object} - Question data with processed math
   */
  processMathInQuestion(questionData) {
    if (!questionData) return questionData;
    
    // Copy the question data to avoid modifying the original
    const processedData = { ...questionData };
    
    // Process math in question text
    if (processedData.questionText) {
      processedData.questionText = this.convertMathToReadableFormat(processedData.questionText);
    }
    
    // Process math in choices
    if (processedData.choices && processedData.choices.length > 0) {
      processedData.choices = processedData.choices.map(choice => 
        this.convertMathToReadableFormat(choice)
      );
    }
    
    // Add LaTeX representations of formulas if available
    if (processedData.mathFormulas && processedData.mathFormulas.length > 0) {
      processedData.processedMathFormulas = processedData.mathFormulas.map(formula => 
        this.normalizeLatex(formula)
      );
    }
    
    return processedData;
  }
  
  /**
   * Convert mathematical notation to a more readable text format
   * @param {string} text - Text that may contain math notation
   * @returns {string} - Text with math converted to readable format
   */
  convertMathToReadableFormat(text) {
    if (!text) return text;
    
    // Handle LaTeX delimiters
    let processedText = text;
    
    // Replace $$...$$ and $...$ with their contents
    processedText = processedText.replace(/\$\$(.*?)\$\$/g, (match, formula) => {
      return ` ${this.convertLatexToText(formula)} `;
    });
    
    processedText = processedText.replace(/\$(.*?)\$/g, (match, formula) => {
      return ` ${this.convertLatexToText(formula)} `;
    });
    
    // Replace \begin{equation}...\end{equation} and similar environments
    processedText = processedText.replace(/\\begin\{(equation|align|math)\}(.*?)\\end\{\1\}/gs, (match, env, formula) => {
      return ` ${this.convertLatexToText(formula)} `;
    });
    
    // Replace \[...\] and \(...\)
    processedText = processedText.replace(/\\\[(.*?)\\\]/gs, (match, formula) => {
      return ` ${this.convertLatexToText(formula)} `;
    });
    
    processedText = processedText.replace(/\\\((.*?)\\\)/gs, (match, formula) => {
      return ` ${this.convertLatexToText(formula)} `;
    });
    
    // Clean up extra spaces
    return processedText.replace(/\s+/g, ' ').trim();
  }
  
  /**
   * Normalize LaTeX to a standard format
   * @param {string} latex - LaTeX formula
   * @returns {string} - Normalized LaTeX
   */
  normalizeLatex(latex) {
    if (!latex) return latex;
    
    // Remove unnecessary whitespace
    let normalized = latex.replace(/\s+/g, ' ').trim();
    
    // Remove LaTeX delimiters if present
    const delimiters = [
      { start: '$$', end: '$$' },
      { start: '$', end: '$' },
      { start: '\\[', end: '\\]' },
      { start: '\\(', end: '\\)' },
      { start: '\\begin{equation}', end: '\\end{equation}' },
      { start: '\\begin{align}', end: '\\end{align}' },
      { start: '\\begin{math}', end: '\\end{math}' }
    ];
    
    for (const { start, end } of delimiters) {
      if (normalized.startsWith(start) && normalized.endsWith(end)) {
        normalized = normalized.slice(start.length, -end.length).trim();
      }
    }
    
    return normalized;
  }
  
  /**
   * Convert LaTeX to readable text
   * @param {string} latex - LaTeX formula
   * @returns {string} - Readable text representation
   */
  convertLatexToText(latex) {
    if (!latex) return latex;
    
    // Normalize the LaTeX first
    const normalized = this.normalizeLatex(latex);
    
    // Common LaTeX commands and their text equivalents
    const replacements = [
      // Fractions
      { pattern: /\\frac\{([^{}]+)\}\{([^{}]+)\}/g, replacement: (match, num, den) => `(${num})/(${den})` },
      
      // Powers and subscripts
      { pattern: /\^(\{[^{}]+\}|[^{}\s])/g, replacement: (match, power) => {
        // Remove braces if present
        const p = power.startsWith('{') ? power.slice(1, -1) : power;
        return ` to the power of ${p}`;
      }},
      
      { pattern: /_(\{[^{}]+\}|[^{}\s])/g, replacement: (match, sub) => {
        // Remove braces if present
        const s = sub.startsWith('{') ? sub.slice(1, -1) : sub;
        return ` subscript ${s}`;
      }},
      
      // Square roots
      { pattern: /\\sqrt\{([^{}]+)\}/g, replacement: (match, content) => `square root of ${content}` },
      { pattern: /\\sqrt\[([^{}]+)\]\{([^{}]+)\}/g, replacement: (match, n, content) => `${n}th root of ${content}` },
      
      // Greek letters
      { pattern: /\\alpha/g, replacement: 'alpha' },
      { pattern: /\\beta/g, replacement: 'beta' },
      { pattern: /\\gamma/g, replacement: 'gamma' },
      { pattern: /\\delta/g, replacement: 'delta' },
      { pattern: /\\epsilon/g, replacement: 'epsilon' },
      { pattern: /\\varepsilon/g, replacement: 'epsilon' },
      { pattern: /\\zeta/g, replacement: 'zeta' },
      { pattern: /\\eta/g, replacement: 'eta' },
      { pattern: /\\theta/g, replacement: 'theta' },
      { pattern: /\\vartheta/g, replacement: 'theta' },
      { pattern: /\\iota/g, replacement: 'iota' },
      { pattern: /\\kappa/g, replacement: 'kappa' },
      { pattern: /\\lambda/g, replacement: 'lambda' },
      { pattern: /\\mu/g, replacement: 'mu' },
      { pattern: /\\nu/g, replacement: 'nu' },
      { pattern: /\\xi/g, replacement: 'xi' },
      { pattern: /\\pi/g, replacement: 'pi' },
      { pattern: /\\varpi/g, replacement: 'pi' },
      { pattern: /\\rho/g, replacement: 'rho' },
      { pattern: /\\varrho/g, replacement: 'rho' },
      { pattern: /\\sigma/g, replacement: 'sigma' },
      { pattern: /\\varsigma/g, replacement: 'sigma' },
      { pattern: /\\tau/g, replacement: 'tau' },
      { pattern: /\\upsilon/g, replacement: 'upsilon' },
      { pattern: /\\phi/g, replacement: 'phi' },
      { pattern: /\\varphi/g, replacement: 'phi' },
      { pattern: /\\chi/g, replacement: 'chi' },
      { pattern: /\\psi/g, replacement: 'psi' },
      { pattern: /\\omega/g, replacement: 'omega' },
      
      // Capital Greek letters
      { pattern: /\\Gamma/g, replacement: 'Gamma' },
      { pattern: /\\Delta/g, replacement: 'Delta' },
      { pattern: /\\Theta/g, replacement: 'Theta' },
      { pattern: /\\Lambda/g, replacement: 'Lambda' },
      { pattern: /\\Xi/g, replacement: 'Xi' },
      { pattern: /\\Pi/g, replacement: 'Pi' },
      { pattern: /\\Sigma/g, replacement: 'Sigma' },
      { pattern: /\\Upsilon/g, replacement: 'Upsilon' },
      { pattern: /\\Phi/g, replacement: 'Phi' },
      { pattern: /\\Psi/g, replacement: 'Psi' },
      { pattern: /\\Omega/g, replacement: 'Omega' },
      
      // Common functions
      { pattern: /\\sin/g, replacement: 'sine' },
      { pattern: /\\cos/g, replacement: 'cosine' },
      { pattern: /\\tan/g, replacement: 'tangent' },
      { pattern: /\\cot/g, replacement: 'cotangent' },
      { pattern: /\\sec/g, replacement: 'secant' },
      { pattern: /\\csc/g, replacement: 'cosecant' },
      { pattern: /\\arcsin/g, replacement: 'arcsine' },
      { pattern: /\\arccos/g, replacement: 'arccosine' },
      { pattern: /\\arctan/g, replacement: 'arctangent' },
      { pattern: /\\log/g, replacement: 'logarithm' },
      { pattern: /\\ln/g, replacement: 'natural logarithm' },
      { pattern: /\\exp/g, replacement: 'exponential' },
      
      // Limits and sums
      { pattern: /\\lim/g, replacement: 'limit' },
      { pattern: /\\sum/g, replacement: 'sum' },
      { pattern: /\\prod/g, replacement: 'product' },
      { pattern: /\\int/g, replacement: 'integral' },
      
      // Operators
      { pattern: /\\times/g, replacement: 'times' },
      { pattern: /\\div/g, replacement: 'divided by' },
      { pattern: /\\cdot/g, replacement: 'times' },
      { pattern: /\\pm/g, replacement: 'plus or minus' },
      { pattern: /\\mp/g, replacement: 'minus or plus' },
      
      // Symbols
      { pattern: /\\infty/g, replacement: 'infinity' },
      { pattern: /\\partial/g, replacement: 'partial' },
      { pattern: /\\nabla/g, replacement: 'nabla' },
      { pattern: /\\therefore/g, replacement: 'therefore' },
      { pattern: /\\because/g, replacement: 'because' },
      
      // Relations
      { pattern: /\\approx/g, replacement: 'approximately equal to' },
      { pattern: /\\sim/g, replacement: 'similar to' },
      { pattern: /\\neq/g, replacement: 'not equal to' },
      { pattern: /\\ne/g, replacement: 'not equal to' },
      { pattern: /\\leq/g, replacement: 'less than or equal to' },
      { pattern: /\\geq/g, replacement: 'greater than or equal to' },
      { pattern: /\\ll/g, replacement: 'much less than' },
      { pattern: /\\gg/g, replacement: 'much greater than' },
      { pattern: /\\subset/g, replacement: 'subset of' },
      { pattern: /\\supset/g, replacement: 'superset of' },
      { pattern: /\\in/g, replacement: 'in' },
      { pattern: /\\notin/g, replacement: 'not in' },
      
      // Spaces and punctuation
      { pattern: /~/g, replacement: ' ' },
      { pattern: /\\,/g, replacement: ' ' },
      { pattern: /\\;/g, replacement: ' ' },
      { pattern: /\\:/g, replacement: ' ' },
      { pattern: /\\!/g, replacement: '' },
      
      // Text mode
      { pattern: /\\text\{([^{}]+)\}/g, replacement: (match, text) => text },
      { pattern: /\\textbf\{([^{}]+)\}/g, replacement: (match, text) => text },
      { pattern: /\\textit\{([^{}]+)\}/g, replacement: (match, text) => text },
      { pattern: /\\mbox\{([^{}]+)\}/g, replacement: (match, text) => text }
    ];
    
    // Apply all replacements
    let result = normalized;
    for (const { pattern, replacement } of replacements) {
      result = result.replace(pattern, replacement);
    }
    
    // Clean up any remaining LaTeX commands
    result = result.replace(/\\\w+/g, '');
    
    // Clean up extra spaces and unnecessary characters
    result = result.replace(/\s+/g, ' ').trim();
    
    return result;
  }
  
  /**
   * Detect if the question is math-heavy
   * @param {Object} questionData - Extracted question data
   * @returns {boolean} - True if the question is math-heavy
   */
  isMathHeavyQuestion(questionData) {
    if (!questionData) return false;
    
    // Count math elements
    let mathCount = 0;
    
    // Check for math formulas
    if (questionData.mathFormulas && questionData.mathFormulas.length > 0) {
      mathCount += questionData.mathFormulas.length;
    }
    
    // Check for LaTeX delimiters in question text
    if (questionData.questionText) {
      const latexPatterns = [
        /\$\$/g,
        /\$/g,
        /\\begin\{equation\}/gi,
        /\\begin\{align\}/gi,
        /\\begin\{math\}/gi,
        /\\\[/g,
        /\\\(/g
      ];
      
      for (const pattern of latexPatterns) {
        const matches = questionData.questionText.match(pattern);
        if (matches) {
          mathCount += matches.length;
        }
      }
    }
    
    // The question is considered math-heavy if it has more than 2 math elements
    return mathCount > 2;
  }
}

// Export the class for use in other modules
window.MathHandler = MathHandler; 