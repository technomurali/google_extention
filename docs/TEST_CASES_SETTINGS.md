# Settings System - Manual Test Cases

**Version:** 2.0  
**Date:** 2024  
**Scope:** Complete settings system functionality

---

## Test Environment Setup

### Prerequisites
1. Chrome Extension loaded in developer mode
2. Open Chrome DevTools (F12) → Console tab (for checking logs)
3. Chrome DevTools → Application tab → Storage → Local Storage (for inspecting stored data)

### Test Scenarios
- **Fresh Install**: New installation with no existing settings
- **Migration**: Existing installation with old `speechSettings` data
- **Normal Usage**: Standard user interaction flows

---

## TEST GROUP 1: Settings Service Initialization

### TC-1.1: Fresh Install - Default Settings
**Priority:** High  
**Preconditions:** Fresh extension installation, no existing settings

**Steps:**
1. Open the extension side panel
2. Open browser DevTools Console
3. Check for any initialization errors in console

**Expected Results:**
- ✅ No errors in console
- ✅ Settings button (⚙️) visible in top-right corner
- ✅ Settings modal opens when clicked
- ✅ All settings panels display with default values

**Verify:**
- Go to Chrome DevTools → Application → Storage → Local Storage
- Find key: `settings`
- Verify structure matches default schema:
  ```json
  {
    "version": "2.0",
    "audio": { "voice": null, "rate": 1.0, "pitch": 1.0, "volume": 1.0 },
    "chat": { "markdown": true, "autoScroll": true, "timestamps": false, "historyLimit": 100 },
    "tools": { ... },
    "translation": { ... },
    "contextSelection": { ... },
    "appearance": { ... },
    "help": { ... }
  }
  ```

---

### TC-1.2: Migration from Old Format
**Priority:** High  
**Preconditions:** Extension with existing `speechSettings` in storage

**Steps:**
1. Before testing, manually add old format to storage:
   - Chrome DevTools → Application → Storage → Local Storage
   - Add key: `speechSettings`
   - Value: `{"voice": "Google UK English Female", "rate": 1.2, "pitch": 1.1, "volume": 0.8}`
2. Reload the extension
3. Open settings modal
4. Navigate to Audio Settings panel

**Expected Results:**
- ✅ No errors during migration
- ✅ Audio settings show migrated values:
  - Voice: "Google UK English Female" (or equivalent)
  - Rate: 1.2
  - Pitch: 1.1
  - Volume: 0.8
- ✅ Old `speechSettings` key removed from storage
- ✅ New `settings` key created with migrated data

**Verify in Console:**
- Check for log message: "Migrated old speechSettings to new format"

---

### TC-1.3: Settings Modal UI Load
**Priority:** High

**Steps:**
1. Click settings button (⚙️)
2. Observe modal appearance

**Expected Results:**
- ✅ Modal opens smoothly with fade-in animation
- ✅ Sidebar visible on left with all categories
- ✅ Default panel (Audio Settings) visible on right
- ✅ Modal overlay darkens background
- ✅ Close button (X) visible in top-right
- ✅ Modal is responsive (resize window, check layout)

---

## TEST GROUP 2: Audio Settings Panel

### TC-2.1: Voice Selection
**Priority:** High

**Steps:**
1. Open Settings → Audio Settings
2. Click "Voice" dropdown
3. Select a different voice from list
4. Click "Test Voice" button
5. Close settings modal
6. Use speech feature in chat bubble
7. Reopen settings

**Expected Results:**
- ✅ Voice dropdown shows available voices
- ✅ Selected voice persists after closing modal
- ✅ Test voice plays with selected voice
- ✅ Speech in chat bubbles uses selected voice
- ✅ Setting saved in `settings.audio.voice`

---

### TC-2.2: Speed (Rate) Adjustment
**Priority:** High

**Steps:**
1. Open Settings → Audio Settings
2. Drag "Speed" slider to 1.5
3. Observe value display updates in real-time
4. Click "Test Voice" button
5. Drag slider to 0.8
6. Test again
7. Close and reopen settings

