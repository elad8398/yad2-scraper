const Telenode = require('telenode-js');
const { loadConfig, loadBotState, saveBotState } = require('./src/data-store');
const { getUpdates, deleteWebhook } = require('./src/telegram-api');
const { processUpdates } = require('./src/bot-commands');
const { runAllScans } = require('./scraper');

async function main() {
    const config = loadConfig();
    const apiToken = process.env.API_TOKEN || config.telegramApiToken;
    const chatId = process.env.CHAT_ID || config.chatId;

    if (!apiToken || !chatId) {
        console.log('Error: API_TOKEN and CHAT_ID must be set');
        process.exit(1);
    }

    const telenode = new Telenode({ apiToken });

    // Ensure webhook is deleted so getUpdates works
    await deleteWebhook(apiToken).catch(() => {});

    // === Phase 1: Process bot commands ===
    console.log('--- Phase 1: Processing bot commands ---');
    try {
        const botState = loadBotState();
        const updates = await getUpdates(apiToken, botState.updateOffset);

        if (updates.length > 0) {
            console.log(`Processing ${updates.length} updates...`);
            await processUpdates(updates, telenode, chatId, apiToken);
        } else {
            console.log('No new updates');
        }
    } catch (e) {
        console.log('Error processing bot commands:', e.message);
    }

    // === Phase 2: Run scraper if enabled ===
    console.log('--- Phase 2: Running scraper ---');
    const botState = loadBotState();

    // Check if scan was manually requested
    if (botState.scanRequested) {
        botState.scanRequested = false;
        saveBotState(botState);
        console.log('Manual scan requested');
    }

    // Check if scanning is enabled
    if (botState.scanEnabled === false) {
        console.log('Scanning is disabled. Skipping.');
        return;
    }

    try {
        await runAllScans(telenode, chatId);

        // Update last scan time
        const updatedState = loadBotState();
        updatedState.lastScanTime = new Date().toISOString();
        saveBotState(updatedState);

        console.log('Scan completed successfully');
    } catch (e) {
        console.log('Error running scans:', e.message);
    }
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
