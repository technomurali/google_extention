# Tool Labels Customization Guide

## Overview

The iChrome extension now supports fully customizable tool labels! You can change display names, icons, and add aliases while maintaining all functionality.

## Where to Customize

Edit the file: **`src/core/config.js`**

Look for the `toolMentions` section (around line 323):

```javascript
toolMentions: {
  tools: [
    { id: 'chat', label: '@GeneralChat', icon: '💬', aliases: ['@chat', '@general'] },
    { id: 'page', label: '@Page', icon: '📃', aliases: ['@webpage', '@content'] },
    { id: 'history', label: '@History', icon: '📚', aliases: ['@browsing', '@recent'] },
    { id: 'bookmarks', label: '@Bookmarks', icon: '🔖', aliases: ['@saved', '@favorites'] },
    { id: 'downloads', label: '@Downloads', icon: '📥', aliases: ['@files'] },
    { id: 'chromepad', label: '@ChromePad', icon: '📝', aliases: ['@notes', '@notepad'] },
  ]
}
```

## What Can You Customize?

### ✅ Safe to Change

| Property | Description | Example |
|----------|-------------|---------|
| `label` | Display name shown in menu | `@AI`, `@Chat`, `@MyTool` |
| `icon` | Emoji displayed next to label | `🤖`, `🌐`, `📋` |
| `aliases` | Alternative names that work too | `['@bot', '@assistant']` |

### ⚠️ Must Stay Unchanged

| Property | Description | Why |
|----------|-------------|-----|
| `id` | Internal identifier | Used by code to route messages |

**Valid IDs:** `chat`, `page`, `history`, `bookmarks`, `downloads`, `chromepad`

## Customization Examples

### Example 1: Simplified Labels

```javascript
tools: [
  { id: 'chat', label: '@AI', icon: '🤖', aliases: ['@bot'] },
  { id: 'page', label: '@Web', icon: '🌐', aliases: ['@site'] },
  { id: 'history', label: '@Past', icon: '⏮️', aliases: ['@back'] },
  { id: 'bookmarks', label: '@Saved', icon: '⭐', aliases: ['@stars'] },
  { id: 'downloads', label: '@Files', icon: '📁', aliases: ['@dl'] },
  { id: 'chromepad', label: '@Notes', icon: '📓', aliases: ['@memo'] },
]
```

### Example 2: Spanish Localization

```javascript
tools: [
  { id: 'chat', label: '@ChatGeneral', icon: '💬', aliases: ['@charla', '@hablar'] },
  { id: 'page', label: '@Pagina', icon: '📃', aliases: ['@web', '@sitio'] },
  { id: 'history', label: '@Historial', icon: '📚', aliases: ['@navegacion'] },
  { id: 'bookmarks', label: '@Marcadores', icon: '🔖', aliases: ['@favoritos'] },
  { id: 'downloads', label: '@Descargas', icon: '📥', aliases: ['@archivos'] },
  { id: 'chromepad', label: '@Notas', icon: '📝', aliases: ['@bloc'] },
]
```

### Example 3: Professional Branding

```javascript
tools: [
  { id: 'chat', label: '@Assistant', icon: '👔', aliases: ['@help', '@support'] },
  { id: 'page', label: '@PageAnalyzer', icon: '🔍', aliases: ['@analyze'] },
  { id: 'history', label: '@BrowsingHistory', icon: '🕐', aliases: ['@timeline'] },
  { id: 'bookmarks', label: '@SavedPages', icon: '📌', aliases: ['@pins'] },
  { id: 'downloads', label: '@FileManager', icon: '💾', aliases: ['@storage'] },
  { id: 'chromepad', label: '@Workspace', icon: '🗂️', aliases: ['@docs'] },
]
```

### Example 4: Fun/Casual

