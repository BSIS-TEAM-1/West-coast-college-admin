/**
 * Utility functions for parsing, formatting, and normalizing schedule strings
 * and times across the registrar workspace, professor load, and student portals.
 *
 * Ensures 12-hour AM/PM format is used for all user-facing displays,
 * while converting to 24-hour HH:mm for native <input type="time"> elements.
 */

const pad = (n: number) => String(n).padStart(2, '0')

// Schedule day tokens, two-letter codes first so "TH"/"SU" are not split.
const DAY_TOKENS = ['TH', 'SU', 'M', 'T', 'W', 'F', 'S']

// Turns a compact day token such as "MTH" or "MWF" into ["M", "TH"] so
// multi-day schedules are shown as separate days instead of one ambiguous blob.
function splitDayCodes(raw: string): string[] {
  const codes: string[] = []
  let cursor = String(raw || '').toUpperCase()
  while (cursor.length > 0) {
    const token = DAY_TOKENS.find((value) => cursor.startsWith(value))
    if (!token) return []
    codes.push(token)
    cursor = cursor.slice(token.length)
  }
  return codes
}

/**
 * Converts any time string (e.g. "13:00", "01:30", "1:30 PM", "07:30")
 * into a standard 12-hour format with AM/PM (e.g. "1:00 PM", "1:30 PM", "7:30 AM").
 */
export function formatTime12h(raw: string): string {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''

  // Already has AM or PM (e.g., "1:30 PM", "01:30 PM", "1:30PM")
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10)
    const min = ampmMatch[2]
    const meridiem = ampmMatch[3].toUpperCase()
    if (hour === 0) hour = 12
    else if (hour > 12) hour = hour - 12
    return `${hour}:${min} ${meridiem}`
  }

  // 24-hour or raw H:mm / HH:mm format without AM/PM
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return trimmed

  let hour = parseInt(match[1], 10)
  const min = match[2]
  if (isNaN(hour)) return trimmed

  let meridiem = 'AM'
  if (hour === 0) {
    hour = 12
    meridiem = 'AM'
  } else if (hour >= 13) {
    hour -= 12
    meridiem = 'PM'
  } else if (hour === 12) {
    meridiem = 'PM'
  } else if (hour >= 1 && hour <= 6) {
    // School context heuristic: classes between 1:00 and 6:59 are afternoon (PM)
    meridiem = 'PM'
  } else {
    // 7:00 to 11:59 are morning (AM)
    meridiem = 'AM'
  }

  return `${hour}:${min} ${meridiem}`
}

/**
 * Converts any time string (e.g. "1:30 PM", "1:00 PM", "07:30 AM", "13:00", "01:30")
 * into a 24-hour "HH:mm" string required by HTML <input type="time">.
 */
export function timeTo24h(raw: string): string {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''

  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10)
    const min = ampmMatch[2]
    const meridiem = ampmMatch[3].toUpperCase()
    if (meridiem === 'PM' && hour < 12) hour += 12
    if (meridiem === 'AM' && hour === 12) hour = 0
    return `${pad(hour)}:${min}`
  }

  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return trimmed

  let hour = parseInt(match[1], 10)
  const min = match[2]
  // In school context, if 1 <= hour <= 6 and no AM/PM, it's PM
  if (hour >= 1 && hour <= 6) {
    hour += 12
  }
  return `${pad(hour)}:${min}`
}

/**
 * Converts a time string (12h or 24h) to total minutes from midnight (0..1439),
 * or null if invalid.
 */
export function parseClockMinutesFlexible(raw: string): number | null {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null

  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10)
    const min = parseInt(ampmMatch[2], 10)
    const meridiem = ampmMatch[3].toUpperCase()
    if (isNaN(hour) || isNaN(min) || min > 59) return null
    if (meridiem === 'PM' && hour < 12) hour += 12
    if (meridiem === 'AM' && hour === 12) hour = 0
    return hour * 60 + min
  }

  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null

  let hour = parseInt(match[1], 10)
  const min = parseInt(match[2], 10)
  if (isNaN(hour) || isNaN(min) || min > 59) return null
  if (hour >= 1 && hour <= 6) hour += 12
  if (hour > 23) return null
  return hour * 60 + min
}

/**
 * Formats a full schedule string (classic or per-day) into 12-hour AM/PM format.
 * Examples:
 *   "M 01:30-04:00 @ room1 / T 13:00-14:00 @ room2"
 *   -> "M 1:30 PM - 4:00 PM @ room1 / T 1:00 PM - 2:00 PM @ room2"
 *
 *   "MW 07:30-09:00"
 *   -> "MW 7:30 AM - 9:00 AM"
 *
 *   "F 04:00-06:00"
 *   -> "F 4:00 PM - 6:00 PM"
 */
export function formatScheduleDisplay(schedule?: string | null): string {
  const trimmed = String(schedule || '').trim()
  if (!trimmed || /^tba$/i.test(trimmed)) return 'TBA'

  const segments = trimmed.includes('/') ? trimmed.split('/') : [trimmed]
  const formattedSegments: string[] = []

  for (const rawSegment of segments) {
    const segment = rawSegment.trim()
    if (!segment) continue

    // Extract optional @ room suffix
    const roomMatch = segment.match(/^(.+?)\s*@\s*(.+)$/)
    const body = (roomMatch ? roomMatch[1] : segment).trim()
    const roomSuffix = roomMatch ? ` @ ${roomMatch[2].trim()}` : ''

    const spaceIndex = body.indexOf(' ')
    if (spaceIndex < 0) {
      formattedSegments.push(segment)
      continue
    }

    const dayPart = body.slice(0, spaceIndex).trim()
    const timePart = body.slice(spaceIndex + 1).trim()
    const dayCodes = splitDayCodes(dayPart)
    // "MTH" -> "M, TH": make every selected day visible in the display.
    const dayLabel = dayCodes.length > 1 ? dayCodes.join(', ') : dayPart

    // Look for time range "start - end" or "start-end"
    const timeRangeMatch = timePart.match(/^(.+?)\s*-\s*(.+)$/)
    if (timeRangeMatch) {
      const startFmt = formatTime12h(timeRangeMatch[1])
      const endFmt = formatTime12h(timeRangeMatch[2])
      formattedSegments.push(`${dayLabel} ${startFmt} - ${endFmt}${roomSuffix}`)
    } else {
      formattedSegments.push(`${dayLabel} ${formatTime12h(timePart)}${roomSuffix}`)
    }
  }

  return formattedSegments.length > 0 ? formattedSegments.join(' / ') : trimmed
}
