"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkFoodsSafety = checkFoodsSafety;
const categories_1 = require("../data/categories");
const taboos_1 = require("../data/taboos");
const planner_1 = require("./planner");
function checkFoodsSafety(foods, profile, context = {}) {
    const results = [];
    for (const food of foods) {
        if (context.introducing === food) {
            results.push({
                food,
                safe: true,
                reason: 'intentional trial-introduce target',
            });
            continue;
        }
        const verdict = (0, planner_1.isFoodSafeForBaby)(food, profile);
        const category = (0, categories_1.getCategoryByFood)(food);
        results.push({
            food,
            safe: verdict.safe,
            reason: verdict.reason,
            categoryId: category?.id,
            categoryState: profile.categoryAllergies[category?.id ?? '']?.state,
        });
    }
    const taboos = (0, taboos_1.findTaboosForIngredients)(foods);
    const tabooWarnings = taboos.filter((taboo) => taboo.level === 'soft' && !!taboo.mitigation);
    const tabooBlocks = taboos.filter((taboo) => taboo.level === 'hard');
    return {
        safe: results.every((result) => result.safe) && tabooBlocks.length === 0,
        results,
        tabooWarnings,
        tabooBlocks,
    };
}
