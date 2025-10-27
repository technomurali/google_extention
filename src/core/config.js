// ============================================================================
// CONFIGURATION FILE - UI CUSTOMIZATION SETTINGS
// ============================================================================
// FILE SUMMARY:
// This file contains all the customizable visual and behavioral settings
// for the extension's side panel interface. It acts as a central configuration
// point, making it easy to modify colors, sizes, spacing, and text without
// touching the main logic code.
//
// KEY SECTIONS:
// - Dimensions (width, height)
// - Colors and gradients
// - Typography (fonts, sizes)
// - Spacing and padding
// - Input field styling
// - Labels and text content
// - Animation settings
//
// USAGE:
// The CONFIG object is imported by sidepanel.js and sidepanel.html.
// Changes here are automatically applied when the extension reloads.
// ============================================================================

/**
 * MAIN CONFIGURATION OBJECT
 * 
 * Contains all customizable settings organized into logical groups.
 * Each property can be modified to change the appearance or behavior
 * of the extension's user interface.
 */
const CONFIG = {
  // (tab bar settings removed)

  // ============================================
  // BUTTON SETTINGS
  // Visual properties for control buttons (close, minimize, etc.)
  // ============================================
  buttons: {
    width: '12px',            // Width of control buttons
    height: '12px',           // Height of control buttons
    iconSize: '12px',         // Size of icons inside buttons (SVG dimensions)
    gap: '4px',               // Space between multiple buttons in a group
    borderRadius: '2px',      // Rounded corners of buttons (0 = square, higher = more round)
  },

  // ============================================
  // COLORS & STYLING
  // All color values for the interface theme
  // Uses hex colors and rgba for transparency
  // ============================================
  colors: {
    // Gradient background colors (creates purple gradient effect)
    gradientStart: '#667eea',  // Top color of gradient (blue-purple)
    gradientEnd: '#764ba2',    // Bottom color of gradient (darker purple)
    
    // Text colors
    titleColor: 'white',       // Color of title text in header
    
    // Button colors (semi-transparent for glass-like effect)
    buttonBackground: 'rgba(255, 255, 255, 0.2)',       // Normal button background (20% white)
    buttonHoverBackground: 'rgba(255, 255, 255, 0.3)',  // Button background on hover (30% white)
    buttonColor: 'white',                                // Button text/icon color
    
    // Header background overlay (darkens the header area slightly)
    headerOverlay: 'rgba(0, 0, 0, 0.1)',  // 10% black overlay for depth effect
  },

  // ============================================
  // TYPOGRAPHY
  // Font settings for text throughout the interface
  // ============================================
  typography: {
    titleFontSize: '12px',       // Size of title text in the header
    titleFontWeight: '600',      // Weight/boldness of title (400=normal, 700=bold)
    // System font stack - uses native fonts for each OS for best performance
    fontFamily: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif`,
  },

  // ============================================
  // SPACING
  // Controls padding and gaps between UI elements
  // Consistent spacing creates visual harmony
  // ============================================
  spacing: {
    headerPadding: '15px',        // Inner padding for header sections (top/bottom/left/right)
    contentPadding: '15px',       // Inner padding for main content area
    headerGap: '15px',            // Space between elements in the header (e.g., title and status)
  },

  // ============================================
  // SEARCH INPUT FIELD
  // Styling for the main text input/textarea where users type messages
  // ============================================
  searchInput: {
    padding: '8px 15px',         // Inner padding: 8px top/bottom, 15px left/right
    borderRadius: '18px',        // Rounded corners (higher = more pill-shaped)
    fontSize: '13px',            // Font size of text user types
    maxWidth: 'none',            // Maximum width constraint (none = stretch to fill)
    background: 'rgba(255, 255, 255, 0.9)',           // Background: 90% opaque white
    focusBackground: 'rgba(255, 255, 255, 1)',        // Background when clicked: 100% opaque white
    textColor: '#333',           // Color of text user types (dark gray)
    placeholderColor: 'rgba(0, 0, 0, 0.4)',          // Color of placeholder hint text (40% black)
    shadow: '0 1px 3px rgba(0, 0, 0, 0.1)',          // Drop shadow: 1px down, 3px blur, 10% black
    focusShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',    // Shadow when focused: bigger and darker
  },

  // ============================================
  // LABELS & TEXT
  // All user-facing text strings used in the side panel
  // Centralizing text makes it easy to change wording or add translations
  // ============================================
  labels: {
    title: 'iChrome',                              // Main title shown in the header
    searchPlaceholder: 'Type your message...',        // Hint text shown in empty input field
  },

  // ============================================
  // POPUP LABELS
  // Text strings for the popup window (if/when popup.html is used)
  // ============================================
  popup: {
    heading: 'Chrome Chat',                           // Popup window title
    statusChecking: 'Checking status...',             // Text shown while checking AI availability
    statusActive: 'Sidebar is active and visible',
    statusHidden: 'Sidebar is hidden',
    searchPlaceholder: 'Enter search text...',        // Popup search field placeholder
    hideButton: 'Hide Sidebar',                       // (legacy - popup depends on this; safe to keep)
    showButton: 'Show Sidebar',                       // (legacy - popup depends on this; safe to keep)
  },

  // ============================================
  // ANIMATION
  // Controls the speed and style of UI transitions
  // ============================================
  animation: {
    duration: '0.3s',      // How long transitions take (0.3 seconds)
    easing: 'ease-out',    // Animation curve (starts fast, ends slow)
  },

  // ============================================
  // ONBOARDING HELP (shown once on panel open)
  // Configure the initial help message rendered in the chat area.
  // Disappears smoothly after user's first message.
  // ============================================
  onboarding: {
    enabled: true,
    title: 'Welcome to iChrome AI Chat',
    lines: [
      'Introducing iChrome — your AI-enabled Chrome companion.',
      'You can now chat intelligently with your browser data.',
      'Search and interact with your History, Bookmarks, and Downloads directly.',
      'Ask smart questions and get instant answers from your browsing activity.',
      'Your privacy is our priority — all chats stay on your device, never leaving your browser.',
      'Use built-in tools to enhance your experience:',
      ' - @History to explore browsing history',
      ' - @Bookmarks to find saved pages',
      ' - @Downloads to view downloaded files',
      'More intelligent features are coming soon — stay tuned!'
    ],
    // Milliseconds per character for typewriter animation
    charDelayMs: 5,
  },

  // ============================================
  // CONTEXT SELECTION (Ask iChrome)
  // Controls selection-to-context behavior and UI labels
  // ============================================
  contextSelection: {
    maxItems: 5,                 // Maximum number of context snippets allowed
    buttonLabel: 'Ask iChrome',  // Floating button label shown on selection
    pillClearAllLabel: 'Clear all',
    pillCounterTemplate: '{count}/{max}', // e.g., 2/5
    contextLabelPrefix: 'Context', // Used as: Context 1:, Context 2:
    selectionHighlight: true,     // Highlight selected text in source bubble
    maxSnippetChars: 800,         // Soft cap for snippet length included in prompt
    pillTruncateChars: 15,        // Characters shown on pill label
  },

  // ============================================
  // PAGE CONTENT (@Page)
  // Configuration for active page capture, chunking, and UI labels
  // ============================================
  pageContent: {
    enabled: true,
    toolLabel: '@Page',
    icon: '📃',            // UI icon for page-related pills and messages
    pillIcon: '📑',

    // Chunking settings (aim for ~3k tokens per chunk; Gemini Nano ~4k window)
    maxChunkChars: 12000,  // hard cap per chunk (characters)
    overlapChars: 500,     // small overlap for continuity
    minChunkChars: 1000,   // avoid tiny chunks

    // UI labels/templates
    capturingMessage: '📃 Capturing page content...',
    captureCompleteTemplate: '📃 Page captured: "{title}"',
    chunksHeaderTemplate: '📊 Content divided into {count} chunks. Select one to analyze:',
    chunkButtonTemplate: '📑 Chunk {index}: {heading} ({size})',
    chunkSelectedTemplate: '✅ Chunk {index} selected: "{heading}"',
    chunkInstructions: 'Click a chunk to start asking questions about that section.',
    clearedOnTabSwitchMessage: 'Page context cleared (tab switched).',

    // Error messages
    errorCapture: 'Failed to capture page content. Please try again.',
    errorNoContent: 'No text content found on this page.',
    errorPermission: 'Permission denied. Please allow access to the current page.',

    // AI prompt template (strictly answer from section content)
    contextPromptTemplate: `You are analyzing a specific section from a web page. Answer the user's question based ONLY on this section. If the answer is not in this section, respond: "I cannot find that information in this section. This section covers: {heading}. You might want to try another chunk."\n\nPAGE: {title}\nURL: {url}\nSECTION: {heading} (Part {index} of {total})\n\nCONTENT START\n{content}\nCONTENT END\n\nUSER QUESTION: {question}`,

    // Behavior
    clearOnTabSwitch: true,
  },

  // ============================================
  // TRANSLATION
  // Configuration for in-bubble translation feature
  // ============================================
  translation: {
    enabled: true,
    // Autodetect source language by default
    defaultSourceLanguage: 'auto',
    // Default fallback display language name when needed
    defaultLanguage: 'en',
    // How many languages to show before search/scroll
    maxDisplayLanguages: 5,
    // Show language codes next to names in the list
    showLanguageCodes: true,
    // How many recently used languages to pin at the top
    recentLimit: 3,
    // Animation speed (milliseconds per character) for translated text appearance
    animationDelayMs: 8,
    // Configurable language list (add or remove freely)
    languages: [
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'ja', name: 'Japanese' },
      { code: 'pt', name: 'Portuguese' },
      // Additional common languages (examples; safe to keep/edit)
      { code: 'de', name: 'German' },
      { code: 'zh', name: 'Chinese' },
      { code: 'hi', name: 'Hindi' },
      { code: 'ar', name: 'Arabic' },
      { code: 'te', name: 'Telugu' },
    ],
    labels: {
      searchPlaceholder: 'Search languages...',
      showOriginal: 'Show Original',
      translating: 'Translating...',
      translationError: 'Translation failed',
    },
  },

  // ============================================
  // SPEECH (TEXT-TO-SPEECH)
  // Configuration for in-bubble speech synthesis feature
  // ============================================
  speech: {
    enabled: true,
    // Default voice (null = browser default)
    defaultVoice: null,
    // Speech rate (0.1 to 10, 1 = normal)
    defaultRate: 1.0,
    // Speech pitch (0 to 2, 1 = normal)
    defaultPitch: 1.0,
    // Speech volume (0 to 1, 1 = full volume)
    defaultVolume: 1.0,
    // Highlight text as it's being read
    highlightText: true,
    // Auto-stop when new message is sent
    autoStopOnNewMessage: true,
    // Show language info in voice selector
    showVoiceLanguage: true,
    // Maximum visible voices before scroll
    maxVisibleVoices: 8,
    // Rate control range
    rateMin: 0.5,
    rateMax: 2.0,
    rateStep: 0.1,
    // Pitch control range
    pitchMin: 0.5,
    pitchMax: 2.0,
    pitchStep: 0.1,
    // Volume control range
    volumeMin: 0,
    volumeMax: 1,
    volumeStep: 0.05,
    labels: {
      speak: 'Read aloud',
      pause: 'Pause',
      resume: 'Resume',
      stop: 'Stop',
      settings: 'Speech Settings',
      voiceLabel: 'Voice',
      speedLabel: 'Speed',
      pitchLabel: 'Pitch',
      volumeLabel: 'Volume',
      testButton: 'Test Voice',
      noVoices: 'No voices available',
      loading: 'Loading voices...',
    },
  },

  // ============================================
  // Z-INDEX (Layer Priority)
  // Controls which elements appear on top of others
  // Higher numbers = closer to user (on top)
  // ============================================
  zIndex: 999999,  // Very high number ensures sidebar appears above most page content

  // ============================================
  // SHADOW
  // Drop shadow effect for depth and elevation
  // ============================================
  shadow: '0 2px 10px rgba(0, 0, 0, 0.2)',  // Shadow: 2px down, 10px blur, 20% black
};

// ============================================================================
// MODULE EXPORT
// ============================================================================
// Make CONFIG available to other files in the extension.
// This export syntax works in both browser and Node.js environments.
// Ensure CONFIG is attached to window for ES module consumers that access
// configuration via the global (e.g., theme/ui modules using window.CONFIG).
if (typeof window !== 'undefined') {
  // Attach as a non-writable reference to avoid accidental reassignment
  try { Object.defineProperty(window, 'CONFIG', { value: CONFIG, configurable: false, enumerable: false, writable: false }); }
  catch { window.CONFIG = CONFIG; }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;  // Export for Node.js/module bundlers
}

