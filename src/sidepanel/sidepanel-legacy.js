// ============================================================================
// SIDE PANEL MAIN LOGIC - AI CHAT & HISTORY SEARCH
// ============================================================================
// FILE SUMMARY:
// This is the main JavaScript file that powers the side panel interface.
// It handles all user interactions, AI conversations, and browser history queries.
//
// KEY FEATURES:
// 1. Theme Management - Automatic dark/light mode based on system preferences
// 2. AI Integration - Connects to Chrome's Gemini Nano language model
// 3. History Search - Intelligent browsing history queries with AI classification
// 4. Session Management - Creates, maintains, and cleans up AI sessions
// 5. UI Interactions - Textarea resizing, message display, input handling
//
// ARCHITECTURE:
// - Runs in the side panel context (isolated from web pages)
// - Uses Chrome Prompt API for on-device AI
// - Communicates with Chrome History API for data retrieval
// - Maintains conversation context within a single AI session
//
// DATA FLOW:
// User Input → Query Classification (AI) → History Search OR AI Chat → Display Results
// ============================================================================

/**
 * FUNCTION: Apply Theme Colors
 * 
 * Dynamically applies dark or light theme colors to the interface by setting
 * CSS custom properties (CSS variables). This enables instant theme switching
 * without reloading the page.
 * 
 * @param {string} theme - Either 'dark' or 'light'
 * 
 * How it works:
 * - Accesses the document root element (html tag)
 * - Sets CSS variables using setProperty()
 * - CSS variables are referenced in stylesheets as var(--variable-name)
 */
function applyTheme(theme) {
  // Get the root element (<html>) to set CSS variables
  const root = document.documentElement;
  
  // DARK MODE: Apply dark color scheme
  if (theme === 'dark') {
    // Background gradients - dark grays instead of purple
    root.style.setProperty('--tab-bar-gradient-start', '#1f1f1f');  // Dark gray top
    root.style.setProperty('--tab-bar-gradient-end', '#2a2a2a');    // Slightly lighter bottom
    
    // Overlays and backgrounds - lighter colors work better on dark backgrounds
    root.style.setProperty('--tab-bar-header-overlay', 'rgba(255,255,255,0.05)');  // Light overlay
    root.style.setProperty('--search-input-background', 'rgba(255,255,255,0.1)');   // Semi-transparent white
    root.style.setProperty('--search-input-focus-background', 'rgba(255,255,255,0.14)');
    
    // Text colors - light gray for readability on dark
    root.style.setProperty('--search-input-text-color', '#f1f1f1');
    root.style.setProperty('--search-input-placeholder-color', 'rgba(255,255,255,0.5)');
    root.style.setProperty('--sp-text-color', '#f1f1f1');
    
    // Borders - subtle light borders
    root.style.setProperty('--sp-border-color', 'rgba(255,255,255,0.15)');
    root.style.setProperty('--sp-input-border', 'rgba(255,255,255,0.2)');
    root.style.setProperty('--sp-input-border-focus', 'rgba(255,255,255,0.35)');
    
    // Buttons - light translucent overlays
    root.style.setProperty('--sp-button-bg', 'rgba(255,255,255,0.12)');
    root.style.setProperty('--sp-button-bg-hover', 'rgba(255,255,255,0.2)');
    root.style.setProperty('--sp-button-border', 'rgba(255,255,255,0.2)');
    root.style.setProperty('--sp-button-border-hover', 'rgba(255,255,255,0.3)');
    root.style.setProperty('--sp-button-color', '#ffffff');
    
    // Scrollbar - light thumb on dark track
    root.style.setProperty('--sp-scrollbar-thumb', 'rgba(255,255,255,0.3)');
  } 
  // LIGHT MODE: Apply light/purple color scheme from config.js
  else {
    // Use colors from CONFIG file with fallbacks
    root.style.setProperty('--tab-bar-gradient-start', CONFIG.colors.gradientStart || '#667eea');
    root.style.setProperty('--tab-bar-gradient-end', CONFIG.colors.gradientEnd || '#764ba2');
    root.style.setProperty('--tab-bar-header-overlay', CONFIG.colors.headerOverlay || 'rgba(0,0,0,0.1)');
    
    // Input field colors from CONFIG
    root.style.setProperty('--search-input-background', CONFIG.searchInput.background || 'rgba(255,255,255,0.9)');
    root.style.setProperty('--search-input-focus-background', CONFIG.searchInput.focusBackground || 'rgba(255,255,255,1)');
    root.style.setProperty('--search-input-text-color', CONFIG.searchInput.textColor || '#333');
    root.style.setProperty('--search-input-placeholder-color', CONFIG.searchInput.placeholderColor || 'rgba(0,0,0,0.4)');
    
    // Text and borders - white text on purple background
    root.style.setProperty('--sp-text-color', '#ffffff');
    root.style.setProperty('--sp-border-color', 'rgba(255,255,255,0.2)');
    root.style.setProperty('--sp-input-border', 'rgba(255,255,255,0.25)');
    root.style.setProperty('--sp-input-border-focus', 'rgba(255,255,255,0.4)');
    
    // Buttons - white translucent overlays
    root.style.setProperty('--sp-button-bg', 'rgba(255,255,255,0.15)');
    root.style.setProperty('--sp-button-bg-hover', 'rgba(255,255,255,0.25)');
    root.style.setProperty('--sp-button-border', 'rgba(255,255,255,0.25)');
    root.style.setProperty('--sp-button-border-hover', 'rgba(255,255,255,0.35)');
    root.style.setProperty('--sp-button-color', '#ffffff');
    
    // Scrollbar
    root.style.setProperty('--sp-scrollbar-thumb', 'rgba(255,255,255,0.35)');
  }
}