**Expected Results:**
- ✅ Slider moves smoothly
- ✅ Value displays as "1.5x" (or similar format)
- ✅ Test voice plays at adjusted speed
- ✅ Speed persists after modal close
- ✅ Min: 0.5, Max: 2.0 enforced
- ✅ Setting saved correctly

---

### TC-2.3: Pitch Adjustment
**Priority:** Medium

**Steps:**
1. Open Settings → Audio Settings
2. Adjust Pitch slider to 1.3
3. Test voice
4. Adjust to 0.7
5. Test voice
6. Verify persistence

**Expected Results:**
- ✅ Pitch slider works correctly
- ✅ Value displays as "1.3" or "1.3x"
- ✅ Voice pitch changes noticeably in test
- ✅ Setting persists

---

### TC-2.4: Volume Adjustment
**Priority:** High

**Steps:**
1. Open Settings → Audio Settings
2. Adjust Volume slider
3. Test voice at different volumes (0%, 50%, 100%)
4. Verify persistence

**Expected Results:**
- ✅ Volume slider works
- ✅ Value displays as percentage (e.g., "50%")
- ✅ Actual volume changes in test
- ✅ Setting persists
- ✅ Min: 0, Max: 100 (1.0)

---

### TC-2.5: Test Voice Button
**Priority:** High

**Steps:**
1. Open Settings → Audio Settings
2. Configure voice, speed, pitch, volume
3. Click "Test Voice" button
4. Click again while playing

**Expected Results:**
- ✅ Test plays: "Hello! This is a test of the text to speech feature."
- ✅ Uses current settings (voice, speed, pitch, volume)
- ✅ Button can stop playback if clicked again
- ✅ Test completes without errors

---

## TEST GROUP 3: Chat Settings Panel

### TC-3.1: Markdown Rendering Toggle
**Priority:** High

**Steps:**
1. Open Settings → Chat Settings
2. Toggle "Enable Markdown Rendering" OFF
3. Send a message with markdown (e.g., `**bold**`, `*italic*`, `# heading`)
4. Toggle ON
5. Send another markdown message

**Expected Results:**
- ✅ Toggle switches state immediately
- ✅ When OFF: Markdown displays as plain text
- ✅ When ON: Markdown renders correctly
- ✅ Setting persists
- ✅ Changes apply to new messages (not existing)

---

### TC-3.2: Auto-scroll Toggle
**Priority:** Medium

**Steps:**
1. Open Settings → Chat Settings
2. Disable "Auto-scroll to Latest Message"
3. Send multiple messages (scroll to top manually)
4. Enable auto-scroll
5. Send another message

**Expected Results:**
- ✅ When disabled: Chat doesn't auto-scroll to bottom
- ✅ When enabled: Chat scrolls to latest message automatically
- ✅ Setting persists

---

### TC-3.3: Timestamps Toggle
**Priority:** Low

**Steps:**
1. Open Settings → Chat Settings
2. Enable "Show Timestamps on Messages"
3. Send a message
4. Disable timestamps
5. Send another message

**Expected Results:**
- ✅ When enabled: Timestamps visible on messages
- ✅ When disabled: No timestamps shown
- ✅ Setting persists

---

### TC-3.4: History Limit
**Priority:** Medium

**Steps:**
1. Open Settings → Chat Settings
2. Change "Message History Limit" to 50
3. Send 60+ messages
4. Check if only 50 messages retained
5. Change limit to 200

**Expected Results:**
- ✅ Number input accepts valid range (1-1000)
- ✅ Old messages pruned when limit exceeded
- ✅ Setting persists

---

### TC-3.5: Clear History Button
**Priority:** High

**Steps:**
1. Open Settings → Chat Settings
2. Send several messages
3. Click "Clear Chat History"
4. Confirm in dialog
5. Cancel dialog on second attempt

**Expected Results:**
- ✅ Confirmation dialog appears
- ✅ On confirm: All messages removed
- ✅ On cancel: No changes
- ✅ History cleared immediately

---

## TEST GROUP 4: Tools Settings Panel

### TC-4.1: Accordion UI Behavior
**Priority:** Medium

