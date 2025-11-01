// ============================================================================
// SETTINGS MODAL UI COMPONENT
// ============================================================================
// FILE SUMMARY:
// Provides the settings modal UI with sidebar navigation and category panels.
// Handles all user interactions with settings and auto-saves changes.
//
// FEATURES:
// - Sidebar navigation for categories
// - Category-specific content panels
// - Auto-save on change
// - Validation feedback
// - Responsive design
// ============================================================================

import { logger } from '../core/logger.js';
import { 
  initializeSettings, 
  getSettings, 
  updateSettings,
  getDefaultSettings 
} from '../services/settings.js';
import { getVoices } from '../services/speech.js';
import { hideOnboardingHelp } from './ui.js';

const log = logger.create('SettingsModal');

// ============================================
// STATE
// ============================================

let modal = null;
let currentCategory = 'audio';
let isInitialized = false;

// Category definitions with icons and labels
const CATEGORIES = [
  { id: 'audio', icon: '🔊', label: 'Audio' },
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'tools', icon: '🔍', label: 'Tools' },
  { id: 'translation', icon: '🌐', label: 'Translation' },
  { id: 'contextSelection', icon: '📝', label: 'Context' },
  { id: 'appearance', icon: '🎨', label: 'Appearance' },
  { id: 'help', icon: '❓', label: 'Help' },
];

// ============================================
// MODAL CREATION
// ============================================

/**
 * Creates the settings modal structure
 * @returns {HTMLElement} Modal element
 */
function createModal() {
  const modalEl = document.createElement('div');
  modalEl.id = 'sp-settings-modal';
  modalEl.className = 'settings-modal';
  
  const panel = document.createElement('div');
  panel.className = 'settings-panel';
  
  // Header
  const header = document.createElement('div');
  header.className = 'settings-header';
  
  const title = document.createElement('div');
  title.className = 'settings-title';
  title.textContent = 'Settings';
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'settings-close';
  closeBtn.innerHTML = '×';
  closeBtn.setAttribute('aria-label', 'Close settings');
  
  header.appendChild(title);
  header.appendChild(closeBtn);
  
  // Container: Sidebar + Content
  const container = document.createElement('div');
  container.className = 'settings-container';
  
  // Sidebar
  const sidebar = document.createElement('div');
  sidebar.className = 'settings-sidebar';
  sidebar.id = 'sp-settings-sidebar';
  
  // Content area
  const content = document.createElement('div');
  content.className = 'settings-content';
  content.id = 'sp-settings-content';
  
  container.appendChild(sidebar);
  container.appendChild(content);
  
  panel.appendChild(header);
  panel.appendChild(container);
  modalEl.appendChild(panel);
  
  // Event handlers
  closeBtn.addEventListener('click', closeModal);
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeModal();
  });
  
  // Keyboard: ESC to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl.style.display === 'flex') {
      closeModal();
    }
  });
  
  return modalEl;
}

/**
 * Creates sidebar navigation
 * @param {HTMLElement} sidebar - Sidebar container
 */
function createSidebar(sidebar) {
  sidebar.innerHTML = '';
  
  CATEGORIES.forEach(category => {
    const item = document.createElement('button');
    item.className = 'settings-sidebar-item';
    item.dataset.category = category.id;
    item.innerHTML = `<span class="settings-sidebar-icon">${category.icon}</span><span class="settings-sidebar-label">${category.label}</span>`;
    
    if (category.id === currentCategory) {
      item.classList.add('active');
    }
    
    item.addEventListener('click', () => {
      switchCategory(category.id);
    });
    
    sidebar.appendChild(item);
  });
}

// ============================================
// CATEGORY PANELS
// ============================================

/**
 * Renders the active category panel
 * @param {HTMLElement} content - Content container
 * @param {string} categoryId - Category ID
 */
async function renderCategoryPanel(content, categoryId) {
  content.innerHTML = '';
  
  switch (categoryId) {
    case 'audio':
      await renderAudioPanel(content);
      break;
    case 'chat':
      renderChatPanel(content);
      break;
    case 'tools':
      renderToolsPanel(content);
      break;
    case 'translation':
      renderTranslationPanel(content);
      break;
    case 'contextSelection':
      renderContextSelectionPanel(content);
      break;
    case 'appearance':
      renderAppearancePanel(content);
      break;
    case 'help':
      renderHelpPanel(content);
      break;
    default:
      content.textContent = 'Category not found';
  }
}

/**
 * Renders Audio Settings panel
 */
