// ============================================================
// Patient Monitoring Service (for Doctor & Pathology)
// Manages recent monitored patients by ThingSpeak Channel ID
// with localStorage persistence and deletion support
// ============================================================

const STORAGE_PREFIX = 'ahm_recent_monitored_';

/**
 * Get recent monitored patients for a specific doctor or pathology lab
 * @param {string} userId - ID of the logged-in doctor/pathology user
 * @returns {Array<Object>} List of monitored patient objects
 */
export function getRecentPatients(userId) {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error reading recent patients:', e);
    return [];
  }
}

/**
 * Add or update a monitored patient in recents
 * @param {string} userId - ID of the logged-in user
 * @param {Object} patient - { id, name, channelId, readKey }
 * @returns {Array<Object>} Updated list
 */
export function saveRecentPatient(userId, patient) {
  if (!userId || !patient?.channelId) return [];
  try {
    const current = getRecentPatients(userId);
    const trimmedChannel = String(patient.channelId).trim();
    
    // Remove if already exists to move to top
    const filtered = current.filter(p => String(p.channelId).trim() !== trimmedChannel);
    
    const entry = {
      id: patient.id || `channel_${trimmedChannel}`,
      name: patient.name?.trim() || `Patient #${trimmedChannel}`,
      channelId: trimmedChannel,
      readKey: patient.readKey ? String(patient.readKey).trim() : '',
      lastMonitored: new Date().toISOString(),
    };
    
    const updated = [entry, ...filtered].slice(0, 20); // Keep latest 20
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Error saving recent patient:', e);
    return [];
  }
}

/**
 * Delete a patient from recent list
 * @param {string} userId - ID of the logged-in user
 * @param {string} channelId - Channel ID of the patient to remove
 * @returns {Array<Object>} Updated list
 */
export function removeRecentPatient(userId, channelId) {
  if (!userId || !channelId) return [];
  try {
    const current = getRecentPatients(userId);
    const trimmedChannel = String(channelId).trim();
    const updated = current.filter(p => String(p.channelId).trim() !== trimmedChannel);
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Error removing recent patient:', e);
    return [];
  }
}

/**
 * Clear all recent patients for a user
 * @param {string} userId
 */
export function clearAllRecentPatients(userId) {
  if (!userId) return;
  localStorage.removeItem(`${STORAGE_PREFIX}${userId}`);
}
