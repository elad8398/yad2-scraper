const Telenode = require('telenode-js');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { loadConfig, loadListingIds, saveListingIds, appendScanHistory, flagForPush } = require('./src/data-store');
const { listingActionKeyboard } = require('./src/bot-keyboards');

puppeteer.use(StealthPlugin());

const YAD2_BASE_URL = 'https://www.yad2.co.il';

const getYad2Response = async (url) => {
    let browser;
    try {
        const launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled'
            ]
        };
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        }
        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7'
        });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 3000));
        const html = await page.content();
        return html;
    } catch (err) {
        console.log(err);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

const extractListingsFromJson = (html) => {
    const startMarker = '{"props":{"pageProps":';
    const startIdx = html.indexOf(startMarker);
    if (startIdx === -1) {
        console.log('Could not find Next.js data in HTML');
        return [];
    }
    const endMarker = '</script>';
    const endIdx = html.indexOf(endMarker, startIdx);
    if (endIdx === -1) {
        console.log('Could not find end of script tag');
        return [];
    }
    const jsonStr = html.substring(startIdx, endIdx);

    try {
        const data = JSON.parse(jsonStr);
        const queries = data?.props?.pageProps?.dehydratedState?.queries || [];
        const items = [];

        for (const q of queries) {
            const qKey = q?.queryKey || [];
            const qData = q?.state?.data || {};
            const hasFeedKey = Array.isArray(qKey) && qKey.some(k => typeof k === 'string' && k.includes('feed'));
            const hasListings = typeof qData === 'object' && ('private' in qData || 'agency' in qData);
            if (hasFeedKey && hasListings) {
                const categories = ['private', 'agency', 'yad1', 'platinum', 'kingOfTheHar', 'trio', 'booster', 'leadingBroker'];
                for (const cat of categories) {
                    const listings = qData[cat];
                    if (Array.isArray(listings)) {
                        for (const listing of listings) {
                            const token = listing.token || '';
                            const link = token ? `${YAD2_BASE_URL}/realestate/item/${token}` : '';
                            const price = listing.price || '';
                            const rooms = listing.additionalDetails?.roomsCount || '';
                            const sqm = listing.additionalDetails?.squareMeter || listing.metaData?.squareMeterBuild || '';
                            const floor = listing.address?.house?.floor;
                            const street = listing.address?.street?.text || '';
                            const neighborhood = listing.address?.neighborhood?.text || '';
                            const city = listing.address?.city?.text || '';
                            const propertyType = listing.additionalDetails?.property?.text || '';
                            const image = listing.metaData?.coverImage || '';

                            items.push({
                                id: token || image || `${street}-${price}`,
                                link,
                                price,
                                rooms,
                                sqm,
                                floor: floor !== undefined && floor !== null ? floor : '',
                                street,
                                neighborhood,
                                city,
                                propertyType,
                                image,
                                adType: cat
                            });
                        }
                    }
                }
                break;
            }
        }
        return items;
    } catch (e) {
        console.log('Error parsing JSON data:', e.message);
        return [];
    }
}

const scrapeItems = async (url) => {
    const yad2Html = await getYad2Response(url);
    if (!yad2Html) {
        throw new Error("Could not get Yad2 response");
    }

    if (yad2Html.includes("ShieldSquare Captcha")) {
        throw new Error("Bot detection");
    }

    const items = extractListingsFromJson(yad2Html);
    console.log(`Found ${items.length} listings`);
    return items;
}

const checkIfHasNewItem = (items, topic) => {
    const savedIds = loadListingIds(topic);
    const currentIds = items.map(item => item.id);
    let shouldUpdateFile = false;

    const filteredIds = savedIds.filter(id => {
        if (!currentIds.includes(id)) {
            shouldUpdateFile = true;
            return false;
        }
        return true;
    });

    const newItems = [];
    items.forEach(item => {
        if (!filteredIds.includes(item.id)) {
            filteredIds.push(item.id);
            newItems.push(item);
            shouldUpdateFile = true;
        }
    });

    if (shouldUpdateFile) {
        saveListingIds(topic, filteredIds);
    }
    return newItems;
}

const formatListingMessage = (item) => {
    let msg = `🏠 מודעה חדשה!\n`;
    msg += `━━━━━━━━━━━━━━━\n`;

    if (item.propertyType) msg += `🏢 ${item.propertyType}\n`;
    if (item.street) {
        msg += `📍 ${item.street}`;
        if (item.neighborhood) msg += `, ${item.neighborhood}`;
        if (item.city) msg += `, ${item.city}`;
        msg += `\n`;
    }
    if (item.price) msg += `💰 ${item.price.toLocaleString()} ₪\n`;
    if (item.rooms) msg += `🛏 ${item.rooms} חדרים\n`;
    if (item.floor !== '') msg += `🏗 קומה ${item.floor}\n`;
    if (item.sqm) msg += `📐 ${item.sqm} מ"ר\n`;
    if (item.link) msg += `\n🔗 ${item.link}`;

    return msg;
}

const scrape = async (topic, url, telenode, chatId) => {
    try {
        await telenode.sendTextMessage(`🔍 סורק ${topic}...`, chatId);
        const scrapedItems = await scrapeItems(url);
        const newItems = checkIfHasNewItem(scrapedItems, topic);

        // Record in scan history
        appendScanHistory({
            timestamp: new Date().toISOString(),
            topic,
            totalListings: scrapedItems.length,
            newListingsCount: newItems.length,
            listings: newItems
        });

        if (newItems.length > 0) {
            for (const item of newItems) {
                const msg = formatListingMessage(item);
                // Send with "Save to Favorites" button
                await telenode.sendInlineKeyboard(chatId, msg, listingActionKeyboard(item.id));
            }
            await telenode.sendTextMessage(`✅ סה"כ ${newItems.length} מודעות חדשות!`, chatId);
        } else {
            await telenode.sendTextMessage(`🔍 ${topic}: אין מודעות חדשות`, chatId);
        }

        return { topic, newCount: newItems.length, totalCount: scrapedItems.length };
    } catch (e) {
        let errMsg = e?.message || "";
        if (errMsg) {
            errMsg = `Error: ${errMsg}`;
        }
        await telenode.sendTextMessage(`Scan failed... ${errMsg}`, chatId);
        throw e;
    }
}

const runAllScans = async (telenode, chatId) => {
    const config = loadConfig();
    const activeProjects = config.projects.filter(p => {
        if (p.disabled) {
            console.log(`Topic "${p.topic}" is disabled. Skipping.`);
        }
        return !p.disabled;
    });

    if (activeProjects.length === 0) {
        console.log('No active projects to scan');
        return;
    }

    const results = [];
    for (const project of activeProjects) {
        try {
            const result = await scrape(project.topic, project.url, telenode, chatId);
            results.push(result);
        } catch (e) {
            console.log(`Error scanning ${project.topic}:`, e.message);
        }
    }
    return results;
}

module.exports = { scrapeItems, checkIfHasNewItem, formatListingMessage, scrape, runAllScans };