async function renderAudioPanel(container) {
  const settings = await getSettings('audio');
  const config = window.CONFIG?.speech || {};
  
  // Voice selection
  const voiceGroup = createSettingsGroup('Voice', container);
  const voiceMenu = document.createElement('div');
  voiceMenu.className = 'settings-voice-menu';
  
  const voiceToggle = document.createElement('button');
  voiceToggle.className = 'settings-voice-toggle';
  voiceToggle.id = 'sp-settings-voice-toggle';
  
  const voiceDropdown = document.createElement('div');
  voiceDropdown.className = 'settings-voice-dropdown';
  voiceDropdown.id = 'sp-settings-voice-dropdown';
  
  // Load voices
  const voices = await getVoices();
  if (voices && voices.length > 0) {
    const currentVoice = settings.voice || voices[0];
    const voiceName = typeof currentVoice === 'object' ? currentVoice.name : currentVoice;
    voiceToggle.textContent = voiceName || 'Select voice...';
    
    voices.forEach(voice => {
      const item = document.createElement('button');
      item.className = 'settings-voice-item';
      item.textContent = config.showVoiceLanguage ? `${voice.name} (${voice.lang})` : voice.name;
      item.addEventListener('click', async () => {
        await updateSettings('audio', { voice });
        voiceToggle.textContent = config.showVoiceLanguage ? `${voice.name} (${voice.lang})` : voice.name;
        voiceDropdown.style.display = 'none';
      });
      voiceDropdown.appendChild(item);
    });
  } else {
    voiceToggle.textContent = config.labels?.noVoices || 'No voices available';
    voiceToggle.disabled = true;
  }
  
  voiceToggle.addEventListener('click', () => {
    voiceDropdown.style.display = voiceDropdown.style.display === 'block' ? 'none' : 'block';
  });
  
  voiceMenu.appendChild(voiceToggle);
  voiceMenu.appendChild(voiceDropdown);
  voiceGroup.appendChild(voiceMenu);
  
  // Speed
  const speedGroup = createSliderGroup(
    'Speed',
    'sp-settings-speed',
    settings.rate || 1.0,
    config.rateMin || 0.5,
    config.rateMax || 2.0,
    config.rateStep || 0.1,
    (val) => `${val.toFixed(1)}×`,
    async (val) => await updateSettings('audio', { rate: val })
  );
  container.appendChild(speedGroup);
  
  // Pitch
  const pitchGroup = createSliderGroup(
    'Pitch',
    'sp-settings-pitch',
    settings.pitch || 1.0,
    config.pitchMin || 0.5,
    config.pitchMax || 2.0,
    config.pitchStep || 0.1,
    (val) => val.toFixed(1),
    async (val) => await updateSettings('audio', { pitch: val })
  );
  container.appendChild(pitchGroup);
  
  // Volume
  const volumeGroup = createSliderGroup(
    'Volume',
    'sp-settings-volume',
    settings.volume || 1.0,
    config.volumeMin || 0,
    config.volumeMax || 1,
    config.volumeStep || 0.05,
    (val) => `${Math.round(val * 100)}%`,
    async (val) => await updateSettings('audio', { volume: val })
  );
  container.appendChild(volumeGroup);
  
  // Test button
  const testGroup = createSettingsGroup('', container);
  const testBtn = document.createElement('button');
  testBtn.className = 'settings-test-btn';
  testBtn.textContent = config.labels?.testButton || 'Test Voice';
  testBtn.addEventListener('click', () => {
    // Trigger test via speech service event
    const event = new CustomEvent('settings-test-voice', { bubbles: true, composed: true });
    document.dispatchEvent(event);
  });
  testGroup.appendChild(testBtn);
}

/**
 * Renders Chat Settings panel
 */
function renderChatPanel(container) {
  getSettings('chat').then(settings => {
    // Markdown
    const markdownToggle = createToggleGroup(
      'Enable Markdown Rendering',
      'sp-settings-markdown',
      settings.markdown !== false,
      async (val) => await updateSettings('chat', { markdown: val })
    );
    container.appendChild(markdownToggle);
    
    // Auto-scroll
    const autoScrollToggle = createToggleGroup(
      'Auto-scroll to Latest Message',
      'sp-settings-auto-scroll',
      settings.autoScroll !== false,
      async (val) => await updateSettings('chat', { autoScroll: val })
    );
    container.appendChild(autoScrollToggle);
    
    // Timestamps
    const timestampsToggle = createToggleGroup(
      'Show Timestamps on Messages',
      'sp-settings-timestamps',
      settings.timestamps === true,
      async (val) => await updateSettings('chat', { timestamps: val })
    );
    container.appendChild(timestampsToggle);
    
    // History limit
    const historyLimitGroup = createNumberGroup(
      'Message History Limit',
      'sp-settings-history-limit',
      settings.historyLimit || 100,
      1,
      1000,
      1,
      async (val) => await updateSettings('chat', { historyLimit: val })
    );
    container.appendChild(historyLimitGroup);
    
    // Clear history button
    const clearGroup = createSettingsGroup('', container);
    const clearBtn = document.createElement('button');
    clearBtn.className = 'settings-action-btn';
    clearBtn.textContent = 'Clear Chat History';
    clearBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all chat history? This cannot be undone.')) {
        // Dispatch event for sidepanel to handle
        const event = new CustomEvent('settings-clear-history', { bubbles: true, composed: true });
        document.dispatchEvent(event);
      }
    });
    clearGroup.appendChild(clearBtn);
  });
}

/**
 * Renders Tools Settings panel (with accordion sections)
 */
