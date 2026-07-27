"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATEGORIES = exports.SHOP_AREA_LABEL = void 0;
exports.getShopAreaForFood = getShopAreaForFood;
exports.getCategoryById = getCategoryById;
exports.getCategoryByFood = getCategoryByFood;
exports.getAllMembers = getAllMembers;
exports.isVariantFood = isVariantFood;
exports.getParentFood = getParentFood;
exports.getVariantsOf = getVariantsOf;
exports.getPrimaryMembers = getPrimaryMembers;
const customFoods_1 = require("../utils/customFoods");
exports.SHOP_AREA_LABEL = {
    staple: '主食/谷物区',
    protein: '肉禽鱼蛋区',
    veg: '蔬果区',
    fruit: '蔬果区',
    oil: '调料/油区',
    condiment: '调料/油区',
    preprocessed: '速冻/熟食区',
    product: '婴幼儿食品区'
};
function getShopAreaForFood(foodName) {
    const cat = getCategoryByFood(foodName);
    if (!cat)
        return '其他';
    return exports.SHOP_AREA_LABEL[cat.mainCategory] || '其他';
}
exports.CATEGORIES = [
    { id: 'grainLow', name: '米及杂粮', riskLevel: 'low', recommendedMonth: 6,
        representatives: ['高铁米粉'],
        members: ['高铁米粉', '大米', '小米', '燕麦', '婴儿燕麦', '糙米'],
        variants: { '婴儿燕麦': '燕麦' },
        mainCategory: 'staple' },
    { id: 'grainHigh', name: '小麦及含麸质谷物', riskLevel: 'high', recommendedMonth: 6,
        representatives: ['面条'],
        members: ['面条', '龙须面', '面包', '小麦粉', '馒头', '麸质'],
        variants: { '龙须面': '面条' },
        mainCategory: 'staple', commonAllergen: true },
    { id: 'root', name: '根茎及薯类', riskLevel: 'low', recommendedMonth: 6,
        representatives: ['山药', '土豆', '胡萝卜'],
        members: ['山药', '土豆', '胡萝卜', '红薯', '紫薯', '白萝卜', '藕', '芋头', '莴笋头'],
        mainCategory: 'veg' },
    { id: 'cruciferous', name: '十字花科', riskLevel: 'low', recommendedMonth: 6,
        representatives: ['西兰花'],
        members: ['西兰花', '花椰菜', '卷心菜', '芥兰', '紫甘蓝', '抱子甘蓝'],
        mainCategory: 'veg' },
    { id: 'gourd', name: '瓜类蔬菜', riskLevel: 'low', recommendedMonth: 6,
        representatives: ['南瓜', '冬瓜'],
        members: ['南瓜', '冬瓜', '西葫芦', '黄瓜', '苦瓜', '丝瓜', '佛手瓜'],
        mainCategory: 'veg' },
    { id: 'nightshade', name: '茄果类蔬菜', riskLevel: 'low', recommendedMonth: 6,
        representatives: ['番茄', '茄子'],
        members: ['番茄', '茄子', '彩椒'],
        mainCategory: 'veg' },
    { id: 'leafy', name: '绿叶菜', riskLevel: 'medium', recommendedMonth: 6,
        representatives: ['菠菜', '娃娃菜'],
        members: ['菠菜', '娃娃菜', '油菜', '生菜', '空心菜', '小白菜', '苋菜', '茼蒿', '芹菜', '韭菜', '香菜', '上海青', '芥菜', '荠菜'],
        mainCategory: 'veg' },
    { id: 'mushroom', name: '菌菇类', riskLevel: 'medium', recommendedMonth: 9,
        representatives: ['香菇'],
        members: ['香菇', '平菇', '金针菇', '口蘑', '杏鲍菇', '鸡腿菇', '蟹味菇', '茶树菇', '银耳', '木耳'],
        mainCategory: 'veg' },
    { id: 'fruitLow', name: '常见水果', riskLevel: 'low', recommendedMonth: 6,
        representatives: ['苹果', '梨'],
        members: ['苹果', '梨', '香蕉', '火龙果', '西梅', '蓝莓', '牛油果', '木瓜', '葡萄', '枇杷'],
        mainCategory: 'fruit' },
    { id: 'fruitMelon', name: '瓜果类水果', riskLevel: 'low', recommendedMonth: 6,
        representatives: ['西瓜'],
        members: ['西瓜', '哈密瓜'],
        mainCategory: 'fruit' },
    { id: 'fruitStoneBerry', name: '核果及浆果', riskLevel: 'medium', recommendedMonth: 6,
        representatives: ['桃子', '草莓'],
        members: ['桃子', '李子', '樱桃', '油桃', '黄桃', '草莓', '猕猴桃'],
        mainCategory: 'fruit' },
    { id: 'fruitCitrus', name: '柑橘类水果', riskLevel: 'medium', recommendedMonth: 6,
        representatives: ['橙子'],
        members: ['柑橘', '橙子', '柠檬', '柚子'],
        mainCategory: 'fruit' },
    { id: 'fruitHigh', name: '热带水果', riskLevel: 'medium', recommendedMonth: 6,
        representatives: ['芒果', '菠萝'],
        members: ['芒果', '菠萝', '杨桃'],
        mainCategory: 'fruit' },
    { id: 'redMeat', name: '畜肉类', riskLevel: 'medium', recommendedMonth: 6,
        representatives: ['猪肉', '牛肉'],
        members: ['猪肉', '牛肉', '羊肉', '猪肝', '排骨'],
        variants: { '猪肝': '猪肉', '排骨': '猪肉' },
        mainCategory: 'protein' },
    { id: 'whiteMeat', name: '禽肉类', riskLevel: 'medium', recommendedMonth: 6,
        representatives: ['鸡胸肉'],
        members: ['鸡胸肉', '鸭肉', '鹅肉', '鸡肝', '鸡腿肉'],
        variants: { '鸡肝': '鸡胸肉', '鸡腿肉': '鸡胸肉' },
        mainCategory: 'protein' },
    { id: 'fish', name: '鱼类', riskLevel: 'high', recommendedMonth: 6,
        representatives: ['鳕鱼', '三文鱼'],
        members: ['鳕鱼', '三文鱼', '鲈鱼', '龙利鱼', '黄花鱼', '银鱼', '巴沙鱼', '鲷鱼'],
        mainCategory: 'protein', commonAllergen: true },
    { id: 'egg', name: '蛋类', riskLevel: 'high', recommendedMonth: 6,
        representatives: ['蛋黄'],
        members: ['蛋黄', '蛋白', '鸡蛋', '鹌鹑蛋', '鸭蛋', '鹅蛋'],
        mainCategory: 'protein', commonAllergen: true },
    { id: 'tofu', name: '大豆及豆制品', riskLevel: 'high', recommendedMonth: 6,
        representatives: ['豆腐'],
        members: ['黄豆', '豆腐', '豆浆', '腐竹', '豆皮', '豆腐脑', '冻豆腐'],
        mainCategory: 'protein', commonAllergen: true },
    { id: 'legume', name: '其他豆类', riskLevel: 'medium', recommendedMonth: 6,
        representatives: ['豌豆'],
        members: ['豌豆', '红豆', '绿豆', '鹰嘴豆', '扁豆'],
        mainCategory: 'protein' },
    { id: 'dairy', name: '牛奶及奶制品', riskLevel: 'high', recommendedMonth: 6,
        representatives: ['酸奶'],
        members: ['牛奶', '酸奶', '奶酪', '奶酪粉'],
        variants: { '奶酪粉': '奶酪' },
        mainCategory: 'protein', commonAllergen: true },
    { id: 'shrimp', name: '甲壳类（水产）', riskLevel: 'high', recommendedMonth: 8,
        representatives: ['虾'],
        members: ['虾', '蟹', '虾皮粉'],
        variants: { '虾皮粉': '虾' },
        mainCategory: 'protein', commonAllergen: true },
    { id: 'mollusc', name: '贝类及软体水产', riskLevel: 'high', recommendedMonth: 8,
        representatives: ['扇贝'],
        members: ['扇贝', '生蚝', '蛤蜊'],
        mainCategory: 'protein', commonAllergen: true },
    { id: 'peanut', name: '花生', riskLevel: 'high', recommendedMonth: 6,
        representatives: ['花生酱'],
        members: ['花生酱', '花生粉', '花生'],
        mainCategory: 'protein', commonAllergen: true },
    { id: 'nuts', name: '树坚果', riskLevel: 'high', recommendedMonth: 6,
        representatives: ['核桃粉'],
        members: ['核桃粉', '杏仁', '腰果', '核桃', '松子', '巴旦木', '榛子', '开心果', '夏威夷果'],
        mainCategory: 'protein', commonAllergen: true },
    { id: 'sesame', name: '芝麻', riskLevel: 'high', recommendedMonth: 6,
        representatives: ['芝麻酱'],
        members: ['芝麻酱', '芝麻粉', '芝麻油'],
        variants: { '芝麻粉': '芝麻酱', '芝麻油': '芝麻酱' },
        mainCategory: 'protein', commonAllergen: true },
    { id: 'oil', name: '油脂', riskLevel: 'low', recommendedMonth: 6,
        representatives: ['核桃油'],
        members: ['核桃油', '亚麻籽油', '橄榄油'],
        mainCategory: 'oil', noAllergyTracking: true },
    { id: 'condiment', name: '调味/营养粉', riskLevel: 'low', recommendedMonth: 6,
        representatives: [],
        members: ['海苔', '海苔碎'],
        mainCategory: 'condiment', noAllergyTracking: true },
    { id: 'preprocessed', name: '半成品/自制', riskLevel: 'medium', recommendedMonth: 6,
        representatives: [],
        members: ['自制浓汤宝', '自制肉松', '自制果泥块', '自制骨汤'],
        mainCategory: 'preprocessed', noAllergyTracking: true },
    { id: 'product', name: '品牌产品', riskLevel: 'low', recommendedMonth: 6,
        representatives: [],
        members: ['婴儿米粉', '婴儿面条', '婴儿溶豆'],
        mainCategory: 'product', noAllergyTracking: true }
];
function getCategoryById(id) {
    return exports.CATEGORIES.find(c => c.id === id);
}
function getCategoryByFood(foodName) {
    for (const c of exports.CATEGORIES) {
        if (c.members.includes(foodName))
            return c;
    }
    const customs = (0, customFoods_1.getCustomFoods)();
    const cf = customs.find(f => f.name === foodName);
    if (cf)
        return exports.CATEGORIES.find(c => c.id === cf.categoryId);
    return undefined;
}
function getAllMembers(categoryId) {
    const cat = exports.CATEGORIES.find(c => c.id === categoryId);
    const builtin = cat?.members || [];
    const customs = (0, customFoods_1.getCustomFoods)().filter(f => f.categoryId === categoryId).map(f => f.name);
    return [...builtin, ...customs];
}
function isVariantFood(foodName) {
    return exports.CATEGORIES.some(c => !!c.variants && foodName in c.variants);
}
function getParentFood(foodName) {
    for (const c of exports.CATEGORIES) {
        const p = c.variants?.[foodName];
        if (p)
            return p;
    }
    return undefined;
}
function getVariantsOf(foodName) {
    for (const c of exports.CATEGORIES) {
        if (!c.variants)
            continue;
        const kids = Object.keys(c.variants).filter(k => c.variants[k] === foodName);
        if (kids.length)
            return kids;
    }
    return [];
}
function getPrimaryMembers(categoryId) {
    const cat = exports.CATEGORIES.find(c => c.id === categoryId);
    if (!cat)
        return [];
    const customs = (0, customFoods_1.getCustomFoods)().filter(f => f.categoryId === categoryId).map(f => f.name);
    return [...cat.members.filter(m => !cat.variants?.[m]), ...customs];
}
