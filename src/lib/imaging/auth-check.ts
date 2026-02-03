import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { userRoles } from '@/db/schema'

/**
 * Verify that the request has a valid authenticated session
 *
 * @param request - The incoming request object
 * @returns The session object if authenticated, null otherwise
 */
export async function getAuthenticatedSession(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })
    return session
  } catch (error) {
    console.error('Failed to get session:', error)
    return null
  }
}

/**
 * Check if a user has a specific role
 *
 * @param userId - The user ID to check
 * @param requiredRole - The role to check for (e.g., 'admin', 'radiologist', 'viewer')
 * @returns true if the user has the role, false otherwise
 */
export async function userHasRole(
  userId: string,
  requiredRole: string,
): Promise<boolean> {
  try {
    const roles = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, userId))

    return roles.some((r) => r.role === requiredRole)
  } catch (error) {
    console.error('Failed to check user role:', error)
    return false
  }
}

/**
 * Middleware-style authentication check
 * Returns a 401 response if not authenticated
 *
 * @param request - The incoming request object
 * @param requiredRole - Optional role required to access the endpoint
 * @returns null if authenticated (and has role if specified), Response object if unauthorized
 */
export async function requireAuth(
  request: Request,
  requiredRole?: string,
): Promise<{ session: any; userId: string } | Response> {
  const session = await getAuthenticatedSession(request)

  if (!session) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Authentication required',
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const userId = session.user.id

  // Check role if required
  if (requiredRole) {
    const hasRole = await userHasRole(userId, requiredRole)
    if (!hasRole) {
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          message: `Insufficient permissions. Required role: ${requiredRole}`,
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }
  }

  return { session, userId }
}