/**
 * FUNCTION: Initialize Theme Synchronization
 * 
 * Sets up automatic theme switching based on the user's system preferences.
 * Monitors the system's dark mode setting and updates the interface in real-time.
 * 
 * How it works:
 * 1. Creates a media query that matches when system is in dark mode
 * 2. Applies initial theme based on current system setting
 * 3. Listens for system theme changes and reapplies theme automatically
 * 
 * Supports both modern (addEventListener) and legacy (addListener) APIs
 * for maximum browser compatibility.
 */
function initThemeSync() {
  // Create a media query to detect dark mode preference
  // This is a live object that updates when system preference changes
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  
  // Function that applies the correct theme based on current system setting
  const update = () => applyTheme(media.matches ? 'dark' : 'light');
  
  // Apply theme immediately on load
  update();
  
  // Listen for system theme changes and update automatically
  // Use modern addEventListener if available, otherwise fall back to legacy addListener
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', update);  // Modern browsers
  } else if (typeof media.addListener === 'function') {
    media.addListener(update);  // Older browsers (Safari < 14)
  }
}

/**
 * MAIN INITIALIZATION FUNCTION (IIFE - Immediately Invoked Function Expression)
 * 
 * This is the entry point that runs automatically when the side panel loads.
 * It sets up all UI elements, configures AI, initializes event listeners,
 * and prepares the interface for user interaction.
 * 
 * RESPONSIBILITIES:
 * - Configure UI elements (titles, placeholders, etc.)
 * - Initialize theme system
 * - Set up textarea auto-resize and manual resize
 * - Configure AI language model session
 * - Set up history search functionality
 * - Bind event listeners for user interactions
 * - Handle session cleanup on panel close
 * 
 * Wrapped in try-catch to gracefully handle any initialization errors.
 */