function renderToolsPanel(container) {
  getSettings('tools').then(settings => {
    const tools = [
      { id: 'chat', label: '@iChromeChat', icon: '💬' },
      { id: 'history', label: '@BrowserHistory', icon: '📚' },
      { id: 'bookmarks', label: '@Bookmarks', icon: '🔖' },
      { id: 'downloads', label: '@Downloads', icon: '📥' },
      { id: 'page', label: '@Page', icon: '📃' },
      { id: 'chromepad', label: '@ChromePad', icon: '📝' },
    ];
    
    tools.forEach(tool => {
      const section = createAccordionSection(tool.label, tool.icon, container);
      const toolSettings = settings[tool.id] || {};
      
      // @iChromeChat settings
      if (tool.id === 'chat') {
        section.content.appendChild(createToggleGroup(
          'Enable Retrieval Mode',
          `sp-settings-tool-${tool.id}-retrieval`,
          toolSettings.retrieval !== false,
          async (val) => await updateSettings(`tools.${tool.id}`, { retrieval: val })
        ));
        
        section.content.appendChild(createNumberGroup(
          'Top M Results',
          `sp-settings-tool-${tool.id}-topm`,
          toolSettings.topM || 12,
          1,
          50,
          1,
          async (val) => await updateSettings(`tools.${tool.id}`, { topM: val })
        ));
        
        section.content.appendChild(createNumberGroup(
          'Rerank K Results',
          `sp-settings-tool-${tool.id}-rerank`,
          toolSettings.rerankK || 4,
          1,
          20,
          1,
          async (val) => await updateSettings(`tools.${tool.id}`, { rerankK: val })
        ));
        
        section.content.appendChild(createToggleGroup(
          'Use LLM for Reranking',
          `sp-settings-tool-${tool.id}-usellm`,
          toolSettings.useLLM !== false,
          async (val) => await updateSettings(`tools.${tool.id}`, { useLLM: val })
        ));
      }
      
      // @BrowserHistory, @Bookmarks, @Downloads settings
      if (['history', 'bookmarks', 'downloads'].includes(tool.id)) {
        section.content.appendChild(createToggleGroup(
          'Enabled',
          `sp-settings-tool-${tool.id}-enabled`,
          toolSettings.enabled !== false,
          async (val) => await updateSettings(`tools.${tool.id}`, { enabled: val })
        ));
        
        section.content.appendChild(createNumberGroup(
          'Max Results per Query',
          `sp-settings-tool-${tool.id}-max`,
          toolSettings.maxResults || 10,
          1,
          100,
          1,
          async (val) => await updateSettings(`tools.${tool.id}`, { maxResults: val })
        ));
        
        // History-specific: Date range
        if (tool.id === 'history') {
          const dateRangeGroup = createSelectGroup(
            'Search Date Range',
            `sp-settings-tool-${tool.id}-daterange`,
            ['7days', '30days', '90days', 'all'],
            ['Last 7 days', 'Last 30 days', 'Last 90 days', 'All time'],
            toolSettings.dateRange || 'all',
            async (val) => await updateSettings(`tools.${tool.id}`, { dateRange: val })
          );
          section.content.appendChild(dateRangeGroup);
        }
        
        // Bookmarks-specific: Search folders
        if (tool.id === 'bookmarks') {
          section.content.appendChild(createToggleGroup(
            'Search in Folder Structure',
            `sp-settings-tool-${tool.id}-folders`,
            toolSettings.searchFolders !== false,
            async (val) => await updateSettings(`tools.${tool.id}`, { searchFolders: val })
          ));
        }
        
        // Downloads-specific: Include metadata
        if (tool.id === 'downloads') {
          section.content.appendChild(createToggleGroup(
            'Include File Metadata',
            `sp-settings-tool-${tool.id}-metadata`,
            toolSettings.includeMetadata !== false,
            async (val) => await updateSettings(`tools.${tool.id}`, { includeMetadata: val })
          ));
        }
      }
      
      // @Page settings
      if (tool.id === 'page') {
        section.content.appendChild(createToggleGroup(
          'Enable Page Capture',
          `sp-settings-tool-${tool.id}-enabled`,
          toolSettings.enabled !== false,
          async (val) => await updateSettings(`tools.${tool.id}`, { enabled: val })
        ));
        
        section.content.appendChild(createNumberGroup(
          'Max Chunk Size (characters)',
          `sp-settings-tool-${tool.id}-maxchunk`,
          toolSettings.maxChunk || 12000,
          1000,
          50000,
          500,
          async (val) => await updateSettings(`tools.${tool.id}`, { maxChunk: val })
        ));
        
        section.content.appendChild(createNumberGroup(
          'Chunk Overlap (characters)',
          `sp-settings-tool-${tool.id}-overlap`,
          toolSettings.overlap || 500,
          0,
          5000,
          100,
          async (val) => await updateSettings(`tools.${tool.id}`, { overlap: val })
        ));
        
        section.content.appendChild(createToggleGroup(
          'Auto-capture on Tab Switch',
          `sp-settings-tool-${tool.id}-autocapture`,
          toolSettings.autoCapture !== false,
          async (val) => await updateSettings(`tools.${tool.id}`, { autoCapture: val })
        ));
        
        section.content.appendChild(createToggleGroup(
          'Clear Context on Tab Switch',
          `sp-settings-tool-${tool.id}-clearonswitch`,
          toolSettings.clearOnSwitch !== false,
          async (val) => await updateSettings(`tools.${tool.id}`, { clearOnSwitch: val })
        ));
      }
      
      // @ChromePad settings
      if (tool.id === 'chromepad') {
        section.content.appendChild(createToggleGroup(
          'Enable ChromePad',
          `sp-settings-tool-${tool.id}-enabled`,
          toolSettings.enabled !== false,
          async (val) => await updateSettings(`tools.${tool.id}`, { enabled: val })
        ));
        
        section.content.appendChild(createToggleGroup(
          'Enable Auto-save',
          `sp-settings-tool-${tool.id}-autosave`,
          toolSettings.autoSave !== false,
          async (val) => await updateSettings(`tools.${tool.id}`, { autoSave: val })
        ));
        
        section.content.appendChild(createToggleGroup(
          'Typewriter Effect Enabled',
          `sp-settings-tool-${tool.id}-typewriter`,
          toolSettings.typewriter !== false,
          async (val) => await updateSettings(`tools.${tool.id}`, { typewriter: val })
        ));
        
        section.content.appendChild(createToggleGroup(
          'Show Save Success Message',
          `sp-settings-tool-${tool.id}-showsuccess`,
          toolSettings.showSuccess !== false,
          async (val) => await updateSettings(`tools.${tool.id}`, { showSuccess: val })
        ));
      }
    });
  });
}

