import { useEffect, useState } from 'react'
import {
  DEFAULT_FORECAST_SETTINGS,
  getForecastSettings,
  subscribeForecastSettings,
} from '../services/forecastSettingsRepository'

let cachedSettings = {
  ...DEFAULT_FORECAST_SETTINGS,
  id: 'current',
  updatedAt: null,
  updatedBy: null,
}

let isSubscribed = false
let subscriberCount = 0
let pendingError = null
const listeners = new Set()

function setCache(nextSettings) {
  cachedSettings = nextSettings
  listeners.forEach((listener) => listener(nextSettings))
}

function setError(error) {
  pendingError = error
  listeners.forEach((listener) => listener(cachedSettings))
}

async function ensureSubscription() {
  if (isSubscribed) return
  isSubscribed = true
  try {
    const initial = await getForecastSettings()
    setCache(initial)
  } catch (error) {
    setError(error)
    return
  }

  subscribeForecastSettings((next) => {
    setCache(next)
  })
}

export function getCachedForecastSettings() {
  return cachedSettings
}

export function subscribeForecastSettingsCache(onChange) {
  listeners.add(onChange)
  onChange(cachedSettings)
  return () => {
    listeners.delete(onChange)
  }
}

export function useForecastSettings() {
  const [settings, setSettings] = useState(cachedSettings)
  const [loading, setLoading] = useState(
    subscriberCount === 0 && settings.updatedAt === null && settings.id === 'current'
  )

  useEffect(() => {
    subscriberCount += 1
    ensureSubscription()
    const unsubscribe = subscribeForecastSettingsCache((next) => {
      setSettings(next)
      setLoading(false)
    })

    return () => {
      subscriberCount -= 1
      unsubscribe()
    }
  }, [])

  return {
    settings,
    loading,
    error: pendingError,
    defaults: DEFAULT_FORECAST_SETTINGS,
    reload: () => getForecastSettings().then((next) => setCache(next)),
  }
}
