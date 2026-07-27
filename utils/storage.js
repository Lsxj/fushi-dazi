"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFridge = getFridge;
exports.setFridge = setFridge;
exports.addFridgeItem = addFridgeItem;
exports.quickAddFridgeItem = quickAddFridgeItem;
exports.consumePortion = consumePortion;
exports.restorePortion = restorePortion;
exports.getNearExpiry = getNearExpiry;
exports.getExpired = getExpired;
exports.getRecentlyAdded = getRecentlyAdded;
exports.removeItemByKey = removeItemByKey;
exports.updateItemByKey = updateItemByKey;
exports.setPortionsByKey = setPortionsByKey;
exports.moveItemLocation = moveItemLocation;
exports.getUrgentItems = getUrgentItems;
exports.getLowStockItems = getLowStockItems;
exports.getTodayAdviceCount = getTodayAdviceCount;
exports.getManualShopList = getManualShopList;
exports.addToManualShopList = addToManualShopList;
exports.removeFromManualShopList = removeFromManualShopList;
const ingredients_1 = require("../data/ingredients");
const storageGuide_1 = require("./storageGuide");
const dateUtil_1 = require("./dateUtil");
function getFridge() {
    return wx.getStorageSync('fridge') || [];
}
function setFridge(items) {
    wx.setStorageSync('fridge', items);
}
function addFridgeItem(item) {
    const fridge = getFridge();
    const existing = fridge.find(f => f.name === item.name && f.storageLocation === item.storageLocation);
    if (existing) {
        existing.portions += item.portions;
    }
    else {
        fridge.push(item);
    }
    setFridge(fridge);
}
function quickAddFridgeItem(name, portions = 1, storageOverride) {
    const ing = (0, ingredients_1.getIngredient)(name);
    const location = storageOverride || (ing?.defaultStorage) || (0, storageGuide_1.getDefaultLocationFor)(name);
    const defaultDays = location === 'frozen' ? 90 : location === 'room' ? 30 : 7;
    const shelfLife = ing?.shelfLifeDays?.[location] || defaultDays;
    const today = new Date();
    const expiry = new Date(today.getTime() + shelfLife * 86400000);
    addFridgeItem({
        name,
        portions,
        storageLocation: location,
        purchaseDate: (0, dateUtil_1.formatLocalDate)(today),
        expiryDate: (0, dateUtil_1.formatLocalDate)(expiry),
        prepStatus: 'raw'
    });
}
function consumePortion(name, portions = 1) {
    const fridge = getFridge();
    const idx = fridge.findIndex(f => f.name === name);
    if (idx >= 0) {
        fridge[idx].portions -= portions;
        if (fridge[idx].portions <= 0) {
            fridge.splice(idx, 1);
        }
        setFridge(fridge);
    }
}
function restorePortion(name, portions = 1) {
    if (portions <= 0)
        return;
    const fridge = getFridge();
    const idx = fridge.findIndex(f => f.name === name);
    if (idx >= 0) {
        fridge[idx].portions += portions;
        setFridge(fridge);
    }
    else {
        quickAddFridgeItem(name, portions);
    }
}
function getNearExpiry(days = 2) {
    const nowMs = (0, dateUtil_1.todayLocalStartMs)();
    return getFridge().filter(item => {
        const expiryMs = (0, dateUtil_1.parseLocalDateMs)(item.expiryDate);
        const diffDays = (expiryMs - nowMs) / 86400000;
        return diffDays <= days && diffDays >= 0;
    });
}
function getExpired() {
    const nowMs = (0, dateUtil_1.todayLocalStartMs)();
    return getFridge().filter(item => (0, dateUtil_1.parseLocalDateMs)(item.expiryDate) < nowMs);
}
function getRecentlyAdded(n = 5) {
    const fridge = getFridge();
    return [...new Set(fridge.map(f => f.name))].slice(-n).reverse();
}
function parseKey(key) {
    return parseInt(key.split('-').pop() || '-1', 10);
}
function removeItemByKey(key) {
    const fridge = getFridge();
    const idx = parseKey(key);
    if (idx >= 0 && idx < fridge.length) {
        fridge.splice(idx, 1);
        setFridge(fridge);
    }
}
function updateItemByKey(key, partial) {
    const fridge = getFridge();
    const idx = parseKey(key);
    if (idx >= 0 && idx < fridge.length) {
        fridge[idx] = { ...fridge[idx], ...partial };
        setFridge(fridge);
    }
}
function setPortionsByKey(key, portions) {
    const fridge = getFridge();
    const idx = parseKey(key);
    if (idx < 0 || idx >= fridge.length)
        return;
    if (portions <= 0) {
        fridge.splice(idx, 1);
    }
    else {
        fridge[idx].portions = portions;
    }
    setFridge(fridge);
}
function moveItemLocation(key, newLoc) {
    const fridge = getFridge();
    const idx = parseKey(key);
    if (idx < 0 || idx >= fridge.length)
        return;
    const item = fridge[idx];
    const ing = (0, ingredients_1.getIngredient)(item.name);
    const defaultDays = newLoc === 'frozen' ? 90 : newLoc === 'room' ? 30 : 7;
    const shelfLife = ing?.shelfLifeDays?.[newLoc] || defaultDays;
    const purchaseMs = (0, dateUtil_1.parseLocalDateMs)(item.purchaseDate);
    const expiryMs = purchaseMs + shelfLife * 86400000;
    item.storageLocation = newLoc;
    item.expiryDate = (0, dateUtil_1.formatLocalDate)(new Date(expiryMs));
    setFridge(fridge);
}
function getUrgentItems(daysThreshold = 2) {
    const nowMs = (0, dateUtil_1.todayLocalStartMs)();
    return getFridge().filter(item => {
        const diff = ((0, dateUtil_1.parseLocalDateMs)(item.expiryDate) - nowMs) / 86400000;
        return diff <= daysThreshold && diff >= 0;
    });
}
function getLowStockItems(threshold = 1) {
    return getFridge().filter(item => item.portions <= threshold);
}
function getTodayAdviceCount() {
    const names = new Set();
    getUrgentItems().forEach(i => names.add(i.name));
    getLowStockItems().forEach(i => names.add(i.name));
    return names.size;
}
function getManualShopList() {
    return wx.getStorageSync('manualShopList') || [];
}
function addToManualShopList(name, portions = 1) {
    const list = getManualShopList();
    const existing = list.find(i => i.name === name);
    if (existing) {
        existing.portions += portions;
    }
    else {
        list.push({ name, portions, addedAt: new Date().toISOString() });
    }
    wx.setStorageSync('manualShopList', list);
}
function removeFromManualShopList(name) {
    const list = getManualShopList().filter(i => i.name !== name);
    wx.setStorageSync('manualShopList', list);
}
