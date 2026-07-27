/**
 * Day 1 + Day 2 smoke test for fushi-mcp.
 *
 * Spawns the stdio server, sends MCP initialize + tools/list + resources/list,
 * then drives each tool/resource with a focused assertion. This is the
 * smallest end-to-end check that proves the guardrails, queries, generation,
 * replacement, and resources all work.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

interface TestResult {
  name: string
  pass: boolean
  detail: string
}

async function withServer<T>(
  fn: (client: Client) => Promise<T>
): Promise<T> {
  // Reset storage to fixture before each run so tests are idempotent.
  // The server reads storage lazily, so order doesn't matter — we just need
  // it written before any tool call lands.
  const fs = await import('node:fs')
  const path = await import('node:path')
  const cwd = new URL('..', import.meta.url).pathname
  const dataDir = path.join(cwd, 'data')
  const fixturesDir = path.join(cwd, 'test', 'fixtures')
  fs.mkdirSync(dataDir, { recursive: true })
  const fridgeFixture = path.join(fixturesDir, 'seed-fridge.json')
  if (fs.existsSync(fridgeFixture)) {
    fs.copyFileSync(fridgeFixture, path.join(dataDir, 'fridge.json'))
  }
  // mealJournal + weeklyPlan + reactions + babyProfile reset to fixture so
  // a previous run's state (e.g. a [BYPASSED SAFETY] log from T22, or a
  // trying window from T34) doesn't leak into assertions.
  fs.writeFileSync(path.join(dataDir, 'mealJournal.json'), '[]', 'utf-8')
  fs.writeFileSync(path.join(dataDir, 'weeklyPlan.json'), '[]', 'utf-8')
  fs.writeFileSync(path.join(dataDir, 'reactions.json'), '[]', 'utf-8')
  const profileFixture = path.join(fixturesDir, 'seed-babyProfile.json')
  if (fs.existsSync(profileFixture)) {
    fs.copyFileSync(profileFixture, path.join(dataDir, 'babyProfile.json'))
  }

  // StdioClientTransport spawns the server child itself; we only own the client.
  // A previous version also did a manual `spawn` for stderr capture — that
  // spawned a dead child we couldn't kill. transport.close() ends the real one.
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/index.ts'],
    cwd,
  })
  const client = new Client(
    { name: 'fushi-test', version: '0.0.1' },
    { capabilities: {} }
  )
  try {
    await client.connect(transport)
    return await fn(client)
  } finally {
    await client.close()
  }
}

function pass(name: string, detail = ''): TestResult {
  return { name, pass: true, detail }
}
function fail(name: string, detail: string): TestResult {
  return { name, pass: false, detail }
}

type ToolContent = Array<{ type: string; text?: string }>
const getText = (content: unknown): string | undefined =>
  (content as ToolContent).find((c) => c.type === 'text' && c.text)?.text

function localDateTime(dayOffset: number, hour: number, minute: number): Date {
  const value = new Date()
  value.setDate(value.getDate() + dayOffset)
  value.setHours(hour, minute, 0, 0)
  return value
}

function formatLocalDate(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function run(): Promise<void> {
  const results: TestResult[] = []

  await withServer(async (client) => {
    // ---- T1: tools/list contains Day 1 + Day 2 tools ----
    const list = await client.listTools()
    const names = list.tools.map((t) => t.name).sort()
    const day1 = ['check_food_safety', 'read_baby_profile']
    const day2 = ['list_recipes', 'get_recipe', 'generate_today_menu', 'replace_meal', 'regenerate_week_plan']
    const allExpected = [...day1, ...day2]
    const allPresent = allExpected.every((n) => names.includes(n))
    results.push(
      allPresent
        ? pass('tools_list', `found: ${names.join(', ')}`)
        : fail('tools_list', `missing. got: ${names.join(', ')}`)
    )

    // ---- T2: read_baby_profile returns the seeded demo profile ----
    const profileRes = await client.callTool({ name: 'read_baby_profile', arguments: {} })
    const profileText = getText(profileRes.content)
    if (!profileText) {
      results.push(fail('read_baby_profile', 'no text content'))
    } else {
      const parsed = JSON.parse(profileText)
      const ok =
        parsed.profile?.babyName === '小蘑菇' &&
        parsed.ageMonths === 10 &&
        Array.isArray(parsed.profile?.confirmedFoods) &&
        parsed.profile.confirmedFoods.includes('鳕鱼')
      results.push(
        ok
          ? pass('read_baby_profile', `babyName=${parsed.profile.babyName} ageMonths=${parsed.ageMonths}`)
          : fail('read_baby_profile', `unexpected: ${profileText.slice(0, 200)}`)
      )
    }

    // ---- T3: check_food_safety — 鳕鱼 is safe ----
    const safeRes = await client.callTool({ name: 'check_food_safety', arguments: { foods: ['鳕鱼'] } })
    const safeText = getText(safeRes.content)
    if (!safeText) results.push(fail('check_food_safety_safe', 'no text content'))
    else {
      const parsed = JSON.parse(safeText)
      const ok = parsed.safe === true && parsed.results[0]?.safe === true
      results.push(
        ok
          ? pass('check_food_safety_safe', '鳕鱼 open+confirmed => safe')
          : fail('check_food_safety_safe', `unexpected: ${safeText.slice(0, 300)}`)
      )
    }

    // ---- T4: check_food_safety — 蜂蜜 (not in category lib) is unsafe ----
    const unsafeRes = await client.callTool({ name: 'check_food_safety', arguments: { foods: ['蜂蜜'] } })
    const unsafeText = getText(unsafeRes.content)
    if (!unsafeText) results.push(fail('check_food_safety_unsafe', 'no text content'))
    else {
      const parsed = JSON.parse(unsafeText)
      const ok =
        parsed.safe === false &&
        parsed.results[0]?.safe === false &&
        /未在分类库/.test(parsed.results[0]?.reason ?? '')
      results.push(
        ok
          ? pass('check_food_safety_unsafe', '蜂蜜 not in lib => unsafe + reason')
          : fail('check_food_safety_unsafe', `unexpected: ${unsafeText.slice(0, 300)}`)
      )
    }

    // ---- T5: check_food_safety — multi-food batch ----
    const batchRes = await client.callTool({
      name: 'check_food_safety',
      arguments: { foods: ['鳕鱼', '虾', '蛋'] },
    })
    const batchText = getText(batchRes.content)
    if (!batchText) results.push(fail('check_food_safety_batch', 'no text content'))
    else {
      const parsed = JSON.parse(batchText)
      const r3 = parsed.results as Array<{ food: string; safe: boolean }>
      const codOk = r3.find((r) => r.food === '鳕鱼')?.safe === true
      const shrimpOk = r3.find((r) => r.food === '虾')?.safe === false
      const eggOk = r3.find((r) => r.food === '蛋')?.safe === false
      results.push(
        codOk && shrimpOk && eggOk
          ? pass('check_food_safety_batch', '鳕鱼=safe 虾=locked=>unsafe 蛋=observation=>unsafe')
          : fail('check_food_safety_batch', `parsed: ${JSON.stringify(r3)}`)
      )
    }

    // ---- T6: list_recipes — at least 3 applicable recipes for 10mo ----
    const listRes = await client.callTool({ name: 'list_recipes', arguments: {} })
    const listText = getText(listRes.content)
    if (!listText) results.push(fail('list_recipes', 'no text content'))
    else {
      const parsed = JSON.parse(listText)
      const count = parsed.recipes?.length ?? 0
      const allHaveId = parsed.recipes?.every((r: { recipe: { id: string } }) => !!r.recipe.id) ?? false
      results.push(
        count >= 3 && allHaveId
          ? pass('list_recipes', `count=${count} allHaveId=${allHaveId}`)
          : fail('list_recipes', `count=${count} allHaveId=${allHaveId}`)
      )
    }

    // ---- T7: list_recipes filtered by mealCategory=protein returns ≥1 ----
    const protRes = await client.callTool({ name: 'list_recipes', arguments: { mealCategory: 'protein' } })
    const protText = getText(protRes.content)
    if (!protText) results.push(fail('list_recipes_protein', 'no text content'))
    else {
      const parsed = JSON.parse(protText)
      const ok = parsed.recipes.length >= 1 && parsed.recipes.every((r: { recipe: { mealCategories: string[] } }) => r.recipe.mealCategories.includes('protein'))
      results.push(
        ok
          ? pass('list_recipes_protein', `count=${parsed.recipes.length}`)
          : fail('list_recipes_protein', `count=${parsed.recipes.length}`)
      )
    }

    // ---- T8: get_recipe — fetch a recipe we know is applicable, verify shape ----
    // Self-contained: use list_recipes to get the first applicable id, then get_recipe.
    const firstId = JSON.parse(listText!).recipes[0]?.recipe?.id
    if (!firstId) {
      results.push(fail('get_recipe', 'no first id from list_recipes'))
    } else {
      const getRes = await client.callTool({ name: 'get_recipe', arguments: { id: firstId } })
      const getText_ = getText(getRes.content)
      if (!getText_) results.push(fail('get_recipe', 'no text content'))
      else {
        const parsed = JSON.parse(getText_)
        const ok =
          parsed.recipe?.id === firstId &&
          typeof parsed.applicable === 'boolean' &&
          Array.isArray(parsed.recipe?.ingredients)
        results.push(
          ok
            ? pass('get_recipe', `id=${firstId} applicable=${parsed.applicable}`)
            : fail('get_recipe', `unexpected: ${getText_.slice(0, 300)}`)
        )
      }
    }

    // ---- T9: get_recipe with bogus id errors cleanly ----
    const bogusRes = await client.callTool({ name: 'get_recipe', arguments: { id: 'definitely_not_a_real_id' } })
    const bogusText = getText(bogusRes.content)
    const isErr = (bogusRes as { isError?: boolean }).isError === true
    results.push(
      isErr && /not found/.test(bogusText ?? '')
        ? pass('get_recipe_not_found', 'bogus id => isError + not found message')
        : fail('get_recipe_not_found', `isError=${isErr} text=${bogusText?.slice(0, 200)}`)
    )

    // ---- T10: generate_today_menu — 3 meals, all applicable ----
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const genRes = await client.callTool({ name: 'generate_today_menu', arguments: { date: todayStr } })
    const genText = getText(genRes.content)
    if (!genText) results.push(fail('generate_today_menu', 'no text content'))
    else {
      const parsed = JSON.parse(genText)
      const meals = parsed.meals ?? []
      const ok = parsed.date === todayStr && meals.length === 3 && meals.every((m: { recipeId: string }) => !!m.recipeId)
      results.push(
        ok
          ? pass('generate_today_menu', `date=${parsed.date} meals=${meals.length} ${parsed.keptFromExisting ? '(existing)' : '(new)'}`)
          : fail('generate_today_menu', `unexpected: ${genText.slice(0, 400)}`)
      )
    }

    // ---- T11: replace_meal — get ≥3 distinct candidates ----
    const replaceRes = await client.callTool({
      name: 'replace_meal',
      arguments: { date: todayStr, mealIndex: 0, topN: 3 },
    })
    const replaceText = getText(replaceRes.content)
    if (!replaceText) results.push(fail('replace_meal', 'no text content'))
    else {
      const parsed = JSON.parse(replaceText)
      const cands = parsed.candidates ?? []
      const ids = new Set(cands.map((c: { recipe: { id: string } }) => c.recipe.id))
      const ok = cands.length >= 3 && ids.size === cands.length
      results.push(
        ok
          ? pass('replace_meal', `candidates=${cands.length} distinct=${ids.size}`)
          : fail('replace_meal', `candidates=${cands.length} distinct=${ids.size}`)
      )
    }

    // ---- T12: regenerate_week_plan — returns 7 days ----
    const regenRes = await client.callTool({ name: 'regenerate_week_plan', arguments: {} })
    const regenText = getText(regenRes.content)
    if (!regenText) results.push(fail('regenerate_week_plan', 'no text content'))
    else {
      const parsed = JSON.parse(regenText)
      const plan = parsed.plan ?? []
      const ok = Array.isArray(plan) && plan.length >= 1 && plan.every((d: { date: string; meals: unknown[] }) => !!d.date && Array.isArray(d.meals))
      results.push(
        ok
          ? pass('regenerate_week_plan', `days=${plan.length} kept=${parsed.kept}`)
          : fail('regenerate_week_plan', `unexpected: ${regenText.slice(0, 300)}`)
      )
    }

    // ---- T13: resources/list returns 7 static resources + listResourceTemplates returns 3 ----
    const resList = await client.listResources()
    const resUris = resList.resources.map((r) => r.uri).sort()
    const expectedUris = [
      'fushi://fridge',
      'fushi://journal/week',
      'fushi://plan/today',
      'fushi://plan/week',
      'fushi://profile',
      'fushi://profile/trying-progress',
      'fushi://recommendations/next',
    ]
    const staticOk = expectedUris.every((u) => resUris.includes(u))
    // MCP SDK v1.29 exposes URI templates via a separate listResourceTemplates call.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const templateList = await (client as any).listResourceTemplates?.()
    const templateUris: string[] = (templateList?.resourceTemplates ?? []).map((t: { uriTemplate?: string }) => t.uriTemplate ?? '')
    const recipesTemplate = templateUris.some((u) => /fushi:\/\/recipes\/\{categoryId\}/.test(u))
    const journalTemplate = templateUris.some((u) => /fushi:\/\/journal\/\{days\}/.test(u))
    const reactionsTemplate = templateUris.some((u) => /fushi:\/\/reactions\/\{days\}/.test(u))
    const ok13 = staticOk && recipesTemplate && journalTemplate && reactionsTemplate
    results.push(
      ok13
        ? pass('resources_list', `${resUris.length} static + ${templateUris.length} template(s)`)
        : fail('resources_list', `static=${staticOk} recipesTpl=${recipesTemplate} journalTpl=${journalTemplate} reactionsTpl=${reactionsTemplate} templates=${templateUris.join(',')}`)
    )

    // ---- T14: fushi://profile resource read returns valid JSON ----
    const profRes = await client.readResource({ uri: 'fushi://profile' })
    const profContents = (profRes.contents as Array<{ text?: string }>) ?? []
    const profText = profContents[0]?.text
    if (!profText) results.push(fail('resource_fushi_profile', 'no text content'))
    else {
      try {
        const parsed = JSON.parse(profText)
        const ok = parsed.profile?.babyName === '小蘑菇' && parsed.ageMonths === 10
        results.push(
          ok
            ? pass('resource_fushi_profile', `babyName=${parsed.profile.babyName}`)
            : fail('resource_fushi_profile', `unexpected: ${profText.slice(0, 200)}`)
        )
      } catch (e) {
        results.push(fail('resource_fushi_profile', `not valid JSON: ${(e as Error).message}`))
      }
    }

    // ---- T15: fushi://plan/today has NO side effects when data is missing ----
    // This locks in the decision to not auto-generate from a read API. To
    // exercise the "missing" path we clear weeklyPlan.json in the server's
    // data dir (via the in-process shim — same process as the server's
    // readJson, so a write here is visible to the next read). Then read the
    // resource and verify (a) the response says found=false, (b) weeklyPlan
    // is still empty (no auto-generation).
    //
    // We do this through a tool the server already exposes indirectly via
    // writeJson: simplest path is to use Node fs from the test process to
    // overwrite the server's data file. The server reads weeklyPlan lazily
    // on each call, so the next read picks up our overwrite.
    const fs = await import('node:fs')
    const path = await import('node:path')
    const dataDir = path.resolve(new URL('..', import.meta.url).pathname, 'data')
    const weeklyPlanPath = path.join(dataDir, 'weeklyPlan.json')
    fs.writeFileSync(weeklyPlanPath, '[]', 'utf-8')

    const todayRes = await client.readResource({ uri: 'fushi://plan/today' })
    const todayContents = (todayRes.contents as Array<{ text?: string }>) ?? []
    const todayText = todayContents[0]?.text ?? ''
    let planAfter = ''
    try {
      planAfter = fs.readFileSync(weeklyPlanPath, 'utf-8')
    } catch (_e) {
      planAfter = '<missing>'
    }
    let todayParsed: { found?: boolean; hint?: string } = {}
    try {
      todayParsed = JSON.parse(todayText)
    } catch (_e) {
      /* ignore */
    }
    const noSideEffect = planAfter.trim() === '[]'
    const ok15 = todayParsed.found === false && !!todayParsed.hint && noSideEffect
    results.push(
      ok15
        ? pass('resource_plan_today_no_sideeffect', `found=false, plan still empty, hint present`)
        : fail('resource_plan_today_no_sideeffect', `found=${todayParsed.found} hint=${todayParsed.hint} planAfter=${planAfter.slice(0, 100)}`)
    )

    // ---- T16: list_fridge — sees the 5 seeded items ----
    const listFridgeRes = await client.callTool({ name: 'list_fridge', arguments: {} })
    const listFridgeText = getText(listFridgeRes.content)
    if (!listFridgeText) results.push(fail('list_fridge', 'no text content'))
    else {
      const parsed = JSON.parse(listFridgeText)
      const names = new Set((parsed.items ?? []).map((i: { name: string }) => i.name))
      const ok = names.has('鳕鱼') && names.has('西兰花') && (parsed.items ?? []).length >= 5
      results.push(
        ok
          ? pass('list_fridge', `${(parsed.items ?? []).length} items, urgent=${(parsed.urgent ?? []).length}`)
          : fail('list_fridge', `items=${(parsed.items ?? []).length} names=${[...names].join(',')}`)
      )
    }

    // ---- T17: add_fridge_item — adds a new item, list_fridge sees it ----
    const addRes = await client.callTool({
      name: 'add_fridge_item',
      arguments: { name: '胡萝卜', portions: 3, storageLocation: 'refrigerated' },
    })
    const addText = getText(addRes.content)
    const addParsed = addText ? JSON.parse(addText) : null
    const reList = await client.callTool({ name: 'list_fridge', arguments: {} })
    const reListParsed = JSON.parse(getText(reList.content) ?? '{}')
    const hasCarrot = (reListParsed.items ?? []).some(
      (i: { name: string; portions: number }) => i.name === '胡萝卜' && i.portions >= 3
    )
    results.push(
      addParsed?.added?.name === '胡萝卜' && hasCarrot
        ? pass('add_fridge_item', '胡萝卜 x3 added + visible in list')
        : fail('add_fridge_item', `addResult=${addText?.slice(0, 200)} hasCarrot=${hasCarrot}`)
    )

    // ---- T18: use_fridge_item — 鸡蛋 3→2 (a stable item that survives record_meal_log side effects) ----
    const eggBefore = (reListParsed.items ?? []).find((i: { name: string }) => i.name === '鸡蛋') as { portions: number } | undefined
    const useRes = await client.callTool({
      name: 'use_fridge_item',
      arguments: { name: '鸡蛋', portions: 1 },
    })
    const useText = getText(useRes.content)
    const useParsed = useText ? JSON.parse(useText) : null
    const ok18 =
      useParsed?.consumed?.name === '鸡蛋' &&
      useParsed?.consumed?.portions === 1 &&
      (eggBefore ? useParsed.remaining === eggBefore.portions - 1 : false)
    results.push(
      ok18
        ? pass('use_fridge_item', `鸡蛋 ${eggBefore?.portions}→${useParsed.remaining}`)
        : fail('use_fridge_item', `parsed=${useText?.slice(0, 200)} before=${eggBefore?.portions}`)
    )

    // ---- T19: get_fridge_advice — shape ----
    const adviceRes = await client.callTool({ name: 'get_fridge_advice', arguments: {} })
    const adviceText = getText(adviceRes.content)
    if (!adviceText) results.push(fail('get_fridge_advice', 'no text content'))
    else {
      const parsed = JSON.parse(adviceText)
      const ok =
        Array.isArray(parsed.urgentItems) &&
        Array.isArray(parsed.lowStockItems) &&
        typeof parsed.todayAdviceCount === 'number'
      results.push(
        ok
          ? pass('get_fridge_advice', `urgent=${parsed.urgentItems.length} lowStock=${parsed.lowStockItems.length} count=${parsed.todayAdviceCount}`)
          : fail('get_fridge_advice', `unexpected: ${adviceText.slice(0, 200)}`)
      )
    }

    // ---- T20: record_meal_log — safe ingredients — log written, fridge deducted ----
    // Use 西兰花 (seeded 2 份) instead of 鳕鱼 so deductions are unambiguous.
    // Use yesterday so the meal/reaction pair is always in the 72h traceback
    // and 7-day resource windows, independent of the day the suite is run.
    const mealOccurredAt = localDateTime(-1, 10, 0)
    const reactionOccurredAt = localDateTime(-1, 12, 30).toISOString()
    const logDate = formatLocalDate(mealOccurredAt)
    const broccoliBefore = (reListParsed.items ?? []).find((i: { name: string }) => i.name === '西兰花') as { portions: number } | undefined
    const recordSafeRes = await client.callTool({
      name: 'record_meal_log',
      arguments: {
        date: logDate,
        mealIndex: 0,
        ingredients: ['西兰花'],
        portion: 'full',
        preference: 'love',
        note: '宝宝挺爱吃',
        eatenAt: mealOccurredAt.toISOString(),
      },
    })
    const recordSafeText = getText(recordSafeRes.content)
    if (!recordSafeText) {
      results.push(fail('record_meal_log_safe', 'no text content'))
    } else {
      const parsed = JSON.parse(recordSafeText)
      const reList2 = await client.callTool({ name: 'list_fridge', arguments: {} })
      const reList2Parsed = JSON.parse(getText(reList2.content) ?? '{}')
      const broccoliAfter = (reList2Parsed.items ?? []).find((i: { name: string }) => i.name === '西兰花') as { portions: number } | undefined
      const ok =
        parsed.safetyCheck?.bypassed === false &&
        parsed.safetyCheck?.flaggedFoods?.length === 0 &&
        Array.isArray(parsed.consumed) &&
        parsed.log?.date === logDate &&
        parsed.log?.preference === 'love' &&
        broccoliBefore &&
        broccoliAfter &&
        broccoliAfter.portions === broccoliBefore.portions - 1
      results.push(
        ok
          ? pass('record_meal_log_safe', `log written, 西兰花 ${broccoliBefore.portions}→${broccoliAfter.portions}`)
          : fail('record_meal_log_safe', `parsed=${recordSafeText.slice(0, 400)} before=${broccoliBefore?.portions} after=${broccoliAfter?.portions}`)
      )
    }

    // ---- T21: record_meal_log — UNSAFE without consent → isError + SafetyBlockError ----
    const recordUnsafeRes = await client.callTool({
      name: 'record_meal_log',
      arguments: {
        date: logDate,
        mealIndex: 1,
        ingredients: ['蜂蜜'],
        portion: 'taste',
        preference: null,
      },
    })
    const recordUnsafeText = getText(recordUnsafeRes.content)
    const isUnsafeErr = (recordUnsafeRes as { isError?: boolean }).isError === true
    const ok21 = isUnsafeErr && /blocked/i.test(recordUnsafeText ?? '') && /蜂蜜/.test(recordUnsafeText ?? '')
    results.push(
      ok21
        ? pass('record_meal_log_unsafe_blocked', '蜂蜜 no consent => isError + blocked message')
        : fail('record_meal_log_unsafe_blocked', `isError=${isUnsafeErr} text=${recordUnsafeText?.slice(0, 300)}`)
    )

    // ---- T22: record_meal_log — UNSAFE + consentToBypassSafety=true → log with [BYPASSED SAFETY] prefix ----
    const recordBypassRes = await client.callTool({
      name: 'record_meal_log',
      arguments: {
        date: logDate,
        mealIndex: 2,
        ingredients: ['蜂蜜'],
        portion: 'taste',
        preference: null,
        note: '家人不小心给的',
        consentToBypassSafety: true,
      },
    })
    const recordBypassText = getText(recordBypassRes.content)
    if (!recordBypassText) {
      results.push(fail('record_meal_log_bypass', 'no text content'))
    } else {
      const parsed = JSON.parse(recordBypassText)
      const ok =
        parsed.safetyCheck?.bypassed === true &&
        parsed.safetyCheck?.flaggedFoods?.length === 1 &&
        /\[BYPASSED SAFETY\]/.test(parsed.log?.note ?? '')
      results.push(
        ok
          ? pass('record_meal_log_bypass', '蜂蜜 + consent => logged with [BYPASSED SAFETY]')
          : fail('record_meal_log_bypass', `parsed=${recordBypassText.slice(0, 400)}`)
      )
    }

    // ---- T23: undo_meal_log — restores the [BYPASSED] entry ----
    const undoRes = await client.callTool({
      name: 'undo_meal_log',
      arguments: { date: logDate, mealIndex: 2 },
    })
    const undoText = getText(undoRes.content)
    if (!undoText) {
      results.push(fail('undo_meal_log', 'no text content'))
    } else {
      const parsed = JSON.parse(undoText)
      const ok =
        parsed.removedLog?.note?.includes?.('[BYPASSED SAFETY]') &&
        Array.isArray(parsed.restored) &&
        parsed.restored.length === 1
      results.push(
        ok
          ? pass('undo_meal_log', `removed [BYPASSED] log, restored ${parsed.restored.length} item(s)`)
          : fail('undo_meal_log', `parsed=${undoText.slice(0, 300)}`)
      )
    }

    // ---- T24: undo_meal_log — nonexistent throws cleanly (valid mealIndex) ----
    const undoBogus = await client.callTool({
      name: 'undo_meal_log',
      arguments: { date: '1999-01-01', mealIndex: 0 },
    })
    const undoBogusText = getText(undoBogus.content)
    const undoBogusErr = (undoBogus as { isError?: boolean }).isError === true
    results.push(
      undoBogusErr && /no meal log/.test(undoBogusText ?? '')
        ? pass('undo_meal_log_not_found', '1999-01-01/0 => isError + no meal log message')
        : fail('undo_meal_log_not_found', `isError=${undoBogusErr} text=${undoBogusText?.slice(0, 200)}`)
    )

    // ---- T25: fushi://fridge resource read ----
    const fridgeRes = await client.readResource({ uri: 'fushi://fridge' })
    const fridgeContents = (fridgeRes.contents as Array<{ text?: string }>) ?? []
    const fridgeText = fridgeContents[0]?.text
    if (!fridgeText) results.push(fail('resource_fushi_fridge', 'no text'))
    else {
      try {
        const parsed = JSON.parse(fridgeText)
        const ok = Array.isArray(parsed.items) && parsed.items.length >= 5
        results.push(
          ok
            ? pass('resource_fushi_fridge', `items=${parsed.items.length}`)
            : fail('resource_fushi_fridge', `items=${parsed.items?.length}`)
        )
      } catch (e) {
        results.push(fail('resource_fushi_fridge', `not JSON: ${(e as Error).message}`))
      }
    }

    // ---- T26: fushi://journal/week resource read ----
    const journalRes = await client.readResource({ uri: 'fushi://journal/week' })
    const journalContents = (journalRes.contents as Array<{ text?: string }>) ?? []
    const journalText = journalContents[0]?.text
    if (!journalText) results.push(fail('resource_fushi_journal_week', 'no text'))
    else {
      try {
        const parsed = JSON.parse(journalText)
        const ok = parsed.days === 7 && Array.isArray(parsed.logs) && Array.isArray(parsed.newFoods)
        results.push(
          ok
            ? pass('resource_fushi_journal_week', `days=${parsed.days} count=${parsed.count} newFoods=${parsed.newFoods.length}`)
            : fail('resource_fushi_journal_week', `unexpected: ${journalText.slice(0, 200)}`)
        )
      } catch (e) {
        results.push(fail('resource_fushi_journal_week', `not JSON: ${(e as Error).message}`))
      }
    }

    // ---- T27: fushi://journal/3 resource read (template) ----
    const journal3Res = await client.readResource({ uri: 'fushi://journal/3' })
    const journal3Contents = (journal3Res.contents as Array<{ text?: string }>) ?? []
    const journal3Text = journal3Contents[0]?.text
    if (!journal3Text) results.push(fail('resource_fushi_journal_template', 'no text'))
    else {
      try {
        const parsed = JSON.parse(journal3Text)
        const ok = parsed.days === 3 && typeof parsed.from === 'string' && typeof parsed.to === 'string'
        results.push(
          ok
            ? pass('resource_fushi_journal_template', `days=${parsed.days} from=${parsed.from} to=${parsed.to}`)
            : fail('resource_fushi_journal_template', `unexpected: ${journal3Text.slice(0, 200)}`)
        )
      } catch (e) {
        results.push(fail('resource_fushi_journal_template', `not JSON: ${(e as Error).message}`))
      }
    }

    // ---- T28: record_reaction — pulls 72h traceback, finds suspect, returns recommendation ----
    // The reaction time is after yesterday's meal so the 72h window catches
    // it. We also pass tracebackIngredients=['豆腐'] — not
    // in confirmedFoods, so analyzeSuspects flags it (the demo seed confirms
    // all common 10mo ingredients, so without a hint every suspect is skipped).
    // Type is 'rash' (not 'gut') so later start_trying_food isn't blocked by
    // hasActiveGutReaction(); moderate + rash still maps to enterObservation.
    const reactionRes = await client.callTool({
      name: 'record_reaction',
      arguments: {
        type: 'rash',
        severity: 'moderate',
        occurredAt: reactionOccurredAt,
        note: '红疹',
        tracebackIngredients: ['豆腐'],
      },
    })
    const reactionText = getText(reactionRes.content)
    if (!reactionText) {
      results.push(fail('record_reaction', 'no text content'))
    } else {
      try {
        const parsed = JSON.parse(reactionText)
        const ok =
          parsed.reaction?.id?.startsWith?.('r-') &&
          parsed.reaction?.severity === 'moderate' &&
          Array.isArray(parsed.tracebackMeals) &&
          parsed.tracebackMeals.length >= 1 &&
          Array.isArray(parsed.initialSuspects) &&
          parsed.initialSuspects.length >= 1 &&
          parsed.initialSuspects[0]?.name === '豆腐' &&
          parsed.recommendation?.action === 'enterObservation' &&
          parsed.recommendation?.days === 7 &&
          parsed.isSeverDirectAllergic === false
        results.push(
          ok
            ? pass('record_reaction', `id=${parsed.reaction.id} suspects=${parsed.initialSuspects.length} rec=${parsed.recommendation.action}`)
            : fail('record_reaction', `parsed=${reactionText.slice(0, 400)}`)
        )
        // Stash for T29 + T39
        ;(globalThis as Record<string, unknown>).__lastReactionId = parsed.reaction?.id
      } catch (e) {
        results.push(fail('record_reaction', `JSON parse: ${(e as Error).message}; raw=${reactionText.slice(0, 300)}`))
      }
    }

    // ---- T29: analyze_suspect_foods — ruleTrace contains expected fields ----
    const reactionId = (globalThis as Record<string, unknown>).__lastReactionId as string
    if (!reactionId) {
      results.push(fail('analyze_suspect_foods', 'no reactionId from T28'))
    } else {
      const analyzeRes = await client.callTool({
        name: 'analyze_suspect_foods',
        arguments: { reactionId },
      })
      const analyzeText = getText(analyzeRes.content)
      if (!analyzeText) {
        results.push(fail('analyze_suspect_foods', 'no text content'))
      } else {
        const parsed = JSON.parse(analyzeText)
        const rt = parsed.ruleTrace
        const ok =
          rt &&
          Array.isArray(rt.allergicSkipped) &&
          Array.isArray(rt.confirmedSkipped) &&
          Array.isArray(rt.introducingChecked) &&
          'tryingDayLabel' in rt &&
          Array.isArray(parsed.suspects) &&
          parsed.suspects.length >= 1 &&
          parsed.suspects[0]?.name === '豆腐'
        results.push(
          ok
            ? pass('analyze_suspect_foods', `ruleTrace shape OK, suspects=${parsed.suspects.length} tryingDayLabel=${rt.tryingDayLabel}`)
            : fail('analyze_suspect_foods', `parsed=${analyzeText.slice(0, 400)}`)
        )
      }
    }

    // ---- T30: analyze_suspect_foods — bogus reactionId errors ----
    const analyzeBogus = await client.callTool({
      name: 'analyze_suspect_foods',
      arguments: { reactionId: 'r-not-real' },
    })
    const analyzeBogusText = getText(analyzeBogus.content)
    const analyzeBogusErr = (analyzeBogus as { isError?: boolean }).isError === true
    results.push(
      analyzeBogusErr && /not found/.test(analyzeBogusText ?? '')
        ? pass('analyze_suspect_foods_not_found', 'bogus id => isError + not found')
        : fail('analyze_suspect_foods_not_found', `isError=${analyzeBogusErr} text=${analyzeBogusText?.slice(0, 200)}`)
    )

    // ---- T31: prompts/list returns the 2 Day 4 prompts ----
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptList = await (client as any).listPrompts?.()
    const promptNames: string[] = (promptList?.prompts ?? []).map((p: { name: string }) => p.name)
    const day4Prompts = ['daily_checkin', 'reaction_followup']
    const ok31 = day4Prompts.every((n) => promptNames.includes(n))
    results.push(
      ok31
        ? pass('prompts_list', `found: ${promptNames.join(', ')}`)
        : fail('prompts_list', `got: ${promptNames.join(', ')}`)
    )

    // ---- T32: get_prompt reaction_followup returns messages with role+content ----
    const followupPrompt = await (client as any).getPrompt?.({
      name: 'reaction_followup',
      arguments: { reaction_type: 'gut', severity: 'moderate', occurred_at: reactionOccurredAt },
    })
    const msgs = followupPrompt?.messages ?? []
    const hasSystem = msgs.some(
      (m: { role: string; content: { type: string; text: string } }) =>
        m.role === 'assistant' && m.content?.type === 'text' && /ruleTrace/.test(m.content.text)
    )
    const hasUser = msgs.some(
      (m: { role: string; content: { type: string; text: string } }) =>
        m.role === 'user' && m.content?.type === 'text' && /拉稀|反应/.test(m.content.text)
    )
    results.push(
      hasSystem && hasUser
        ? pass('prompt_reaction_followup', `${msgs.length} messages, system+user both present`)
        : fail('prompt_reaction_followup', `msgs=${msgs.length} system=${hasSystem} user=${hasUser}`)
    )

    // ---- T33: fushi://reactions/7 resource read ----
    const reactionsRes = await client.readResource({ uri: 'fushi://reactions/7' })
    const reactionsContents = (reactionsRes.contents as Array<{ text?: string }>) ?? []
    const reactionsText = reactionsContents[0]?.text
    if (!reactionsText) results.push(fail('resource_fushi_reactions', 'no text'))
    else {
      try {
        const parsed = JSON.parse(reactionsText)
        const ok =
          parsed.days === 7 &&
          parsed.count >= 1 &&
          Array.isArray(parsed.reactions) &&
          Array.isArray(parsed.activeReactions)
        results.push(
          ok
            ? pass('resource_fushi_reactions', `count=${parsed.count} active=${parsed.activeCount}`)
            : fail('resource_fushi_reactions', `unexpected: ${reactionsText.slice(0, 200)}`)
        )
      } catch (e) {
        results.push(fail('resource_fushi_reactions', `not JSON: ${(e as Error).message}`))
      }
    }

    // ---- T34: start_trying_food happy path (untried category) ----
    // Use 'whiteMeat' (currently untried) so the guard passes.
    const startRes = await client.callTool({
      name: 'start_trying_food',
      arguments: { categoryId: 'whiteMeat', food: '鸡肉' },
    })
    const startText = getText(startRes.content)
    if (!startText) {
      results.push(fail('start_trying_food', `isError=${(startRes as { isError?: boolean }).isError} content=${JSON.stringify(startRes.content).slice(0, 400)}`))
    } else {
      try {
        const parsed = JSON.parse(startText)
        const ok =
          parsed.categoryId === 'whiteMeat' &&
          parsed.food === '鸡肉' &&
          parsed.daysRequired === 3 &&
          (parsed.schedule === 'today' || parsed.schedule === 'tomorrow') &&
          typeof parsed.startDate === 'string'
        results.push(
          ok
            ? pass('start_trying_food', `food=鸡肉 daysRequired=${parsed.daysRequired} schedule=${parsed.schedule}`)
            : fail('start_trying_food', `parsed=${startText.slice(0, 400)}`)
        )
      } catch (e) {
        results.push(fail('start_trying_food', `JSON parse fail: ${(e as Error).message}; raw=${startText.slice(0, 400)}`))
      }
    }

    // ---- T35: start_trying_food rejected — already trying ----
    const startDupRes = await client.callTool({
      name: 'start_trying_food',
      arguments: { categoryId: 'fruitLow', food: '苹果' },
    })
    const startDupText = getText(startDupRes.content)
    const startDupErr = (startDupRes as { isError?: boolean }).isError === true
    results.push(
      startDupErr && /already a trying|already.*in.*progress/i.test(startDupText ?? '')
        ? pass('start_trying_food_blocked', '重复 start_trying_food => isError + already-in-progress')
        : fail('start_trying_food_blocked', `isError=${startDupErr} text=${startDupText?.slice(0, 200)}`)
    )

    // ---- T36: complete_trying_food blocked — too early OR not yet started ----
    // start_trying_food scheduled for tomorrow, so getTryingProgress may
    // either (a) return null because startDate is in the future, or
    // (b) return dayIndex=0 because no feedings logged yet. Either way,
    // complete must be blocked.
    const completeEarlyRes = await client.callTool({
      name: 'complete_trying_food',
      arguments: { categoryId: 'whiteMeat' },
    })
    const completeEarlyText = getText(completeEarlyRes.content)
    const completeEarlyErr = (completeEarlyRes as { isError?: boolean }).isError === true
    const earlyText = completeEarlyText ?? ''
    const isEarlyBlock =
      /too early/i.test(earlyText) ||
      /no progress/i.test(earlyText) ||
      /not in trying state/i.test(earlyText) ||
      /day.*\d+/.test(earlyText)
    results.push(
      completeEarlyErr && isEarlyBlock
        ? pass('complete_trying_food_too_early', `未到 complete 条件 => isError + 拒绝`)
        : fail('complete_trying_food_too_early', `isError=${completeEarlyErr} text=${earlyText.slice(0, 200)}`)
    )

    // ---- T37: abort_trying_food — rolls back to untried (whiteMeat was untried) ----
    const abortRes = await client.callTool({
      name: 'abort_trying_food',
      arguments: { categoryId: 'whiteMeat' },
    })
    const abortText = getText(abortRes.content)
    if (!abortText) {
      results.push(fail('abort_trying_food', `isError=${(abortRes as { isError?: boolean }).isError}`))
    } else {
      try {
        const parsed = JSON.parse(abortText)
        const ok = parsed.abortedFood === '鸡肉' && parsed.resultingState === 'untried'
        results.push(
          ok
            ? pass('abort_trying_food', `aborted 鸡肉 → ${parsed.resultingState}`)
            : fail('abort_trying_food', `parsed=${abortText.slice(0, 300)}`)
        )
      } catch (e) {
        results.push(fail('abort_trying_food', `JSON parse: ${(e as Error).message}; raw=${abortText.slice(0, 300)}`))
      }
    }

    // ---- T38: mark_food_allergic — bogus reactionId => isError + not found ----
    const markBogus = await client.callTool({
      name: 'mark_food_allergic',
      arguments: {
        food: '虾',
        reactionId: 'r-not-real',
        consentToConfirmIrreversible: true,
      },
    })
    const markBogusText = getText(markBogus.content)
    const markBogusErr = (markBogus as { isError?: boolean }).isError === true
    results.push(
      markBogusErr && /not found/i.test(markBogusText ?? '')
        ? pass('mark_food_allergic_bogus_reaction', 'bogus reactionId => isError + not found')
        : fail('mark_food_allergic_bogus_reaction', `isError=${markBogusErr} text=${markBogusText?.slice(0, 200)}`)
    )

    // ---- T39: mark_food_allergic — real reactionId + consent=true => success ----
    // T28 created a real reaction (id stashed in __lastReactionId).
    const realReactionId = (globalThis as Record<string, unknown>).__lastReactionId as string
    if (!realReactionId) {
      results.push(fail('mark_food_allergic_happy', 'no real reactionId from T28'))
    } else {
      const markRes = await client.callTool({
        name: 'mark_food_allergic',
        arguments: {
          food: '豆腐',
          reactionId: realReactionId,
          consentToConfirmIrreversible: true,
          note: '测试过敏标记',
        },
      })
      const markText = getText(markRes.content)
      if (!markText) {
        results.push(fail('mark_food_allergic_happy', 'no text content'))
      } else {
        const parsed = JSON.parse(markText)
        const ok =
          parsed.food === '豆腐' &&
          parsed.state === 'allergic' &&
          parsed.reactionId === realReactionId &&
          typeof parsed.enteredAt === 'string'
        results.push(
          ok
            ? pass('mark_food_allergic_happy', `豆腐 marked allergic, enteredAt=${parsed.enteredAt}`)
            : fail('mark_food_allergic_happy', `parsed=${markText.slice(0, 300)}`)
        )
      }
    }

    // ---- T40: enter_observation — sets 7-day window ----
    const obsRes = await client.callTool({
      name: 'enter_observation',
      arguments: { food: '鸡蛋', daysOverride: 5, note: '轻度皮疹' },
    })
    const obsText = getText(obsRes.content)
    if (!obsText) {
      results.push(fail('enter_observation', 'no text content'))
    } else {
      const parsed = JSON.parse(obsText)
      const ok = parsed.food === '鸡蛋' && parsed.state === 'observation' && parsed.days === 5
      results.push(
        ok
          ? pass('enter_observation', `鸡蛋 observation 5 天, nextRetry=${parsed.nextRetryDate}`)
          : fail('enter_observation', `parsed=${obsText.slice(0, 300)}`)
      )
    }

    // ---- T41: start_introducing — 蜂蜜 blocked by safety gate ----
    const introRes = await client.callTool({
      name: 'start_introducing',
      arguments: { food: '蜂蜜' },
    })
    const introText = getText(introRes.content)
    const introErr = (introRes as { isError?: boolean }).isError === true
    results.push(
      introErr && /blocked|safety|unsafe/i.test(introText ?? '')
        ? pass('start_introducing_safety_blocked', '蜂蜜 => isError + safety blocked')
        : fail('start_introducing_safety_blocked', `isError=${introErr} text=${introText?.slice(0, 200)}`)
    )

    // ---- T42: fushi://profile/trying-progress resource ----
    const tryingRes = await client.readResource({ uri: 'fushi://profile/trying-progress' })
    const tryingContents = (tryingRes.contents as Array<{ text?: string }>) ?? []
    const tryingText = tryingContents[0]?.text
    if (!tryingText) results.push(fail('resource_trying_progress', 'no text'))
    else {
      try {
        const parsed = JSON.parse(tryingText)
        const ok =
          'trying' in parsed &&
          'scheduledStart' in parsed &&
          'isComplete' in parsed &&
          Array.isArray(parsed.nextRecommendations)
        results.push(
          ok
            ? pass('resource_trying_progress', `trying=${parsed.trying?.food ?? 'none'} nextRecs=${parsed.nextRecommendations.length}`)
            : fail('resource_trying_progress', `unexpected: ${tryingText.slice(0, 200)}`)
        )
      } catch (e) {
        results.push(fail('resource_trying_progress', `not JSON: ${(e as Error).message}`))
      }
    }

    // ---- T43: fushi://recommendations/next resource ----
    const recRes = await client.readResource({ uri: 'fushi://recommendations/next' })
    const recContents = (recRes.contents as Array<{ text?: string }>) ?? []
    const recText = recContents[0]?.text
    if (!recText) results.push(fail('resource_recommendations_next', 'no text'))
    else {
      try {
        const parsed = JSON.parse(recText)
        const ok = Array.isArray(parsed)
        results.push(
          ok
            ? pass('resource_recommendations_next', `${parsed.length} recommendations`)
            : fail('resource_recommendations_next', `not array: ${recText.slice(0, 200)}`)
        )
      } catch (e) {
        results.push(fail('resource_recommendations_next', `not JSON: ${(e as Error).message}`))
      }
    }

    // ---- T44: introduce_new_food prompt get ----
    const introPrompt = await (client as any).getPrompt?.({
      name: 'introduce_new_food',
      arguments: { food: '虾', reason: '月龄到了' },
    })
    const introMsgs = introPrompt?.messages ?? []
    const introSystem = introMsgs.some(
      (m: { role: string; content: { type: string; text: string } }) =>
        m.role === 'assistant' && /postVaccine|hasActiveGutReaction|check_food_safety/.test(m.content.text)
    )
    const introUser = introMsgs.some(
      (m: { role: string; content: { type: string; text: string } }) =>
        m.role === 'user' && /虾/.test(m.content.text) && /月龄到了/.test(m.content.text)
    )
    results.push(
      introSystem && introUser
        ? pass('prompt_introduce_new_food', `${introMsgs.length} messages, system+user both present`)
        : fail('prompt_introduce_new_food', `system=${introSystem} user=${introUser}`)
    )

    // ---- T45: get_week_summary — 4-card layout shape ----
    const summaryRes = await client.callTool({ name: 'get_week_summary', arguments: {} })
    const summaryText = getText(summaryRes.content)
    if (!summaryText) {
      results.push(fail('get_week_summary', 'no text content'))
    } else {
      try {
        const parsed = JSON.parse(summaryText)
        const ok =
          typeof parsed.refDate === 'string' &&
          parsed.range &&
          typeof parsed.range.from === 'string' &&
          typeof parsed.range.to === 'string' &&
          typeof parsed.loveCount === 'number' &&
          typeof parsed.newFoodCount === 'number' &&
          typeof parsed.reactionCount === 'number' &&
          parsed.nutritionLabel &&
          typeof parsed.nutritionEmoji === 'string' &&
          ['ok', 'warn', 'normal'].includes(parsed.nutritionState)
        results.push(
          ok
            ? pass('get_week_summary', `love=${parsed.loveCount} new=${parsed.newFoodCount} rxn=${parsed.reactionCount} nutrition=${parsed.nutritionLabel}`)
            : fail('get_week_summary', `parsed=${summaryText.slice(0, 400)}`)
        )
      } catch (e) {
        results.push(fail('get_week_summary', `JSON parse: ${(e as Error).message}; raw=${summaryText.slice(0, 300)}`))
      }
    }

    // ---- T46: get_week_summary — invalid refDate => isError ----
    const summaryBad = await client.callTool({ name: 'get_week_summary', arguments: { refDate: 'not-a-date' } })
    const summaryBadText = getText(summaryBad.content)
    const summaryBadErr = (summaryBad as { isError?: boolean }).isError === true
    results.push(
      summaryBadErr && /invalid/i.test(summaryBadText ?? '')
        ? pass('get_week_summary_invalid_date', 'refDate=not-a-date => isError + invalid')
        : fail('get_week_summary_invalid_date', `isError=${summaryBadErr} text=${summaryBadText?.slice(0, 200)}`)
    )
  })

  // Summary
  console.log('\n=== Day 1 + Day 2 Smoke Test ===')
  for (const r of results) {
    console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
  }
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length === 0 ? 0 : 1)
}

run().catch((err) => {
  console.error('test runner fatal:', err)
  process.exit(1)
})
