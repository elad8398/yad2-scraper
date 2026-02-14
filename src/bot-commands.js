const { loadBotState, saveBotState, loadFavorites, saveFavorites, loadConfig, saveConfig, loadScanHistory } = require('./data-store');
const { answerCallbackQuery } = require('./telegram-api');
const { mainMenuKeyboard, searchListKeyboard, favoritesKeyboard, settingsKeyboard } = require('./bot-keyboards');
const { computeStats, formatStatsMessage } = require('./stats');

async function processUpdates(updates, telenode, chatId, apiToken) {
    const botState = loadBotState();
    let newOffset = botState.updateOffset;

    for (const update of updates) {
        newOffset = update.update_id + 1;

        // Verify chat ID for security
        const updateChatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
        if (String(updateChatId) !== String(chatId)) {
            continue;
        }

        if (update.callback_query) {
            await handleCallback(update.callback_query, telenode, chatId, apiToken);
        } else if (update.message?.text) {
            await handleMessage(update.message.text, telenode, chatId, botState);
        }
    }

    botState.updateOffset = newOffset;
    saveBotState(botState);
    return newOffset;
}

async function handleMessage(text, telenode, chatId, botState) {
    // Check if waiting for search input
    if (botState.awaitingInput === 'add_search') {
        await handleAddSearchInput(text, telenode, chatId, botState);
        return;
    }

    // Command routing
    const command = text.split(' ')[0].toLowerCase();
    switch (command) {
        case '/start':
        case '/menu':
            await handleStart(telenode, chatId);
            break;
        case '/searches':
            await handleSearches(telenode, chatId);
            break;
        case '/add':
            await handleAddSearchPrompt(telenode, chatId, botState);
            break;
        case '/favorites':
            await handleFavorites(telenode, chatId);
            break;
        case '/stats':
            await handleStats(telenode, chatId);
            break;
        case '/scan':
            await handleScanNow(telenode, chatId);
            break;
        case '/settings':
            await handleSettings(telenode, chatId);
            break;
        case '/help':
            await handleHelp(telenode, chatId);
            break;
        default:
            break;
    }
}

async function handleCallback(callbackQuery, telenode, chatId, apiToken) {
    const data = callbackQuery.data;
    const callbackId = callbackQuery.id;

    try {
        if (data === 'cmd_start') {
            await handleStart(telenode, chatId);
        } else if (data === 'cmd_searches') {
            await handleSearches(telenode, chatId);
        } else if (data === 'cmd_add_search') {
            const botState = loadBotState();
            await handleAddSearchPrompt(telenode, chatId, botState);
        } else if (data === 'cmd_favorites') {
            await handleFavorites(telenode, chatId);
        } else if (data === 'cmd_stats') {
            await handleStats(telenode, chatId);
        } else if (data === 'cmd_scan') {
            await handleScanNow(telenode, chatId);
        } else if (data === 'cmd_settings') {
            await handleSettings(telenode, chatId);
        } else if (data === 'toggle_scan') {
            await handleToggleScan(telenode, chatId);
        } else if (data.startsWith('search_toggle_')) {
            const idx = parseInt(data.replace('search_toggle_', ''));
            await handleToggleSearch(telenode, chatId, idx);
        } else if (data.startsWith('search_del_')) {
            const idx = parseInt(data.replace('search_del_', ''));
            await handleRemoveSearch(telenode, chatId, idx);
        } else if (data.startsWith('save_fav_')) {
            const listingId = data.replace('save_fav_', '');
            await handleSaveFavorite(telenode, chatId, listingId);
        } else if (data.startsWith('fav_view_')) {
            const idx = parseInt(data.replace('fav_view_', ''));
            await handleViewFavorite(telenode, chatId, idx);
        } else if (data.startsWith('fav_del_')) {
            const idx = parseInt(data.replace('fav_del_', ''));
            await handleDeleteFavorite(telenode, chatId, idx);
        }

        await answerCallbackQuery(apiToken, callbackId, '').catch(() => {});
    } catch (err) {
        console.log('Error handling callback:', err.message);
    }
}

// === COMMAND HANDLERS ===

async function handleStart(telenode, chatId) {
    const msg = '🏠 Yad2 Scraper Bot\n━━━━━━━━━━━━━━━\nבחר פעולה:';
    await telenode.sendInlineKeyboard(chatId, msg, mainMenuKeyboard);
}

