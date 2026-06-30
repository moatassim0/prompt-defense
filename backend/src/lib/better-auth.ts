import { betterAuth } from "better-auth";
import { pool, query } from "../config/database";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { recordLoginEvent } from "./audit";
import { pruneUserSessionsKeepNewest } from "./session-cleanup";

dotenv.config();

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3001",
  trustedOrigins: [
    process.env.FRONTEND_URL ? process.env.FRONTEND_URL : "http://localhost:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ],
  database: pool,
  emailAndPassword: {
    enabled: true,
    password: {
      hash: async (password: string) => {
        return await bcrypt.hash(password, 12);
      },
      verify: async ({ password, hash }: { password: string; hash: string }) => {
        return await bcrypt.compare(password, hash);
      },
    },
  },
  user: {
    modelName: "users",
    fields: {
      name: "display_name",
      email: "email",
      emailVerified: "email_verified",
      image: "image",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    additionalFields: {
      password_hash: {
        type: "string",
        required: false,
        defaultValue: "managed_by_better_auth",
      },
      role: {
        type: "string",
        defaultValue: "user",
      },
      is_active: {
        type: "boolean",
        defaultValue: true,
      },
      failed_login_count: {
        type: "number",
        defaultValue: 0,
      },
      locked_until: {
        type: "date",
        required: false,
      },
      deleted_at: {
        type: "date",
        required: false,
      }
    }
  },
  session: {
    modelName: "session",
  },
  account: {
    modelName: "account",
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session: { userId: string; [key: string]: unknown }) => {
          try {
            const result = await query(
              'SELECT email FROM users WHERE id = $1',
              [session.userId],
            );
            const email = result.rows[0]?.email ?? '';
            await recordLoginEvent({
              userId: session.userId,
              email,
              success: true,
            });
            const maxSessions = Math.max(
              1,
              Number.parseInt(process.env.SESSION_MAX_PER_USER ?? '5', 10) || 5,
            );
            await pruneUserSessionsKeepNewest(session.userId, maxSessions);
          } catch (err) {
            console.error('Session hook (login audit / prune) failed:', err);
          }
        },
      },
    },
  },
  advanced: {
    database: {
      generateId: () => globalThis.crypto.randomUUID(),
    },
    crossSubDomainCookies: {
      enabled: process.env.NODE_ENV === 'production' && !!process.env.COOKIE_DOMAIN,
      domain: process.env.COOKIE_DOMAIN,
    },
  }
});
