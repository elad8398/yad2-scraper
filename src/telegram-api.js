const https = require('https');

const BASE_URL = 'https://api.telegram.org/bot';

function makeRequest(apiToken, method, params = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${BASE_URL}${apiToken}/${method}`);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.append(key, String(value));
            }
        });

        https.get(url.toString(), (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${data}`));
                }
            });
        }).on('error', reject);
    });
}

async function getUpdates(apiToken, offset, limit = 100) {
    const result = await makeRequest(apiToken, 'getUpdates', {
        offset,
        limit,
        timeout: 0
    });
    if (result.ok) {
        return result.result || [];
    }
    console.log('getUpdates error:', result);
    return [];
}

async function answerCallbackQuery(apiToken, callbackQueryId, text) {
    return makeRequest(apiToken, 'answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text
    });
}

async function deleteWebhook(apiToken) {
    return makeRequest(apiToken, 'deleteWebhook');
}

module.exports = { getUpdates, answerCallbackQuery, deleteWebhook };