async function handleHelp(telenode, chatId) {
    const msg = `📋 פקודות זמינות:\n\n` +
        `/start - תפריט ראשי\n` +
        `/searches - ניהול חיפושים\n` +
        `/add - הוסף חיפוש חדש\n` +
        `/favorites - מועדפים\n` +
        `/stats - סטטיסטיקות\n` +
        `/scan - סרוק עכשיו\n` +
        `/settings - הגדרות\n` +
        `/help - עזרה`;
    await telenode.sendTextMessage(msg, chatId);
}

async function handleSearches(telenode, chatId) {
    const config = loadConfig();
    const projects = config.projects || [];
    if (projects.length === 0) {
        const kb = [[{ text: '➕ הוסף חיפוש חדש', callback_data: 'cmd_add_search' }],
                     [{ text: '🔙 חזרה', callback_data: 'cmd_start' }]];
        await telenode.sendInlineKeyboard(chatId, '🔍 אין חיפושים מוגדרים', kb);
        return;
    }

    let msg = '🔍 החיפושים שלי:\n━━━━━━━━━━━━━━━\n\n';
    projects.forEach((p, i) => {
        const status = p.disabled ? '⏸ מושבת' : '✅ פעיל';
        msg += `${i + 1}. ${p.topic} [${status}]\n`;
    });

    await telenode.sendInlineKeyboard(chatId, msg, searchListKeyboard(projects));
}

async function handleAddSearchPrompt(telenode, chatId, botState) {
    botState.awaitingInput = 'add_search';
    saveBotState(botState);
    const msg = '➕ שלח לי את פרטי החיפוש בפורמט:\n\n' +
        '`שם | כתובת URL מיד2`\n\n' +
        'לדוגמה:\n' +
        '`north-tlv | https://www.yad2.co.il/realestate/rent?city=5000`\n\n' +
        'לביטול שלח /cancel';
    await telenode.sendTextMessage(msg, chatId);
}

async function handleAddSearchInput(text, telenode, chatId, botState) {
    botState.awaitingInput = null;
    saveBotState(botState);

    if (text === '/cancel') {
        await telenode.sendTextMessage('❌ בוטל', chatId);
        return;
    }

    const parts = text.split('|').map(s => s.trim());
    if (parts.length !== 2) {
        await telenode.sendTextMessage('❌ פורמט לא תקין. שלח: שם | URL', chatId);
        return;
    }

    const [topic, url] = parts;
    if (!url.includes('yad2.co.il')) {
        await telenode.sendTextMessage('❌ ה-URL חייב להיות מיד2', chatId);
        return;
    }

    if (!topic.match(/^[a-zA-Z0-9\-_]+$/)) {
        await telenode.sendTextMessage('❌ שם החיפוש חייב להיות באנגלית בלי רווחים (אפשר מקפים)', chatId);
        return;
    }

    const config = loadConfig();
    if (config.projects.some(p => p.topic === topic)) {
        await telenode.sendTextMessage('❌ כבר קיים חיפוש עם השם הזה', chatId);
        return;
    }

    config.projects.push({ topic, url });
    saveConfig(config);

    await telenode.sendTextMessage(`✅ חיפוש "${topic}" נוסף בהצלחה! יסרק בריצה הבאה.`, chatId);
}

async function handleToggleSearch(telenode, chatId, idx) {
    const config = loadConfig();
    if (idx < 0 || idx >= config.projects.length) return;

    config.projects[idx].disabled = !config.projects[idx].disabled;
    saveConfig(config);

    const status = config.projects[idx].disabled ? 'מושבת ⏸' : 'פעיל ✅';
    await telenode.sendTextMessage(`${config.projects[idx].topic}: ${status}`, chatId);
    await handleSearches(telenode, chatId);
}

async function handleRemoveSearch(telenode, chatId, idx) {
    const config = loadConfig();
    if (idx < 0 || idx >= config.projects.length) return;

    const removed = config.projects.splice(idx, 1)[0];
    saveConfig(config);

    await telenode.sendTextMessage(`🗑 חיפוש "${removed.topic}" הוסר`, chatId);
    await handleSearches(telenode, chatId);
}

