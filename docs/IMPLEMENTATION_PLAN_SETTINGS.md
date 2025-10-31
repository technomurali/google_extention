# Settings System Implementation Plan

## 📋 Overview

This document outlines the detailed implementation plan for restructuring the settings system into a comprehensive, module-based settings interface with improved organization and extensibility.

**Goal**: Transform the current single-purpose "Speech Settings" modal into a full-featured settings system with:
- Audio Settings (renamed from Speech/Sound)
- Chat Settings
- Tool-specific Settings (for each module)
- Translation Settings
- Context Selection Settings
- Appearance Settings
- Help Settings (new, with configurable onboarding)

---

## 🏗️ Architecture Overview

### Current State
- **Settings Storage**: `chrome.storage.local.speechSettings` (only speech/audio)
- **Settings UI**: Single modal (`sp-speech-settings`) for speech only
- **Settings Access**: Direct import of `speech.js` service functions

### Target State
- **Settings Storage**: `chrome.storage.local.settings` (unified object)
- **Settings UI**: Comprehensive modal with sidebar navigation
- **Settings Service**: Centralized `settings.js` service for all settings
- **Migration**: Automatic migration from old `speechSettings` to new `settings.audio`

---

## 📁 File Structure Changes

### New Files to Create

```
src/
├── services/
│   └── settings.js                    # NEW: Centralized settings service
├── ui/
│   └── settings-modal.js              # NEW: Settings modal UI component
└── utils/
    └── settings-migration.js           # NEW: Migration utility for old settings
```

### Files to Modify

```
src/
├── core/
│   └── config.js                      # MODIFY: Add default settings schema
├── services/
│   └── speech.js                      # MODIFY: Use new settings service
├── sidepanel/
│   ├── sidepanel.html                 # MODIFY: Replace speech modal with settings modal
│   └── sidepanel.js                   # MODIFY: Initialize new settings system
└── features/
    ├── history/
    │   └── history.js                 # MODIFY: Read settings from centralized service
    ├── bookmarks/
    │   └── bookmarks.js               # MODIFY: Read settings from centralized service
    ├── downloads/
    │   └── downloads.js               # MODIFY: Read settings from centralized service
    ├── page-content/
    │   └── page-content.js            # MODIFY: Read settings from centralized service
    └── chromepad/
        └── chromepad.js               # MODIFY: Read settings from centralized service
```

---

## 🔧 Implementation Phases

### Phase 1: Core Settings Infrastructure

#### 1.1 Create Settings Service (`src/services/settings.js`)

**Purpose**: Centralized settings management with:
- Default settings schema
- Get/Set operations with validation
- Migration from old format
- Event system for settings changes

**Key Functions**:
```javascript
- initializeSettings()          // Load from storage, migrate if needed
- getSettings(category)         // Get all or category-specific settings
- updateSettings(category, data) // Update settings with validation
- resetSettings(category)       // Reset to defaults
- exportSettings()              // Export for backup
- importSettings(data)           // Import from backup
```

**Default Settings Schema**:
```javascript
{
  audio: {
    voice: null,
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0
  },
  chat: {
    markdown: true,
    autoScroll: true,
    timestamps: false,
    historyLimit: 100
  },
  tools: {
    chat: { retrieval: true, topM: 12, rerankK: 4, useLLM: true },
    history: { enabled: true, maxResults: 10, dateRange: 'all' },
    bookmarks: { enabled: true, maxResults: 10, searchFolders: true },
    downloads: { enabled: true, maxResults: 10, includeMetadata: true },
    page: { enabled: true, maxChunk: 12000, overlap: 500, autoCapture: true, clearOnSwitch: true },
    chromepad: { enabled: true, autoSave: true, typewriter: true, showSuccess: true }
  },
  translation: {
    enabled: true,
    defaultSource: 'auto',
    recentLimit: 3,
    showCodes: true,
    animationSpeed: 8
  },
  contextSelection: {
    enabled: true,
    maxSnippets: 5,
    maxChars: 800,
    highlight: true,
    useRetrieval: true,
    preIndex: true
  },
  appearance: {
    theme: 'auto',
    fontSize: 'medium',
    inputHeight: { min: 36, max: 40 },
    showIcons: true
  },
  help: {
    showOnLoad: true,          // NEW: Configurable help on load
    showOnboarding: true,
    showTooltips: true
  }
}
```