```javascript
tools: [
  { id: 'chat', label: '@BFF', icon: '🤗', aliases: ['@buddy', '@pal'] },
  { id: 'page', label: '@ThisPage', icon: '👀', aliases: ['@here'] },
  { id: 'history', label: '@Memory', icon: '🧠', aliases: ['@remember'] },
  { id: 'bookmarks', label: '@Faves', icon: '❤️', aliases: ['@loves'] },
  { id: 'downloads', label: '@MyFiles', icon: '🗃️', aliases: ['@stuff'] },
  { id: 'chromepad', label: '@Diary', icon: '📖', aliases: ['@journal'] },
]
```

## How It Works

### User Experience Flow

1. **User types:** `@`
   - Autocomplete menu appears with your custom labels

2. **User filters:** `@his`
   - Shows only tools matching "his" (e.g., `@Historial` if you set Spanish labels)

3. **User selects:** Clicks or presses Enter
   - Tool label inserted: `@Historial `

4. **User types query:** `@Historial show recent sites`
   - System parses: `tool = "history"`, `query = "show recent sites"`

5. **System routes:** Message sent to history feature
   - Behavior unchanged regardless of label!

### Alias Support

Aliases let users type shortcuts:

```javascript
{ id: 'chat', label: '@GeneralChat', aliases: ['@chat', '@ai'] }
```

**All of these work:**
- `@GeneralChat what is AI?` ✅
- `@chat what is AI?` ✅
- `@ai what is AI?` ✅

All resolve to the same `chat` tool!

## Testing Your Customization

After editing `config.js`:

1. **Reload Extension:**
   - Go to `chrome://extensions`
   - Click reload button for iChrome

2. **Test @-Menu:**
   - Open sidepanel
   - Type `@`
   - ✅ Verify your custom labels appear

3. **Test Selection:**
   - Select a tool with Enter or click
   - ✅ Verify label inserted correctly

4. **Test Aliases:**
   - Type an alias (e.g., `@chat`)
   - ✅ Verify autocomplete works
   - Send message
   - ✅ Verify correct tool activated

5. **Test Functionality:**
   - Send queries with each tool
   - ✅ Verify all features work normally

## Troubleshooting

### Labels don't appear after editing config

**Solution:** Reload the extension:
```
chrome://extensions → Click "Reload" button
```

### Alias not working

**Check:**
1. Alias starts with `@`
2. Alias is in array: `aliases: ['@alias1', '@alias2']`
3. Extension reloaded after change

### Tool not routing correctly

**Check:**
1. `id` field unchanged (must be: `chat`, `page`, `history`, `bookmarks`, `downloads`, `chromepad`)
2. No typos in `id`
3. JSON syntax correct (commas, quotes, brackets)

## Best Practices

### ✅ Do's

- Keep labels short (under 15 characters)
- Use clear, descriptive names
- Add helpful aliases
- Use consistent icon style
- Test after every change

### ❌ Don'ts

- Don't change `id` values
- Don't remove the `@` from labels
- Don't use spaces in aliases
- Don't forget commas between array items
- Don't use special characters except emoji

## Configuration Validation

Your config should follow this structure:

```javascript
{
  id: 'string',        // Required: one of the valid IDs
  label: '@String',    // Required: starts with @
  icon: 'emoji',       // Required: single emoji or text
  aliases: ['@str']    // Optional: array of strings starting with @
}
```

## Advanced: Multiple Language Support

You can create multiple config files for different languages:

```javascript
// config.en.js (English)
// config.es.js (Spanish)
// config.fr.js (French)
```

Then switch between them or let users choose their preference!

## Support

If you encounter issues:

1. Check browser console for errors (F12)
2. Verify JSON syntax in config.js
3. Ensure extension reloaded after changes
4. Test with default config first

## Summary

✅ **Customize:** labels, icons, aliases  
⚠️ **Keep unchanged:** id values  
🔄 **After editing:** Reload extension  
🧪 **Always test:** All tools after changes  

Happy customizing! 🎨

