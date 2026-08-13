const foodNames: Record<string, string> = {
  '高铁米粉': 'Iron-fortified rice cereal',
  '菠菜': 'Spinach',
  '豆腐': 'Tofu',
  '蛋黄': 'Egg yolk',
  '鸡蛋': 'Egg',
  '燕麦': 'Oats',
  '苹果': 'Apple',
  '梨': 'Pear',
  '南瓜': 'Pumpkin',
  '西兰花': 'Broccoli',
  '鳕鱼': 'Cod',
  '虾': 'Shrimp',
  '牛奶': 'Milk',
  '大米': 'Rice',
  '牛肉': 'Beef',
  '土豆': 'Potato',
}

const englishFoodNames = new Map(
  Object.entries(foodNames).map(([source, translated]) => [
    translated.toLowerCase(),
    source,
  ])
)

const phrases: Array<[string, string]> = [
  ['已确认食材正常放行', 'Established food is allowed'],
  ['未知食材必须阻断', 'Unknown food must be blocked'],
  ['个体过敏必须阻断', 'Individual allergy must be blocked'],
  ['软禁忌提醒但不误拦截', 'Pairing guidance warns without incorrectly blocking'],
  ['今日菜单调用确定性规划器', "Today's menu uses the deterministic planner"],
  ['饮食回顾先读取真实记录', 'Meal review reads actual records first'],
  ['身体反应进入反应记录流程', 'Physical reactions enter the reaction-record workflow'],
  ['试吃前调用安全规则并允许已确认食材', 'Food trials check safety rules and allow established foods'],
  ['锁定品类试吃必须被规则阻断', 'Trials from a locked category must be blocked'],
  ['未知食材试吃必须被规则阻断', 'Unknown-food trials must be blocked'],
  ['个体过敏食材试吃必须被规则阻断', 'Individual-allergy trials must be blocked'],
  ['档案问题先读取宝宝档案', 'Profile questions read the child profile first'],
  ['食谱问题读取适用食谱目录', 'Recipe questions read the applicable recipe catalog'],
  ['今天吃什么？', 'What is on the menu today?'],
  ['这周宝宝吃过什么？', 'What has the child eaten this week?'],
  ['宝宝刚起了红疹', 'The child just developed a rash'],
  ['想试试鳕鱼', 'I want to try cod'],
  ['想试试虾', 'I want to try shrimp'],
  ['想试试蜂蜜', 'I want to try honey'],
  ['宝宝现在是什么状态？', "What is the child's current status?"],
  ['有哪些鱼类食谱？', 'Which fish recipes are available?'],
  ['菠菜先焯水 30 秒去草酸', 'Blanch spinach for 30 seconds to reduce oxalates'],
  ['草酸与钙结合形成草酸钙,降低钙吸收', 'Oxalates can bind with calcium and reduce calcium absorption'],
  ['已标记过敏', ' is marked as an allergy'],
  ['鳕鱼已标记过敏', 'Cod is marked as an allergy'],
  ['疫苗期间只用确认稳定的食物,', 'During the post-vaccination period, use only established foods; '],
  ['不在清单内', ' is not on the established-food list'],
  ['已通过档案校验', 'profile checks passed'],
  ['免排敏食材', 'non-trial food'],
  ['南瓜大米粥', 'Pumpkin rice porridge'],
  ['牛肉土豆粥', 'Beef and potato porridge'],
  ['鳕鱼蔬菜粥', 'Cod and vegetable porridge'],
]

export function displayFood(value: string): string {
  return foodNames[value] ?? value
}

export function foodInputToRuleValue(value: string): string {
  return englishFoodNames.get(value.trim().toLowerCase()) ?? value.trim()
}

export function displayText(value: string): string {
  let translated = foodNames[value] ?? value
  for (const [source, target] of phrases) {
    translated = translated.replaceAll(source, target)
  }
  for (const [source, target] of Object.entries(foodNames)) {
    translated = translated.replaceAll(source, target)
  }
  return translated
}