#### 1.2 Create Migration Utility (`src/utils/settings-migration.js`)

**Purpose**: Migrate existing `speechSettings` to new `settings.audio`

**Migration Logic**:
1. Check for `chrome.storage.local.speechSettings`
2. If exists, copy to `settings.audio`
3. Merge with defaults
4. Remove old `speechSettings` (or keep as backup)
5. Log migration for debugging

---

### Phase 2: Settings UI Component

#### 2.1 Create Settings Modal Component (`src/ui/settings-modal.js`)

**Purpose**: Reusable settings modal with:
- Sidebar navigation (categories)
- Category content panels
- Auto-save on change
- Validation feedback
- Responsive design

**UI Structure**:
```
┌─────────────────────────────────────────┐
│  Settings                          [×]   │
├──────────┬──────────────────────────────┤
│          │                              │
│  🔊 Audio│  [Audio Settings Content]    │
│  💬 Chat │                              │
│  🔍 Tools│                              │
│  🌐 Trans│                              │
│  📝 Ctxt │                              │
│  🎨 Appr │                              │
│  ❓ Help │                              │
│          │                              │
└──────────┴──────────────────────────────┘
```

**Key Features**:
- Tab-style navigation in sidebar
- Content panel updates based on selection
- Smooth transitions
- Keyboard navigation support (ESC to close, Tab navigation)
- Mobile-responsive (stacked layout on narrow screens)

#### 2.2 Update HTML (`src/sidepanel/sidepanel.html`)

**Changes**:
- Remove old `speech-settings-modal` structure
- Add new `settings-modal` structure
- Add settings button in header (keep same button, change behavior)
- Include new CSS for settings modal

---

### Phase 3: Category Implementations

#### 3.1 Audio Settings Panel

**Moves from**: Current speech settings modal  
**Content**:
- Voice selector (dropdown)
- Speed slider (0.5x - 2.0x)
- Pitch slider (0.5 - 2.0)
- Volume slider (0% - 100%)
- Test Voice button

**Implementation**:
- Reuse existing voice loading logic
- Connect to `settings.audio` category
- Auto-save on slider/selection change

#### 3.2 Chat Settings Panel

**New category**  
**Content**:
- Toggle: Enable markdown rendering
- Toggle: Auto-scroll to latest message
- Toggle: Show timestamps on messages
- Number input: Message history limit
- Button: Clear chat history

**Implementation**:
- Create form controls
- Connect to `settings.chat` category
- Clear history button triggers confirmation + action

#### 3.3 Tools Settings Panel

**New category with sub-sections**  
**Structure**: Expandable sections for each tool

**Content per Tool**:

**@iChromeChat**:
- Toggle: Enable retrieval mode
- Number: Top M results (default: 12)
- Number: Rerank K results (default: 4)
- Toggle: Use LLM for reranking

**@BrowserHistory**:
- Toggle: Enable history search
- Number: Max results per query (default: 10)
- Dropdown: Search date range (last 7/30/90 days/all)

**@Bookmarks**:
- Toggle: Enable bookmark search
- Number: Max results per query (default: 10)
- Toggle: Search in folder structure

**@Downloads**:
- Toggle: Enable download search
- Number: Max results per query (default: 10)
- Toggle: Include file metadata

**@Page**:
- Toggle: Enable page capture
- Number: Max chunk size (characters, default: 12000)
- Number: Chunk overlap (characters, default: 500)
- Toggle: Auto-capture on tab switch
- Toggle: Clear context on tab switch

