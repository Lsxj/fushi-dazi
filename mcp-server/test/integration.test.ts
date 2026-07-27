/**
 * Day 7: 10-step end-to-end integration test.
 *
 * This walks through the same flow an LLM would drive in a real demo
 * session — read profile, pick a meal, log it, hit a reaction, analyze
 * the reaction, mark the offender, and verify the plan self-corrects.
 *
 * Unlike tools.test.ts (which is 46 isolated smoke tests), this file
 * chains state across the 10 steps so the assertions reflect the
 * cumulative effect: the meal log lives in storage, the reaction links
 * to it, the mark_allergic mutation removes that food from future plans.
 *
 * Run: `npx tsx test/integration.test.ts`
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import fs from 'node:fs'
import path from 'node:path'

interface Step {
  name: string
  pass: boolean
  detail: string
}

const pass = (name: string, detail = ''): Step => ({ name, pass: true, detail })
const fail = (name: string, detail: string): Step => ({ name, pass: false, detail })

type ToolContent = Array<{ type: string; text?: string }>
const getText = (content: unknown): string | undefined =>
  (content as ToolContent).find((c) => c.type === 'text' && c.text)?.text

async function withServer<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  // Reset storage to fixtures so the test is idempotent.
  const cwd = new URL('..', import.meta.url).pathname
  const dataDir = path.join(cwd, 'data')
  const fixturesDir = path.join(cwd, 'test', 'fixtures')
  fs.mkdirSync(dataDir, { recursive: true })
  for (const fixture of ['seed-babyProfile.json', 'seed-fridge.json']) {
    const src = path.join(fixturesDir, fixture)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dataDir, fixture.replace('seed-', '')))
    }
  }
  fs.writeFileSync(path.join(dataDir, 'mealJournal.json'), '[]', 'utf-8')
  fs.writeFileSync(path.join(dataDir, 'weeklyPlan.json'), '[]', 'utf-8')
  fs.writeFileSync(path.join(dataDir, 'reactions.json'), '[]', 'utf-8')

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/index.ts'],
    cwd,
  })
  const client = new Client({ name: 'integration-test', version: '0.0.1' }, { capabilities: {} })
  try {
    await client.connect(transport)
    return await fn(client)
  } finally {
    await client.close()
  }
}

async function run(): Promise<void> {
  const steps: Step[] = []

  await withServer(async (client) => {
    // ---- Step 1: read_baby_profile ----
    const profileRes = await client.callTool({ name: 'read_baby_profile', arguments: {} })
    const profile = JSON.parse(getText(profileRes.content) ?? '{}')
    steps.push(
      profile.profile?.babyName === '小蘑菇' && profile.ageMonths === 10
        ? pass('1_read_baby_profile', `babyName=${profile.profile.babyName} ageMonths=${profile.ageMonths}`)
        : fail('1_read_baby_profile', JSON.stringify(profile).slice(0, 200))
    )

    // ---- Step 2: list_recipes (applicable, no filters) ----
    const listRes = await client.callTool({ name: 'list_recipes', arguments: {} })
    const listed = JSON.parse(getText(listRes.content) ?? '{}')
    const applicableCount = (listed.recipes ?? []).length
    steps.push(
      applicableCount >= 3
        ? pass('2_list_recipes', `${applicableCount} applicable recipes`)
        : fail('2_list_recipes', `count=${applicableCount}`)
    )

    // ---- Step 3: generate_today_menu ----
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const genRes = await client.callTool({ name: 'generate_today_menu', arguments: { date: todayStr } })
    const generated = JSON.parse(getText(genRes.content) ?? '{}')
    const firstMealRecipeId = generated.meals?.[0]?.recipeId
    const firstMealRecipeName = generated.meals?.[0]?.recipeName
    steps.push(
      generated.meals?.length === 3 && !!firstMealRecipeId
        ? pass('3_generate_today_menu', `3 meals, first=${firstMealRecipeName} (${firstMealRecipeId})`)
        : fail('3_generate_today_menu', JSON.stringify(generated).slice(0, 300))
    )

    // ---- Step 4: record_meal_log (safe ingredients) ----
    // Use 鳕鱼 + 西兰花 — both open + confirmed (avoid 鸡蛋 which is in observation).
    const recordRes = await client.callTool({
      name: 'record_meal_log',
      arguments: {
        date: todayStr,
        mealIndex: 0,
        ingredients: ['鳕鱼', '西兰花'],
        portion: 'full',
        preference: 'love',
        note: '宝宝挺爱吃',
      },
    })
    const recorded = JSON.parse(getText(recordRes.content) ?? '{}')
    steps.push(
      recorded.safetyCheck?.bypassed === false &&
        recorded.log?.preference === 'love' &&
        recorded.log?.date === todayStr
        ? pass('4_record_meal_log', `safe log written, consumed ${(recorded.consumed ?? []).length} items`)
        : fail('4_record_meal_log', JSON.stringify(recorded).slice(0, 300))
    )

    // ---- Step 5: list_fridge (should reflect deductions) ----
    const fridgeRes = await client.callTool({ name: 'list_fridge', arguments: {} })
    const fridge = JSON.parse(getText(fridgeRes.content) ?? '{}')
    const cod = (fridge.items ?? []).find((i: { name: string }) => i.name === '鳕鱼')
    const broccoli = (fridge.items ?? []).find((i: { name: string }) => i.name === '西兰花')
    steps.push(
      cod && broccoli && cod.portions < 2 && broccoli.portions < 2
        ? pass('5_list_fridge', `鳕鱼 ${cod.portions}/2 西兰花 ${broccoli.portions}/2 (deducted)`)
        : fail('5_list_fridge', `cod=${cod?.portions} broccoli=${broccoli?.portions}`)
    )

    // ---- Step 6: record_reaction (rash + moderate, hits the meal) ----
    // Use a timestamp AFTER the meal — traceback72h should pull it.
    // traceback hint is 豆腐 (NOT in confirmedFoods) so analyzeSuspects has
    // something to flag. 鳕鱼 + 西兰花 are confirmed, so analyzer skips them.
    const reactionRes = await client.callTool({
      name: 'record_reaction',
      arguments: {
        type: 'rash',
        severity: 'moderate',
        occurredAt: new Date(today.getTime() + 6 * 3600 * 1000).toISOString(),
        note: '红疹',
        tracebackIngredients: ['豆腐'],
      },
    })
    const reaction = JSON.parse(getText(reactionRes.content) ?? '{}')
    const reactionId = reaction.reaction?.id
    steps.push(
      reactionId &&
        reaction.recommendation?.action === 'enterObservation' &&
        Array.isArray(reaction.initialSuspects) &&
        reaction.initialSuspects.length >= 1
        ? pass('6_record_reaction', `id=${reactionId} rec=${reaction.recommendation.action} suspects=${reaction.initialSuspects.length}`)
        : fail('6_record_reaction', JSON.stringify(reaction).slice(0, 300))
    )

    // ---- Step 7: analyze_suspect_foods (ruleTrace) ----
    const analyzeRes = await client.callTool({
      name: 'analyze_suspect_foods',
      arguments: { reactionId },
    })
    const analyzed = JSON.parse(getText(analyzeRes.content) ?? '{}')
    const rt = analyzed.ruleTrace
    steps.push(
      rt && Array.isArray(rt.allergicSkipped) && Array.isArray(rt.confirmedSkipped) && Array.isArray(rt.introducingChecked) && 'tryingDayLabel' in rt
        ? pass('7_analyze_suspect_foods', `ruleTrace OK, suspects=${analyzed.suspects?.length ?? 0}`)
        : fail('7_analyze_suspect_foods', JSON.stringify(analyzed).slice(0, 300))
    )

    // ---- Step 8: mark_food_allergic (irreversible) ----
    // The user said "yes, 鳕鱼 永远不要了".
    const markRes = await client.callTool({
      name: 'mark_food_allergic',
      arguments: {
        food: '鳕鱼',
        reactionId,
        consentToConfirmIrreversible: true,
        note: '测试 — 永久过敏标记',
      },
    })
    const marked = JSON.parse(getText(markRes.content) ?? '{}')
    steps.push(
      marked.food === '鳕鱼' && marked.state === 'allergic'
        ? pass('8_mark_food_allergic', `鳕鱼 → allergic, enteredAt=${marked.enteredAt}`)
        : fail('8_mark_food_allergic', JSON.stringify(marked).slice(0, 300))
    )

    // ---- Step 9: regenerate_week_plan / list_recipes (verify unsafe filtered) ----
    // After mark_allergic, 鳕鱼 should be in individualExceptions[鳕鱼].state='allergic',
    // so isRecipeApplicable returns false for any recipe containing 鳕鱼.
    const listAfterRes = await client.callTool({ name: 'list_recipes', arguments: {} })
    const listedAfter = JSON.parse(getText(listAfterRes.content) ?? '{}')
    const codRecipesAfter = (listedAfter.recipes ?? []).filter((rw: { recipe: { ingredients: { name: string }[] } }) =>
      rw.recipe.ingredients.some((i) => i.name === '鳕鱼')
    )
    steps.push(
      codRecipesAfter.length === 0
        ? pass('9_filter_after_mark', `鳕鱼-marked, applicable 鳕鱼-recipes = 0 (was 鳕鱼-recipes before)`)
        : fail('9_filter_after_mark', `still ${codRecipesAfter.length} recipes with 鳕鱼: ${codRecipesAfter.map((r: { recipe: { id: string } }) => r.recipe.id).join(',')}`)
    )

    // ---- Step 10: get_week_summary ----
    const summaryRes = await client.callTool({ name: 'get_week_summary', arguments: {} })
    const summary = JSON.parse(getText(summaryRes.content) ?? '{}')
    steps.push(
      typeof summary.refDate === 'string' &&
        summary.range?.from &&
        summary.range?.to &&
        typeof summary.loveCount === 'number' &&
        summary.nutritionLabel
        ? pass('10_get_week_summary', `range=${summary.range.from}..${summary.range.to} love=${summary.loveCount} nutrition=${summary.nutritionLabel}`)
        : fail('10_get_week_summary', JSON.stringify(summary).slice(0, 300))
    )

    // ---- Step 11: narrate_week (LLM path — mock provider when no ANTHROPIC_API_KEY) ----
    // The mock provider returns a deterministic echo with a [MOCK] prefix.
    // Live provider (with ANTHROPIC_API_KEY) returns a real narration.
    // Either way, the tool shape (summary + narration + provider + mode) is
    // identical, so the test asserts on shape, not content.
    const narrateRes = await client.callTool({ name: 'narrate_week', arguments: { tone: 'calm' } })
    const narrated = JSON.parse(getText(narrateRes.content) ?? '{}')
    steps.push(
      narrated.summary &&
        typeof narrated.narration === 'string' &&
        narrated.narration.length > 0 &&
        (narrated.provider === 'anthropic' || narrated.provider === 'mock') &&
        (narrated.mode === 'live' || narrated.mode === 'mock') &&
        typeof narrated.model === 'string'
        ? pass('11_narrate_week', `provider=${narrated.provider} mode=${narrated.mode} chars=${narrated.narration.length}`)
        : fail('11_narrate_week', JSON.stringify(narrated).slice(0, 300))
    )
  })

  // ---- Summary ----
  console.log('\n=== Day 7: 10-step integration test ===')
  for (const s of steps) {
    console.log(`${s.pass ? '✅' : '❌'} Step ${s.name}${s.detail ? ' — ' + s.detail : ''}`)
  }
  const failed = steps.filter((s) => !s.pass).length
  console.log(`\n${steps.length - failed}/${steps.length} steps passed`)
  process.exit(failed === 0 ? 0 : 1)
}

run().catch((err) => {
  console.error('integration test runner fatal:', err)
  process.exit(1)
})
