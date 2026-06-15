/**
 * usePresence — Module 13 GPS heartbeat hook
 *
 * Starts navigator.geolocation.watchPosition() when an employee is checked in.
 * Sends a heartbeat to the backend every HEARTBEAT_INTERVAL_MS (30s minimum).
 * Exposes the current presence status, GPS position, and error state.
 *
 * Usage:
 *   const { status, position, error, gpsAvailable } = usePresence({ enabled: isCheckedIn })
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { presenceApi } from '@/lib/api'

const HEARTBEAT_INTERVAL_MS = 30_000   // send at most every 30 s
const GEO_TIMEOUT_MS        = 10_000
const GEO_MAX_AGE_MS        = 20_000

export function usePresence({ enabled = false } = {}) {
  const [status, setStatus]         = useState(null)   // CHECKED_IN | OUT_OF_ZONE | etc.
  const [position, setPosition]     = useState(null)   // { lat, lng, accuracy, timestamp }
  const [error, setError]           = useState(null)   // string | null
  const [gpsAvailable, setGpsAvail] = useState(true)
  const [insideZone, setInsideZone] = useState(null)
  const [distanceM, setDistanceM]   = useState(null)
  const [zoneName, setZoneName]     = useState(null)

  const watchIdRef      = useRef(null)
  const lastSentRef     = useRef(0)
  const pendingRef      = useRef(false)

  const sendHeartbeat = useCallback(async (lat, lng, accuracy) => {
    if (pendingRef.current) return
    const now = Date.now()
    if (now - lastSentRef.current < HEARTBEAT_INTERVAL_MS) return

    pendingRef.current = true
    lastSentRef.current = now
    try {
      const data = await presenceApi.heartbeat(lat, lng, accuracy)
      setStatus(data?.status ?? null)
      setInsideZone(data?.inside_zone ?? null)
      setDistanceM(data?.distance_m ?? null)
      setZoneName(data?.zone ?? null)
      setError(null)
    } catch (err) {
      /* don't surface network errors to UI — just keep last known status */
    } finally {
      pendingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      return
    }

    if (!navigator.geolocation) {
      setGpsAvail(false)
      setError('GPS not available on this device')
      return
    }

    function onPosition(pos) {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords
      setPosition({ lat, lng, accuracy, timestamp: pos.timestamp })
      setGpsAvail(true)
      setError(null)
      sendHeartbeat(lat, lng, Math.round(accuracy))
    }

    function onError(err) {
      setGpsAvail(false)
      setError(
        err.code === 1 ? 'Location permission denied — heartbeat disabled'
          : err.code === 2 ? 'GPS signal unavailable'
          : 'GPS timeout'
      )
    }

    watchIdRef.current = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      timeout: GEO_TIMEOUT_MS,
      maximumAge: GEO_MAX_AGE_MS,
    })

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [enabled, sendHeartbeat])

  return { status, position, error, gpsAvailable, insideZone, distanceM, zoneName }
}
