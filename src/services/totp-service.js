const SteamTotp = require('steam-totp');

class TotpService {
  constructor() {
    this.timeOffset = 0;
  }

  // Sync time with Steam servers. Returns the offset.
  async syncTime() {
    return new Promise((resolve, reject) => {
      SteamTotp.getTimeOffset((err, offset, latency) => {
        if (err) return reject(err);
        this.timeOffset = offset;
        resolve({ offset, latency });
      });
    });
  }

  // Generate a 5-char Steam Guard code
  generateCode(sharedSecret) {
    return SteamTotp.generateAuthCode(sharedSecret, this.timeOffset);
  }

  // Get seconds remaining until code changes
  getSecondsUntilChange() {
    const time = Math.floor(Date.now() / 1000) + this.timeOffset;
    return 30 - (time % 30);
  }

  // Generate confirmation key for trade confirmations
  getConfirmationKey(identitySecret, tag) {
    const time = Math.floor(Date.now() / 1000) + this.timeOffset;
    return {
      key: SteamTotp.getConfirmationKey(identitySecret, time, tag),
      time: time
    };
  }

  // Get the current Steam server time
  getSteamTime() {
    return Math.floor(Date.now() / 1000) + this.timeOffset;
  }
}

module.exports = new TotpService();