/**
 * Renders Translation Settings panel
 */
function renderTranslationPanel(container) {
  getSettings('translation').then(settings => {
    const config = window.CONFIG?.translation || {};
    
    // Enable translation
    const enableToggle = createToggleGroup(
      'Enable Translation',
      'sp-settings-translation-enabled',
      settings.enabled !== false,
      async (val) => await updateSettings('translation', { enabled: val })
    );
    container.appendChild(enableToggle);
    
    // Default source language
    const languages = config.languages || [
      { code: 'auto', name: 'Auto-detect' },
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'ja', name: 'Japanese' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'de', name: 'German' },
      { code: 'zh', name: 'Chinese' },
      { code: 'hi', name: 'Hindi' },
      { code: 'ar', name: 'Arabic' },
      { code: 'te', name: 'Telugu' },
    ];
    
    const sourceLangValues = languages.map(l => l.code);
    const sourceLangLabels = languages.map(l => l.name);
    
    const sourceLangGroup = createSelectGroup(
      'Default Source Language',
      'sp-settings-translation-source',
      sourceLangValues,
      sourceLangLabels,
      settings.defaultSource || 'auto',
      async (val) => await updateSettings('translation', { defaultSource: val })
    );
    container.appendChild(sourceLangGroup);
    
    // Recently used languages limit
    const recentLimitGroup = createNumberGroup(
      'Recently Used Languages Limit',
      'sp-settings-translation-recent',
      settings.recentLimit || 3,
      1,
      10,
      1,
      async (val) => await updateSettings('translation', { recentLimit: val })
    );
    container.appendChild(recentLimitGroup);
    
    // Show language codes
    const showCodesToggle = createToggleGroup(
      'Show Language Codes',
      'sp-settings-translation-codes',
      settings.showCodes !== false,
      async (val) => await updateSettings('translation', { showCodes: val })
    );
    container.appendChild(showCodesToggle);
    
    // Animation speed
    const animationGroup = createNumberGroup(
      'Animation Speed (ms per character)',
      'sp-settings-translation-animation',
      settings.animationSpeed || 8,
      1,
      50,
      1,
      async (val) => await updateSettings('translation', { animationSpeed: val })
    );
    container.appendChild(animationGroup);
  });
}

/**
 * Renders Context Selection Settings panel
 */