**@ChromePad**:
- Toggle: Enable ChromePad
- Toggle: Auto-save interval (future feature)
- Toggle: Typewriter effect enabled
- Toggle: Show save success message

**Implementation**:
- Accordion-style expandable sections
- Per-tool settings stored in `settings.tools.{toolId}`
- Validation for numeric inputs

#### 3.4 Translation Settings Panel

**New category**  
**Content**:
- Toggle: Enable translation
- Dropdown: Default source language (auto-detect + all supported languages)
- Number: Recently used languages limit (default: 3)
- Toggle: Show language codes
- Number: Animation speed (ms per character, default: 8)

**Implementation**:
- Connect to existing `config.js` translation settings
- Sync with `settings.translation` category

#### 3.5 Context Selection Settings Panel

**New category**  
**Content**:
- Toggle: Enable context selection
- Number: Max context snippets (default: 5)
- Number: Max snippet characters (default: 800)
- Toggle: Highlight selected text
- Toggle: Use retrieval when pills added
- Toggle: Pre-index on pill add

**Implementation**:
- Connect to existing `config.js` contextSelection settings
- Sync with `settings.contextSelection` category

#### 3.6 Appearance Settings Panel

**New category**  
**Content**:
- Dropdown: Theme (auto/light/dark)
- Dropdown: Font size (small/medium/large)
- Range: Input field min height (default: 36px)
- Range: Input field max height (default: 40vh)
- Toggle: Show tool icons

**Implementation**:
- Theme changes apply immediately via CSS variables
- Font size changes apply via CSS classes
- Input height changes update CSS properties

#### 3.7 Help Settings Panel (NEW - User Requirement)

**New category**  
**Content**:
- **Toggle: Show help on application load** ⭐ (Primary requirement)
- Toggle: Show onboarding message
- Toggle: Show tooltips on first use
- Button: View User Guide (opens docs/USER_GUIDE.md or in-app viewer)

**Implementation**:
- `showOnLoad` controls whether onboarding help appears
- Reads from `settings.help.showOnLoad`
- Updates `config.js` onboarding.enabled if needed
- User Guide button: In-app modal or link to documentation

---

### Phase 4: Integration

#### 4.1 Update Speech Service

**File**: `src/services/speech.js`

**Changes**:
- Remove direct storage operations
- Import `settings.js` service
- Use `getSettings('audio')` and `updateSettings('audio', {...})`
- Maintain backward compatibility during migration period

**Migration Path**:
```javascript
// Old way (remove after migration)
const stored = await chrome.storage.local.get('speechSettings');

// New way
const audioSettings = await getSettings('audio');
```

#### 4.2 Update Sidepanel Initialization

**File**: `src/sidepanel/sidepanel.js`

**Changes**:
- Remove `setupSpeechSettings()` function
- Add `setupSettingsModal()` function
- Initialize settings service on load
- Update settings button to open new modal
- Check `settings.help.showOnLoad` to show/hide onboarding

#### 4.3 Update Feature Modules

**Files**: All tool modules (`history.js`, `bookmarks.js`, etc.)

**Changes**:
- Import `settings.js` service
- Read tool-specific settings from centralized service
- Apply settings to tool behavior

**Example**:
```javascript
// In history.js
import { getSettings } from '../services/settings.js';

const toolSettings = await getSettings('tools.history');
const maxResults = toolSettings.maxResults || 10;
```

#### 4.4 Update Config.js

**File**: `src/core/config.js`

**Changes**:
- Keep existing CONFIG structure for UI constants
- Add settings schema documentation
- Note that runtime settings come from `settings.js`, not `config.js`
- Update `onboarding.enabled` to read from `settings.help.showOnLoad`

---

### Phase 5: Testing & Validation

#### 5.1 Migration Testing

**Scenarios**:
1. Fresh install (no old settings) → Should use defaults
2. Existing install with `speechSettings` → Should migrate automatically
3. Settings persistence → Changes should persist across reloads
4. Settings reset → Should restore defaults

#### 5.2 UI Testing

