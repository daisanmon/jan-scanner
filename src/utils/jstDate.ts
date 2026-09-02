const jstDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function toJstDateKey(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = jstDateFormatter.formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${read('year')}-${read('month')}-${read('day')}`
}

export function isDifferentJstDate(
  previous: string | undefined,
  current: Date,
): boolean {
  if (!previous) return true
  const previousKey = toJstDateKey(previous)
  const currentKey = toJstDateKey(current)
  return previousKey === null || currentKey === null || previousKey !== currentKey
}