function renderContextSelectionPanel(container) {
  getSettings('contextSelection').then(settings => {
    // Enable context selection
    const enableToggle = createToggleGroup(
      'Enable Context Selection',
      'sp-settings-context-enabled',
      settings.enabled !== false,
      async (val) => await updateSettings('contextSelection', { enabled: val })
    );
    container.appendChild(enableToggle);
    
    // Max context snippets
    const maxSnippetsGroup = createNumberGroup(
      'Max Context Snippets',
      'sp-settings-context-maxsnippets',
      settings.maxSnippets || 5,
      1,
      20,
      1,
      async (val) => await updateSettings('contextSelection', { maxSnippets: val })
    );
    container.appendChild(maxSnippetsGroup);
    
    // Max snippet characters
    const maxCharsGroup = createNumberGroup(
      'Max Snippet Characters',
      'sp-settings-context-maxchars',
      settings.maxChars || 800,
      100,
      5000,
      100,
      async (val) => await updateSettings('contextSelection', { maxChars: val })
    );
    container.appendChild(maxCharsGroup);
    
    // Highlight selected text
    const highlightToggle = createToggleGroup(
      'Highlight Selected Text',
      'sp-settings-context-highlight',
      settings.highlight !== false,
      async (val) => await updateSettings('contextSelection', { highlight: val })
    );
    container.appendChild(highlightToggle);
    
    // Use retrieval when pills added
    const useRetrievalToggle = createToggleGroup(
      'Use Retrieval When Pills Added',
      'sp-settings-context-retrieval',
      settings.useRetrieval !== false,
      async (val) => await updateSettings('contextSelection', { useRetrieval: val })
    );
    container.appendChild(useRetrievalToggle);
    
    // Pre-index on pill add
    const preIndexToggle = createToggleGroup(
      'Pre-index on Pill Add',
      'sp-settings-context-preindex',
      settings.preIndex !== false,
      async (val) => await updateSettings('contextSelection', { preIndex: val })
    );
    container.appendChild(preIndexToggle);

    // Optimize URLs in context preview
    const optimizeToggle = createToggleGroup(
      'Optimize URLs in Context Previews',
      'sp-settings-context-optimizeurls',
      settings.optimizeURLs !== false,
      async (val) => {
        await updateSettings('contextSelection', { optimizeURLs: val });
        // Reflect immediately in CONFIG
        if (window.CONFIG && window.CONFIG.contextSelection) {
          window.CONFIG.contextSelection.optimizeURLs = val;
        }
      }
    );
    container.appendChild(optimizeToggle);

    // Max URL chars (keep full URL if <=)
    const maxUrlCharsGroup = createNumberGroup(
      'Max URL Characters (keep full URL if ≤)',
      'sp-settings-context-maxurlchars',
      settings.maxURLChars || 50,
      10,
      200,
      5,
      async (val) => {
        await updateSettings('contextSelection', { maxURLChars: val });
        if (window.CONFIG && window.CONFIG.contextSelection) {
          window.CONFIG.contextSelection.maxURLChars = val;
        }
      }
    );
    container.appendChild(maxUrlCharsGroup);

    // Max path segments
    const maxPathSegmentsGroup = createNumberGroup(
      'Max Path Segments',
      'sp-settings-context-maxpathsegments',
      settings.maxPathSegments || 3,
      0,
      10,
      1,
      async (val) => {
        await updateSettings('contextSelection', { maxPathSegments: val });
        if (window.CONFIG && window.CONFIG.contextSelection) {
          window.CONFIG.contextSelection.maxPathSegments = val;
        }
      }
    );
    container.appendChild(maxPathSegmentsGroup);

    // Max path characters
    const maxPathCharsGroup = createNumberGroup(
      'Max Path Characters',
      'sp-settings-context-maxpathchars',
      settings.maxPathChars || 30,
      10,
      200,
      5,
      async (val) => {
        await updateSettings('contextSelection', { maxPathChars: val });
        if (window.CONFIG && window.CONFIG.contextSelection) {
          window.CONFIG.contextSelection.maxPathChars = val;
        }
      }
    );
    container.appendChild(maxPathCharsGroup);

    // Include search query for search engines
    const includeSearchToggle = createToggleGroup(
      'Include Search Query for Search Engines',
      'sp-settings-context-includequery',
      settings.includeQueryForSearch !== false,
      async (val) => {
        await updateSettings('contextSelection', { includeQueryForSearch: val });
        if (window.CONFIG && window.CONFIG.contextSelection) {
          window.CONFIG.contextSelection.includeQueryForSearch = val;
        }
      }
    );
    container.appendChild(includeSearchToggle);
  });
}

/**
 * Renders Appearance Settings panel
 */
function renderAppearancePanel(container) {
  getSettings('appearance').then(settings => {
    // Theme selector
    const themeGroup = createSelectGroup(
      'Theme',
      'sp-settings-theme',
      ['auto', 'light', 'dark'],
      ['Auto', 'Light', 'Dark'],
      settings.theme || 'auto',
      async (val) => {
        await updateSettings('appearance', { theme: val });
        // Apply theme immediately
        applyTheme(val);
      }
    );
    container.appendChild(themeGroup);
    
    // Font size
    const fontSizeGroup = createSelectGroup(
      'Font Size',
      'sp-settings-font-size',
      ['small', 'medium', 'large'],
      ['Small', 'Medium', 'Large'],
      settings.fontSize || 'medium',
      async (val) => {
        await updateSettings('appearance', { fontSize: val });
        // Apply font size immediately
        applyFontSize(val);
      }
    );
    container.appendChild(fontSizeGroup);
    
    // Input field min height
    const inputHeight = settings.inputHeight || { min: 36, max: 40 };
    const minHeightGroup = createNumberGroup(
      'Input Field Min Height (px)',
      'sp-settings-input-min-height',
      inputHeight.min || 36,
      24,
      100,
      2,
      async (val) => {
        const current = settings.inputHeight || { min: 36, max: 40 };
        await updateSettings('appearance', { 
          inputHeight: { ...current, min: val } 
        });
        applyInputHeight({ ...current, min: val });
      }
    );
    container.appendChild(minHeightGroup);
    
    // Input field max height (as percentage of viewport)
    const maxHeightGroup = createNumberGroup(
      'Input Field Max Height (% of viewport)',
      'sp-settings-input-max-height',
      inputHeight.max || 40,
      20,
      80,
      5,
      async (val) => {
        const current = settings.inputHeight || { min: 36, max: 40 };
        await updateSettings('appearance', { 
          inputHeight: { ...current, max: val } 
        });
        applyInputHeight({ ...current, max: val });
      }
    );
    container.appendChild(maxHeightGroup);
    
    // Show tool icons
    const showIconsToggle = createToggleGroup(
      'Show Tool Icons',
      'sp-settings-show-icons',
      settings.showIcons !== false,
      async (val) => await updateSettings('appearance', { showIcons: val })
    );
    container.appendChild(showIconsToggle);
  });
}

