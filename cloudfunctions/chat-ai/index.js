/**
 * chat-ai — WeChat cloud function.
 *
 * Production entrypoint for the parent-facing AI assistant. The flow:
 *
 *   1. wx.login → openid (provided by WeChat automatically via cloud.getWXContext)
 *   2. Install wx shim (cloudDB backend) so fushi-ditu utils can call wx.getStorageSync
 *   3. Build Anthropic Messages API request:
 *        - system: fushi-ditu business rules + 4 hard guardrails
 *        - tools:   the safe tools (read-only + reversible mutations)
 *        - messages: user question + history (clipped to last 20 turns)
 *   4. Send to Claude → possibly get tool_use blocks back
 *   5. For each tool_use, dispatch to the corresponding fushi-ditu function
 *      (registered in TOOL_REGISTRY below). The function call goes through
 *      fushi-ditu's pure logic — guardrails, try/catch, etc. — so the LLM
 *      CANNOT bypass safety rules.
 *   6. Feed tool_result blocks back to Claude for the final answer.
 *   7. Return { answer, toolCalls, openid } to the mini-program.
 *
 * Local dev: `node index.js --local` uses file shim + a fake openid so
 * the function can be exercised without WeChat cloud tooling.
 *
 * Multi-tenancy is automatic: openid from the WeChat context scopes all
 * data reads/writes to that user. No separate user table needed.
 */
'use strict'

const path = require('path')
const fs = require('fs')

// Resolve fushi-ditu. In the cloud function, we cannot require files
// outside the function's own directory, so the deploy script mirrors
// `fushi-ditu/utils/` and `fushi-ditu/data/` into
// `cloudfunctions/chat-ai/fushi-ditu/` before each deploy (see
// scripts/sync-fushiditu.sh). We point FUSHI_ROOT at that mirror.
// Locally (LOCAL=1), we can still reach the real fushi-ditu/utils.
const FUSHI_ROOT = process.env.LOCAL === '1'
  ? path.resolve(__dirname, '../..')
  : path.resolve(__dirname, 'fushi-ditu')
// wx-shim is bundled INTO this directory rather than shared from
// cloudfunctions/_shared — WeChat's deploy model uploads only the
// function's own folder, so cross-folder requires fail at runtime
// (Error: Cannot find module '../_shared/wx-shim'). If you update the
// shim, copy the new file here too (see deploy.md §"Updating wx-shim").
const shim = require('./wx-shim')
const { getLLMClient } = require('./_llm/factory.js')

const MAX_HISTORY_TURNS = 20
const MAX_TOOL_ITERATIONS = 5 // safety: don't loop forever

// ---- fushi-ditu imports ----
//
// We import the compiled .js (fushi-ditu is CommonJS, target ES2020 —
// runs on Node as-is). The shim must be installed BEFORE these requires
// because they execute `wx.getStorageSync` at module load time.

let _fushi = null
function loadFushi() {
  if (_fushi) return _fushi
  _fushi = {
    planner: require(path.join(FUSHI_ROOT, 'utils/planner.js')),
    reactions: require(path.join(FUSHI_ROOT, 'utils/reactions.js')),
    journal: require(path.join(FUSHI_ROOT, 'utils/journal.js')),
    storage: require(path.join(FUSHI_ROOT, 'utils/storage.js')),
    observation: require(path.join(FUSHI_ROOT, 'utils/observation.js')),
    recipes: require(path.join(FUSHI_ROOT, 'data/recipes.js')),
    categories: require(path.join(FUSHI_ROOT, 'data/categories.js')),
    taboos: require(path.join(FUSHI_ROOT, 'data/taboos.js')),
    reviewStats: require(path.join(FUSHI_ROOT, 'utils/reviewStats.js')),
  }
  return _fushi
}

// ---- Tool registry ----
//
// Only safe tools are exposed to the LLM. Irreversible mutations
// (mark_food_allergic) require a user-confirmed consent flag (extracted
// from the message) and are NOT auto-invoked by the LLM alone — see
// the consent handling in the tool's invoke function.
//
// Each tool maps:
//   - { name, description, input_schema } → for Anthropic tool_use
//   - invoke(input, ctx)                  → call fushi-ditu, return string result

const TOOLS = []
const TOOL_INVOKERS = {}

function defineTool({ name, description, inputSchema, invoke }) {
  TOOLS.push({ name, description, input_schema: inputSchema })
  TOOL_INVOKERS[name] = invoke
}

