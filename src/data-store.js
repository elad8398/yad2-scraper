const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function loadJson(filePath, defaultValue) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    } catch (e) {
        return defaultValue;
    }
}

function saveJson(filePath, data) {
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function flagForPush() {
    fs.writeFileSync(path.join(__dirname, '..', 'push_me'), '');
}

// Bot State
function loadBotState() {
    return loadJson(path.join(DATA_DIR, 'bot-state.json'), {
        updateOffset: 0,
        scanEnabled: true,
        lastScanTime: null,
        awaitingInput: null
    });
}

function saveBotState(state) {
    saveJson(path.join(DATA_DIR, 'bot-state.json'), state);
    flagForPush();
}

// Favorites
function loadFavorites() {
    return loadJson(path.join(DATA_DIR, 'favorites.json'), []);
}

function saveFavorites(favorites) {
    saveJson(path.join(DATA_DIR, 'favorites.json'), favorites);
    flagForPush();
}

// Scan History
function loadScanHistory() {
    return loadJson(path.join(DATA_DIR, 'scan-history.json'), []);
}

function appendScanHistory(entry) {
    const history = loadScanHistory();
    history.push(entry);
    // Keep only last 30 days
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const trimmed = history.filter(h => new Date(h.timestamp).getTime() > thirtyDaysAgo);
    saveJson(path.join(DATA_DIR, 'scan-history.json'), trimmed);
    flagForPush();
}

// Config
function loadConfig() {
    return loadJson(CONFIG_PATH, { telegramApiToken: null, chatId: null, projects: [] });
}

function saveConfig(config) {
    saveJson(CONFIG_PATH, config);
    flagForPush();
}

// Listing IDs (existing pattern)
function loadListingIds(topic) {
    return loadJson(path.join(DATA_DIR, `${topic}.json`), []);
}

function saveListingIds(topic, ids) {
    saveJson(path.join(DATA_DIR, `${topic}.json`), ids);
    flagForPush();
}

module.exports = {
    loadBotState, saveBotState,
    loadFavorites, saveFavorites,
    loadScanHistory, appendScanHistory,
    loadConfig, saveConfig,
    loadListingIds, saveListingIds,
    flagForPush
};
