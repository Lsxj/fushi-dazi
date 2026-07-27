"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkinMeal = checkinMeal;
exports.uncheckinMeal = uncheckinMeal;
const recipes_1 = require("../data/recipes");
const storage_1 = require("./storage");
const journal_1 = require("./journal");
function checkinMeal(date, mealIndex, recipe, override) {
    const consumed = [];
    const hasOverride = !!(override && (override.customDishName ||
        (override.actualIngredients && override.actualIngredients.length > 0) ||
        override.portion ||
        override.note));
    const isCustom = !!(override && (override.customDishName ||
        (override.actualIngredients && override.actualIngredients.length > 0)));
    if (isCustom && override?.actualIngredients) {
        for (const name of override.actualIngredients) {
            (0, storage_1.consumePortion)(name, 1);
            consumed.push({ name, portions: 1 });
        }
    }
    else {
        for (const ing of recipe.ingredients) {
            (0, storage_1.consumePortion)(ing.name, ing.portions);
            consumed.push({ name: ing.name, portions: ing.portions });
        }
    }
    const log = {
        date,
        mealIndex,
        recipeId: recipe.id,
        recipeName: recipe.name,
        ingredients: isCustom && override?.actualIngredients
            ? override.actualIngredients
            : recipe.ingredients.map(i => i.name),
        loggedAt: new Date().toISOString(),
        ...(override?.eatenAt ? { eatenAt: override.eatenAt } : {}),
        ...(override?.customDishName ? { customDishName: override.customDishName } : {}),
        ...(override?.portion ? { portion: override.portion } : {}),
        ...(override?.note ? { note: override.note } : {}),
        ...(isCustom ? { isCustom: true } : {})
    };
    (0, journal_1.logMeal)(log);
    return { log, consumed };
}
function uncheckinMeal(date, mealIndex) {
    const log = (0, journal_1.getJournal)().find(l => l.date === date && l.mealIndex === mealIndex);
    if (log) {
        if (log.isCustom) {
            for (const name of (log.ingredients || [])) {
                if (name)
                    (0, storage_1.restorePortion)(name, 1);
            }
        }
        else {
            const recipe = recipes_1.RECIPES.find(r => r.id === log.recipeId);
            if (recipe) {
                for (const ing of recipe.ingredients) {
                    (0, storage_1.restorePortion)(ing.name, ing.portions);
                }
            }
            else {
                for (const name of (log.ingredients || [])) {
                    if (name)
                        (0, storage_1.restorePortion)(name, 1);
                }
            }
        }
    }
    (0, journal_1.unlogMeal)(date, mealIndex);
}
