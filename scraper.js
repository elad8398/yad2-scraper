const cheerio = require('cheerio');
const Telenode = require('telenode-js');
const fs = require('fs');
const config = require('./config.json');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const YAD2_BASE_URL = 'https://www.yad2.co.il';

const getYad2Response = async (url) => {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled'
            ]
        });
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

const scrapeItems = async (url) => {
    const yad2Html = await getYad2Response(url);
    if (!yad2Html) {
        throw new Error("Could not get Yad2 response");
    }
    const $ = cheerio.load(yad2Html);
    const title = $("title");
    const titleText = title.first().text();
    if (titleText === "ShieldSquare Captcha") {
        throw new Error("Bot detection");
    }

    const items = [];

    // Try to find feed items and extract links
    $(".feeditem").each((_, elm) => {
        const $item = $(elm);
        // Try to find a link in the feed item
        const link = $item.find("a").attr('href');
        const imgSrc = $item.find(".pic img").attr('src');
        const itemId = $item.attr('id') || $item.attr('data-id') || '';

        let fullLink = '';
        if (link) {
            fullLink = link.startsWith('http') ? link : `${YAD2_BASE_URL}${link}`;
        } else if (itemId) {
            fullLink = `${YAD2_BASE_URL}/realestate/item/${itemId}`;
        }

        const identifier = fullLink || imgSrc || '';
        if (identifier) {
            items.push({
                id: identifier,
                link: fullLink,
                image: imgSrc || ''
            });
        }
    });

    // If no feeditems found, try alternative selectors
    if (items.length === 0) {
        $("a[href*='/item/'], a[href*='/realestate/']").each((_, elm) => {
            const $link = $(elm);
            const href = $link.attr('href');
            if (href && href.includes('/item/')) {
                const fullLink = href.startsWith('http') ? href : `${YAD2_BASE_URL}${href}`;
                const imgSrc = $link.find("img").attr('src') || '';
                if (!items.some(item => item.id === fullLink)) {
                    items.push({
                        id: fullLink,
                        link: fullLink,
                        image: imgSrc
                    });
                }
            }
        });
    }

    return items;
}

const checkIfHasNewItem = async (items, topic) => {
    const filePath = `./data/${topic}.json`;
    let savedIds = [];
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        savedIds = JSON.parse(fileContent);
    } catch (e) {
        if (e.code === "ENOENT") {
            fs.mkdirSync('data', { recursive: true });
            fs.writeFileSync(filePath, '[]');
        } else {
            console.log(e);
            throw new Error(`Could not read / create ${filePath}`);
        }
    }

    const currentIds = items.map(item => item.id);
    let shouldUpdateFile = false;

    // Remove old items that are no longer listed
    const filteredIds = savedIds.filter(id => {
        if (!currentIds.includes(id)) {
            shouldUpdateFile = true;
            return false;
        }
        return true;
    });

    // Find new items
    const newItems = [];
    items.forEach(item => {
        if (!filteredIds.includes(item.id)) {
            filteredIds.push(item.id);
            newItems.push(item);
            shouldUpdateFile = true;
        }
    });

    if (shouldUpdateFile) {
        const updatedIds = JSON.stringify(filteredIds, null, 2);
        fs.writeFileSync(filePath, updatedIds);
        await createPushFlagForWorkflow();
    }
    return newItems;
}

const createPushFlagForWorkflow = () => {
    fs.writeFileSync("push_me", "")
}

const scrape = async (topic, url) => {
    const apiToken = process.env.API_TOKEN || config.telegramApiToken;
    const chatId = process.env.CHAT_ID || config.chatId;
    const telenode = new Telenode({apiToken})
    try {
        await telenode.sendTextMessage(`Starting scanning ${topic}...`, chatId)
        const scrapedItems = await scrapeItems(url);
        const newItems = await checkIfHasNewItem(scrapedItems, topic);
        if (newItems.length > 0) {
            for (const item of newItems) {
                let msg = `🏠 מודעה חדשה!\n\n`;
                if (item.link) {
                    msg += `🔗 לינק: ${item.link}\n`;
                }
                if (item.image) {
                    msg += `🖼 תמונה: ${item.image}`;
                }
                await telenode.sendTextMessage(msg, chatId);
            }
            await telenode.sendTextMessage(`✅ סה"כ ${newItems.length} מודעות חדשות!`, chatId);
        } else {
            await telenode.sendTextMessage(`🔍 ${topic}: אין מודעות חדשות`, chatId);
        }
    } catch (e) {
        let errMsg = e?.message || "";
        if (errMsg) {
            errMsg = `Error: ${errMsg}`
        }
        await telenode.sendTextMessage(`Scan workflow failed... ${errMsg}`, chatId)
        throw new Error(e)
    }
}

const program = async () => {
    await Promise.all(config.projects.filter(project => {
        if (project.disabled) {
            console.log(`Topic "${project.topic}" is disabled. Skipping.`);
        }
        return !project.disabled;
    }).map(async project => {
        await scrape(project.topic, project.url)
    }))
};

program();