**Steps:**
1. Open Settings → Tools Settings
2. Observe accordion sections for each tool
3. Click to expand/collapse sections

**Expected Results:**
- ✅ All 6 tools visible: @iChromeChat, @BrowserHistory, @Bookmarks, @Downloads, @Page, @ChromePad
- ✅ Sections expand/collapse smoothly
- ✅ Only one section open at a time (or multiple - check design intent)
- ✅ Icons visible next to tool names

---

### TC-4.2: @iChromeChat Settings
**Priority:** High

**Steps:**
1. Expand "@iChromeChat" section
2. Toggle "Enable Retrieval Mode"
3. Adjust "Top M Results" to 20
4. Adjust "Rerank K Results" to 6
5. Toggle "Use LLM for Reranking"
6. Test retrieval functionality

**Expected Results:**
- ✅ All toggles work
- ✅ Number inputs accept valid ranges
- ✅ Settings persist
- ✅ Retrieval behavior changes according to settings

---

### TC-4.3: @BrowserHistory Settings
**Priority:** High

**Steps:**
1. Expand "@BrowserHistory" section
2. Toggle "Enabled" OFF
3. Try using @BrowserHistory tool
4. Toggle back ON
5. Adjust "Max Results per Query" to 15
6. Change "Search Date Range" to "Last 7 days"
7. Test history search

**Expected Results:**
- ✅ When disabled: Tool doesn't respond or shows error
- ✅ When enabled: Tool works normally
- ✅ Max results limit applied to search results
- ✅ Date range affects search scope
- ✅ Settings persist

---

### TC-4.4: @Bookmarks Settings
**Priority:** Medium

**Steps:**
1. Expand "@Bookmarks" section
2. Adjust "Max Results per Query"
3. Toggle "Search in Folder Structure"
4. Test bookmark search

**Expected Results:**
- ✅ Max results limits bookmark results
- ✅ Folder structure toggle affects search behavior
- ✅ Settings persist

---

### TC-4.5: @Downloads Settings
**Priority:** Medium

**Steps:**
1. Expand "@Downloads" section
2. Adjust "Max Results per Query"
3. Toggle "Include File Metadata"
4. Test downloads search

**Expected Results:**
- ✅ Max results limits download results
- ✅ Metadata toggle affects result format
- ✅ Settings persist

---

### TC-4.6: @Page Settings
**Priority:** High

**Steps:**
1. Expand "@Page" section
2. Adjust "Max Chunk Size" to 15000
3. Adjust "Chunk Overlap" to 800
4. Toggle "Auto-capture on Tab Switch"
5. Toggle "Clear Context on Tab Switch"
6. Test page capture

**Expected Results:**
- ✅ Chunk size affects how content is split
- ✅ Overlap affects chunk boundaries
- ✅ Auto-capture toggle affects tab switch behavior
- ✅ Clear context toggle affects persistence
- ✅ Settings persist
- ✅ Changes visible in next page capture

**Verify:**
- Capture a long page
- Check chunk sizes in UI
- Switch tabs and observe behavior

---

### TC-4.7: @ChromePad Settings
**Priority:** Medium

**Steps:**
1. Expand "@ChromePad" section
2. Toggle all ChromePad settings (Enable, Auto-save, Typewriter, Show Success)
3. Test ChromePad functionality

**Expected Results:**
- ✅ All toggles work
- ✅ Typewriter effect respects setting
- ✅ Auto-save respects setting
- ✅ Success messages respect setting
- ✅ Settings persist

---

## TEST GROUP 5: Translation Settings Panel

### TC-5.1: Enable Translation Toggle
**Priority:** High

**Steps:**
1. Open Settings → Translation Settings
2. Disable "Enable Translation"
3. Try to translate a message
4. Re-enable translation

**Expected Results:**
- ✅ When disabled: Translation buttons/menus hidden or disabled
- ✅ When enabled: Translation features available
- ✅ Setting persists

---

### TC-5.2: Default Source Language
**Priority:** Medium

**Steps:**
1. Open Settings → Translation Settings
2. Change "Default Source Language" dropdown
3. Select different languages (Auto, English, Spanish, etc.)
4. Use translation feature