defineTool({
  name: 'read_baby_profile',
  description:
    'Read the active baby profile: babyName, ageMonths, currentStatus, categoryAllergies state, trying state, next recommendations. Read-only.',
  inputSchema: { type: 'object', properties: {}, required: [] },
  invoke(_input, _ctx) {
    const f = loadFushi()
    const profile = f.planner.readBabyProfile ? f.planner.readBabyProfile() : readProfileViaShim()
    return profile
  },
})

function readProfileViaShim() {
  // fushi-ditu utils don't have a readBabyProfile export; assemble it here.
  const profile = wx.getStorageSync('babyProfile')
  if (!profile) throw new Error('read_baby_profile: no babyProfile in store')
  return {
    profile,
    ageMonths: profile.ageMonths,
    tryingProgress: require(path.join(FUSHI_ROOT, 'utils/planner.js')).getTryingProgress(profile),
    scheduledStart: require(path.join(FUSHI_ROOT, 'utils/planner.js')).getTryingScheduledStart(profile),
    isComplete: require(path.join(FUSHI_ROOT, 'utils/planner.js')).checkTryingComplete
      ? null
      : null,
    nextRecommendations: require(path.join(FUSHI_ROOT, 'utils/planner.js')).getNextRecommendation(profile),
  }
}

defineTool({
  name: 'check_food_safety',
  description:
    'HARD GUARDRAIL — does NOT call an LLM. Check whether each food is safe for the active baby given their profile (allergy state, trying progress, taboo pairs, post-vaccine restrictions). Use this BEFORE recommending any food.',
  inputSchema: {
    type: 'object',
    properties: {
      foods: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'Food names to check.' },
    },
    required: ['foods'],
  },
  invoke(input) {
    const profile = wx.getStorageSync('babyProfile')
    if (!profile) throw new Error('check_food_safety: no babyProfile in store')
    const results = (input.foods || []).map((food) => {
      const r = loadFushi().planner.isFoodSafeForBaby(food, profile)
      return { food, safe: r.safe, reason: r.reason }
    })
    const allSafe = results.every((r) => r.safe)
    return { safe: allSafe, results }
  },
})

defineTool({
  name: 'list_recipes',
  description:
    'List recipes applicable to the active baby, with optional filters. Recipes failing isRecipeApplicable are NEVER returned. tabooCheck controls warnings only.',
  inputSchema: {
    type: 'object',
    properties: {
      mealCategory: { type: 'string', enum: ['staple', 'protein', 'veg', 'fruit'] },
      excludeFoods: { type: 'array', items: { type: 'string' } },
      inFridgeOnly: { type: 'boolean' },
    },
    required: [],
  },
  invoke(input) {
    const f = loadFushi()
    const profile = wx.getStorageSync('babyProfile')
    if (!profile) throw new Error('list_recipes: no babyProfile in store')
    let pool = [...f.recipes.RECIPES]
    if (input.mealCategory) pool = pool.filter((r) => r.mealCategories.includes(input.mealCategory))
    if (input.excludeFoods?.length) {
      const ex = new Set(input.excludeFoods)
      pool = pool.filter((r) => !r.ingredients.some((i) => ex.has(i.name)))
    }
    if (input.inFridgeOnly) {
      const fridge = wx.getStorageSync('fridge') || []
      const names = new Set(fridge.map((i) => i.name))
      pool = pool.filter((r) => r.ingredients.every((i) => names.has(i.name)))
    }
    const applicable = pool.filter((r) => f.planner.isRecipeApplicable(r, profile).applicable)
    return { count: applicable.length, recipes: applicable.slice(0, 30) }
  },
})

