import { getAuth } from 'firebase-admin/auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Standard server-side authentication check for Next.js Server Components and Actions.
 * Replaces redundant auth checks and standardizes token verification.
 */
export async function checkAuth(options: { 
  role?: string | string[], 
  shouldRedirect?: boolean,
  redirectTo?: string 
} = {}) {
  const { role, shouldRedirect = false, redirectTo = '/login' } = options;
  
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session')?.value;

  if (!sessionToken) {
    if (shouldRedirect) redirect(redirectTo);
    return { authenticated: false, error: 'Missing session token' };
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(sessionToken);
    const userRole = decodedToken.role as string;

    if (role) {
      const allowedRoles = Array.isArray(role) ? role : [role];
      if (!allowedRoles.includes(userRole)) {
        if (shouldRedirect) redirect('/unauthorized');
        return { 
          authenticated: true, 
          authorized: false, 
          user: decodedToken,
          error: 'Insufficient permissions' 
        };
      }
    }

    return { 
      authenticated: true, 
      authorized: true, 
      user: decodedToken,
      uid: decodedToken.uid,
      role: userRole
    };
  } catch (error) {
    console.error('Auth verification failed:', error);
    if (shouldRedirect) redirect(redirectTo);
    return { authenticated: false, error: 'Invalid or expired session' };
  }
}

/**
 * Validates a Bearer token from the Authorization header for API routes.
 */
export async function validateApiToken(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) {
    return { success: false, error: 'Missing or invalid authorization header' };
  }

  const token = authHeader.substring(7);
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    return { success: true, user: decodedToken, uid: decodedToken.uid };
  } catch (error) {
    return { success: false, error: 'Invalid or expired token' };
  }
}
