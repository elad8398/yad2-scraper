const { loadScanHistory, loadFavorites } = require('./data-store');

function computeStats() {
    const history = loadScanHistory();
    const favorites = loadFavorites();
    const today = new Date().toISOString().split('T')[0];

    const todayEntries = history.filter(h => h.timestamp && h.timestamp.startsWith(today));
    const todayListings = todayEntries.flatMap(h => h.listings || []);
    const prices = todayListings.map(l => l.price).filter(p => p && p > 0);

    return {
        todayScans: todayEntries.length,
        todayNewListings: todayEntries.reduce((sum, h) => sum + (h.newListingsCount || 0), 0),
        avgPrice: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
        minPrice: prices.length > 0 ? Math.min(...prices) : 0,
        maxPrice: prices.length > 0 ? Math.max(...prices) : 0,
        totalFavorites: favorites.length,
        totalScans: history.length,
        totalListingsEver: history.reduce((sum, h) => sum + (h.newListingsCount || 0), 0)
    };
}

function formatStatsMessage(stats) {
    let msg = '📊 סטטיסטיקות\n';
    msg += '━━━━━━━━━━━━━━━\n\n';
    msg += `📅 היום:\n`;
    msg += `   🔍 ${stats.todayScans} סריקות\n`;
    msg += `   🏠 ${stats.todayNewListings} מודעות חדשות\n`;
    if (stats.avgPrice > 0) {
        msg += `   💰 ממוצע: ${stats.avgPrice.toLocaleString()} ₪\n`;
        msg += `   📉 ${stats.minPrice.toLocaleString()} - ${stats.maxPrice.toLocaleString()} ₪\n`;
    }
    msg += `\n📈 סה"כ:\n`;
    msg += `   🔍 ${stats.totalScans} סריקות\n`;
    msg += `   🏠 ${stats.totalListingsEver} מודעות נמצאו\n`;
    msg += `   ⭐ ${stats.totalFavorites} מועדפים\n`;
    return msg;
}

module.exports = { computeStats, formatStatsMessage };
