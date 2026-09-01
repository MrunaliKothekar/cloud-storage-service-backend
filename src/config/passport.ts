import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

import { env } from "./env.js";
import { pool } from "./database.js";

passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL,
    },

    async (
      _accessToken,
      _refreshToken,
      profile,
      done
    ) => {
      try {
        const email = profile.emails?.[0]?.value;

        if (!email) {
          return done(
            new Error("GOOGLE_EMAIL_NOT_AVAILABLE"),
            false
          );
        }

        const name = profile.displayName || null;

        const imageUrl =
          profile.photos?.[0]?.value || null;

        const existingUser = await pool.query(
          `
          SELECT
            id,
            email,
            name,
            image_url,
            token_version,
            created_at
          FROM users
          WHERE email = $1
          `,
          [email]
        );

        if (existingUser.rows.length > 0) {
          return done(null, existingUser.rows[0]);
        }

        const result = await pool.query(
          `
          INSERT INTO users (
            email,
            name,
            image_url
          )
          VALUES ($1, $2, $3)
          RETURNING
            id,
            email,
            name,
            image_url,
            token_version,
            created_at
          `,
          [email, name, imageUrl]
        );

        return done(null, result.rows[0]);
      } catch (error) {
        return done(error, false);
      }
    }
  )
);

export default passport;