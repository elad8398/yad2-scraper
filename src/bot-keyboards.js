const mainMenuKeyboard = [
    [
        { text: '🔍 החיפושים שלי', callback_data: 'cmd_searches' },
        { text: '⭐ מועדפים', callback_data: 'cmd_favorites' }
    ],
    [
        { text: '▶️ סרוק עכשיו', callback_data: 'cmd_scan' },
        { text: '📊 סטטיסטיקות', callback_data: 'cmd_stats' }
    ],
    [
        { text: '⚙️ הגדרות', callback_data: 'cmd_settings' }
    ]
];

function searchListKeyboard(projects) {
    const rows = projects.map((p, i) => {
        const status = p.disabled ? '⏸' : '✅';
        const toggleText = p.disabled ? '▶️' : '⏸';
        return [
            { text: `${status} ${p.topic}`, callback_data: `search_view_${i}` },
            { text: toggleText, callback_data: `search_toggle_${i}` },
            { text: '🗑', callback_data: `search_del_${i}` }
        ];
    });
    rows.push([{ text: '➕ הוסף חיפוש חדש', callback_data: 'cmd_add_search' }]);
    rows.push([{ text: '🔙 חזרה לתפריט', callback_data: 'cmd_start' }]);
    return rows;
}

function favoritesKeyboard(favorites) {
    if (favorites.length === 0) {
        return [[{ text: '🔙 חזרה לתפריט', callback_data: 'cmd_start' }]];
    }
    const rows = favorites.map((f, i) => {
        const label = `${f.street || 'מודעה'} - ${f.price ? f.price.toLocaleString() + ' ₪' : ''}`;
        return [
            { text: label, callback_data: `fav_view_${i}` },
            { text: '🗑', callback_data: `fav_del_${i}` }
        ];
    });
    rows.push([{ text: '🔙 חזרה לתפריט', callback_data: 'cmd_start' }]);
    return rows;
}

function settingsKeyboard(scanEnabled) {
    const scanText = scanEnabled ? '⏸ כבה סריקה' : '▶️ הפעל סריקה';
    return [
        [{ text: scanText, callback_data: 'toggle_scan' }],
        [{ text: '🔙 חזרה לתפריט', callback_data: 'cmd_start' }]
    ];
}

function listingActionKeyboard(listingId) {
    return [
        [{ text: '⭐ שמור למועדפים', callback_data: `save_fav_${listingId}` }]
    ];
}

module.exports = {
    mainMenuKeyboard,
    searchListKeyboard,
    favoritesKeyboard,
    settingsKeyboard,
    listingActionKeyboard
};
