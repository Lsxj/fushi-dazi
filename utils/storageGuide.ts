import { CATEGORIES, getCategoryByFood } from '../data/categories'
import { getIngredient } from '../data/ingredients'

export interface StorageGuide {
  location: string
  shortLine: string
  tip: string
}

const CATEGORY_GUIDE: Record<string, StorageGuide> = {
  root: {
    location: '室温阴凉',
    shortLine: '室温 14天 / 冷藏 30-60天',
    tip: '土豆/芋头需避光防发芽变绿。山药/红薯阴凉通风即可。切开后用保鲜膜包好冷藏 2-3 天。'
  },
  leafy: {
    location: '冷藏',
    shortLine: '冷藏 5-7天',
    tip: '清洗后用厨房纸吸干装保鲜袋冷藏。焯水后分装冷冻可保 1 个月,做辅食特别方便。'
  },
  cruciferous: {
    location: '冷藏',
    shortLine: '冷藏 7天',
    tip: '保鲜膜包好冷藏。焯水切块分装冷冻可保 2-3 个月,直接取用免清洗。'
  },
  gourd: {
    location: '冷藏',
    shortLine: '冷藏 7-14天',
    tip: '南瓜冬瓜完整时可阴凉保存，切开后密封冷藏并尽快吃完；黄瓜、西葫芦冷藏保存。'
  },
  nightshade: {
    location: '冷藏',
    shortLine: '冷藏 5-7天',
    tip: '番茄、茄子和彩椒冷藏保存，做辅食前清洗并彻底煮熟。'
  },
  redMeat: {
    location: '冷冻',
    shortLine: '冷冻 90天 / 冷藏 2天',
    tip: '⚠️ 强烈建议买回家分小份冷冻(每份 30g),用前一晚移冷藏解冻 12 小时。冷藏不超过 2 天。'
  },
  whiteMeat: {
    location: '冷冻',
    shortLine: '冷冻 90天 / 冷藏 2天',
    tip: '⚠️ 同红肉,分小份冷冻最方便。鸡胸肉切薄片冷冻,做辅食随用随取。'
  },
  fish: {
    location: '冷冻',
    shortLine: '冷冻 90天 / 冷藏 2天',
    tip: '⚠️ 鳕鱼三文鱼买回家分块冷冻。前一晚移冷藏解冻 12 小时,做菜时仔细去刺。'
  },
  shrimp: {
    location: '冷冻',
    shortLine: '冷冻 60天 / 冷藏 1天',
    tip: '⚠️ 虾比鱼更易变质。冷冻保存,用前 8 小时冷藏解冻。去虾线去壳后再做。'
  },
  mollusc: {
    location: '冷冻',
    shortLine: '冷冻 30-60天 / 冷藏 1天',
    tip: '贝类应来源可靠、彻底煮熟并去壳，首次少量尝试。'
  },
  egg: {
    location: '冷藏',
    shortLine: '冷藏 14天',
    tip: '尖头朝下放鸡蛋盒。分清生熟分开存放,煮熟蛋黄冷藏 3 天内吃完。'
  },
  tofu: {
    location: '冷藏',
    shortLine: '冷藏 3-5天',
    tip: '⚠️ 豆腐保质期短。开封后浸冷开水冷藏 1-2 天。冻豆腐口感更软适合宝宝。'
  },
  fruitLow: {
    location: '冷藏',
    shortLine: '冷藏 7-30天',
    tip: '苹果梨可冷藏 1 个月。香蕉室温催熟,熟后冷藏 3 天。蓝莓火龙果冷藏 7 天内吃完。'
  },
  fruitHigh: {
    location: '冷藏',
    shortLine: '冷藏 5-7天',
    tip: '芒果、菠萝等买回后冷藏并尽快食用；作为新食物时逐种少量引入。'
  },
  fruitMelon: {
    location: '冷藏',
    shortLine: '切开后冷藏 1-2天',
    tip: '西瓜、哈密瓜切开前洗净外皮，切开后密封冷藏并尽快食用。'
  },
  fruitStoneBerry: {
    location: '冷藏',
    shortLine: '冷藏 3-7天',
    tip: '彻底清洗；桃、李、樱桃等应去核并按月龄处理成安全质地。'
  },
  fruitCitrus: {
    location: '冷藏',
    shortLine: '冷藏 7-14天',
    tip: '去皮、去籽和较粗纤维后再喂，首次少量尝试。'
  },
  grainLow: {
    location: '室温',
    shortLine: '室温 180天',
    tip: '高铁米粉开封后 1 个月内吃完,远离潮湿。大米小米存阴凉密封罐,夏天可冷藏防虫。'
  },
  grainHigh: {
    location: '室温',
    shortLine: '室温 180天',
    tip: '面条干燥密封保存。开封后 1-2 个月内吃完,湿润环境易长虫。'
  },
  mushroom: {
    location: '冷藏',
    shortLine: '冷藏 7天',
    tip: '鲜菌菇用厨房纸包好冷藏(不要塑料袋,会闷烂)。干菌菇室温常温避光。'
  },
  nuts: {
    location: '室温',
    shortLine: '室温 90天',
    tip: '必须使用细磨坚果粉或无颗粒坚果酱并调稀，禁止给婴幼儿整粒或碎块坚果。'
  },
  peanut: {
    location: '看包装',
    shortLine: '密封避光保存',
    tip: '使用无颗粒花生酱或花生粉调稀，禁止整粒花生；引入后若无反应应规律食用。'
  },
  dairy: {
    location: '冷藏',
    shortLine: '按包装说明',
    tip: '优先选择巴氏杀菌原味酸奶等适龄形态；1岁内牛奶不能替代母乳或配方奶作为主饮。'
  },
  sesame: {
    location: '看包装',
    shortLine: '密封避光保存',
    tip: '芝麻酱调稀后少量引入；芝麻油不能替代含蛋白的芝麻制品作为耐受确认。'
  },
  oil: {
    location: '室温',
    shortLine: '室温 90天 / 开封后 30天',
    tip: '辅食油应按包装避光密封保存，适量添加；亚麻籽油主要提供 ALA，并非 DHA。'
  },
  condiment: {
    location: '室温',
    shortLine: '室温 60天 / 开封后冷藏',
    tip: '海苔碎等应密封干燥保存，并查看钠含量和配料表。'
  },
  preprocessed: {
    location: '冷冻',
    shortLine: '冷冻 30天',
    tip: '自制浓汤宝/果泥块用冰格分小份冻,取用方便。骨汤煮好分装冷冻保 1 个月。'
  },
  product: {
    location: '看包装',
    shortLine: '按包装说明',
    tip: '婴儿米粉、面条等严格按包装说明保存；首次食用前核对配料表中的奶、蛋、小麦等过敏原。'
  }
}