**Expected Results:**
- ✅ Dropdown shows all available languages
- ✅ Selected language persists
- ✅ Translation uses selected default source language
- ✅ "Auto-detect" option works

---

### TC-5.3: Recently Used Languages Limit
**Priority:** Low

**Steps:**
1. Open Settings → Translation Settings
2. Adjust "Recently Used Languages Limit" to 5
3. Use translation with multiple languages
4. Check if recent languages list respects limit

**Expected Results:**
- ✅ Number input accepts valid range (1-10)
- ✅ Recent languages list limited to specified number
- ✅ Setting persists

---

### TC-5.4: Show Language Codes Toggle
**Priority:** Low

**Steps:**
1. Open Settings → Translation Settings
2. Toggle "Show Language Codes"
3. Check translation menu/language list

**Expected Results:**
- ✅ When enabled: Language codes visible (e.g., "English (en)")
- ✅ When disabled: Only language names shown
- ✅ Setting persists

---

### TC-5.5: Animation Speed
**Priority:** Low

**Steps:**
1. Open Settings → Translation Settings
2. Adjust "Animation Speed" (ms per character)
3. Translate some text and observe animation

**Expected Results:**
- ✅ Animation speed changes based on setting
- ✅ Lower values = faster animation
- ✅ Higher values = slower animation
- ✅ Setting persists

---

## TEST GROUP 6: Context Selection Settings Panel

### TC-6.1: Enable Context Selection Toggle
**Priority:** High

**Steps:**
1. Open Settings → Context Selection Settings
2. Disable "Enable Context Selection"
3. Try to select text and add as context
4. Re-enable

**Expected Results:**
- ✅ When disabled: Context selection feature disabled
- ✅ When enabled: Context selection works
- ✅ Setting persists

---

### TC-6.2: Max Context Snippets
**Priority:** Medium

**Steps:**
1. Open Settings → Context Selection Settings
2. Adjust "Max Context Snippets" to 3
3. Add multiple context snippets
4. Verify limit enforced

**Expected Results:**
- ✅ Number input accepts valid range (1-20)
- ✅ Maximum snippets limit enforced
- ✅ Setting persists

---

### TC-6.3: Max Snippet Characters
**Priority:** Medium

**Steps:**
1. Open Settings → Context Selection Settings
2. Set "Max Snippet Characters" to 500
3. Select and add long text as context
4. Verify character limit enforced

**Expected Results:**
- ✅ Number input accepts valid range (100-5000)
- ✅ Snippets truncated to max characters
- ✅ Setting persists

---

### TC-6.4: Highlight Selected Text
**Priority:** Low

**Steps:**
1. Open Settings → Context Selection Settings
2. Toggle "Highlight Selected Text"
3. Select text in chat/messages
4. Observe highlighting behavior

**Expected Results:**
- ✅ When enabled: Selected text highlighted visually
- ✅ When disabled: No highlighting
- ✅ Setting persists

---

### TC-6.5: Retrieval and Pre-index Settings
**Priority:** Medium

**Steps:**
1. Open Settings → Context Selection Settings
2. Toggle "Use Retrieval When Pills Added"
3. Toggle "Pre-index on Pill Add"
4. Add context pills and observe behavior

**Expected Results:**
- ✅ Retrieval toggle affects whether retrieval runs
- ✅ Pre-index toggle affects indexing behavior
- ✅ Settings persist

---

## TEST GROUP 7: Appearance Settings Panel

### TC-7.1: Theme Selection
**Priority:** High

**Steps:**
1. Open Settings → Appearance Settings
2. Change theme to "Dark"
3. Observe UI changes
4. Change to "Light"
5. Change to "Auto"
6. Close and reopen extension

**Expected Results:**
- ✅ Theme changes apply immediately
- ✅ Dark theme: Dark colors applied
- ✅ Light theme: Light colors applied
- ✅ Auto: Uses system preference
- ✅ Setting persists after reload

---

### TC-7.2: Font Size Selection
**Priority:** Medium

