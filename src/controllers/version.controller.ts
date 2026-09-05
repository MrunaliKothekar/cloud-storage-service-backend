import { Request, Response } from "express";
import { supabase } from "../config/supabase.js";
import {
  canView,
  canEdit,
} from "../services/permission.service.js";
import { createSignedDownloadUrl } from "../services/storage.service.js";

export const getVersions = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.auth!.userId;
    const { fileId } = req.params;

    const allowed = await canView(
      userId,
      "file",
      fileId
    );

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this file",
      });
    }

    const { data, error } = await supabase
      .from("file_versions")
      .select(
        "id,file_id,version_number,size_bytes,checksum,created_at,storage_key"
      )
      .eq("file_id", fileId)
      .order("version_number", {
        ascending: false,
      });

    if (error) throw error;

    return res.json({
      success: true,
      versions: data ?? [],
    });
  } catch (error) {
    console.error("Get versions error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get file versions",
    });
  }
};
export const downloadVersion = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.auth!.userId;

    const { fileId, versionId } = req.params;

    const allowed = await canView(
      userId,
      "file",
      fileId
    );

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You do not have access",
      });
    }

    const { data: version, error } = await supabase
      .from("file_versions")
      .select("*")
      .eq("id", versionId)
      .eq("file_id", fileId)
      .maybeSingle();

    if (error) throw error;

    if (!version) {
      return res.status(404).json({
        success: false,
        message: "Version not found",
      });
    }

    const signedUrl = await createSignedDownloadUrl(
      version.storage_key
    );

    return res.json({
      success: true,
      signedUrl,
      expiresIn: 300,
    });
  } catch (error) {
    console.error("Download version error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to download version",
    });
  }
};
export const revertVersion = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.auth!.userId;

    const { fileId, versionId } = req.params;

    const allowed = await canEdit(
      userId,
      "file",
      fileId
    );

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You cannot revert this file",
      });
    }

    const { data: version, error: versionError } =
      await supabase
        .from("file_versions")
        .select("*")
        .eq("id", versionId)
        .eq("file_id", fileId)
        .maybeSingle();

    if (versionError) throw versionError;

    if (!version) {
      return res.status(404).json({
        success: false,
        message: "Version not found",
      });
    }

    const { data: file, error: fileError } =
      await supabase
        .from("files")
        .select("*")
        .eq("id", fileId)
        .maybeSingle();

    if (fileError) throw fileError;

    if (!file) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    // Create a new version pointing to the old storage object.
    const nextVersionNumber =
      version.version_number + 1;

    const { data: newVersion, error: newVersionError } =
      await supabase
        .from("file_versions")
        .insert({
          file_id: fileId,
          version_number: nextVersionNumber,
          storage_key: version.storage_key,
          size_bytes: version.size_bytes,
          checksum: version.checksum,
        })
        .select()
        .single();

    if (newVersionError) throw newVersionError;

    const { error: updateError } = await supabase
      .from("files")
      .update({
        version_id: newVersion.id,
        size_bytes: version.size_bytes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileId);

    if (updateError) throw updateError;

    await supabase.from("activities").insert({
      actor_id: userId,
      action: "rename",
      resource_type: "file",
      resource_id: fileId,
      context: {
        action: "version_revert",
        versionId,
      },
    });

    return res.json({
      success: true,
      version: newVersion,
    });
  } catch (error) {
    console.error("Revert version error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to revert version",
    });
  }
};