/**
 * Applies theme setting
 */
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    root.removeAttribute('data-theme'); // Auto uses system preference
  }
}

/**
 * Applies font size setting
 */
function applyFontSize(size) {
  const root = document.documentElement;
  root.setAttribute('data-font-size', size);
  // Apply via CSS variable
  const sizes = { small: '12px', medium: '13px', large: '14px' };
  root.style.setProperty('--base-font-size', sizes[size] || sizes.medium);
}

/**
 * Applies input height setting
 */
function applyInputHeight(height) {
  const input = document.getElementById('sp-input');
  if (input) {
    if (height.min) {
      input.style.minHeight = `${height.min}px`;
    }
    if (height.max) {
      const maxPx = (window.innerHeight * height.max) / 100;
      input.style.maxHeight = `${maxPx}px`;
    }
  }
}

/**
 * Renders Help Settings panel (PRIMARY REQUIREMENT)
 */
function renderHelpPanel(container) {
  getSettings('help').then(settings => {
    // Show help on load toggle
    const showOnLoadToggle = createToggleGroup(
      'Show Help on Application Load',
      'sp-settings-help-show-on-load',
      settings.showOnLoad !== false,
      async (val) => {
        await updateSettings('help', { showOnLoad: val });
        // Update config immediately
        if (window.CONFIG && window.CONFIG.onboarding) {
          window.CONFIG.onboarding.enabled = val;
          // Hide onboarding immediately if disabled
          if (!window.CONFIG.onboarding.enabled) {
            hideOnboardingHelp();
          }
        }
      }
    );
    container.appendChild(showOnLoadToggle);
    
    // Show tooltips toggle
    const tooltipsToggle = createToggleGroup(
      'Show Tooltips',
      'sp-settings-help-tooltips',
      settings.showTooltips !== false,
      async (val) => await updateSettings('help', { showTooltips: val })
    );
    container.appendChild(tooltipsToggle);
    
    // View User Guide button
    const guideGroup = createSettingsGroup('', container);
    const guideBtn = document.createElement('button');
    guideBtn.className = 'settings-action-btn';
    guideBtn.textContent = 'View User Guide';
    guideBtn.addEventListener('click', async () => {
      // Close the settings modal
      closeModal();
      
      // Create an AI bubble notification about the user guide
      try {
        // Dynamically import appendMessage and setSelectedTool from ui.js
        const { appendMessage, setSelectedTool } = await import('./ui.js');
        const { TOOLS } = await import('../core/constants.js');
        
        // Create a clickable AI bubble
        const guideBubble = appendMessage('📖 User Guide is available in ChromePad. Click here to view it.', 'ai');
        guideBubble.style.cursor = 'pointer';
        guideBubble.style.opacity = '0.95';
        guideBubble.style.background = 'rgba(102, 126, 234, 0.15)'; // Brand color tint
        guideBubble.style.borderLeft = '3px solid #667eea'; // Brand accent
        guideBubble.title = 'Click to open User Guide in ChromePad';
        
        // Add click handler to open user guide in ChromePad
        guideBubble.addEventListener('click', async () => {
          try {
            // Switch to ChromePad tool
            setSelectedTool(TOOLS.CHROMEPAD);
            
            // Initialize ChromePad and load the user guide
            if (window.ChromePad && typeof window.ChromePad.renderNotesListBubble === 'function') {
              await window.ChromePad.renderNotesListBubble();
              
              // Find and open the user guide note
              // Wait a bit for the list to render
              setTimeout(async () => {
                try {
                  const { findUserGuideNoteId, renderEditorBubble } = await import('../features/chromepad/chromepad.js');
                  const guideNoteId = await findUserGuideNoteId();
                  if (guideNoteId && typeof renderEditorBubble === 'function') {
                    await renderEditorBubble(guideNoteId, true); // true = open in preview mode (read-only)
                  }
                } catch (err) {
                  log.error('Failed to open user guide note:', err);
                }
              }, 300);
            }
          } catch (err) {
            console.error('Failed to navigate to ChromePad:', err);
          }
        });
      } catch (error) {
        log.error('Failed to show user guide bubble:', error);
      }
    });
    guideGroup.appendChild(guideBtn);
  });
}

