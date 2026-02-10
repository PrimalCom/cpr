import { betterAuth } from 'better-auth'
import pg from 'pg'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

export const auth = betterAuth({
  baseURL: process.env.SERVER_URL || 'http://localhost:3008',
  trustedOrigins: [process.env.SERVER_URL || 'http://localhost:3008'],
  database: pool,
  emailAndPassword: {
    enabled: true,
  },
  plugins: [tanstackStartCookies()],
})
