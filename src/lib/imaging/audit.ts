import { db } from '@/db'
import { auditLogs } from '@/db/schema'
import { auth } from '@/lib/auth'

/**
 * Audit Log Actions
 */
export type AuditAction =
  | 'upload'
  | 'view'
  | 'create_centerline'
  | 'edit_centerline'
  | 'delete_centerline'
  | 'create_measurement'
  | 'edit_measurement'
  | 'delete_measurement'

/**
 * Audit Log Resource Types
 */
export type AuditResourceType =
  | 'dicom_study'
  | 'dicom_series'
  | 'centerline'
  | 'measurement'

/**
 * Log an audit event to the database
 *
 * @param request - The incoming request object (used to extract user session)
 * @param action - The action being performed
 * @param resourceType - The type of resource being acted upon
 * @param resourceId - The ID of the resource
 * @param metadata - Optional additional metadata to store
 */
export async function logAudit(
  request: Request,
  action: AuditAction,
  resourceType: AuditResourceType,
  resourceId: string | number,
  metadata?: Record<string, any>,
): Promise<void> {
  try {
    // Get user session from Better Auth
    const session = await auth.api.getSession({ headers: request.headers })

    // Extract user ID (null if not authenticated)
    const userId = session?.user.id || null

    // Insert audit log entry
    await db.insert(auditLogs).values({
      userId,
      action,
      resourceType,
      resourceId: String(resourceId),
      metadata: metadata || null,
      createdAt: new Date(),
    })
  } catch (error) {
    // Log error but don't fail the request
    console.error('Failed to log audit event:', error)
  }
}

/**
 * Create an audit logger bound to a specific request
 *
 * This factory function returns a logging function that already has the request
 * bound, making it easier to log multiple audit events from the same handler.
 *
 * @param request - The incoming request object
 * @returns A logging function bound to the request
 */
export function createAuditLogger(request: Request) {
  return (
    action: AuditAction,
    resourceType: AuditResourceType,
    resourceId: string | number,
    metadata?: Record<string, any>,
  ) => logAudit(request, action, resourceType, resourceId, metadata)
}
