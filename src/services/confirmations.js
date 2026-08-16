const SteamTotp = require('steam-totp');
const SteamCommunity = require('steamcommunity');

class ConfirmationsService {
  constructor() {
    this.cache = new Map(); // accountName -> { confirmations, lastFetched }
    this.timeOffset = 0;
    this.lastUsedTime = 0;
  }

  setTimeOffset(offset) {
    this.timeOffset = offset;
  }

  _getSteamTime() {
    let time = Math.floor(Date.now() / 1000) + this.timeOffset;
    if (time <= this.lastUsedTime) {
      time = this.lastUsedTime + 1;
    }
    this.lastUsedTime = time;
    return time;
  }

  _getTypeDescription(type) {
    const types = {
      1: 'Generic',
      2: 'Trade',
      3: 'Market Listing',
      5: 'Phone Change',
      6: 'Account Recovery'
    };
    return types[type] || `Unknown (${type})`;
  }

  _initCommunity(cookies) {
    const community = new SteamCommunity();
    // cookies is a string: "sessionid=xxx; steamLoginSecure=yyy"
    // steamcommunity expects an array of strings
    const cookieArray = cookies.split(';').map(c => c.trim()).filter(Boolean);
    community.setCookies(cookieArray);
    return community;
  }

  // Fetch confirmations for an account — fully async, caches results
  async fetchConfirmations(steamId, identitySecret, deviceId, cookies) {
    return new Promise((resolve) => {
      try {
        const community = this._initCommunity(cookies);
        const time = this._getSteamTime();
        const confKey = SteamTotp.getConfirmationKey(identitySecret, time, 'conf');

        // MONKEY PATCH: steamcommunity hardcodes SteamTotp.getDeviceID(steamId).
        // For accounts imported from SDA, this generates the WRONG device ID and Steam rejects it with "Oh nooooooes!".
        // We temporarily override getDeviceID to return the actual device ID from the maFile.
        const originalGetDeviceID = SteamTotp.getDeviceID;
        SteamTotp.getDeviceID = () => deviceId;

        // We override steamID on community so getDeviceID works if it falls back
        community.steamID = { getSteamID64: () => steamId, toString: () => steamId };

        community.getConfirmations(time, confKey, (err, confs) => {
          if (err) {
            return resolve({ success: false, confirmations: [], error: err.message });
          }

          const confirmations = (confs || []).map(c => ({
            id: c.id,
            nonce: c.key,
            type: c.type,
            typeDescription: this._getTypeDescription(c.type),
            creatorId: c.creator,
            headline: c.title || 'Підтвердження',
            sending: c.sending || '',
            receiving: c.receiving || '',
            summary: c.receiving || '',
            icon: c.icon || '',
            timestamp: c.timestamp ? c.timestamp.toISOString() : '',
            cancel: 'Cancel',
            accept: 'Accept'
          }));

          // Cache the result
          this.cache.set(steamId, {
            confirmations,
            lastFetched: Date.now()
          });

          resolve({ success: true, confirmations });
        });
        
        // Restore immediately after synchronous invocation
        SteamTotp.getDeviceID = originalGetDeviceID;
      } catch (err) {
        resolve({ success: false, confirmations: [], error: err.message });
      }
    });
  }

  // Accept or deny a single confirmation
  async respondToConfirmation(steamId, identitySecret, deviceId, cookies, confirmationId, confirmationNonce, accept) {
    return new Promise((resolve) => {
      try {
        const community = this._initCommunity(cookies);
        const time = this._getSteamTime();
        
        community.steamID = { getSteamID64: () => steamId, toString: () => steamId };

        const originalGetDeviceID = SteamTotp.getDeviceID;
        SteamTotp.getDeviceID = () => deviceId;

        // steamcommunity requires the array of confirmation IDs and their keys
        const allowKey = SteamTotp.getConfirmationKey(identitySecret, time, 'allow');
        const cancelKey = SteamTotp.getConfirmationKey(identitySecret, time, 'cancel');
        const key = accept ? allowKey : cancelKey;

        community.respondToConfirmation(confirmationId, confirmationNonce, time, key, accept, (err) => {
          SteamTotp.getDeviceID = originalGetDeviceID;
          if (err) resolve({ success: false, confirmationId, error: err.message });
          else resolve({ success: true, confirmationId });
        });
        
        // Restore immediately after synchronous invocation
        SteamTotp.getDeviceID = originalGetDeviceID;
      } catch (err) {
        resolve({ success: false, confirmationId, error: err.message });
      }
    });
  }

  // BATCH accept/deny — runs ALL operations concurrently with Promise.allSettled
  async batchRespond(steamId, identitySecret, deviceId, cookies, confirmations, accept) {
    // Instead of doing them one-by-one, we can do them concurrently
    const results = await Promise.allSettled(
      confirmations.map(conf =>
        this.respondToConfirmation(steamId, identitySecret, deviceId, cookies, conf.id, conf.nonce, accept)
      )
    );

    return results.map((result, index) => ({
      confirmationId: confirmations[index].id,
      success: result.status === 'fulfilled' && result.value.success,
      error: result.status === 'rejected' ? result.reason.message : (result.value?.error || null)
    }));
  }

  // Get cached confirmations (instant, no network)
  getCachedConfirmations(steamId) {
    const cached = this.cache.get(steamId);
    if (!cached || (Date.now() - cached.lastFetched > 30000)) {
      return null; // Expired or missing
    }
    return cached.confirmations;
  }
}

module.exports = new ConfirmationsService();
