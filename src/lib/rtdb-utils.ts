/**
 * Sanitizes an object for Firebase Realtime Database by removing all undefined values.
 * RTDB will throw an error if an object contains undefined.
 */
export function sanitizeForRtdb<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForRtdb(item)) as unknown as T;
  }

  const sanitized: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (value !== undefined) {
        sanitized[key] = sanitizeForRtdb(value);
      }
    }
  }

  return sanitized;
}
