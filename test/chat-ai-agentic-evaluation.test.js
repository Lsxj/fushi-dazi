'use strict'

const assert = require('assert')

process.env.LOCAL = '1'
process.env.LLM_PROVIDER = 'mock'

const { evaluateAgenticWorkflow } = require('../utils/agentEvaluation.js')
const { MockClient } = require('../cloudfunctions/chat-ai/_llm/mock.js')

async function main() {
  const evaluation = evaluateAgenticWorkflow()
  assert.strictEqual(evaluation.datasetSize, 9)
  assert.strictEqual(evaluation.toolSelectionAccuracy, 1)
  assert.strictEqual(evaluation.safetyBlockRecall, 1)
  assert.strictEqual(evaluation.groundingProxyRate, 1)
  assert.strictEqual(evaluation.endToEndSuccessRate, 1)

  const client = new MockClient()
  const firstTurn = await client.chat({
    messages: [{ role: 'user', content: '想试试蜂蜜' }],
    tools: [],
  })
  assert.strictEqual(firstTurn.toolCalls[0].name, 'check_food_safety')
  assert.deepStrictEqual(firstTurn.toolCalls[0].input, { foods: ['蜂蜜'] })

  const blockedAnswer = await client.chat({
    messages: [
      { role: 'user', content: '想试试蜂蜜' },
      {
        role: 'assistant',
        content: '',
        tool_calls: firstTurn.toolCalls,
      },
      {
        role: 'tool',
        tool_call_id: firstTurn.toolCalls[0].id,
        content: JSON.stringify({
          safe: false,
          results: [{ food: '蜂蜜', safe: false, reason: '蜂蜜未在分类库' }],
        }),
      },
    ],
    tools: [],
  })
  assert.match(blockedAnswer.text, /已阻断这次尝试/)
  assert.match(blockedAnswer.text, /蜂蜜未在分类库/)
  assert.match(blockedAnswer.text, /请不要喂食/)
  assert.doesNotMatch(blockedAnswer.text, /未发现阻断项/)

  const missingEvidenceAnswer = await client.chat({
    messages: [
      {
        role: 'assistant',
        content: '',
        tool_calls: firstTurn.toolCalls,
      },
      {
        role: 'tool',
        tool_call_id: firstTurn.toolCalls[0].id,
        content: 'invalid result',
      },
    ],
    tools: [],
  })
  assert.match(missingEvidenceAnswer.text, /暂时不能判断/)

  const groundedMenuAnswer = await client.chat({
    messages: [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'menu-tool', name: 'generate_today_menu', input: {} },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'menu-tool',
        content: JSON.stringify({
          meals: [{ recipeName: '南瓜大米粥' }, { recipeName: '牛肉土豆粥' }],
        }),
      },
    ],
    tools: [],
  })
  assert.match(groundedMenuAnswer.text, /南瓜大米粥、牛肉土豆粥/)
  assert.doesNotMatch(groundedMenuAnswer.text, /鳕鱼西兰花米糊/)

  process.stdout.write(
    `agentic evaluation passed: ${evaluation.passCount}/${evaluation.datasetSize}, ` +
      `tool=${evaluation.toolSelectionAccuracy}, safety=${evaluation.safetyBlockRecall}, ` +
      `groundingProxy=${evaluation.groundingProxyRate}, e2e=${evaluation.endToEndSuccessRate}\n`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
