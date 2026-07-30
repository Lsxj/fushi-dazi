"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDeterministicMenuPreview = generateDeterministicMenuPreview;
const recipes_1 = require("../data/recipes");
const safety_1 = require("./safety");
const candidateIdsBySlot = {
    breakfast: ['r002'],
    lunch: ['r005', 'r010'],
};
function getRequiredRecipe(recipeId) {
    const recipe = recipes_1.RECIPES.find((candidate) => candidate.id === recipeId);
    if (!recipe) {
        throw new Error(`menu preview recipe "${recipeId}" is missing`);
    }
    return recipe;
}
function generateDeterministicMenuPreview(profile) {
    const meals = [];
    const exclusions = [];
    for (const [slot, recipeIds] of Object.entries(candidateIdsBySlot)) {
        for (const recipeId of recipeIds) {
            const recipe = getRequiredRecipe(recipeId);
            const ingredients = recipe.ingredients.map((ingredient) => ingredient.name);
            const safety = (0, safety_1.checkFoodsSafety)(ingredients, profile);
            if (safety.safe) {
                meals.push({
                    slot,
                    recipeId: recipe.id,
                    recipeName: recipe.name,
                    ingredients,
                });
                break;
            }
            const blocked = safety.results.find((result) => !result.safe);
            if (blocked) {
                exclusions.push({
                    recipeId: recipe.id,
                    recipeName: recipe.name,
                    blockedFood: blocked.food,
                    reason: blocked.reason ?? `${blocked.food}未通过安全规则`,
                    rule: profile.individualExceptions[blocked.food]?.state === 'allergic'
                        ? 'individual-allergy'
                        : 'food-safety',
                });
            }
        }
    }
    return { meals, exclusions };
}
