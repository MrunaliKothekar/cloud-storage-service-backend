import type { AccessTokenPayload } from "../utils/jwt.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;

      user?: {
        id: string;
        email: string;
        name: string | null;
        image_url: string | null;
        token_version: number;
        created_at: string;
      };
    }
  }
}

export {};