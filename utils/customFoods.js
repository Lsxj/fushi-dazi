"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCustomFoods = getCustomFoods;
exports.setCustomFoods = setCustomFoods;
exports.addCustomFood = addCustomFood;
exports.removeCustomFood = removeCustomFood;
exports.renameCustomFood = renameCustomFood;
function getCustomFoods() {
    return wx.getStorageSync('customFoods') || [];
}
function setCustomFoods(items) {
    wx.setStorageSync('customFoods', items);
}
function addCustomFood(food) {
    const all = getCustomFoods();
    if (all.find(f => f.name === food.name))
        return false;
    all.push(food);
    setCustomFoods(all);
    return true;
}
function removeCustomFood(name) {
    const all = getCustomFoods().filter(f => f.name !== name);
    setCustomFoods(all);
}
function renameCustomFood(oldName, newName) {
    const all = getCustomFoods();
    if (all.find(f => f.name === newName && f.name !== oldName))
        return false;
    const target = all.find(f => f.name === oldName);
    if (!target)
        return false;
    target.name = newName;
    setCustomFoods(all);
    return true;
}
