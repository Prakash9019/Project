import { z } from 'zod'

export const uuidParam = z.string().uuid({ message: 'Invalid ID format' })
export const e164Phone  = z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number format (E.164 required)')
export const safeString = z.string().transform(s => s.trim()).refine(s => !s.includes('\x00'), 'Invalid characters')