const LOC_LABEL: Record<string, string> = { frozen: '冷冻', refrigerated: '冷藏', room: '室温' }

export function getStorageGuide(foodName: string): StorageGuide {
  const ing = getIngredient(foodName)
  const cat = getCategoryByFood(foodName)
  const catGuide = cat ? CATEGORY_GUIDE[cat.id] : null

  if (ing) {
    const days: string[] = []
    if (ing.shelfLifeDays.frozen) days.push(`冷冻 ${ing.shelfLifeDays.frozen}天`)
    if (ing.shelfLifeDays.refrigerated) days.push(`冷藏 ${ing.shelfLifeDays.refrigerated}天`)
    if (ing.shelfLifeDays.room) days.push(`室温 ${ing.shelfLifeDays.room}天`)
    return {
      location: LOC_LABEL[ing.defaultStorage],
      shortLine: days.join(' / '),
      tip: catGuide?.tip || ''
    }
  }

  if (catGuide) return catGuide

  return { location: '冷藏', shortLine: '冷藏 7天', tip: '' }
}

export function getDefaultLocationFor(foodName: string): 'frozen' | 'refrigerated' | 'room' {
  const ing = getIngredient(foodName)
  if (ing) return ing.defaultStorage
  const cat = getCategoryByFood(foodName)
  if (!cat) return 'refrigerated'
  const guide = CATEGORY_GUIDE[cat.id]
  if (!guide) return 'refrigerated'
  if (guide.location.includes('冷冻')) return 'frozen'
  if (guide.location.includes('室温')) return 'room'
  return 'refrigerated'
}
