import { DateTime } from 'luxon'

export const MAZ_TZ = 'America/Mazatlan'

export function toUTC(isoLocal: string) {
  const dt = DateTime.fromISO(isoLocal, { zone: MAZ_TZ })
  return dt.toUTC().toISO()
}

export function sessionFromMazatlanHour(isoUTC: string) {
  const h = DateTime.fromISO(isoUTC).setZone(MAZ_TZ).hour
  if (h >= 0 && h < 8) return 'Asia'
  if (h >= 7 && h < 16) return 'London'
  return 'NewYork'
}

