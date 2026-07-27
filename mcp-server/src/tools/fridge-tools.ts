/**
 * Fridge tools (Day 3): list / add / use / advice.
 *
 * These are write-capable tools. They are NOT hard guardrails (they don't
 * have a safety rule attached), but list/add/use still need to be reviewed
 * carefully because the data feeds into generate_today_menu (fridge boost)
 * and replace_meal (fridge-aware replacement).
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  listFridge,
  addFridgeItem,
  useFridgeItem,
  getFridgeAdvice,
} from '../domain/fridge.js'
import { safeToolCall } from '../lib/tool-helpers.js'

const addFridgeItemInput = {
  name: z.string().min(1).describe('Ingredient name (e.g. "鳕鱼", "西兰花")'),
  portions: z.number().int().min(1).max(20).optional().describe('How many portions. Default 1.'),
  storageLocation: z
    .enum(['frozen', 'refrigerated', 'room'])
    .optional()
    .describe('Storage location. Default: ingredient default (or refrigerated).'),
  prepStatus: z.enum(['raw', 'washed', 'cooked', 'portioned']).optional().describe('Prep state. Default raw.'),
}

const useFridgeItemInput = {
  name: z.string().min(1).describe('Ingredient name to consume'),
  portions: z.number().int().min(1).max(20).optional().describe('How many portions to consume. Default 1.'),
}

export function registerFridgeTools(server: McpServer): void {
  server.tool(
    'list_fridge',
    'List fridge items with urgent (≤2 days to expiry) and low-stock (≤1 portion) highlights.',
    {},
    async () => safeToolCall(() => listFridge(), 'list_fridge failed')
  )

  server.tool(
    'add_fridge_item',
    'Add a fridge item. Auto-fills storage location and expiry from ingredient shelf-life data.',
    addFridgeItemInput,
    async (args) => safeToolCall(() => addFridgeItem(args), 'add_fridge_item failed')
  )

  server.tool(
    'use_fridge_item',
    'Mark N portions of a fridge item as consumed. Removes the item if portions hit 0.',
    useFridgeItemInput,
    async (args) => safeToolCall(() => useFridgeItem(args), 'use_fridge_item failed')
  )

  server.tool(
    'get_fridge_advice',
    'Get today\'s fridge advice: urgent items (use soon), low-stock items (restock), and the total advice count.',
    {},
    async () => safeToolCall(() => getFridgeAdvice(), 'get_fridge_advice failed')
  )
}
