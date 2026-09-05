import { pool } from "../config/database.js";

const TRASH_RETENTION_DAYS = 30;

export const purgeTrash = async () => {
  try {
    await pool.query(
      `
      DELETE FROM files
      WHERE is_deleted = true
        AND updated_at <
            now() - ($1 * INTERVAL '1 day')
      `,
      [TRASH_RETENTION_DAYS]
    );

    await pool.query(
      `
      DELETE FROM folders
      WHERE is_deleted = true
        AND updated_at <
            now() - ($1 * INTERVAL '1 day')
      `,
      [TRASH_RETENTION_DAYS]
    );

    console.log(
      "Trash purge completed successfully"
    );
  } catch (error) {
    console.error(
      "Trash purge failed:",
      error
    );
  }
};