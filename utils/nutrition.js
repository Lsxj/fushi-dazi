"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NUTRITION_RULES = void 0;
exports.getNutritionRule = getNutritionRule;
exports.meetsRequired = meetsRequired;
exports.scoreByRule = scoreByRule;
exports.NUTRITION_RULES = [
    {
        minMonth: 4,
        stageName: '尝鲜起步期',
        required: ['staple'],
        encouraged: ['staple'],
        ironRichPerWeek: 5,
        dhaSourcesPerWeek: 0,
        eggsPerDay: 0,
        encourageFingerFood: false,
        sourceNote: 'WHO+中营养会：6 月起以铁强化米粉为第一口辅食，单一食物逐一引入。'
    },
    {
        minMonth: 6,
        stageName: '单一引入期',
        required: ['staple'],
        encouraged: ['staple', 'veg', 'fruit'],
        ironRichPerWeek: 5,
        dhaSourcesPerWeek: 0,
        eggsPerDay: 0,
        encourageFingerFood: false,
        sourceNote: 'AAP 2024：单一食物起步，每次试新食物间隔 3-5 天观察。'
    },
    {
        minMonth: 7,
        stageName: '蛋白引入期',
        required: ['staple', 'protein'],
        encouraged: ['staple', 'protein', 'veg'],
        ironRichPerWeek: 6,
        dhaSourcesPerWeek: 1,
        eggsPerDay: 1,
        encourageFingerFood: false,
        sourceNote: '中营养会 2022：每日 1 蛋黄 + 50g 红肉/鱼，蔬菜鼓励但非硬约束。'
    },
    {
        minMonth: 9,
        stageName: '营养均衡期',
        required: ['staple', 'protein', 'veg'],
        encouraged: ['staple', 'protein', 'veg', 'fruit'],
        ironRichPerWeek: 7,
        dhaSourcesPerWeek: 2,
        eggsPerDay: 1,
        encourageFingerFood: true,
        sourceNote: 'WHO IYCF：7+ 月每日 ≥4 食物组；中营养会：每餐主+蛋+蔬三类全。'
    },
    {
        minMonth: 12,
        stageName: '手指食物期',
        required: ['staple', 'protein', 'veg'],
        encouraged: ['staple', 'protein', 'veg', 'fruit'],
        ironRichPerWeek: 7,
        dhaSourcesPerWeek: 2,
        eggsPerDay: 1,
        encourageFingerFood: true,
        sourceNote: 'AAP：12 月起鼓励 finger food 锻炼自主进食；每日 3 顿+ 1-2 加餐。'
    },
    {
        minMonth: 18,
        stageName: '过渡成人膳食期',
        required: ['staple', 'protein', 'veg'],
        encouraged: ['staple', 'protein', 'veg', 'fruit'],
        ironRichPerWeek: 7,
        dhaSourcesPerWeek: 2,
        eggsPerDay: 1,
        encourageFingerFood: true,
        sourceNote: '中营养会 2022：13-24 月逐步过渡到成人膳食结构。'
    }
];
function getNutritionRule(ageMonths) {
    const sorted = [...exports.NUTRITION_RULES].sort((a, b) => b.minMonth - a.minMonth);
    return sorted.find(r => ageMonths >= r.minMonth) || exports.NUTRITION_RULES[0];
}
function meetsRequired(mealCategories, rule) {
    return rule.required.every(c => mealCategories.includes(c));
}
function scoreByRule(mealCategories, rule) {
    let score = 0;
    for (const c of rule.required) {
        if (mealCategories.includes(c))
            score += 15;
        else
            score -= 30;
    }
    for (const c of rule.encouraged) {
        if (!rule.required.includes(c) && mealCategories.includes(c))
            score += 4;
    }
    return score;
}
