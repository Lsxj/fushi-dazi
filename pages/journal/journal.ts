import { getJournal, PREFERENCE_LABEL, PREFERENCE_EMOJI, MealLog } from '../../utils/journal'
import { getWeekday } from '../../utils/planner'

interface DayGroup {
  date: string
  dateLabel: string
  weekday: string
  logs: any[]
}

Page({
  data: {
    totalCount: 0,
    groupedLogs: [] as DayGroup[]
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const all = getJournal()
    all.sort((a, b) => b.date.localeCompare(a.date) || b.mealIndex - a.mealIndex)

    const grouped: Record<string, MealLog[]> = {}
    for (const log of all) {
      if (!grouped[log.date]) grouped[log.date] = []
      grouped[log.date].push(log)
    }

    const days: DayGroup[] = Object.keys(grouped)
      .sort((a, b) => b.localeCompare(a))
      .map(date => ({
        date,
        dateLabel: this.shortDate(date),
        weekday: getWeekday(date),
        logs: grouped[date]
          .sort((a, b) => a.mealIndex - b.mealIndex)
          .map(log => ({
            ...log,
            prefEmoji: log.preference ? PREFERENCE_EMOJI[log.preference] : '',
            prefLabel: log.preference ? PREFERENCE_LABEL[log.preference] : ''
          }))
      }))

    this.setData({
      totalCount: all.length,
      groupedLogs: days
    })
  },

  shortDate(dateStr: string): string {
    const parts = dateStr.split('-')
    return `${parts[1]}/${parts[2]}`
  }
})
