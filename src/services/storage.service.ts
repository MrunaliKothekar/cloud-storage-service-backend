import { supabase } from "../config/supabase.js";
import { env } from "../config/env.js";

export const uploadToStorage = async (
  storageKey: string,
  buffer: Buffer,
  contentType: string
) => {
  const { data, error } = await supabase.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .upload(storageKey, buffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return data;
};

export const deleteFromStorage = async (
  storageKey: string
) => {
  const { error } = await supabase.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .remove([storageKey]);

  if (error) {
    throw error;
  }
};