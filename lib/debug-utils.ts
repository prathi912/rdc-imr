export function debugLog(message: string, data?: any) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[DEBUG] ${message}`, data || "")
  }
}

export function debugError(message: string, error?: any) {
  if (process.env.NODE_ENV === "development") {
    console.error(`[ERROR] ${message}`, error || "")
  }
}

export function debugWarn(message: string, data?: any) {
  if (process.env.NODE_ENV === "development") {
    console.warn(`[WARN] ${message}`, data || "")
  }
}

export function performanceLog(label: string, fn: () => any) {
  if (process.env.NODE_ENV === "development") {
    console.time(label)
    const result = fn()
    console.timeEnd(label)
    return result
  }
  return fn()
}

export function logFirebaseError(operation: string, error: any) {
  debugError(`Firebase ${operation} failed:`, {
    code: error.code,
    message: error.message,
    stack: error.stack,
  })
}
