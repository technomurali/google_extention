// Copyright (c) 2025 Gundlapalli Muralidhar,
// Licensed under the MIT License. See LICENSE file in the project root.
// LinkedIn: https://www.linkedin.com/in/technomurali/
//
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
  //
  // HOW TO TEST HELP SETTINGS:
  // ============================================
  // 1. SHOW HELP ON APPLICATION LOAD:
  //    - Open Settings → Help section
  //    - Toggle "Show Help on Application Load" ON/OFF
  //    - Reload the side panel (close and reopen)
  //    - ✅ ON: Welcome message appears with typewriter effect
  //    - ✅ OFF: No welcome message appears on load
  //
  // 2. SHOW TOOLTIPS:
  //    - Open Settings → Help section
  //    - Toggle "Show Tooltips" ON/OFF
  //    - ✅ ON: Tooltips show when hovering over ChromePad notes
  //    - ✅ OFF: Tooltips are disabled
  //
  // QUICK TEST STEPS:
  // ============================================
  // A. Test "Show Help on Application Load":
  //    1. Settings → Help → Toggle "Show Help on Application Load" ON
  //    2. Close side panel completely
  //    3. Reopen side panel → Should see welcome message
  //    4. Toggle OFF → Reload → Should NOT see welcome message
  //
  // B. Test "Show Tooltips" - Manual Test Cases:
  //    ============================================
  //    1. BASIC TOGGLE TEST:
  //       - Settings → Help → Toggle "Show Tooltips" ON
  //       - Open ChromePad (@ChromePad)
  //       - Hover over any note → Should see preview tooltip with note type and content
  //       - Toggle OFF → Reload panel → Hover again → Should NOT see tooltip
  //
  //    2. EMPTY NOTE TEST:
  //       - Create a note with NO content
  //       - Hover over it → Should NOT see tooltip (even when setting is ON)
  //       - Add content to note → Hover → Should now see tooltip
  //
  //    3. LONG CONTENT TEST:
  //       - Create a note with VERY LONG content (10+ lines)
  //       - Hover over it → Tooltip should show first 3 lines only
  //       - Verify tooltip is truncated to ~200 characters
  //
  //    4. MARKDOWN CONTENT TEST:
  //       - Create note with markdown (headers, lists, bold, etc.)
  //       - Hover → Tooltip should show plain text preview (no markdown)
  //
  //    5. MULTIPLE NOTES TEST:
  //       - Create 5+ notes with different content
  //       - Hover over each one → Each should show correct preview
  //       - Verify tooltips don't overlap or interfere with each other
  //
  //    6. TOOLTIP PERSISTENCE TEST:
  //       - Hover over note → Tooltip appears
  //       - Move mouse INTO the tooltip → Tooltip stays visible
  //       - Move mouse OUT of tooltip → Tooltip fades away
  //
  //    7. QUICK HOVER TEST:
  //       - Hover over note and quickly move away (< 200ms)
  //       - Tooltip should still appear and fade out smoothly
  //
  //    8. TOOLTIP CLOSE BUTTON:
  //       - Hover over note → Tooltip appears
  //       - Click the × button in tooltip → Tooltip immediately closes
  //
  //    9. RELOAD PERSISTENCE TEST:
  //       - Set tooltips to OFF
  //       - Reload side panel
  //       - Hover → Still no tooltips
  //       - Set back to ON
  //       - Reload again
  //       - Hover → Tooltips work again
  //
  //    10. NATIVE TITLE ATTRIBUTES TEST:
  //        - Verify native HTML title attributes still work:
  //          - Hover over "+ New" button → Shows "Create new note"
  //          - Hover over "Import" button → Shows "Import text or markdown files"
  //          - Hover over action buttons (Preview, Edit, Delete, etc.) → Show tooltips
  //        - These native tooltips are NOT affected by the setting
  // ============================================
  onboarding: {
    enabled: true,
    title: '👋 Welcome to iChrome — Your Intelligent Browser Companion',
    lines: [
      'This Extension works only for Chrome based Canary Browser',
      '',
      '### Private. Powerful. Personal. Intelligent Browser',
      '',
      '---',
      '',
      '### 🚀 Quick Start',
      '',
      '**1. Open iChrome Panel**',
      '',
      '> Click the **iChrome icon** in Chrome\'s toolbar → Side panel opens on the right.',
      '',
      '**2. Start Chatting**',
      '',
      '> Just type your question!  ',
      'Example: `Explain AI in simple terms`  ',
      '(Default tool: **@iChromeChat**)',
      '',
      '**3. Explore Smart Tools**',
      '',
      'Use `@` to access built-in tools:',
      '',
      '| Tool | Mention | Purpose |',
      '|------|----------|----------|',
      '| 🧠 AI Chat | `@iChromeChat` | General conversation & help |',
      '| 🕓 History | `@BrowserHistory` | Search visited pages |',
      '| 🔖 Bookmarks | `@Bookmarks` | Find saved sites |',
      '| 📁 Downloads | `@Downloads` | Review downloaded files |',
      '| 📃 Page | `@Page` | Analyze current webpage |',
      '| 🗒️ ChromePad | `@ChromePad` | Take smart notes |',
      '',
      '---',
      '',
      '### 💡 Pro Tips',
      '',
      '- Use **natural language**: "What sites did I visit yesterday?"  ',
      '- Use **Shift + Enter** for a new line, **Enter** to send.  ',
      '- Click **⚙ Settings** in the panel to manage voices, language, and themes.  ',
      '- Everything runs **on-device** — no data ever leaves your browser.',
      '',
      '---',
      '',
      '### 🧭 Try These Commands',
      '',
      '**💬 Chat Examples:**',
      '',
      '- `@iChromeChat explain quantum computing in simple terms`',
      '- `@iChromeChat write a professional email requesting a meeting`',
      '- `@iChromeChat generate a JavaScript array example`',
      '',
      '**🕓 History Search:**',
      '',
      '1. Type `@BrowserHistory` to enter history mode',
      '2. Try: `show first 300 history items`',
      '3. Click **Ask iChromeChat** to analyze results',
      '4. Ask: `what patterns do you see in my browsing?`',
      '',
      '**📚 Other Tools:**',
      '',
      '- `@Bookmarks` → Search saved sites → **Ask iChromeChat** → Natural language query',
      '- `@Downloads` → Find files → **Ask iChromeChat** → Analyze downloads',
      '- `@Page` → Analyze current webpage content',
      '',
      '---',
      '',
      '### 🗒️ ChromePad — Your Smart Note-Taking Companion',
      '',
      '**Create Notes:**',
      '',
      '1. Type `@ChromePad` to open ChromePad',
      '2. Click **+ New** to create a note',
      '3. Choose note type: **Note**, **TODO**, or **Idea**',
      '4. Write your content with full markdown support',
      '',
      '**AI-Powered Features:**',
      '',
      '**✨ Generate** — Create new content from scratch',
      '- Select text → Click **Generate** → Choose tone & format',
      '- Options: Professional, Casual, Technical, Creative',
      '',
      '**✏️ Rewrite** — Transform your text',
      '- Select text → Click **Rewrite** → Pick a style',
      '- Styles: More Professional, Simpler, Shorter, Longer',
      '',
      '**✅ Proofread** — Perfect your grammar',
      '- Select text → Click **Proofread** → Get instant corrections',
      '- Fixes grammar, spelling, punctuation, and clarity',
      '',
      '**🌐 Translate** — Multi-language support',
      '- Select text → Click **Translate** → Choose target language',
      '- Supports 100+ languages including Telugu!',
      '- Auto-detects source language',
      '',
      '**🔊 Audio** — Listen to your notes',
      '- Click **Audio** button → Text-to-speech playback',
      '- Adjustable voice, speed, and volume in Settings',
      '',
      '**🤖 Ask iChromeChat** — Chat with AI about your notes',
      '- Click **Ask iChromeChat** button in ChromePad',
      '- AI analyzes ALL your notes and answers questions',
      '- Examples:',
      '  - "Summarize all my TODO items"',
      '  - "Find notes about meetings"',
      '  - "What ideas did I write about the project?"',
      '  - "Create a summary of my technical notes"',
      '- Perfect for finding insights across multiple notes!',
      '',
      '**💡 Pro ChromePad Tips:**',
      '',
      '- **Markdown Support**: Use # headers, **bold**, *italic*, lists, code blocks',
      '- **Quick Preview**: Hover over notes to see content tooltip',
      '- **Import/Export**: Import .txt/.md files or export notes as markdown',
      '- **Search**: Use the search bar to find notes instantly',
      '- **Organize**: Pin important notes to keep them at the top',
      '',
      '---',
      '',
      '### 📖 Need Detailed Help?',
      '',
      'For comprehensive documentation and advanced features:',
      '',
      '1. Type `@ChromePad` to open ChromePad',
      '2. Click on the **iChrome User Guide** file',
      '3. View the complete user manual with all details!',
    ],
    // Milliseconds per character for typewriter animation
    charDelayMs: 5,
  },

  // ============================================
  // CONTEXT SELECTION (Ask iChrome)
  // Controls selection-to-context behavior and UI labels
  // ============================================
  contextSelection: {
    maxItems: 5,                 // Maximum number of context snippets allowed (legacy limit; ignored if unlimitedChunks is true)
    buttonLabel: 'Ask iChrome',  // Floating button label shown on selection
    pillClearAllLabel: 'Clear all',
    pillCounterTemplate: '{count}/{max}', // e.g., 2/5
    contextLabelPrefix: 'Context', // Used as: Context 1:, Context 2:
    selectionHighlight: true,     // Highlight selected text in source bubble
    maxSnippetChars: 4000,         // Per-chunk soft cap for snippet length
    // Multi-chunk processing (Ask iChrome)
    enableMultiChunkProcessing: true,  // If true, large selections are split and analyzed per-chunk
    chunkOverlapChars: 200,            // Overlap between consecutive chunks for continuity
    unlimitedChunks: true,             // If true, remove 5-item cap and allow unlimited chunks
    showChunkProgress: true,           // Show progress like "Processing chunk 2/10..."
    synthesizeStrategy: 'llm',         // 'llm' | 'concatenate' fallback strategy
    // UI labels for multi-chunk flow
    chunkLabelTemplate: 'Chunk {index}/{total} ({size})',
    processingChunkTemplate: 'Processing chunk {index}/{total}...',
    synthesizingLabel: 'Synthesizing final answer...',
    pillTruncateChars: 5,        // Characters shown on pill label

    // URL optimization for list-to-context (History/Bookmarks/Downloads)
    optimizeURLs: true,           // Enable URL/domain optimization in preview sent to LLM
    maxURLChars: 50,              // Keep full URL if <= this length
    maxPathSegments: 3,           // Keep up to this many path segments
    maxPathChars: 30,             // Truncate path to this many chars
    includeQueryForSearch: true,  // Extract and show search query if applicable
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
    showTabSwitchHint: true,   // Show brief status when context is cleared on tab switch
    recentPagesLimit: 5,        // Placeholder for future recent-pages UI
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
  // CHROMEPAD (NOTE-TAKING FEATURE)
  // Configuration for ChromePad editor and typewriter animation
  // ============================================
  chromePad: {
    typewriterEffect: {
      enabled: true,           // Enable/disable typewriter animation for generated text
      delayMs: 8,             // Milliseconds between characters (matches chat animation)
      minLength: 50,          // Only animate if generated text exceeds this many characters
      allowInterrupt: true,   // Allow user to interrupt animation by typing
      maxAnimateChars: 5000,  // Skip animation if result exceeds this (performance optimization)
    },
    saveToChromePad: {
      enabled: true,                    // Enable/disable "Save to ChromePad" button on AI messages
      successMessageDuration: 5000,     // Duration in ms to show success message (5000 = 5 seconds)
      autoHideSuccessMessage: false,    // Auto-hide success message after duration (false = stays visible)
      successMessage: '✓ Saved to ChromePad. Click here to view',  // Success message text
      errorMessage: 'Failed to save to ChromePad. Please try again.',  // Error message text
      unavailableMessage: 'ChromePad is currently unavailable. Please reload and try again.',
    },
  },

  // ============================================
  // MARKDOWN RENDERING (Internal, dependency-free)
  // Controls basic markdown support across the app
  // ============================================
  markdown: {
    enabled: true,
    openLinksInNewTab: true,
    sanitize: true,          // Always escape HTML before rendering markdown
    features: {
      headings: true,
      emphasis: true,        // bold/italic/strike
      inlineCode: true,
      codeBlocks: true,
      lists: true,
      blockquotes: true,
      hr: true,
      links: true,
      autolinks: true,
    },
  },

  // ============================================
  // TOOL MENTIONS (@tool)
  // Configuration for inline @tool mentions in the input
  // ============================================
  toolMentions: {
    enabled: true,
    trigger: '@',
    allowMultiple: false,
    removeFromMessage: true,
    autocomplete: {
      enabled: true,
      minChars: 0,
      maxVisible: 6,
      highlightMatch: true,
    },
    styling: {
      mentionColor: '#7B61FF',
      mentionBackground: 'rgba(123, 97, 255, 0.10)',
      mentionBorderRadius: '4px',
      mentionPadding: '2px 4px',
    },
    // Tool labels (customize display names, but IDs remain the same for behavior)
    // Format: { id: 'internal_id', label: '@DisplayName', icon: 'emoji' }
    // You can change labels and icons, but keep the 'id' values unchanged
    tools: [
      { id: 'chat', label: '@iChromeChat', icon: '💬', aliases: ['@chat', '@general'] },
      { id: 'page', label: '@Page', icon: '📃', aliases: ['@webpage', '@content'] },
      { id: 'history', label: '@BrowserHistory', icon: '📚', aliases: ['@browsing', '@recent'] },
      { id: 'bookmarks', label: '@Bookmarks', icon: '🔖', aliases: ['@saved', '@favorites'] },
      { id: 'downloads', label: '@Downloads', icon: '📥', aliases: ['@files'] },
      { id: 'chromepad', label: '@ChromePad', icon: '📝', aliases: ['@notes', '@notepad'] },
      { id: 'help', label: '@Help', icon: '❓', aliases: ['@guide', '@support'] },
    ],
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