**Scenarios**:
1. Modal opens/closes correctly
2. Sidebar navigation works
3. All form controls update correctly
4. Auto-save works (no explicit save button needed)
5. Validation shows errors appropriately
6. Responsive design works on narrow screens

#### 5.3 Integration Testing

**Scenarios**:
1. Audio settings affect speech behavior
2. Chat settings affect message display
3. Tool settings affect tool behavior
4. Help settings control onboarding display
5. Appearance settings apply immediately

#### 5.4 Edge Cases

**Scenarios**:
1. Storage quota exceeded → Graceful degradation
2. Corrupted settings → Reset to defaults
3. Missing category → Use defaults for that category
4. Invalid values → Validation and correction

---

## 🔄 Data Migration Strategy

### Migration Flow

```
On Extension Load:
1. Initialize Settings Service
2. Check for old speechSettings in storage
3. If found:
   a. Load old speechSettings
   b. Map to settings.audio
   c. Merge with defaults
   d. Save to settings
   e. Optionally: Keep old speechSettings as backup (with _backup suffix)
   f. Log migration completion
4. If not found:
   a. Load existing settings or create defaults
```

### Migration Code Structure

```javascript
// In settings.js
async function migrateOldSettings() {
  const old = await chrome.storage.local.get('speechSettings');
  if (old.speechSettings) {
    // Migrate audio settings
    const audioSettings = {
      voice: old.speechSettings.voice || null,
      rate: old.speechSettings.rate || 1.0,
      pitch: old.speechSettings.pitch || 1.0,
      volume: old.speechSettings.volume || 1.0
    };
    
    // Load existing settings or create new
    const current = await chrome.storage.local.get('settings');
    const settings = current.settings || getDefaultSettings();
    
    // Merge audio settings
    settings.audio = { ...settings.audio, ...audioSettings };
    
    // Save new structure
    await chrome.storage.local.set({ settings });
    
    // Keep backup
    await chrome.storage.local.set({ 
      speechSettings_backup: old.speechSettings 
    });
    
    log.info('Settings migrated successfully');
  }
}
```

---

## 📊 Settings Data Structure

### Storage Format

```javascript
chrome.storage.local.settings = {
  version: "2.0",  // Settings schema version
  audio: { ... },
  chat: { ... },
  tools: { ... },
  translation: { ... },
  contextSelection: { ... },
  appearance: { ... },
  help: { ... }
}
```

### Settings Versioning

- Version field allows future schema migrations
- Breaking changes increment major version
- Non-breaking changes increment minor version

---

## 🎨 UI/UX Design Details

### Settings Modal Styling

**Theme**: Consistent with existing glassmorphism style
- Backdrop blur
- Gradient backgrounds
- Semi-transparent panels
- Smooth animations

**Colors**: Match existing CONFIG colors
- Use CSS variables for consistency
- Support light/dark mode

**Typography**: Match existing font stack
- System fonts
- Consistent sizing

### Interaction Patterns

1. **Auto-save**: Settings save immediately on change (no Save button)
2. **Validation**: Real-time feedback on invalid inputs
3. **Confirmation**: For destructive actions (Clear History, Reset)
4. **Loading States**: Show spinners during async operations
5. **Error Handling**: Toast notifications for errors

### Accessibility

- Keyboard navigation (Tab, Enter, Escape)
- ARIA labels for screen readers
- Focus management
- High contrast support

---

## 🔐 Security & Privacy

### Settings Storage

- All settings stored locally (`chrome.storage.local`)
- No sensitive data in settings
- Settings never leave the device

### Validation

- Type checking for all inputs
- Range validation for numeric inputs
- Enum validation for dropdowns
- Sanitization for string inputs

---

## 📈 Performance Considerations

### Lazy Loading

- Load settings service only when settings modal opens
- Load voice list only when Audio category is accessed
- Lazy-render category panels (only render active panel)

### Caching

- Cache settings in memory after first load
- Invalidate cache only on explicit updates
- Debounce rapid setting changes

