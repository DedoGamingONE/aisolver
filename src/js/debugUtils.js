/**
 * Debug utilities for Pearson MyLab AI Solver
 * 
 * This module provides enhanced debugging tools to help diagnose
 * cross-domain communication issues and message flow problems.
 */

(function() {
  // Keep track of message stats for debugging
  const messageStats = {
    sent: {},
    received: {},
    throttled: {},
    localStorage: {
      sent: {},
      received: {}
    }
  };
  
  // Store circular message paths
  const circularPaths = [];
  
  /**
   * Records statistics about message traffic
   * @param {string} category - The category (sent, received, etc.)
   * @param {string} action - The message action
   * @param {Object} data - Additional data to record
   */
  function recordMessageStat(category, action, data = {}) {
    // Initialize counter if needed
    if (!messageStats[category][action]) {
      messageStats[category][action] = {
        count: 0,
        timestamps: [],
        data: []
      };
    }
    
    // Update stats
    messageStats[category][action].count++;
    messageStats[category][action].timestamps.push(Date.now());
    
    // Keep only last 50 timestamps for each action
    if (messageStats[category][action].timestamps.length > 50) {
      messageStats[category][action].timestamps.shift();
    }
    
    // Store additional data (if provided)
    if (Object.keys(data).length > 0) {
      messageStats[category][action].data.push({
        timestamp: Date.now(),
        ...data
      });
      
      // Keep only last 20 data points
      if (messageStats[category][action].data.length > 20) {
        messageStats[category][action].data.shift();
      }
    }
  }
  
  /**
   * Detects if a message path shows a circular reference pattern
   * @param {Array} path - The message path to check
   * @returns {boolean} Whether a loop was detected
   */
  function detectMessageLoop(path) {
    if (!path || path.length < 3) return false;
    
    // Check for repeating patterns
    const counts = {};
    path.forEach(domain => {
      counts[domain] = (counts[domain] || 0) + 1;
    });
    
    // Look for domains that appear 3+ times
    for (const domain in counts) {
      if (counts[domain] >= 3) {
        // Record this circular path for analysis
        circularPaths.push({
          timestamp: Date.now(),
          path: [...path],
          counts: {...counts}
        });
        
        // Keep the list manageable
        if (circularPaths.length > 20) {
          circularPaths.shift();
        }
        
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Generate a report of message statistics
   * @returns {Object} Message statistics report
   */
  function getMessageStatsReport() {
    const now = Date.now();
    const report = {
      summary: {},
      byAction: {},
      messageRate: {},
      loops: circularPaths.length,
      lastCircularPath: circularPaths.length > 0 ? circularPaths[circularPaths.length - 1] : null
    };
    
    // Calculate total counts for each category
    for (const category in messageStats) {
      report.summary[category] = 0;
      
      for (const action in messageStats[category]) {
        report.summary[category] += messageStats[category][action].count;
        
        // Calculate actions by type
        if (!report.byAction[action]) {
          report.byAction[action] = {};
        }
        report.byAction[action][category] = messageStats[category][action].count;
        
        // Calculate message rate (messages per second in last 5 seconds)
        const recentMessages = messageStats[category][action].timestamps.filter(
          timestamp => (now - timestamp) < 5000
        );
        
        if (!report.messageRate[action]) {
          report.messageRate[action] = {};
        }
        report.messageRate[action][category] = recentMessages.length / 5; // per second
      }
    }
    
    return report;
  }
  
  /**
   * Get a detailed flow analysis for debugging communication issues
   * @returns {Object} Flow analysis object with patterns and recommendations
   */
  function analyzeMessageFlow() {
    const stats = getMessageStatsReport();
    const analysis = {
      patterns: [],
      recommendations: [],
      urgentIssues: [],
      flowRating: 'normal' // 'normal', 'concerning', 'problematic'
    };
    
    // Check for high message rates
    for (const action in stats.messageRate) {
      for (const category in stats.messageRate[action]) {
        const rate = stats.messageRate[action][category];
        
        // More than 5 messages per second is concerning
        if (rate > 5) {
          analysis.patterns.push(`High message rate: ${rate.toFixed(1)}/sec for ${action} (${category})`);
          
          if (rate > 10) {
            analysis.flowRating = 'problematic';
            analysis.urgentIssues.push(`Message storm detected: ${action} (${category})`);
            analysis.recommendations.push(`Increase throttling for '${action}' messages`);
          } else {
            analysis.flowRating = 'concerning';
            analysis.recommendations.push(`Consider rate limiting '${action}' messages`);
          }
        }
      }
    }
    
    // Look for message imbalances
    for (const action in stats.byAction) {
      const sent = stats.byAction[action].sent || 0;
      const received = stats.byAction[action].received || 0;
      
      // If sending significantly more than receiving
      if (sent > 0 && received === 0) {
        analysis.patterns.push(`Messages sent but none received: ${action}`);
        analysis.recommendations.push(`Check if '${action}' messages are being processed correctly`);
      }
      
      // If receiving significantly more than we're sending
      if (received > (sent * 3) && received > 10) {
        analysis.patterns.push(`Receiving many more messages than sending: ${action}`);
        analysis.recommendations.push(`Check for message duplication or multiple senders for '${action}'`);
      }
    }
    
    // Check for circular paths
    if (circularPaths.length > 0) {
      analysis.patterns.push(`${circularPaths.length} circular message paths detected`);
      analysis.recommendations.push(`Review message forwarding logic and limit propagation depth`);
      
      if (circularPaths.length > 5) {
        analysis.flowRating = 'problematic';
        analysis.urgentIssues.push(`Multiple message loops detected`);
      }
    }
    
    return analysis;
  }
  
  /**
   * Reset all debugging statistics
   */
  function resetDebugStats() {
    for (const category in messageStats) {
      if (typeof messageStats[category] === 'object') {
        for (const action in messageStats[category]) {
          messageStats[category][action].count = 0;
          messageStats[category][action].timestamps = [];
          messageStats[category][action].data = [];
        }
      }
    }
    
    circularPaths.length = 0;
  }
  
  // Export debugging utilities to window
  window.PearsonAiDebug = {
    recordMessageStat,
    detectMessageLoop,
    getMessageStatsReport,
    analyzeMessageFlow,
    resetDebugStats,
    
    // Convenience method to dump debug info to console
    dumpDebugInfo: function() {
      console.group('Pearson AI Solver - Debug Information');
      console.log('Message Stats Report:', getMessageStatsReport());
      console.log('Message Flow Analysis:', analyzeMessageFlow());
      
      // Add visual indicators for message rates
      const flowAnalysis = analyzeMessageFlow();
      console.log(
        'Flow Health: %c' + flowAnalysis.flowRating,
        'font-weight: bold; color: ' + 
        (flowAnalysis.flowRating === 'normal' ? 'green' : 
         flowAnalysis.flowRating === 'concerning' ? 'orange' : 'red')
      );
      
      if (flowAnalysis.urgentIssues.length > 0) {
        console.log('%cUrgent Issues:', 'color: red; font-weight: bold');
        flowAnalysis.urgentIssues.forEach(issue => console.log(` - ${issue}`));
      }
      
      if (flowAnalysis.recommendations.length > 0) {
        console.log('Recommendations:');
        flowAnalysis.recommendations.forEach(rec => console.log(` - ${rec}`));
      }
      
      console.groupEnd();
      
      return flowAnalysis;
    }
  };
})(); 