// ============================================
// UI HELPER FUNCTIONS
// ============================================

/**
 * Creates a settings group container
 */
function createSettingsGroup(label, container) {
  const group = document.createElement('div');
  group.className = 'settings-group';
  
  if (label) {
    const labelEl = document.createElement('label');
    labelEl.className = 'settings-label';
    labelEl.textContent = label;
    group.appendChild(labelEl);
  }
  
  container.appendChild(group);
  return group;
}

/**
 * Creates a slider group
 */
function createSliderGroup(label, id, value, min, max, step, formatValue, onChange) {
  const group = createSettingsGroup(label, document.createElement('div'));
  const sliderContainer = document.createElement('div');
  sliderContainer.className = 'settings-slider-container';
  
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = id;
  slider.min = min;
  slider.max = max;
  slider.step = step;
  slider.value = value;
  slider.className = 'settings-slider';
  
  const valueDisplay = document.createElement('span');
  valueDisplay.className = 'settings-value';
  valueDisplay.id = `${id}-value`;
  valueDisplay.textContent = formatValue(value);
  
  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    valueDisplay.textContent = formatValue(val);
    onChange(val);
  });
  
  sliderContainer.appendChild(slider);
  sliderContainer.appendChild(valueDisplay);
  group.appendChild(sliderContainer);
  
  return group;
}

/**
 * Creates a toggle switch group
 */
function createToggleGroup(label, id, checked, onChange) {
  const group = createSettingsGroup('', document.createElement('div'));
  const toggleContainer = document.createElement('div');
  toggleContainer.className = 'settings-toggle-container';
  
  const labelEl = document.createElement('label');
  labelEl.className = 'settings-toggle-label';
  labelEl.setAttribute('for', id);
  labelEl.textContent = label;
  
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.id = id;
  toggle.className = 'settings-toggle';
  toggle.checked = checked;
  
  toggle.addEventListener('change', () => {
    onChange(toggle.checked);
  });
  
  toggleContainer.appendChild(toggle);
  toggleContainer.appendChild(labelEl);
  group.appendChild(toggleContainer);
  
  return group;
}

/**
 * Creates a number input group
 */
function createNumberGroup(label, id, value, min, max, step, onChange) {
  const group = createSettingsGroup(label, document.createElement('div'));
  
  const input = document.createElement('input');
  input.type = 'number';
  input.id = id;
  input.className = 'settings-input';
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = value;
  
  input.addEventListener('change', () => {
    const val = Math.max(min, Math.min(max, parseInt(input.value) || min));
    input.value = val;
    onChange(val);
  });
  
  group.appendChild(input);
  return group;
}

/**
 * Creates a select dropdown group
 */
function createSelectGroup(label, id, values, labels, currentValue, onChange) {
  const group = createSettingsGroup(label, document.createElement('div'));
  
  const select = document.createElement('select');
  select.id = id;
  select.className = 'settings-select';
  
  values.forEach((val, idx) => {
    const option = document.createElement('option');
    option.value = val;
    option.textContent = labels[idx] || val;
    if (val === currentValue) option.selected = true;
    select.appendChild(option);
  });
  
  select.addEventListener('change', () => {
    onChange(select.value);
  });
  
  group.appendChild(select);
  return group;
}

/**
 * Creates an accordion section
 */
function createAccordionSection(title, icon, container) {
  const section = document.createElement('div');
  section.className = 'settings-accordion-section';
  
  const header = document.createElement('button');
  header.className = 'settings-accordion-header';
  header.innerHTML = `<span>${icon} ${title}</span><span class="settings-accordion-arrow">▼</span>`;
  
  const content = document.createElement('div');
  content.className = 'settings-accordion-content';
  content.style.display = 'none';
  
  header.addEventListener('click', () => {
    const isOpen = content.style.display !== 'none';
    content.style.display = isOpen ? 'none' : 'block';
    header.querySelector('.settings-accordion-arrow').textContent = isOpen ? '▼' : '▲';
  });
  
  section.appendChild(header);
  section.appendChild(content);
  container.appendChild(section);
  
  return { section, header, content };
}

// ============================================
// MODAL CONTROL
// ============================================

/**
 * Switches to a different category
 */
async function switchCategory(categoryId) {
  currentCategory = categoryId;
  
  // Update sidebar
  const sidebar = document.getElementById('sp-settings-sidebar');
  if (sidebar) {
    sidebar.querySelectorAll('.settings-sidebar-item').forEach(item => {
      item.classList.toggle('active', item.dataset.category === categoryId);
    });
  }
  
  // Update content
  const content = document.getElementById('sp-settings-content');
  if (content) {
    await renderCategoryPanel(content, categoryId);
  }
}

/**
 * Opens the settings modal
 */