defineTool({
  name: 'generate_today_menu',
  description:
    'HARD GUARDRAIL — does NOT call an LLM. Generate a 3-meal plan for a given date (default today). Every recipe is isRecipeApplicable-verified. Writes the plan to weeklyPlan so the home page reflects it.',
  inputSchema: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'Target date in YYYY-MM-DD. Defaults to today.',
      },
    },
    required: [],
  },
  invoke(input) {
    const f = loadFushi()
    const profile = wx.getStorageSync('babyProfile')
    if (!profile) throw new Error('generate_today_menu: no babyProfile in store')
    // Resolve target date. If the LLM passes a future date (e.g. user
    // asks "明天吃什么"), we plan that day so the home-page / plan-page
    // can reflect it. The "trying" window logic still applies because
    // fushi-ditu's generateWeeklyPlan looks at tryingStartDate.
    const target = input && typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
      ? new Date(input.date + 'T12:00:00')
      : new Date()
    const [day] = f.planner.generateWeeklyPlan(profile, 1, target) || []
    if (!day) {
      return { date: formatYmd(target), meals: [], note: 'no applicable plan' }
    }
    // Persist into weeklyPlan so the home / plan page can read it back.
    const week = wx.getStorageSync('weeklyPlan') || []
    const idx = week.findIndex((p) => p.date === day.date)
    if (idx >= 0) week[idx] = day
    else week.push(day)
    wx.setStorageSync('weeklyPlan', week)
    return {
      date: day.date,
      meals: day.meals.map((m) => ({
        mealIndex: m.mealIndex,
        recipeId: m.recipe.id,
        recipeName: m.recipe.name,
      })),
    }
  },
})

defineTool({
  name: 'get_feeding_history',
  description:
    'Read recorded feeding data: mealJournal, reactions, latest all-time logs, and 7-day review summary. Read-only. Use before answering questions about history, review, what was recorded, what baby ate, reactions, or weekly summary.',
  inputSchema: {
    type: 'object',
    properties: {
      days: {
        type: 'number',
        description: 'Lookback window in days for the range summary. Defaults to 7, max 90.',
      },
      limit: {
        type: 'number',
        description: 'Max records to return for each list. Defaults to 20, max 50.',
      },
    },
    required: [],
  },
  invoke(input) {
    const f = loadFushi()
    const profile = wx.getStorageSync('babyProfile')
    if (!profile) throw new Error('get_feeding_history: no babyProfile in store')

    const days = clampNumber(input.days, 7, 1, 90)
    const limit = clampNumber(input.limit, 20, 1, 50)
    const today = new Date()
    const fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1))
    const from = formatYmd(fromDate)
    const to = formatYmd(today)

    const allMealLogs = readArrayFromTool(f.journal.getJournal, 'mealJournal')
    const allReactions = readArrayFromTool(f.reactions.getReactions, 'reactions')

    const mealLogsInRange = allMealLogs
      .filter((log) => log && log.date >= from && log.date <= to)
      .sort(sortMealLogDesc)
      .slice(0, limit)
      .map(formatMealLogForLLM)

    const reactionsInRange = allReactions
      .filter((reaction) => {
        const d = String(reaction?.occurredAt || '').slice(0, 10)
        return d >= from && d <= to
      })
      .sort(sortReactionDesc)
      .slice(0, limit)
      .map(formatReactionForLLM)

    const latestMealLogs = [...allMealLogs]
      .sort(sortMealLogDesc)
      .slice(0, limit)
      .map(formatMealLogForLLM)

    const latestReactions = [...allReactions]
      .sort(sortReactionDesc)
      .slice(0, limit)
      .map(formatReactionForLLM)

    const weekSummary = f.reviewStats.summarize7Days
      ? f.reviewStats.summarize7Days(profile)
      : null

    return {
      profile: {
        babyName: profile.babyName,
        birthday: profile.birthday,
        ageMonths: profile.ageMonths,
      },
      range: { from, to, days },
      weekSummary,
      totals: {
        mealLogs: allMealLogs.length,
        reactions: allReactions.length,
        rangeMealLogs: mealLogsInRange.length,
        rangeReactions: reactionsInRange.length,
      },
      mealLogsInRange,
      reactionsInRange,
      latestMealLogs,
      latestReactions,
      guidance:
        'If mealLogsInRange is empty but latestMealLogs is not empty, say there is no feeding record in the selected recent range, then summarize the latest historical records instead of saying there is no data at all.',
    }
  },
})

defineTool({
  name: 'record_reaction',
  description:
    'Record a reaction. Pure rules — pulls 72h traceback, runs analyzer, returns recommendation (markAllergic / pediatricCare / enterObservation / monitor).',
  inputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['gut', 'rash', 'vomit', 'sleepy', 'fever', 'constipation'] },
      severity: { type: 'string', enum: ['mild', 'moderate', 'severe'] },
      occurredAt: { type: 'string', description: 'ISO timestamp' },
      note: { type: 'string' },
    },
    required: ['type', 'severity', 'occurredAt'],
  },
  invoke(input) {
    const f = loadFushi()
    const traceback = f.reactions.traceback72h(input.occurredAt)
    const ingredientSet = new Set()
    traceback.forEach((l) => l.ingredients.forEach((i) => ingredientSet.add(i)))
    const profile = wx.getStorageSync('babyProfile')
    const suspects = f.observation.analyzeSuspects(profile, [...ingredientSet], input.occurredAt)
    const reaction = {
      id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      occurredAt: input.occurredAt,
      type: input.type,
      severity: input.severity,
      note: input.note,
      tracebackMeals: traceback.map((l) => ({
        date: l.date,
        mealIndex: l.mealIndex,
        recipeName: l.recipeName,
        ingredients: l.ingredients,
      })),
      suspectedFoods: suspects.map((s) => s.name),
    }
    f.reactions.addReaction(reaction)
    const rec = recommend(input.severity, input.type)
    return { reaction, suspects, recommendation: rec }
  },
})

