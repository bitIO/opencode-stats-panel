import { useCallback, useEffect, useRef, useState } from "react"

interface ApiState<T> {
  data: T | null
  error: string | null
  loading: boolean
}

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[]): ApiState<T> & { refetch: () => void } {
  const [state, setState] = useState<ApiState<T>>({ data: null, error: null, loading: true })
  const [tick, setTick] = useState(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const key = deps.map((d) => JSON.stringify(d)).join("|")

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fetcherRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false })
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ data: null, error: String((err as Error).message), loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [key, tick])

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  return { ...state, refetch }
}
