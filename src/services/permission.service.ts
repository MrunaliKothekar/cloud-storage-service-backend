import { pool } from "../config/database.js";

export type PermissionRole =
  | "owner"
  | "editor"
  | "viewer"
  | null;

type ResourceType = "file" | "folder";

// ==========================================
// GET RESOURCE PERMISSION
// ==========================================
export const getResourcePermission = async (
  userId: string,
  resourceType: ResourceType,
  resourceId: string
): Promise<PermissionRole> => {
  // ========================================
  // FILE
  // ========================================
  if (resourceType === "file") {
    const fileResult = await pool.query(
      `
      SELECT
        id,
        owner_id,
        folder_id
      FROM files
      WHERE id = $1
        AND is_deleted = false
      `,
      [resourceId]
    );

    if (fileResult.rowCount === 0) {
      return null;
    }

    const file = fileResult.rows[0];

    // --------------------------------------
    // OWNER
    // --------------------------------------
    if (file.owner_id === userId) {
      return "owner";
    }

    // --------------------------------------
    // DIRECT FILE SHARE
    // --------------------------------------
    const directShare = await pool.query(
      `
      SELECT role
      FROM shares
      WHERE resource_type = 'file'
        AND resource_id = $1
        AND grantee_user_id = $2
      LIMIT 1
      `,
      [resourceId, userId]
    );

    if ((directShare.rowCount ?? 0) > 0) {
      return directShare.rows[0].role;
    }

    // --------------------------------------
    // INHERITED FOLDER SHARE
    // --------------------------------------
    if (file.folder_id) {
      const folderPermission =
        await getFolderPermission(
          userId,
          file.folder_id
        );

      if (folderPermission) {
        return folderPermission;
      }
    }

    return null;
  }

  // ========================================
  // FOLDER
  // ========================================
  return getFolderPermission(
    userId,
    resourceId
  );
};

// ==========================================
// GET FOLDER PERMISSION
// ==========================================
const getFolderPermission = async (
  userId: string,
  folderId: string
): Promise<PermissionRole> => {
  const folderResult = await pool.query(
    `
    SELECT
      id,
      owner_id
    FROM folders
    WHERE id = $1
      AND is_deleted = false
    `,
    [folderId]
  );

  if (folderResult.rowCount === 0) {
    return null;
  }

  const folder = folderResult.rows[0];

  // --------------------------------------
  // OWNER
  // --------------------------------------
  if (folder.owner_id === userId) {
    return "owner";
  }

  /*
   * Walk from current folder upward.
   *
   * depth 0 = current folder
   * depth 1 = parent
   * depth 2 = grandparent
   *
   * The closest share wins.
   */
  const shareResult = await pool.query(
    `
    WITH RECURSIVE folder_tree AS (
      SELECT
        id,
        parent_id,
        0 AS depth
      FROM folders
      WHERE id = $1
        AND is_deleted = false

      UNION ALL

      SELECT
        f.id,
        f.parent_id,
        ft.depth + 1
      FROM folders f
      INNER JOIN folder_tree ft
        ON f.id = ft.parent_id
      WHERE f.is_deleted = false
    )

    SELECT
      s.role,
      ft.depth
    FROM folder_tree ft
    INNER JOIN shares s
      ON s.resource_type = 'folder'
      AND s.resource_id = ft.id
      AND s.grantee_user_id = $2
    ORDER BY ft.depth ASC
    LIMIT 1
    `,
    [folderId, userId]
  );

  if ((shareResult.rowCount ?? 0) > 0) {
    return shareResult.rows[0].role;
  }

  return null;
};

// ==========================================
// CAN VIEW
// ==========================================
export const canView = async (
  userId: string,
  resourceType: ResourceType,
  resourceId: string
): Promise<boolean> => {
  const role = await getResourcePermission(
    userId,
    resourceType,
    resourceId
  );

  return (
    role === "owner" ||
    role === "editor" ||
    role === "viewer"
  );
};

// ==========================================
// CAN EDIT
// ==========================================
export const canEdit = async (
  userId: string,
  resourceType: ResourceType,
  resourceId: string
): Promise<boolean> => {
  const role = await getResourcePermission(
    userId,
    resourceType,
    resourceId
  );

  return (
    role === "owner" ||
    role === "editor"
  );
};

// ==========================================
// CAN DELETE
// ==========================================
export const canDelete = async (
  userId: string,
  resourceType: ResourceType,
  resourceId: string
): Promise<boolean> => {
  const role = await getResourcePermission(
    userId,
    resourceType,
    resourceId
  );

  // Only owner can delete
  return role === "owner";
};