// NOTE: We deliberately do NOT expose mark_food_allergic as an LLM-invokable
// tool. The user must explicitly invoke it from the UI (e.g. "永久标记为过敏"
// confirmation button), passing consentToConfirmIrreversible=true. This is the
// same guardrail that the mcp-server uses (z.literal(true)) — we just don't
// hand the tool to the LLM at all.

// ---- Helpers ----

function recommend(severity, type) {
  if (severity === 'severe') return { action: 'markAllergic', reason: '严重反应 — 建议直接确诊为过敏' }
  if (type === 'vomit' && severity !== 'mild') return { action: 'pediatricCare', reason: '呕吐中度以上 — 建议先看儿科' }
  if (severity === 'moderate') return { action: 'enterObservation', reason: '中度反应 — 进入 7 天观察期', days: 7 }
  return { action: 'monitor', reason: '轻微反应 — 暂不标记,继续观察' }
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.floor(n), min), max)
}

function readArrayFromTool(reader, storageKey) {
  try {
    const value = typeof reader === 'function' ? reader() : wx.getStorageSync(storageKey)
    return Array.isArray(value) ? value : []
  } catch (_err) {
    const value = wx.getStorageSync(storageKey)
    return Array.isArray(value) ? value : []
  }
}

function sortMealLogDesc(a, b) {
  const ad = String(a?.date || '')
  const bd = String(b?.date || '')
  if (ad !== bd) return bd.localeCompare(ad)
  const ai = Number(a?.mealIndex ?? -1)
  const bi = Number(b?.mealIndex ?? -1)
  if (ai !== bi) return bi - ai
  return String(b?.loggedAt || '').localeCompare(String(a?.loggedAt || ''))
}

function sortReactionDesc(a, b) {
  return String(b?.occurredAt || '').localeCompare(String(a?.occurredAt || ''))
}

function formatMealLogForLLM(log) {
  return {
    date: log.date,
    mealIndex: log.mealIndex,
    recipeName: log.customDishName || log.recipeName,
    plannedRecipeName: log.recipeName,
    ingredients: log.ingredients || [],
    eatenAt: log.eatenAt || log.loggedAt,
    loggedAt: log.loggedAt,
    preference: log.preference || null,
    portion: log.portion || null,
    note: log.note || '',
    isCustom: !!log.isCustom,
  }
}

function formatReactionForLLM(reaction) {
  return {
    id: reaction.id,
    occurredAt: reaction.occurredAt,
    type: reaction.type,
    severity: reaction.severity,
    note: reaction.note || '',
    suspectedFoods: reaction.suspectedFoods || [],
    tracebackMeals: reaction.tracebackMeals || [],
    resolvedAt: reaction.resolvedAt || null,
  }
}

