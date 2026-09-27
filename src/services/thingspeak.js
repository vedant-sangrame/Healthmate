// ============================================================
// ThingSpeak Read API Service
// ============================================================

const THINGSPEAK_BASE = 'https://api.thingspeak.com';

/**
 * Fetch latest data from a ThingSpeak channel
 * @param {string} channelId - ThingSpeak Channel ID
 * @param {string} readApiKey - Read API Key
 * @param {number} results - Number of results to fetch
 * @returns {Promise<Object>} - Channel feeds data
 */
export async function fetchChannelData(channelId, readApiKey, results = 1) {
  const url = `${THINGSPEAK_BASE}/channels/${channelId}/feeds.json?api_key=${readApiKey}&results=${results}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ThingSpeak API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data;
}

/**
 * Fetch channel field data with specific field number
 * @param {string} channelId 
 * @param {string} readApiKey 
 * @param {number} fieldNum - Field number (1-8)
 * @param {number} results 
 * @returns {Promise<Object>}
 */
export async function fetchFieldData(channelId, readApiKey, fieldNum, results = 100) {
  const url = `${THINGSPEAK_BASE}/channels/${channelId}/fields/${fieldNum}.json?api_key=${readApiKey}&results=${results}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ThingSpeak API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data;
}

/**
 * Parse the latest feed entry from ThingSpeak response
 * Fields mapping (based on the MicroPython main.py):
 *   field1 = BPM
 *   field2 = SpO2
 *   field3 = ECG raw value
 */
export function parseLatestFeed(data) {
  if (!data || !data.feeds || data.feeds.length === 0) {
    return null;
  }
  
  const oneMonthAgo = new Date();
  oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

  // Search backwards to find the most recent feed with valid data (BPM > 0 or SpO2 > 0) within last 1 month
  for (let i = data.feeds.length - 1; i >= 0; i--) {
    const feed = data.feeds[i];
    const bpm = feed.field1 ? parseFloat(feed.field1) : 0;
    const spo2 = feed.field2 ? parseFloat(feed.field2) : 0;
    const ecg = feed.field3 ? parseFloat(feed.field3) : 0;
    
    // Only return feeds that contain meaningful readings within last 1 month
    if ((bpm > 0 || spo2 > 0) && new Date(feed.created_at) >= oneMonthAgo) {
      return {
        bpm,
        spo2,
        ecg,
        timestamp: feed.created_at,
        entryId: feed.entry_id,
      };
    }
  }
  
  return null;
}

/**
 * Parse all feeds for historical data
 * Filters out NO DATA and automatically deletes/discards readings older than 1 month (30 days)
 */
export function parseAllFeeds(data) {
  if (!data || !data.feeds) return [];
  
  const oneMonthAgo = new Date();
  oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

  return data.feeds
    .map(feed => ({
      bpm: feed.field1 ? parseFloat(feed.field1) : null,
      spo2: feed.field2 ? parseFloat(feed.field2) : null,
      ecg: feed.field3 ? parseFloat(feed.field3) : null,
      timestamp: feed.created_at,
      entryId: feed.entry_id,
    }))
    .filter(f => (f.bpm !== null && f.bpm > 0) || (f.spo2 !== null && f.spo2 > 0))
    .filter(f => new Date(f.timestamp) >= oneMonthAgo);
}

/**
 * Get channel info
 */
export async function fetchChannelInfo(channelId, readApiKey) {
  const url = `${THINGSPEAK_BASE}/channels/${channelId}/feeds.json?api_key=${readApiKey}&results=0`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ThingSpeak API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.channel;
}
