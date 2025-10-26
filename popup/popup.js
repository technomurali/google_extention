// Initialize popup labels from config
function initializeLabels() {
  document.getElementById('heading').textContent = CONFIG.popup.heading;
  document.getElementById('status').textContent = CONFIG.popup.statusChecking;
  document.getElementById('searchInput').placeholder = CONFIG.popup.searchPlaceholder;
  document.getElementById('hideBtn').textContent = CONFIG.popup.hideButton;
  document.getElementById('showBtn').textContent = CONFIG.popup.showButton;
}

// Update UI — no content script/tabbar now; show static status
async function updateStatus() {
  updateUI({ visible: false });
}

function updateUI(status) {
  const statusDiv = document.getElementById('status');
  const hideBtn = document.getElementById('hideBtn');
  const showBtn = document.getElementById('showBtn');

  if (status.visible) {
    statusDiv.textContent = CONFIG.popup.statusActive;
    statusDiv.className = 'status active';
    hideBtn.disabled = false;
    hideBtn.className = 'btn-warning';
    showBtn.disabled = true;
    showBtn.className = 'btn-disabled';
  } else {
    statusDiv.textContent = CONFIG.popup.statusHidden;
    statusDiv.className = 'status';
    hideBtn.disabled = true;
    hideBtn.className = 'btn-disabled';
    showBtn.disabled = false;
    showBtn.className = 'btn-success';
  }
}

// No-op: tabbar functionality removed
async function sendAction(action) { updateStatus(); }

// Event listeners
document.getElementById('hideBtn').addEventListener('click', () => {
  sendAction('hide');
});

document.getElementById('showBtn').addEventListener('click', () => {
  sendAction('show');
});

// Initialize labels and status
initializeLabels();
updateStatus();