function formatYmd(d) {
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

const SYSTEM_PROMPT = `你是 辅食搭子 的 AI 助手。家长用自然语言问你关于宝宝辅食的问题(今天吃什么 / 刚试了新食材 / 宝宝拉稀了 / 想试试虾 等),你用工具调用帮他们搞定,然后用人话回答。

HARD RULES (绝对不能违反):
1. 永不推 unsafe food。check_food_safety 返 unsafe 的食材,不能出现在你的推荐里。
2. 不能凭空调"永久过敏"或"开始排敏"等不可逆操作 — 那种操作必须家长在 UI 上点确认按钮,你只能在 prompt 里提示"建议家长去 X 页点 Y 按钮"。
3. 用中文回复。家长语言之外的"实际/按计划"等抽象词不要用 — 用"按计划/今天没吃/喂了"等。
4. 不超过 300 字,除非家长明确要详细。
5. 数据缺失就明说"这个数据没有",不编造。
6. 已有宝宝档案时,不要让家长重新提供月龄/过敏/排敏信息;先调用 read_baby_profile 或对应工具读取。

工具用法:
- 问"今天吃什么" → generate_today_menu
- 问"刚吃了 X" → 先 record_meal_log(已自动扣库存),然后总结
- 问"宝宝拉稀了" → record_reaction → 看 recommendation → 翻译成家长语言
- 问"想试试 X" → read_baby_profile → check_food_safety([X]) → 解释怎么排敏
- 问"这周怎么样"/"回顾"/"最近吃了什么"/"记录了哪些辅食"/"已经吃过什么" → get_feeding_history,再总结已记录的 reaction + meal log,不要瞎编数字
- 回答任何“已记录/历史/回顾/吃过/反应记录”问题前,必须先调用 get_feeding_history。若近 7 天为空但 latestMealLogs 有数据,要说“近 7 天没有记录,最新历史记录是...”,不能说完全没有数据。

如果需要家长确认不可逆操作(永久过敏/开始排敏),只说"建议家长去 [页面] 点 [按钮] 确认"。`

// ---- LLM client (provider-agnostic) ----
//
// We use a small abstraction so the chat-ai tool-use loop is identical
// regardless of provider. The actual client (Anthropic / DeepSeek / mock)
// is decided by the factory based on LLM_PROVIDER env.

function getLLMClientOrThrow() {
  return getLLMClient() // from _llm/factory.js
}

// ---- Tool-call loop (provider-agnostic) ----
//
// We build a uniform `messages` shape (Anthropic-flavored — turns are
// { role, content, optional tool_calls / tool_call_id }) and let the
// provider translate to its native wire format. This means the loop
// itself is identical for Anthropic, DeepSeek, or mock.

async function runToolLoop(messages) {
  const llm = getLLMClientOrThrow()
  const toolCalls = []
  let iter = 0
  let currentMessages = messages

  while (iter < MAX_TOOL_ITERATIONS) {
    iter++
    const response = await llm.chat({
      system: SYSTEM_PROMPT,
      messages: currentMessages,
      tools: TOOLS,
    })

    if (!response.toolCalls || response.toolCalls.length === 0) {
      return { answer: response.text, toolCalls, iterations: iter, provider: response.provider, model: response.model }
    }

    // Dispatch each tool call, collecting results.
    const toolResultMessages = []
    for (const tc of response.toolCalls) {
      const invoker = TOOL_INVOKERS[tc.name]
      let resultText
      let isError = false
      try {
        const result = invoker ? invoker(tc.input || {}, { openid: _currentOpenid }) : null
        resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      } catch (err) {
        resultText = `Error: ${err.message}`
        isError = true
      }
      toolCalls.push({ name: tc.name, input: tc.input, ok: !isError, preview: resultText.slice(0, 200) })
      toolResultMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: resultText,
      })
    }

    // Append the assistant turn (with tool_calls) + tool result messages.
    currentMessages = [
      ...currentMessages,
      {
        role: 'assistant',
        content: response.text || '',
        tool_calls: response.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, input: tc.input })),
      },
      ...toolResultMessages,
    ]
  }

  return { answer: '[loop limit reached]', toolCalls, iterations: iter, provider: response.provider, model: response.model }
}

let _currentOpenid = null

// ---- Main handler ----
//
// WeChat cloud function signature: `exports.main = async (event, context) => {...}`.
// `event` is the mini-program's request body, `context` includes OPENID.