**Steps:**
1. Open Settings → Appearance Settings
2. Change font size to "Small"
3. Observe text size changes
4. Change to "Large"
5. Verify persistence

**Expected Results:**
- ✅ Font size changes apply immediately
- ✅ All text (messages, input, UI) scales appropriately
- ✅ Setting persists

---

### TC-7.3: Input Field Height Controls
**Priority:** Medium

**Steps:**
1. Open Settings → Appearance Settings
2. Adjust "Input Field Min Height" to 48px
3. Adjust "Input Field Max Height" to 50% viewport
4. Type long text in input field
5. Verify height constraints

**Expected Results:**
- ✅ Min height enforced (input doesn't shrink below)
- ✅ Max height enforced (input doesn't grow above)
- ✅ Changes apply immediately
- ✅ Setting persists

---

### TC-7.4: Show Tool Icons Toggle
**Priority:** Low

**Steps:**
1. Open Settings → Appearance Settings
2. Disable "Show Tool Icons"
3. Check tool mentions/pills in chat
4. Re-enable

**Expected Results:**
- ✅ When disabled: Tool icons hidden (only text shown)
- ✅ When enabled: Icons visible with tool names
- ✅ Setting persists

---

## TEST GROUP 8: Help Settings Panel

### TC-8.1: Show Help on Load (PRIMARY)
**Priority:** Critical

**Steps:**
1. Open Settings → Help Settings
2. Enable "Show Help on Application Load"
3. Close extension completely
4. Reopen extension side panel
5. Disable the setting
6. Close and reopen

**Expected Results:**
- ✅ When enabled: Onboarding/help message appears on load
- ✅ When disabled: No help message on load
- ✅ Setting persists
- ✅ Behavior matches `window.CONFIG.onboarding.enabled`

---

### TC-8.2: Show Onboarding Toggle
**Priority:** Medium

**Steps:**
1. Open Settings → Help Settings
2. Toggle "Show Onboarding Message"
3. Trigger onboarding flow (if applicable)
4. Verify behavior

**Expected Results:**
- ✅ Toggle affects onboarding display
- ✅ Setting persists

---

### TC-8.3: Show Tooltips Toggle
**Priority:** Low

**Steps:**
1. Open Settings → Help Settings
2. Toggle "Show Tooltips on First Use"
3. Use features for first time
4. Verify tooltip behavior

**Expected Results:**
- ✅ Tooltips shown/hidden based on setting
- ✅ Setting persists

---

### TC-8.4: View User Guide Button
**Priority:** Low

**Steps:**
1. Open Settings → Help Settings
2. Click "View User Guide" button

**Expected Results:**
- ✅ User guide opens (new tab or modal)
- ✅ Guide is readable and formatted correctly

---

## TEST GROUP 9: Settings Persistence

### TC-9.1: Auto-Save on Change
**Priority:** Critical

**Steps:**
1. Open Settings → Audio Settings
2. Change voice, speed, pitch, volume
3. Don't click any "Save" button
4. Close settings modal immediately
5. Reload extension
6. Reopen settings

**Expected Results:**
- ✅ All changes saved automatically (no Save button needed)
- ✅ Settings persist after reload
- ✅ No data loss

---

### TC-9.2: Multiple Category Changes
**Priority:** High

**Steps:**
1. Make changes across multiple categories:
   - Audio: Change voice and speed
   - Chat: Change markdown and history limit
   - Tools: Change history max results
   - Appearance: Change theme
2. Close settings
3. Reload extension
4. Verify all changes persisted

**Expected Results:**
- ✅ All changes saved
- ✅ No conflicts between categories
- ✅ All settings persist correctly

---

### TC-9.3: Settings Validation
**Priority:** High

**Steps:**
1. Open Settings → Audio Settings
2. Try to set Speed to 0.3 (below min)
3. Try to set Speed to 2.5 (above max)
4. Try to set Volume to -0.1
5. Try to set invalid number inputs

**Expected Results:**
- ✅ Values clamped to valid ranges
- ✅ Invalid inputs rejected or corrected
- ✅ No crashes or errors
- ✅ Default values used if invalid

---

## TEST GROUP 10: Integration Testing

### TC-10.1: Settings Applied to Features
**Priority:** Critical

**Steps:**
1. Change audio settings (voice, speed, pitch, volume)
2. Use speech feature in chat
3. Verify speech uses new settings

**Expected Results:**
- ✅ Speech uses configured voice
- ✅ Speech uses configured speed
- ✅ Speech uses configured pitch
- ✅ Speech uses configured volume

---

### TC-10.2: Tool Settings Integration
**Priority:** Critical

**Steps:**
1. Set History max results to 5
2. Use @BrowserHistory tool
3. Verify only 5 results shown
4. Set Bookmarks max results to 8
5. Use @Bookmarks tool
6. Verify 8 results limit

**Expected Results:**
- ✅ History respects max results setting
- ✅ Bookmarks respects max results setting
- ✅ Downloads respects max results setting
- ✅ Page chunking respects chunk size settings

---

### TC-10.3: Help Settings Integration
**Priority:** High

**Steps:**
1. Disable "Show Help on Application Load"
2. Reload extension
3. Verify no onboarding shown
4. Enable setting
5. Reload extension
6. Verify onboarding shown

**Expected Results:**
- ✅ Help setting controls onboarding display
- ✅ Behavior matches config.onboarding.enabled

---

## TEST GROUP 11: Edge Cases & Error Handling

### TC-11.1: Storage Quota Exceeded
**Priority:** Medium

**Steps:**
1. Fill Chrome storage with large amounts of data
2. Try to save settings
3. Observe error handling

**Expected Results:**
- ✅ Graceful error handling
- ✅ User notified if save fails
- ✅ Extension continues to function
- ✅ Partial saves don't corrupt data

---

### TC-11.2: Corrupted Settings
**Priority:** High

**Steps:**
1. Manually corrupt settings in storage:
   - Chrome DevTools → Application → Storage → Local Storage
   - Edit `settings` key with invalid JSON
2. Reload extension
3. Try to open settings

**Expected Results:**
- ✅ Extension recovers gracefully
- ✅ Default settings applied
- ✅ No crashes
- ✅ Settings modal still opens

---

### TC-11.3: Missing Categories
**Priority:** Medium

**Steps:**
1. Manually remove a category from settings storage
2. Reload extension
3. Try to access that category in settings

**Expected Results:**
- ✅ Default values used for missing category
- ✅ Settings modal still functional
- ✅ No errors

---

### TC-11.4: Concurrent Settings Changes
**Priority:** Low

**Steps:**
1. Open settings modal in two side panel instances (if possible)
2. Make different changes in each
3. Observe behavior

**Expected Results:**
- ✅ Last write wins (or appropriate conflict resolution)
- ✅ No data corruption
- ✅ Settings consistent after both close

---

### TC-11.5: Rapid Settings Changes
**Priority:** Low

**Steps:**
1. Rapidly toggle settings on/off multiple times
2. Drag sliders quickly back and forth
3. Change multiple settings rapidly

**Expected Results:**
- ✅ All changes captured
- ✅ No performance issues
- ✅ No UI freezing
- ✅ Final state correct

---

## TEST GROUP 12: UI/UX Testing

### TC-12.1: Modal Navigation
**Priority:** High

**Steps:**
1. Click each category in sidebar
2. Verify correct panel loads
3. Navigate between panels multiple times
4. Test keyboard navigation (if implemented)

**Expected Results:**
- ✅ Each category loads correct panel
- ✅ Smooth transitions between panels
- ✅ Active category highlighted in sidebar
- ✅ Panel content updates correctly

---

### TC-12.2: Modal Responsiveness
**Priority:** Medium

**Steps:**
1. Open settings modal
2. Resize browser window
3. Test on different window sizes
4. Check mobile/responsive view (if applicable)

**Expected Results:**
- ✅ Modal adapts to window size
- ✅ Content remains readable
- ✅ No horizontal scrolling
- ✅ Layout doesn't break

---

### TC-12.3: Modal Close Methods
**Priority:** Medium

**Steps:**
1. Open settings modal
2. Close via X button
3. Reopen and close via overlay click
4. Reopen and press Escape key (if implemented)
5. Reopen and navigate away

**Expected Results:**
- ✅ All close methods work
- ✅ Settings saved before close
- ✅ Modal state resets on reopen

---

### TC-12.4: Form Controls Behavior
**Priority:** High

**Steps:**
1. Test all slider controls (smooth dragging)
2. Test all toggle switches (smooth animation)
3. Test all number inputs (validation, min/max)
4. Test all dropdown selects

**Expected Results:**
- ✅ All controls responsive
- ✅ Visual feedback during interaction
- ✅ Values update in real-time
- ✅ No lag or stuttering

---

## TEST GROUP 13: Performance Testing

### TC-13.1: Settings Modal Load Time
**Priority:** Low

**Steps:**
1. Open settings modal
2. Measure time to fully render
3. Navigate between panels
4. Measure panel switch time

**Expected Results:**
- ✅ Modal opens within 200ms
- ✅ Panel switches within 100ms
- ✅ No noticeable delays

---

### TC-13.2: Settings Save Performance
**Priority:** Medium

**Steps:**
1. Make multiple rapid changes
2. Observe save latency
3. Change many settings at once
4. Measure time to persist

**Expected Results:**
- ✅ Saves don't block UI
- ✅ No lag during interaction
- ✅ Background saves work correctly

---

## TEST GROUP 14: Accessibility Testing

### TC-14.1: Keyboard Navigation
**Priority:** Medium

**Steps:**
1. Open settings modal
2. Navigate using Tab key
3. Activate controls with Enter/Space
4. Use arrow keys on sliders/selects

**Expected Results:**
- ✅ All controls keyboard accessible
- ✅ Focus indicators visible
- ✅ Logical tab order
- ✅ Keyboard shortcuts work

---

### TC-14.2: Screen Reader Compatibility
**Priority:** Low

**Steps:**
1. Enable screen reader (NVDA/JAWS/ChromeVox)
2. Navigate settings modal
3. Verify all controls announced

**Expected Results:**
- ✅ Controls have proper labels
- ✅ State changes announced
- ✅ Navigation understandable
- ✅ Error messages announced

---

## TEST GROUP 15: Regression Testing

### TC-15.1: Existing Features Still Work
**Priority:** Critical

**Steps:**
1. Test all existing features:
   - Chat functionality
   - Tool usage (@History, @Bookmarks, etc.)
   - Speech synthesis
   - Translation
   - Context selection
   - ChromePad

**Expected Results:**
- ✅ All features work as before
- ✅ No functionality broken by settings system
- ✅ Settings enhance (not replace) existing behavior

---

### TC-15.2: Backward Compatibility
**Priority:** High

**Steps:**
1. Test with existing user data
2. Verify old settings format migrated
3. Check no data loss occurred

**Expected Results:**
- ✅ Old settings migrated correctly
- ✅ No data loss
- ✅ Users can continue seamlessly

---

## Test Reporting Template

For each test case, document:

```
Test Case ID: TC-X.X
Status: ✅ PASS / ❌ FAIL / ⚠️ PARTIAL
Execution Date: YYYY-MM-DD
Tester Name: [Your Name]
Browser Version: Chrome [Version]
Extension Version: [Version]

Steps Executed:
[Brief description]

Actual Results:
[What actually happened]

Issues Found:
[Any bugs or unexpected behavior]

Screenshots:
[Attach if relevant]

Notes:
[Additional observations]
```

---

## Known Issues / Limitations

Document any known issues discovered during testing here:

1. [Issue description]
2. [Issue description]

---

## Test Completion Checklist

- [ ] All Critical (Priority: Critical) tests executed
- [ ] All High priority tests executed
- [ ] All Medium priority tests executed
- [ ] At least 50% of Low priority tests executed
- [ ] All failures documented with steps to reproduce
- [ ] Screenshots captured for visual issues
- [ ] Console errors logged
- [ ] Edge cases tested
- [ ] Performance acceptable
- [ ] No data loss observed

---

**End of Test Cases Document**