(function initSidePanel() {
  try {
    // ========== DOM ELEMENT REFERENCES ==========
    // Get references to all interactive elements we'll need
    const title = document.getElementById('sp-title');        // Header title element
    const input = document.getElementById('sp-input');        // Main textarea for user input
    const content = document.getElementById('sp-content');    // Message display area
    const handle = document.getElementById('sp-resize');      // Drag handle for resizing
    const statusEl = document.getElementById('sp-status');    // AI status indicator

    // ========== APPLY CONFIGURATION ==========
    // Set text content from config.js
    if (title) title.textContent = CONFIG.labels.title || 'Chrome Chat';
    if (input) input.placeholder = CONFIG.labels.searchPlaceholder || 'Type your message...';

    // Clear any existing content (in case of reload)
    content.textContent = '';

    // ========== INITIALIZE THEME SYSTEM ==========
    // Set up automatic dark/light mode switching
    initThemeSync();

    // ========== INJECT SPACING FROM CONFIG ==========
    // Apply spacing values from config.js to CSS variables
    const root = document.documentElement;
    if (CONFIG && CONFIG.spacing) {
      root.style.setProperty('--tab-bar-header-padding', CONFIG.spacing.headerPadding || '12px 12px');
      root.style.setProperty('--tab-bar-content-padding', CONFIG.spacing.contentPadding || '10px 12px');
    }

    // ========== TEXTAREA HEIGHT PERSISTENCE ==========
    // Load saved height but DO NOT raise the minimum to the saved value.
    // This lets users resize down after previously resizing up.
    let minInputHeight = 0;  // Baseline minimum (3 lines)
    const savedH = localStorage.getItem('sp-input-height');  // Saved current height
    
    if (input) {
      // Calculate baseline minimum based on font metrics
      const cs = window.getComputedStyle(input);
      const lineHeight = parseFloat(cs.lineHeight) || 18;
      const padV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const defaultMin = lineHeight * 3 + padV;
      
      // Do not let saved height influence the minimum
      const savedPx = savedH ? parseFloat(savedH) : 0;
      minInputHeight = defaultMin;
      
      // Apply min and current height (use saved height if present)
      input.style.minHeight = minInputHeight + 'px';
      input.style.height = (savedPx || minInputHeight) + 'px';
      
      // If no saved height exists, save the starting height
      if (!savedPx) {
        localStorage.setItem('sp-input-height', input.style.height);
      }
    }

    // ========== AUTO-GROW TEXTAREA FUNCTIONALITY ==========
    /**
     * FUNCTION: Auto-Grow Textarea
     * 
     * Automatically adjusts the textarea height to fit its content.
     * As user types more lines, the textarea expands vertically.
     * Respects both minimum and maximum height limits.
     */
    function autoGrow() {
      // Reset height to auto to get accurate scrollHeight measurement
      input.style.height = 'auto';
      
      // Get the content's actual height (includes all text lines)
      const contentH = input.scrollHeight;
      
      // Maximum height = 40% of window height (prevents textarea from taking over)
      const maxH = window.innerHeight * 0.4;
      
      // Calculate new height: between minimum and maximum, fitting content
      const next = Math.max(minInputHeight, Math.min(contentH, maxH));
      
      // Apply the new height
      input.style.height = next + 'px';
      
      // Save the height so it persists across sessions
      localStorage.setItem('sp-input-height', input.style.height);
    }
    
    // Bind autoGrow to the input event (fires as user types)
    if (input) {
      input.addEventListener('input', autoGrow);
      
      // Run once on initialization to set proper height
      autoGrow();
    }

    // ========== MANUAL RESIZE VIA DRAG HANDLE ==========
    // Users can click and drag the top handle to manually resize the textarea.
    // This gives more control than auto-grow alone.
    if (handle && input) {
      // Track drag state
      let dragging = false;  // Is user currently dragging?
      let startY = 0;        // Mouse Y position when drag started
      let startH = 0;        // Textarea height when drag started
      
      // MOUSE DOWN: Start drag operation
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();  // Prevent text selection during drag
        dragging = true;
        startY = e.clientY;  // Record starting mouse position
        startH = parseInt(window.getComputedStyle(input).height, 10) || input.clientHeight;
        document.body.style.userSelect = 'none';  // Disable text selection globally during drag
      });
      
      // MOUSE MOVE: Update height as user drags
      window.addEventListener('mousemove', (e) => {
        if (!dragging) return;  // Only proceed if drag is active
        
        // Calculate how much user moved the mouse vertically
        // Dragging UP (negative dy) increases height
        const dy = startY - e.clientY;
        
        // Calculate new height, respecting min/max limits
        const newH = Math.max(minInputHeight, Math.min(startH + dy, window.innerHeight * 0.4));
        
        // Apply the new height in real-time
        input.style.height = newH + 'px';
      });
      
      // MOUSE UP: End drag operation
      window.addEventListener('mouseup', () => {
        if (!dragging) return;  // Only proceed if drag was active
        
        dragging = false;
        document.body.style.userSelect = '';  // Re-enable text selection
        
        // Save the final height to localStorage
        localStorage.setItem('sp-input-height', input.style.height);
        // Do not raise the minimum; allow shrinking later. Keep baseline min.
        input.style.minHeight = minInputHeight + 'px';
      });
    }

    // ============================================================================
    // PROMPT API (GEMINI NANO) INTEGRATION
    // ============================================================================
    // This section configures the connection to Chrome's built-in AI language model.
    // Gemini Nano runs locally on the device - no data sent to external servers.
    
    /**
     * AI SESSION VARIABLE
     * Stores the active AI session. Only one session is created and reused
     * for the entire conversation until the panel closes.
     */
    let lmSession = null;
    
    /**
     * SUPPORTED OUTPUT LANGUAGES
     * Chrome's Gemini Nano currently supports these languages for optimal quality.
     * Other languages will fall back to English.
     */
    const LM_ALLOWED_LANGS = ['en','es','ja'];
    
    /**
     * FUNCTION: Pick Output Language
     * 
     * Detects the user's browser language and selects the best supported language
     * for AI responses. Falls back to English if user's language isn't supported.
     * 
     * @returns {string} - Two-letter language code ('en', 'es', or 'ja')
     */
    function pickOutputLanguage() {
      try {
        // Get browser language (e.g., "en-US" -> "en")
        const pref = (navigator.language || 'en').slice(0,2).toLowerCase();
        
        // Return if supported, otherwise default to English
        return LM_ALLOWED_LANGS.includes(pref) ? pref : 'en';
      } catch {
        // If any error occurs, safely default to English
        return 'en';
      }
    }
    
    // Determine language once on initialization
    const outputLang = pickOutputLanguage();
    
    // Configure AI options with the selected language
    // This ensures proper output quality and safety attestation
    const LM_OPTIONS = { output: { language: outputLang } };
    
    // Log the configured language for debugging
    console.log('AI Language configured:', outputLang);
    /**
     * FUNCTION: Check History Permission
     * 
     * Checks if the extension has permission to access browser history.
     * History is an optional permission that requires explicit user consent.
     * 
     * @returns {Promise<boolean>} - True if permission granted, false otherwise
     */
    async function hasHistoryPermission() {
      try {
        // Check if 'history' permission is already granted
        const granted = await chrome.permissions.contains({ permissions: ['history'] });
        return granted;
      } catch {
        // If check fails (e.g., API not available), assume no permission
        return false;
      }
    }
    
    /**
     * FUNCTION: Request History Permission
     * 
     * Prompts the user to grant history access permission.
     * Must be called in response to a user action (like clicking a button).
     * 
     * @returns {Promise<boolean>} - True if user granted permission, false if denied
     */
    async function requestHistoryPermission() {
      try {
        // Show Chrome's permission dialog to the user
        const granted = await chrome.permissions.request({ permissions: ['history'] });
        return granted;
      } catch {
        // If request fails, return false
        return false;
      }
    }

    /**
     * FUNCTION: Ensure AI Availability
     * 
     * Checks if the Gemini Nano AI model is available and ready to use.
     * Updates the status display with the current availability state.
     * 
     * Possible states:
     * - 'readily' - Model is downloaded and ready to use immediately
     * - 'after-download' - Model needs to be downloaded first
     * - 'no' - Model not available (insufficient hardware/storage)
     * - 'unavailable' - API not available in this browser version
     * 
     * @returns {Promise<string>} - Availability status
     */
    async function ensureAvailability() {
      try {
        // Check if LanguageModel API exists in this browser
        if (!('LanguageModel' in self)) {
          statusEl.textContent = 'AI unavailable (update Chrome)';
          return 'unavailable';
        }
        
        // Check availability status with configured language options
        const availability = await LanguageModel.availability(LM_OPTIONS);
        
        // Display status to user
        statusEl.textContent = availability;
        return availability;
      } catch (e) {
        // If check fails, display error
        statusEl.textContent = 'AI check error';
        return 'unavailable';
      }
    }

    /**
     * FUNCTION: Ensure AI Session
     * 
     * Creates or returns the existing AI session. This function implements
     * session reuse - only one session is created and used for all prompts
     * until the panel closes. This is more efficient than creating a new
     * session for each prompt.
     * 
     * @returns {Promise<Object|null>} - AI session object or null if unavailable
     */
    async function ensureSession() {
      // If session already exists, return it (reuse)
      if (lmSession) return lmSession;
      
      // Check if AI is available
      const avail = await ensureAvailability();
      if (avail === 'unavailable') return null;
      
      // Create new session with language options
      // Note: Must be called from a user gesture (we do this on send button click)
      lmSession = await LanguageModel.create(LM_OPTIONS);
      return lmSession;
    }

    /**
     * FUNCTION: Append Message to Chat
     * 
     * Creates a message bubble and adds it to the conversation display.
     * Automatically scrolls to show the new message.
     * 
     * @param {string} text - The message text to display
     * @param {string} role - Either 'user' or 'ai' (determines bubble styling)
     * @returns {HTMLElement} - The created message element (for further manipulation)
     */
    function appendMessage(text, role) {
      // Create message bubble element
      const div = document.createElement('div');
      div.className = 'msg ' + role;  // CSS class: 'msg user' or 'msg ai'
      div.textContent = text;
      
      // Add to conversation display
      content.appendChild(div);
      
      // Auto-scroll to bottom to show latest message
      content.scrollTop = content.scrollHeight;
      
      // Return element so caller can modify it (e.g., for streaming)
      return div;
    }

    // ============================================================================
    // TOOL SELECTION STATE (menu inside input row)
    // ============================================================================
    let selectedTool = 'chat';
    const toolsBtn = document.getElementById('sp-tools');
    const toolsMenu = document.getElementById('sp-tools-menu');
    if (toolsBtn && toolsMenu) {
      const hideMenu = () => { toolsMenu.style.display = 'none'; };

      function computeToolsMenuWidth() {
        try {
          const items = toolsMenu.querySelectorAll('.tool-item');
          if (!items || !items.length) return;
          // Pick longest by VISIBLE label text (what the user sees)
          let longest = '';
          items.forEach((btn) => {
            const v = String((btn.textContent || '')).trim();
            if (v.length > longest.length) longest = v;
          });
          // Create a hidden measuring span with same font styles
          const probe = document.createElement('span');
          probe.style.visibility = 'hidden';
          probe.style.position = 'absolute';
          probe.style.whiteSpace = 'nowrap';
          const ref = items[0];
          const cs = window.getComputedStyle(ref);
          // Apply full font shorthand when available for accuracy
          if (cs.font) {
            probe.style.font = cs.font;
          } else {
            probe.style.fontSize = cs.fontSize;
            probe.style.fontFamily = cs.fontFamily;
            probe.style.fontWeight = cs.fontWeight;
          }
          probe.textContent = longest;
          document.body.appendChild(probe);
          const textW = probe.offsetWidth;
          document.body.removeChild(probe);
          // Account for actual padding and borders from computed style
          const padL = parseFloat(cs.paddingLeft) || 12;
          const padR = parseFloat(cs.paddingRight) || 12;
          const borL = parseFloat(cs.borderLeftWidth) || 0;
          const borR = parseFloat(cs.borderRightWidth) || 0;
          const widthPx = Math.ceil(textW + padL + padR + borL + borR);
          toolsMenu.style.width = widthPx + 'px';
        } catch {}
      }

      toolsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const nowOpen = toolsMenu.style.display !== 'block';
        if (nowOpen) {
          computeToolsMenuWidth();
          toolsMenu.style.display = 'block';
        } else {
          toolsMenu.style.display = 'none';
        }
      });
      toolsMenu.addEventListener('click', (e) => {
        const t = e.target;
        if (t && t.dataset && t.dataset.tool) {
          selectedTool = t.dataset.tool;
          hideMenu();
          statusEl.textContent = selectedTool === 'chat' ? '' : `Tool: ${selectedTool}`;
        }
      });
      document.addEventListener('click', (e) => {
        if (!toolsMenu.contains(e.target) && e.target !== toolsBtn) hideMenu();
      });
    }

    // ============================================================================
    // HISTORY QUERY CLASSIFICATION (used only when tool = history)
    // ============================================================================
    // Uses AI to intelligently detect when user is asking about browser history
    // and extracts structured filters (domains, time ranges, limits, etc.)
    
    /**
     * HISTORY CLASSIFICATION SCHEMA
     * 
     * Defines the JSON structure the AI should return when classifying queries.
     * This schema uses structured output to ensure consistent, parseable responses.
     * 
     * Fields:
     * - intent: 'history' if asking about browsing history, 'other' for general chat
     * - keywords: Array of search keywords extracted from the query
     * - domains: Array of website domains to filter by (e.g., ['youtube.com'])
     * - timeRange: Predefined time period (today, yesterday, last7, last30, all)
     * - days: Custom number of days to look back (e.g., "last 10 days")
     * - limit: Maximum number of results to return
     * - searchOnly: True if user wants only search engine queries
     */
    const historySchema = {
      type: 'object',
      properties: {
        intent: { type: 'string', enum: ['history', 'other'] },
        keywords: { type: 'array', items: { type: 'string' } },
        domains: { type: 'array', items: { type: 'string' } },
        timeRange: { type: 'string', enum: ['today','yesterday','last7','last30','all'] },
        limit: { type: 'number' },
        days: { type: 'number' },
        searchOnly: { type: 'boolean' }
      },
      required: ['intent'],
      additionalProperties: false
    };

    /**
     * FUNCTION: Classify User Query
     * 
     * Uses AI to determine if the user is asking about browser history or wants
     * general conversation. If it's a history query, extracts structured filters.
     * 
     * PROCESS:
     * 1. Quick keyword check (history, visited, browsing, recent)
     * 2. If keywords found, use AI to extract detailed filters
     * 3. Parse AI response as JSON with structured schema
     * 4. Return classification result
     * 
     * @param {string} text - User's query text
     * @returns {Promise<Object>} - Classification result with intent and filters
     */
    async function classifyQuery(text) {
      // STEP 1: Quick heuristic check for history-related keywords
      // This avoids unnecessary AI calls for non-history queries
      const lower = text.toLowerCase();
      if (/(history|visited|browsing|recent)/.test(lower)) {
        
        // STEP 2: Use AI to extract structured information
        if (await ensureSession()) {
          try {
            // Use an isolated session (clone) so classifier prompts don't
            // leak JSON-schema instructions into the main chat context.
            const base = await ensureSession();
            const classifier = base && base.clone ? await base.clone() : await LanguageModel.create(LM_OPTIONS);
            const result = await classifier.prompt(
              `You are to classify a user's query about browser history.
Return ONLY JSON with fields:
- intent: 'history' | 'other'
- keywords: string[]
- domains: string[] (e.g., ['youtube.com'])
- timeRange: 'today' | 'yesterday' | 'last7' | 'last30' | 'all'
- days: number (custom last N days when provided like 'last 10 days')
- limit: number (max results requested like 'show last 10')
- searchOnly: boolean (true if the user asked for searches only)
Examples:
"show my history" => {"intent":"history","keywords":[],"domains":[],"timeRange":"last7"}
"what did I visit today?" => {"intent":"history","keywords":[],"domains":[],"timeRange":"today"}
"show history about youtube" => {"intent":"history","keywords":["youtube"],"domains":[],"timeRange":"last7"}
"show last 10 history items" => {"intent":"history","keywords":[],"domains":[],"timeRange":"last7","limit":10}
"show history from google.com" => {"intent":"history","keywords":[],"domains":["google.com"],"timeRange":"last7"}
"what did I browse last 7 days?" => {"intent":"history","keywords":[],"domains":[],"timeRange":"last7","days":7}
"show 15 google searches from today" => {"intent":"history","keywords":["google"],"domains":["google.com"],"timeRange":"today","limit":15,"searchOnly":true}
Query: ${text}`,
              { ...LM_OPTIONS, responseConstraint: historySchema }
            );
            // Destroy the classifier session to avoid resource leaks
            try { classifier.destroy && classifier.destroy(); } catch {}
            // Parse AI's JSON response
            return JSON.parse(result);
          } catch {
            // If AI fails, continue to fallback
          }
        }
        
        // FALLBACK: AI not available, return default history classification
        return { intent: 'history', keywords: [], domains: [], timeRange: 'last7', limit: 20 };
      }
      
      // NOT A HISTORY QUERY: Return 'other' intent for general chat
      return { intent: 'other' };
    }

    /**
     * FUNCTION: Normalize Domain Name
     * 
     * Converts common domain shorthand to full domain names.
     * E.g., "youtube" → "youtube.com", "github" → "github.com"
     * 
     * @param {string} d - Domain input (may be shorthand)
     * @returns {string} - Normalized full domain name
     */
    function normalizeDomain(d) {
      try {
        // Convert to lowercase and trim whitespace
        let s = (d || '').toLowerCase().trim();
        if (!s) return '';
        
        // Map common shorthand to full domains
        if (s === 'youtube') s = 'youtube.com';
        if (s === 'github') s = 'github.com';
        if (s === 'google') s = 'google.com';
        if (s === 'stack overflow' || s === 'stackoverflow') s = 'stackoverflow.com';
        
        return s;
      } catch {
        return '';
      }
    }

    /**
     * FUNCTION: Compute Time Window
     * 
     * Converts human-readable time ranges into timestamp boundaries.
     * Used to filter history results by date/time.
     * 
     * @param {string} range - Time range preset ('today', 'yesterday', 'last7', 'last30', 'all')
     * @param {number} daysOverride - Custom number of days (overrides range if provided)
     * @returns {Object} - {startTime, endTime} as millisecond timestamps
     */
    function computeTimeWindow(range, daysOverride) {
      const now = new Date();
      let start = 0;  // Unix epoch (beginning of time)
      let end = now.getTime();  // Current time in milliseconds
      
      // If custom days specified (e.g., "last 10 days"), use that instead
      if (typeof daysOverride === 'number' && daysOverride > 0) {
        start = end - daysOverride * 24 * 60 * 60 * 1000;  // Go back N days
        return { startTime: start, endTime: end };
      }
      
      // Otherwise, use the preset range
      switch (range) {
        case 'today': {
          // Start of today (midnight)
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          start = d.getTime();
          break;
        }
        case 'yesterday': {
          // From yesterday's midnight to today's midnight
          const d0 = new Date();
          d0.setHours(0, 0, 0, 0);
          const d1 = new Date(d0.getTime() - 24 * 60 * 60 * 1000);
          start = d1.getTime();
          end = d0.getTime();
          break;
        }
        case 'last7':
          // Last 7 days
          start = end - 7 * 24 * 60 * 60 * 1000;
          break;
        case 'last30':
          // Last 30 days
          start = end - 30 * 24 * 60 * 60 * 1000;
          break;
        case 'all':
        default:
          // All time (from epoch)
          start = 0;
          break;
      }
      
      return { startTime: start, endTime: end };
    }

    /**
     * FUNCTION: Render History Results
     * 
     * Creates interactive UI elements to display browser history results.
     * Each history item shows favicon, title, timestamp, and is clickable.
     * 
     * @param {Array} items - Array of history objects from Chrome History API
     * @param {HTMLElement} reuseBubble - Existing element to update (or null to create new)
     */
    function renderHistory(items, reuseBubble) {
      // Create container for all history items
      const wrap = document.createElement('div');
      wrap.className = 'history-list';
      
      // Create a row for each history item
      items.forEach((it) => {
        // Row container
        const row = document.createElement('div');
        row.className = 'history-item';
        
        // Favicon image
        const fav = document.createElement('img');
        fav.width = 16;
        fav.height = 16;
        
        // Get favicon using Google's public service
        // (chrome://favicon/ is restricted in sidepanel context)
        try {
          const domain = new URL(it.url).hostname;  // Extract domain from URL
          fav.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        } catch {
          // If URL parsing fails, use default gray circle icon
          fav.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="%23999"/></svg>';
        }
        
        // Fallback if favicon fails to load
        fav.onerror = () => {
          fav.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="%23999"/></svg>';
        };
        
        // Text column (title + timestamp)
        const col = document.createElement('div');
        const t = document.createElement('div');
        t.className = 'title';
        t.textContent = it.title || it.url;  // Use title, fallback to URL
        
        const m = document.createElement('div');
        m.className = 'meta';
        m.textContent = new Date(it.lastVisitTime || 0).toLocaleString();  // Format timestamp
        
        col.appendChild(t);
        col.appendChild(m);
        
        // Assemble row: favicon + text column
        row.appendChild(fav);
        row.appendChild(col);
        
        // Make row clickable - opens URL in new tab
        row.addEventListener('click', () => chrome.tabs.create({ url: it.url }));
        
        // Add row to wrapper
        wrap.appendChild(row);
      });
      
      // Display results: either update existing bubble or create new one
      if (reuseBubble) {
        // Update existing bubble (e.g., replacing "Loading..." message)
        reuseBubble.innerHTML = '';
        reuseBubble.appendChild(wrap);
      } else {
        // Create new message bubble for results
        const container = appendMessage('', 'ai');
        container.innerHTML = '';
        container.appendChild(wrap);
      }
    }

    // ============================================================================
    // BOOKMARKS QUERY HANDLER
    // ============================================================================
    async function handleBookmarksQuery(text) {
      const loading = appendMessage('Loading bookmarks…', 'ai');
      try {
        const permsOk = await chrome.permissions.request({ permissions: ['bookmarks'] }).catch(() => false);
        if (!permsOk) {
          loading.textContent = 'Permission denied for bookmarks.';
          return;
        }
        const all = await chrome.bookmarks.getTree();
        const items = [];
        function walk(nodes) {
          nodes.forEach(n => {
            if (n.url) items.push(n);
            if (n.children) walk(n.children);
          });
        }
        walk(all);
        let q = (text||'').trim().toLowerCase();
        if (q) {
          items.splice(0, items.length, ...items.filter(i => (i.title||'').toLowerCase().includes(q) || (i.url||'').toLowerCase().includes(q)));
        }
        if (!items.length) { loading.textContent = 'No bookmarks found.'; return; }
        // Render similar to history
        const mapped = items.slice(0, 100).map(i => ({ title: i.title, url: i.url, lastVisitTime: 0 }));
        renderHistory(mapped, loading);
      } catch (e) {
        loading.textContent = 'Error reading bookmarks.';
      }
    }

    // ============================================================================
    // DOWNLOADS QUERY HANDLER
    // ============================================================================
    async function handleDownloadsQuery(text) {
      const loading = appendMessage('Loading downloads…', 'ai');
      try {
        const permsOk = await chrome.permissions.request({ permissions: ['downloads'] }).catch(() => false);
        if (!permsOk) {
          loading.textContent = 'Permission denied for downloads.';
          return;
        }
        const q = (text||'').trim().toLowerCase();
        const results = await chrome.downloads.search({ query: q ? [q] : undefined, limit: 100 }).catch(() => []);
        if (!results || !results.length) { loading.textContent = 'No downloads found.'; return; }
        const mapped = results.map(d => ({ title: d.filename || d.url, url: d.url, lastVisitTime: d.endTime ? Date.parse(d.endTime) : 0 }));
        renderHistory(mapped, loading);
      } catch (e) {
        loading.textContent = 'Error reading downloads.';
      }
    }

    /**
     * FUNCTION: Handle History Query
     * 
     * Executes a browser history search based on AI-classified filters.
     * Handles permission requests, searches Chrome history, filters results,
     * and displays them to the user.
     * 
     * PROCESS:
     * 1. Request history permission if not granted
     * 2. Compute time window from classification
     * 3. Search Chrome history with filters
     * 4. Apply domain and search-only filters
     * 5. Render results with favicons
     * 
     * @param {Object} cls - Classification object from classifyQuery()
     */
    async function handleHistoryQuery(cls) {
      // Show loading message while searching
      const loading = appendMessage('Searching your history…', 'ai');
      
      // PERMISSION CHECK: History access requires explicit user consent
      const permsApi = chrome && chrome.permissions;
      let granted = false;
      try {
        granted = permsApi ? await hasHistoryPermission() : false;
      } catch {}
      if (!granted && permsApi) {
        const ok = await requestHistoryPermission();
        granted = !!ok;
      }
      if (!granted) {
        loading.textContent = 'Permission to read history was denied.';
        // Provide a button to re-request permission
        const btn = document.createElement('button');
        btn.className = 'send-btn';
        btn.textContent = 'Grant history access';
        btn.onclick = async () => {
          const ok = await requestHistoryPermission();
          if (ok) {
            loading.textContent = 'Permission granted. Searching…';
            await handleHistoryQuery(cls);
          } else {
            loading.textContent = 'Still denied. You can enable it in chrome://extensions → Details → Permissions.';
          }
        };
        loading.appendChild(document.createElement('br'));
        loading.appendChild(btn);
        return;
      }

      const { startTime } = computeTimeWindow(cls.timeRange || 'last7', cls.days);
      // Sanitize keywords: drop generic/time words that hurt matching
      const kwStop = new Set([
        'visited','visit','today','yesterday','last','week','weeks','month','months','days','day','recent',
        'show','history','what','did','my','the','of','and','to','in','from','about','on'
      ]);
      const cleanedKeywords = (cls.keywords || [])
        .map(k => (k || '').toLowerCase().trim())
        .filter(k => k && !kwStop.has(k));
      const rawText = cleanedKeywords.join(' ').trim();
      const maxResults = Math.min(Math.max(cls.limit || 20, 1), 100);

      async function query(text, start) {
        return chrome.history.search({ text, startTime: start, maxResults });
      }

      try {
        let results = await query(rawText, startTime);
        if (!results.length && rawText) {
          // Retry with no keywords in same window
          results = await query('', startTime);
        }
        if (!results.length && startTime !== 0) {
          // Retry all-time window
          results = await query(rawText, 0);
          if (!results.length && rawText) {
            results = await query('', 0);
          }
        }

        // Optional domain filter with safe fallbacks
        const stopWords = new Set(['chrome','permission','prompt','history']);
        const domains = (cls.domains || [])
          .map(d => normalizeDomain(d))
          .filter(d => d && d.length >= 3 && !stopWords.has(d));

        let filtered = results;
        // searchOnly: try to filter to search engine result pages / queries
        if (cls.searchOnly) {
          const searchHosts = ['google.com','bing.com','duckduckgo.com','yahoo.com'];
          const qParams = ['q','query','p','text'];
          const onlySearch = results.filter(r => {
            try {
              const u = new URL(r.url);
              const host = u.hostname.toLowerCase();
              if (!searchHosts.some(h => host.endsWith(h))) return false;
              return qParams.some(p => u.searchParams.has(p));
            } catch { return false; }
          });
          if (onlySearch.length) filtered = onlySearch;
        }
        if (domains.length) {
          const byDomain = results.filter(r => {
            try {
              const host = new URL(r.url).hostname.toLowerCase();
              return domains.some(d => host.includes(d));
            } catch { return false; }
          });
          // If domain filter removes everything, ignore it
          if (byDomain.length) filtered = byDomain;
        }

        if (!filtered.length) {
          loading.textContent = 'No history found for your query.';
          return;
        }
        renderHistory(filtered, loading);
      } catch (e) {
        loading.textContent = 'Error accessing history: ' + (e && e.message ? e.message : 'Unknown');
      }
    }

    /**
     * FUNCTION: Send Message (Main Entry Point)
     * 
     * This is the main function that handles all user messages.
     * It routes to either history search or AI chat based on intent classification.
     * 
     * FLOW:
     * 1. Get and validate user input
     * 2. Display user message
     * 3. Classify intent using AI (history or chat)
     * 4. Extract additional filters with regex fallback
     * 5. Route to appropriate handler:
     *    - History → handleHistoryQuery()
     *    - Chat → Gemini Nano with streaming
     * 
     * This function is triggered by:
     * - Clicking send button
     * - Pressing Enter (without Shift)
     */
    async function sendMessage() {
      // Get user input and validate
      const text = (input.value || '').trim();
      if (!text) return;  // Ignore empty messages
      
      // Display user's message
      const userMsg = appendMessage(text, 'user');
      
      // Clear input field and reset height
      input.value = '';
      autoGrow();
      
      // STEP 1: Decide path
      let cls = { intent: 'other' };
      if (selectedTool === 'chat') {
        cls = await classifyQuery(text);
      }
      
      // STEP 2: Regex fallback for numbers AI might miss
      // Extract result limits (e.g., "show 50 items")
      const limitMatch = text.match(/\b(last|show)\s+(\d{1,3})\s+(?:\w+\s+)?(results|items|sites|visits|pages|entries)\b/i);
      if (limitMatch && !cls.limit) cls.limit = parseInt(limitMatch[2], 10);
      
      // Extract custom day ranges (e.g., "last 10 days")
      const daysMatch = text.match(/\blast\s+(\d{1,3})\s+days?\b/i);
      if (daysMatch && !cls.days) cls.days = parseInt(daysMatch[1], 10);
      
      // STEP 3: Route based on intent
      // Respect explicit tool choice: if user selected Chat, never route to tools
      if (selectedTool !== 'chat' && selectedTool === 'history' || (selectedTool !== 'chat' && cls.intent === 'history')) {
        // HISTORY QUERY: Search browser history
        await handleHistoryQuery(cls);
        return;
      }
      if (selectedTool !== 'chat' && selectedTool === 'bookmarks') {
        await handleBookmarksQuery(text);
        return;
      }
      if (selectedTool !== 'chat' && selectedTool === 'downloads') {
        await handleDownloadsQuery(text);
        return;
      }
      
      // GENERAL CHAT: Use AI for conversation
      // Ensure AI session is ready
      const session = await ensureSession();
      if (!session) {
        appendMessage('AI unavailable. See requirements.', 'ai');
        return;
      }
      
      try {
        // Use streaming if available for real-time response
        if (session.promptStreaming) {
          // Create empty bubble for streaming text
          const aiDiv = appendMessage('', 'ai');
          
          // Stream response word-by-word
          const stream = session.promptStreaming(text, LM_OPTIONS);
          for await (const chunk of stream) {
            aiDiv.textContent += chunk;  // Append each word as it arrives
            content.scrollTop = content.scrollHeight;  // Keep scrolled to bottom
          }
        } else {
          // Fallback: Non-streaming (wait for full response)
          const result = await session.prompt(text, LM_OPTIONS);
          appendMessage(result, 'ai');
        }
      } catch (e) {
        // Handle errors gracefully
        appendMessage('Error: ' + (e && e.message ? e.message : 'Unknown'), 'ai');
      }
    }

    // ============================================================================
    // EVENT BINDINGS
    // ============================================================================
    
    // Bind send button click
    const sendBtn = document.getElementById('sp-send');
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    
    // Bind Enter key to send (Shift+Enter for new line)
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();  // Prevent default Enter behavior
        await sendMessage();
      }
      // Note: Shift+Enter still creates a new line (default behavior)
    });

    // ============================================================================
    // CLEANUP ON PANEL CLOSE
    // ============================================================================
    /**
     * Clean up AI session when sidepanel is closed.
     * This frees memory and resources by destroying the Gemini Nano session.
     * Session is automatically recreated when panel reopens.
     */
    window.addEventListener('beforeunload', () => {
      if (lmSession) {
        lmSession.destroy();  // Free AI resources
        lmSession = null;     // Reset session variable
        console.log('AI session destroyed on sidepanel close');
      }
    });
    
  } catch (e) {
    // Catch any initialization errors and log them
    console.error('Error initializing side panel:', e);
  }
})();  // Execute initialization immediately