exports.main = async (event, context) => {
  try {
    // Resolve openid: from WeChat context in production, from event in local dev.
    const wxContext = context && context.OPENID ? context : null
    const openid = (wxContext && wxContext.OPENID) || event._testOpenid || 'test-openid'
    _currentOpenid = openid

    // Install shim. Three paths:
    //   1. LOCAL=1: local node run, use __dirname/_localdata (writable on dev machine)
    //   2. Cloud, no wxContext: manual test invocation, use /tmp (writable inside
    //      the cloud function sandbox; /var/user/ is read-only)
    //   3. Cloud, real wxContext: production, use cloudDB
    if (process.env.LOCAL === '1') {
      shim.installFileShim(path.join(__dirname, '_localdata', openid))
    } else if (!wxContext) {
      shim.installFileShim(path.join('/tmp', 'fushi_localdata', openid))
    } else {
      // Lazy-require so local node run doesn't pull in wx-server-sdk.
      const cloud = require('wx-server-sdk')
      cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
      await shim.installCloudDbShim(cloud, openid)
    }

    // Sync storage boundary:
    // - Mini-program pages render from local wx.storage, so the client-visible
    //   storage snapshot is authoritative at the start of every turn.
    // - AI tools run against cloudDB, then we return a post-tool snapshot so
    //   the client mirrors cloud writes back into local wx.storage.
    if (event._localBackup && typeof event._localBackup === 'object') {
      for (const [key, value] of Object.entries(event._localBackup)) {
        if (value === undefined) continue
        if (!(shim.STORAGE_KEYS || []).includes(key)) continue
        wx.setStorageSync(key, value)
      }
    }
    const profile = wx.getStorageSync('babyProfile')
    if (!profile) {
      return {
        ok: true,
        answer: '欢迎使用辅食搭子!我看到你的宝宝档案还没建好,先去「我的」页填一下基本信息(宝宝月龄 + 名字),然后我们就可以开始聊了。',
        toolCalls: [],
        openid,
        storageSnapshot: collectStorageSnapshot(),
      }
    }

    // Validate event.
    const question = (event && event.question) || ''
    const history = (event && Array.isArray(event.history)) ? event.history : []
    if (!question) return { ok: false, error: 'question is required' }

    // Build the message list. Sanitize: only role + text content from history.
    const safeHistory = history
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-MAX_HISTORY_TURNS)
    // The cloud function test harness doesn't supply wxContext, so
    // _currentOpenid is undefined and the shim installs at /tmp/fushi_localdata/.
    // For real wx.cloud.callFunction from the mini-program, wxContext is
    // populated and the shim routes to cloudDB.
    const messages = [
      ...safeHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: question },
    ]

    // Drive the tool loop.
    const { answer, toolCalls, provider, model, iterations } = await runToolLoop(messages)
    return { ok: true, answer, toolCalls, openid, provider, model, iterations, storageSnapshot: collectStorageSnapshot() }
  } catch (err) {
    console.error('chat-ai fatal:', err)
    return { ok: false, error: err.message || String(err) }
  }
}

function collectStorageSnapshot() {
  const out = {}
  for (const key of shim.STORAGE_KEYS || []) {
    const value = wx.getStorageSync(key)
    if (value !== undefined) out[key] = value
  }
  return out
}

// ---- Local dev entrypoint ----
//
// Allows running `node index.js --local` to exercise the full flow without
// WeChat cloud. Reads questions from stdin, prints answers to stdout.

if (require.main === module) {
  process.env.LOCAL = '1'
  const readline = require('readline')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ctx = { OPENID: 'local-dev' }

  // Seed local data from mcp-server fixtures (only if missing) so the demo
  // works out of the box without any cloud setup.
  const localDataDir = path.join(__dirname, '_localdata', 'local-dev')
  fs.mkdirSync(localDataDir, { recursive: true })
  if (!fs.existsSync(path.join(localDataDir, 'babyProfile.json'))) {
    const fixSrc = path.join(FUSHI_ROOT, 'mcp-server', 'test', 'fixtures')
    if (fs.existsSync(path.join(fixSrc, 'seed-babyProfile.json'))) {
      fs.copyFileSync(path.join(fixSrc, 'seed-babyProfile.json'), path.join(localDataDir, 'babyProfile.json'))
      fs.copyFileSync(path.join(fixSrc, 'seed-fridge.json'), path.join(localDataDir, 'fridge.json'))
      for (const k of ['mealJournal', 'reactions', 'customFoods', 'weeklyPlan', 'manualShopList']) {
        fs.writeFileSync(path.join(localDataDir, `${k}.json`), '[]', 'utf-8')
      }
      console.log('[local mode] seeded from mcp-server/test/fixtures/')
    } else {
      console.log('[local mode] no fixtures found; new user flow will trigger')
    }
  }

  console.log('chat-ai local mode. Type a question (empty line to quit):')
  rl.on('line', async (line) => {
    if (!line.trim()) {
      rl.close()
      return
    }
    const result = await exports.main({ question: line, history: [], _testOpenid: 'local-dev' }, ctx)
    console.log('---')
    console.log('answer:', result.answer)
    if (result.toolCalls && result.toolCalls.length) {
      console.log('tool calls:')
      for (const tc of result.toolCalls) console.log(`  - ${tc.name}(${JSON.stringify(tc.input)}) ok=${tc.ok}`)
    }
    if (result.error) console.log('error:', result.error)
    console.log()
  })
}