async function handleFavorites(telenode, chatId) {
    const favorites = loadFavorites();
    if (favorites.length === 0) {
        const kb = [[{ text: '🔙 חזרה', callback_data: 'cmd_start' }]];
        await telenode.sendInlineKeyboard(chatId, '⭐ אין מועדפים שמורים', kb);
        return;
    }

    let msg = `⭐ מועדפים (${favorites.length}):\n━━━━━━━━━━━━━━━\n\n`;
    favorites.forEach((f, i) => {
        msg += `${i + 1}. ${f.street || 'מודעה'}`;
        if (f.price) msg += ` - ${f.price.toLocaleString()} ₪`;
        if (f.rooms) msg += ` | ${f.rooms} חד'`;
        msg += '\n';
    });

    await telenode.sendInlineKeyboard(chatId, msg, favoritesKeyboard(favorites));
}

async function handleSaveFavorite(telenode, chatId, listingId) {
    const favorites = loadFavorites();
    if (favorites.some(f => f.id === listingId)) {
        await telenode.sendTextMessage('⭐ כבר שמור במועדפים!', chatId);
        return;
    }

    // Find listing in scan history
    const history = loadScanHistory();
    let listing = null;
    for (const entry of history) {
        const found = (entry.listings || []).find(l => l.id === listingId);
        if (found) {
            listing = found;
            break;
        }
    }

    if (listing) {
        listing.savedAt = new Date().toISOString();
        favorites.push(listing);
    } else {
        favorites.push({ id: listingId, savedAt: new Date().toISOString() });
    }

    saveFavorites(favorites);
    await telenode.sendTextMessage('⭐ נשמר למועדפים!', chatId);
}

async function handleViewFavorite(telenode, chatId, idx) {
    const favorites = loadFavorites();
    if (idx < 0 || idx >= favorites.length) return;

    const f = favorites[idx];
    let msg = '⭐ מועדף:\n━━━━━━━━━━━━━━━\n';
    if (f.propertyType) msg += `🏢 ${f.propertyType}\n`;
    if (f.street) {
        msg += `📍 ${f.street}`;
        if (f.neighborhood) msg += `, ${f.neighborhood}`;
        if (f.city) msg += `, ${f.city}`;
        msg += '\n';
    }
    if (f.price) msg += `💰 ${f.price.toLocaleString()} ₪\n`;
    if (f.rooms) msg += `🛏 ${f.rooms} חדרים\n`;
    if (f.floor !== undefined && f.floor !== '') msg += `🏗 קומה ${f.floor}\n`;
    if (f.sqm) msg += `📐 ${f.sqm} מ"ר\n`;
    if (f.link) msg += `\n🔗 ${f.link}`;

    await telenode.sendTextMessage(msg, chatId);
}

async function handleDeleteFavorite(telenode, chatId, idx) {
    const favorites = loadFavorites();
    if (idx < 0 || idx >= favorites.length) return;

    favorites.splice(idx, 1);
    saveFavorites(favorites);

    await telenode.sendTextMessage('🗑 הוסר מהמועדפים', chatId);
    await handleFavorites(telenode, chatId);
}

async function handleStats(telenode, chatId) {
    const stats = computeStats();
    const msg = formatStatsMessage(stats);
    const kb = [[{ text: '🔙 חזרה', callback_data: 'cmd_start' }]];
    await telenode.sendInlineKeyboard(chatId, msg, kb);
}

async function handleScanNow(telenode, chatId) {
    const botState = loadBotState();
    botState.scanRequested = true;
    saveBotState(botState);
    await telenode.sendTextMessage('▶️ סריקה תתבצע עכשיו!', chatId);
}

async function handleSettings(telenode, chatId) {
    const botState = loadBotState();
    const scanStatus = botState.scanEnabled !== false ? '✅ פעילה' : '⏸ מושבתת';
    const lastScan = botState.lastScanTime
        ? new Date(botState.lastScanTime).toLocaleString('he-IL')
        : 'לא בוצעה';

    let msg = '⚙️ הגדרות\n━━━━━━━━━━━━━━━\n\n';
    msg += `🔍 סריקה: ${scanStatus}\n`;
    msg += `🕐 סריקה אחרונה: ${lastScan}\n`;

    await telenode.sendInlineKeyboard(chatId, msg, settingsKeyboard(botState.scanEnabled !== false));
}

async function handleToggleScan(telenode, chatId) {
    const botState = loadBotState();
    botState.scanEnabled = botState.scanEnabled === false ? true : false;
    saveBotState(botState);

    const status = botState.scanEnabled ? 'הופעלה ✅' : 'הושבתה ⏸';
    await telenode.sendTextMessage(`🔍 סריקה ${status}`, chatId);
    await handleSettings(telenode, chatId);
}

module.exports = { processUpdates };