### Storage Optimization

- Store only changed settings (not full object each time)
- Use compression if needed (future optimization)
- Clean up old backup settings after migration period

---

## 🚀 Deployment Strategy

### Rollout Plan

1. **Phase 1**: Core infrastructure (behind feature flag)
2. **Phase 2**: UI components (gradual rollout)
3. **Phase 3**: Full integration (all categories)
4. **Phase 4**: Migration of existing users
5. **Phase 5**: Removal of old code

### Feature Flags

```javascript
// In config.js
features: {
  newSettingsSystem: true,  // Enable new settings
  settingsMigration: true,  // Enable migration
}
```

### Backward Compatibility

- Keep old speech modal code until migration complete
- Support both old and new storage formats during transition
- Graceful fallback to defaults if migration fails

---

## 📝 Testing Checklist

### Unit Tests
- [ ] Settings service get/set operations
- [ ] Migration logic correctness
- [ ] Validation functions
- [ ] Default settings loading

### Integration Tests
- [ ] Settings persist across reloads
- [ ] All modules read settings correctly
- [ ] UI updates reflect setting changes
- [ ] Migration preserves user data

### Manual Tests
- [ ] Open settings modal
- [ ] Navigate between categories
- [ ] Modify each setting type
- [ ] Verify changes apply immediately
- [ ] Test on fresh install
- [ ] Test migration from old settings
- [ ] Test Help settings show/hide onboarding
- [ ] Test responsive design

---

## 📚 Documentation Updates

### Files to Update

1. **ARCHITECTURE.md**: Document new settings architecture
2. **USER_GUIDE.md**: Add settings section with screenshots
3. **README.md**: Update settings description
4. **CHANGELOG.md**: Document changes

### New Documentation

1. **Settings API Documentation**: For developers
2. **Settings Schema Reference**: Complete schema documentation

---

## 🐛 Known Issues & Considerations

### Potential Issues

1. **Migration Conflicts**: If user has both old and new settings
   - **Solution**: Prefer new settings, log conflict

2. **Storage Limits**: Chrome storage.local has 10MB limit
   - **Solution**: Monitor size, warn if approaching limit

3. **Settings Validation**: Invalid settings from corrupted storage
   - **Solution**: Validate on load, reset to defaults if invalid

4. **Race Conditions**: Multiple tabs modifying settings
   - **Solution**: Use storage.onChanged listener for sync

### Future Enhancements

1. Settings export/import (JSON file)
2. Settings sync across devices (if user enables)
3. Settings presets (Quick Setup modes)
4. Advanced settings (developer mode)
5. Settings search (find setting quickly)

---

## ✅ Success Criteria

### Functional Requirements
- ✅ All settings categories implemented
- ✅ Settings persist correctly
- ✅ Migration from old settings works
- ✅ Help settings control onboarding display
- ✅ All tools read from centralized settings

### Non-Functional Requirements
- ✅ Settings modal loads in < 200ms
- ✅ Settings changes apply in < 100ms
- ✅ No data loss during migration
- ✅ Backward compatible during transition
- ✅ Responsive design works on all screen sizes

---

## 📅 Estimated Timeline

- **Phase 1**: Core Infrastructure - 2-3 hours
- **Phase 2**: Settings UI Component - 3-4 hours
- **Phase 3**: Category Implementations - 4-5 hours
- **Phase 4**: Integration - 2-3 hours
- **Phase 5**: Testing & Bug Fixes - 2-3 hours

**Total Estimated Time**: 13-18 hours

---

## 🎯 Priority Order

### Must Have (P0)
1. Settings service infrastructure
2. Audio settings (migrate existing)
3. Help settings (showOnLoad toggle)
4. Settings modal UI

### Should Have (P1)
1. Chat settings
2. Tools settings (basic)
3. Appearance settings
4. Migration utility

### Nice to Have (P2)
1. Translation settings
2. Context selection settings
3. Settings export/import
4. Advanced validation

---

End of Implementation Plan
