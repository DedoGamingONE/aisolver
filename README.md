# Pearson MyLab AI Solver

A Chrome extension that uses Claude AI to automatically solve questions in Pearson MyLab.

![Extension Logo](images/icon128.png)

## Features

- Automatically detects and solves questions in Pearson MyLab
- Supports multiple question types:
  - Multiple Choice
  - True/False
  - Fill-in-the-Blank
  - Matching
  - Ordering
- Customizable settings for solver behavior
- Statistics tracking for performance monitoring
- Clean, minimal UI that integrates with Pearson MyLab

## Installation

### From Chrome Web Store (Recommended)

*Coming Soon*

### Manual Installation (Developer Mode)

1. Download or clone this repository to your computer
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top-right corner
4. Click "Load unpacked"
5. Select the folder containing the extension files
6. The extension should now be installed and visible in your extensions list

## Setup

1. Click on the extension icon to open the popup
2. Click "Settings" to open the options page
3. Enter your Anthropic API key
   - You can get an API key from [Anthropic's console](https://console.anthropic.com/)
4. Configure your preferences
5. Click "Save Settings"

## Usage

### Basic Usage

1. Navigate to a Pearson MyLab assignment
2. The solver will automatically detect questions on the page
3. If auto-solving is enabled, the extension will attempt to solve questions automatically
4. To manually solve a question, click the "Solve Current Question" button in the popup

### Popup Interface

- **Enable AI Solver**: Toggle to enable/disable the automatic solver
- **Statistics**: View performance metrics
- **Solve Current Question**: Manually trigger the solver for the current question
- **Reset Statistics**: Clear all statistics data

### Options Page

- **API Configuration**: Set up your API key and model preferences
- **Solver Settings**: Configure how the solver behaves
- **Question Types**: Choose which question types to support
- **Advanced Settings**: Debug mode and custom prompts

## How It Works

1. The extension detects when you're on a Pearson MyLab page with questions
2. It extracts the question text, options, and context
3. The background script sends the question to the Claude AI API
4. The AI analyzes the question and generates an answer
5. The extension processes the response and selects the appropriate answer

## Privacy & Security

- Your API key is stored locally in your browser's storage
- Questions and answers are sent directly to Anthropic's API servers
- No data is collected by the extension developers
- All processing happens on your local machine or through Anthropic's API

## Troubleshooting

### Common Issues

- **Extension isn't detecting questions**: Make sure you're on a supported Pearson MyLab page
- **Incorrect answers**: Adjust the confidence threshold or try a more accurate model
- **API errors**: Verify your API key is correct and has sufficient credits

### Getting Help

If you encounter issues, please [open an issue](https://github.com/username/pearson-mylab-ai-solver/issues) on GitHub.

## Development

### Project Structure

```
├── images/               # Extension icons
├── src/
│   ├── css/              # Stylesheets
│   │   └── content.css   # Content script styles
│   ├── js/               # JavaScript files
│   │   ├── background.js # Background script
│   │   ├── content.js    # Content script
│   │   ├── options.js    # Options page script
│   │   └── popup.js      # Popup script
│   ├── options.html      # Options page
│   └── popup.html        # Popup interface
└── manifest.json         # Extension manifest
```

### Building from Source

1. Clone the repository
2. Make your changes
3. Load the extension in developer mode as described in the installation section

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This extension is meant for educational purposes only. Use it responsibly and in accordance with your institution's academic integrity policies.

Pearson MyLab is a trademark of Pearson Education, Inc. This extension is not affiliated with, endorsed by, or sponsored by Pearson Education. 