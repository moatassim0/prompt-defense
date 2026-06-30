import { betterAuth } from "better-auth";
import { pool } from "../config/database";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

export const auth = betterAuth({
  baseURL: "http://localhost:3001/api/auth",
  trustedOrigins: [
    process.env.FRONTEND_URL ? process.env.FRONTEND_URL : "http://localhost:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3001",
    "http://127.0.0.1:3001"
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
      name: "display_name", // Map 'name' to our existing 'display_name'
      email: "email",
      emailVerified: "email_verified",
      image: "image",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
      },
      password: {
        type: "string",
        returned: false,
        fieldName: "password_hash"
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
  advanced: {
    generateId: () => crypto.randomUUID(),
    crossSubDomainCookies: {
      enabled: true
    }
  }
});
