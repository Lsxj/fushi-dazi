"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TABOOS = void 0;
exports.checkTaboo = checkTaboo;
exports.findTaboosForIngredients = findTaboosForIngredients;
exports.findTaboosAgainst = findTaboosAgainst;
exports.TABOOS = [
    {
        foods: ['菠菜', '豆腐'],
        level: 'soft',
        reason: '草酸与钙结合形成草酸钙,降低钙吸收',
        mitigation: '菠菜先焯水 30 秒去草酸',
        source: 'NutritionConsensus'
    },
    {
        foods: ['菠菜', '牛奶'],
        level: 'soft',
        reason: '草酸与钙结合,降低钙吸收',
        mitigation: '菠菜先焯水 30 秒',
        source: 'NutritionConsensus'
    },
    {
        foods: ['菠菜', '黄豆'],
        level: 'soft',
        reason: '草酸+钙形成沉淀',
        mitigation: '菠菜先焯水',
        source: 'NutritionConsensus'
    },
    {
        foods: ['菠菜', '虾'],
        level: 'soft',
        reason: '草酸影响虾中钙的吸收',
        mitigation: '菠菜先焯水',
        source: 'NutritionConsensus'
    },
    {
        foods: ['苋菜', '豆腐'],
        level: 'soft',
        reason: '高草酸蔬菜+钙,降低钙吸收',
        mitigation: '苋菜先焯水',
        source: 'NutritionConsensus'
    },
    {
        foods: ['苋菜', '牛奶'],
        level: 'soft',
        reason: '草酸+钙',
        mitigation: '苋菜先焯水',
        source: 'NutritionConsensus'
    },
    {
        foods: ['燕麦', '牛奶'],
        level: 'soft',
        reason: '燕麦植酸影响牛奶中钙铁吸收',
        mitigation: '日常无碍;补钙补铁餐建议隔开',
        source: 'NutritionConsensus'
    },
    {
        foods: ['猪肝', '番茄'],
        level: 'soft',
        reason: '猪肝铜离子加速番茄维生素 C 氧化',
        mitigation: '番茄分餐吃;或快炒减少受热时间',
        source: 'NutritionConsensus'
    },
    {
        foods: ['猪肝', '青椒'],
        level: 'soft',
        reason: '铜离子破坏维生素 C',
        mitigation: '分餐摄入',
        source: 'NutritionConsensus'
    },
];
function checkTaboo(foodA, foodB) {
    return exports.TABOOS.find(t => (t.foods[0] === foodA && t.foods[1] === foodB) ||
        (t.foods[0] === foodB && t.foods[1] === foodA));
}
function findTaboosForIngredients(ingredients) {
    const found = [];
    for (let i = 0; i < ingredients.length; i++) {
        for (let j = i + 1; j < ingredients.length; j++) {
            const t = checkTaboo(ingredients[i], ingredients[j]);
            if (t)
                found.push(t);
        }
    }
    return found;
}
function findTaboosAgainst(target, others) {
    const found = [];
    for (const o of others) {
        if (o === target)
            continue;
        const t = checkTaboo(target, o);
        if (t)
            found.push(t);
    }
    return found;
}
