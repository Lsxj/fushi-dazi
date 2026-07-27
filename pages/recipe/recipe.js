"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const recipes_1 = require("../../data/recipes");
const planner_1 = require("../../utils/planner");
Page({
    data: { recipe: null, tabooWarnings: [] },
    onLoad(options) {
        if (options.id) {
            const r = (0, recipes_1.getRecipe)(options.id);
            if (r) {
                const warnings = (0, planner_1.getRecipeTabooWarnings)(r).map(t => ({
                    foods: t.foods.join(' + '),
                    reason: t.reason,
                    mitigation: t.mitigation || ''
                }));
                this.setData({ recipe: r, tabooWarnings: warnings });
                wx.setNavigationBarTitle({ title: r.name });
            }
        }
    }
});
