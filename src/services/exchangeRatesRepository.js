import { httpsCallable } from 'firebase/functions'
import { functions, isFirebaseConfigured } from '../lib/firebase'

const PTAX_CACHE_KEY = 'sq-comex-ptax-rates'

function readCachedPtaxRates() {
  if (typeof window === 'undefined') return null

  try {
    const rawValue = window.localStorage.getItem(PTAX_CACHE_KEY)
    return rawValue ? JSON.parse(rawValue) : null
  } catch {
    return null
  }
}

function writeCachedPtaxRates(rates) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(PTAX_CACHE_KEY, JSON.stringify(rates))
  } catch {
    // Ignore cache write failures.
  }
}

export async function getDailyPtaxRates() {
  if (!isFirebaseConfigured || !functions) {
    throw new Error('Firebase Functions não está configurado para consultar a PTAX.')
  }

  try {
    const callable = httpsCallable(functions, 'getDailyPtaxRates')
    const response = await callable()
    writeCachedPtaxRates(response.data)
    return response.data
  } catch (error) {
    const cachedRates = readCachedPtaxRates()
    if (cachedRates) {
      return cachedRates
    }

    throw error
  }
}
