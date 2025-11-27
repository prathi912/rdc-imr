'use client';

// Defines a structured error for Firestore permission issues to provide rich context for debugging.
export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';
  requestResourceData?: any;
};

export class FirestorePermissionError extends Error {
  public context: SecurityRuleContext;

  constructor(context: SecurityRuleContext) {
    const message = `FirestoreError: Missing or insufficient permissions: The following request was denied by Firestore Security Rules:\n${JSON.stringify(context, null, 2)}`;
    super(message);
    this.name = 'FirestorePermissionError';
    this.context = context;

    // This is to ensure the stack trace is captured correctly.
    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, FirestorePermissionError);
    } else {
      this.stack = (new Error(message)).stack;
    }
  }
}
