// middleware/license.js — Community Edition
// The Community Edition has no licence keys and no limits. Every check lets the
// request through, and the licence the app reports is "Community Edition".
// (Same exports as the commercial edition's middleware, which this replaces.)

const COMMUNITY_LIMITS = {
  maxFeatures: -1,
  maxInitiatives: -1,
  maxTestPacks: -1,
  maxSyntheticMonitors: -1,
  aiTestGeneration: true,
  continuumPush: true
}

const COMMUNITY_LICENSE = {
  tier: 'community',
  isActive: true,
  licenseKey: null,
  limitsJson: JSON.stringify(COMMUNITY_LIMITS)
}

const pass = (req, res, next) => next()

async function getLicense () {
  return COMMUNITY_LICENSE
}

async function getLicenseInfo () {
  return {
    edition: 'community',
    tier: 'community',
    tierDisplayName: 'Community Edition',
    isActive: true,
    expiresAt: null,
    lastValidatedAt: null,
    remoteStatus: null,
    statusMessage: null,
    hasKey: false,
    keyHint: null,
    limits: COMMUNITY_LIMITS,
    usage: {},
    features: { aiTestGeneration: true, continuumPush: true },
    locked: false,
    validationWarning: false,
    daysUntilLock: null
  }
}

module.exports = {
  getLicense,
  getLicenseInfo,
  clearLicenseCache () {},
  async updateUsageCounts () {},
  checkFeatureLimit: pass,
  checkInitiativeLimit: pass,
  checkSyntheticLimit: pass,
  checkTestPackLimit: pass,
  checkContinuumEnabled: pass,
  checkProFeature: pass
}