export async function openModal() {
  if (!modal) {
    modal = createModal();
    document.body.appendChild(modal);
    
    // Add CSS if not already added
    if (!document.getElementById('settings-modal-styles')) {
      addStyles();
    }
  }
  
  // Initialize sidebar
  const sidebar = document.getElementById('sp-settings-sidebar');
  if (sidebar) {
    createSidebar(sidebar);
  }
  
  // Render initial category
  const content = document.getElementById('sp-settings-content');
  if (content) {
    await renderCategoryPanel(content, currentCategory);
  }
  
  modal.style.display = 'flex';
  log.info('Settings modal opened');
}

/**
 * Closes the settings modal
 */
function closeModal() {
  if (modal) {
    modal.style.display = 'none';
    log.info('Settings modal closed');
  }
}

/**
 * Adds CSS styles for the settings modal
 */
function addStyles() {
  const style = document.createElement('style');
  style.id = 'settings-modal-styles';
  style.textContent = `
    .settings-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .settings-panel {
      width: 90%;
      max-width: 800px;
      max-height: 90vh;
      background: var(--search-input-background, rgba(255,255,255,0.95));
      border: 1px solid var(--sp-input-border, rgba(255,255,255,0.25));
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .settings-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px;
      border-bottom: 1px solid var(--sp-input-border, rgba(0,0,0,0.1));
    }
    .settings-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--search-input-text-color, #333);
    }
    .settings-close {
      appearance: none;
      border: 0;
      background: transparent;
      font-size: 24px;
      cursor: pointer;
      color: var(--search-input-text-color, #333);
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
    }
    .settings-close:hover {
      background: rgba(0,0,0,0.05);
    }
    .settings-container {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .settings-sidebar {
      width: 200px;
      border-right: 1px solid var(--sp-input-border, rgba(0,0,0,0.1));
      background: rgba(0,0,0,0.02);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }
    .settings-sidebar-item {
      appearance: none;
      border: 0;
      background: transparent;
      padding: 12px 16px;
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--search-input-text-color, #333);
      border-left: 3px solid transparent;
    }
    .settings-sidebar-item:hover {
      background: rgba(0,0,0,0.05);
    }
    .settings-sidebar-item.active {
      background: rgba(102,126,234,0.1);
      border-left-color: #667eea;
      font-weight: 600;
    }
    .settings-content {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
    }
    .settings-group {
      margin-bottom: 20px;
    }
    .settings-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--search-input-text-color, #333);
    }
    .settings-input, .settings-select {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--sp-input-border, rgba(0,0,0,0.2));
      border-radius: 8px;
      font-size: 13px;
      background: var(--search-input-background, rgba(255,255,255,0.9));
      color: var(--search-input-text-color, #333);
      box-sizing: border-box;
    }
    .settings-select option {
      background: var(--dropdown-background, rgba(255,255,255,1));
      color: var(--search-input-text-color, #333);
    }
    .settings-slider-container {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .settings-slider {
      flex: 1;
      height: 6px;
    }
    .settings-value {
      min-width: 50px;
      text-align: right;
      font-size: 12px;
      font-weight: 600;
    }
    .settings-toggle-container {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .settings-toggle {
      width: 40px;
      height: 20px;
    }
    .settings-test-btn, .settings-action-btn {
      width: 100%;
      padding: 10px 16px;
      border: 1px solid var(--sp-button-border, rgba(0,0,0,0.2));
      background: var(--accent-brand, #667eea);
      color: white;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .settings-accordion-section {
      margin-bottom: 12px;
      border: 1px solid var(--sp-input-border, rgba(0,0,0,0.1));
      border-radius: 8px;
      overflow: hidden;
    }
    .settings-accordion-header {
      width: 100%;
      padding: 12px 16px;
      background: rgba(0,0,0,0.02);
      border: 0;
      text-align: left;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .settings-accordion-content {
      padding: 16px;
    }
    .settings-voice-toggle {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--sp-input-border, rgba(0,0,0,0.2));
      border-radius: 8px;
      background: var(--search-input-background, rgba(255,255,255,0.9));
      text-align: left;
      cursor: pointer;
    }
    .settings-voice-dropdown {
      position: absolute;
      background: var(--dropdown-background, rgba(255,255,255,0.95));
      border: 1px solid var(--sp-input-border, rgba(0,0,0,0.2));
      border-radius: 8px;
      max-height: 200px;
      overflow-y: auto;
      display: none;
      z-index: 10;
    }
    .settings-voice-item {
      width: 100%;
      padding: 8px 12px;
      border: 0;
      background: transparent;
      text-align: left;
      cursor: pointer;
      color: var(--search-input-text-color, #333);
    }
    .settings-voice-item:hover {
      background: var(--sp-button-bg-hover, rgba(0,0,0,0.1));
    }
  `;
  document.head.appendChild(style);
}

/**
 * Initializes the settings modal
 */
export async function initializeSettingsModal() {
  if (isInitialized) return;
  
  await initializeSettings();
  isInitialized = true;
  log.info('Settings modal initialized');
}

