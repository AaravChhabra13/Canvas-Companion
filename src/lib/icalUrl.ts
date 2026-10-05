export const ICAL_URL_ERROR = 'Must start with https:// or webcal:// and be an .ics feed link'

export function isValidIcalUrl(url: string): boolean {
  const u = url.trim()
  return /^(https|webcal):\/\//i.test(u) && u.toLowerCase().includes('.ics')
}
