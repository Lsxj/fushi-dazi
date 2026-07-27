/**
 * Domain layer: fridge tools (list / add / use / advice).
 *
 * Thin wrappers over fushi-ditu/utils/storage.ts. Storage semantics are
 * upstream (single-source-of-truth in fushi-ditu's fridge model).
 */
import {
  getFridge,
  quickAddFridgeItem,
  consumePortion,
  getUrgentItems,
  getLowStockItems,
  getTodayAdviceCount,
} from '../../../utils/storage.js'
import type { FridgeItem } from './fushi-types.js'

export interface ListFridgeOutput {
  items: FridgeItem[]
  urgent: FridgeItem[]
  lowStock: FridgeItem[]
}

export function listFridge(): ListFridgeOutput {
  return {
    items: getFridge(),
    urgent: getUrgentItems(),
    lowStock: getLowStockItems(),
  }
}

export interface AddFridgeItemInput {
  name: string
  portions?: number
  storageLocation?: 'frozen' | 'refrigerated' | 'room'
  prepStatus?: 'raw' | 'washed' | 'cooked' | 'portioned'
}

export interface AddFridgeItemOutput {
  added: { name: string; portions: number; storageLocation: string }
}

export function addFridgeItem(input: AddFridgeItemInput): AddFridgeItemOutput {
  if (!input.name || !input.name.trim()) {
    throw new Error('add_fridge_item: name is required')
  }
  quickAddFridgeItem(input.name, input.portions ?? 1, input.storageLocation)
  // We don't re-read the fridge here — the user can call list_fridge.
  return {
    added: {
      name: input.name,
      portions: input.portions ?? 1,
      storageLocation: input.storageLocation ?? 'auto',
    },
  }
}

export interface UseFridgeItemInput {
  name: string
  portions?: number
}

export interface UseFridgeItemOutput {
  consumed: { name: string; portions: number }
  remaining: number | null
}

export function useFridgeItem(input: UseFridgeItemInput): UseFridgeItemOutput {
  if (!input.name || !input.name.trim()) {
    throw new Error('use_fridge_item: name is required')
  }
  const portions = input.portions ?? 1
  const before = getFridge().find((f) => f.name === input.name)
  consumePortion(input.name, portions)
  const after = getFridge().find((f) => f.name === input.name)
  return {
    consumed: { name: input.name, portions },
    remaining: after ? after.portions : null,
  }
}

export interface GetFridgeAdviceOutput {
  urgentItems: FridgeItem[]
  lowStockItems: FridgeItem[]
  todayAdviceCount: number
}

export function getFridgeAdvice(): GetFridgeAdviceOutput {
  return {
    urgentItems: getUrgentItems(),
    lowStockItems: getLowStockItems(),
    todayAdviceCount: getTodayAdviceCount(),
  }
}
