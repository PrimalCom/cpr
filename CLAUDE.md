# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

This is a full-stack TanStack application demonstrating modern React patterns with:

- **Framework**: TanStack Start (full-stack React framework with SSR)
- **Router**: TanStack Router (file-based routing in `src/routes/`)
- **State Management**: TanStack Store (reactive state with derived values)
- **Data Fetching**: TanStack Query (with SSR integration)
- **Styling**: Tailwind CSS v4
- **UI Components**: Shadcn/ui
- **Database**: Drizzle ORM with PostgreSQL
- **Authentication**: Better Auth (email/password with TanStack Start adapter)
- **AI Integration**: TanStack AI with multi-provider support (Anthropic, OpenAI, Gemini, Ollama)
- **Build Tool**: Vite with Nitro
- **Testing**: Vitest with React Testing Library

## Development Commands

```bash
# Development
pnpm install         # Install dependencies
pnpm dev             # Start dev server on port 3008

# Building & Preview
pnpm build           # Build for production
pnpm preview         # Preview production build

# Testing & Quality
pnpm test            # Run Vitest tests
pnpm lint            # Run ESLint
pnpm format          # Run Prettier
pnpm check           # Format and lint with auto-fix

# Database (Drizzle)
pnpm db:generate     # Generate migrations from schema
pnpm db:migrate      # Run migrations
pnpm db:push         # Push schema changes directly
pnpm db:pull         # Pull schema from database
pnpm db:studio       # Open Drizzle Studio
```

## Project Architecture

### Directory Structure

- **`src/routes/`** - File-based routing (see Routing section)
- **`src/components/`** - Reusable React components
  - `ui/` - Shadcn components (button, input, etc.)
  - Files prefixed with `demo.` are examples
- **`src/lib/`** - Shared utilities and configurations
  - `auth.ts` - Better Auth server configuration
  - `auth-client.ts` - Better Auth client hooks
  - `utils.ts` - General utilities (cn, etc.)
- **`src/hooks/`** - Custom React hooks
- **`src/db/`** - Database layer
  - `schema.ts` - Drizzle schema definitions
  - `index.ts` - Database client instance
- **`src/db-collections/`** - TanStack DB collections for client-side data
- **`src/integrations/`** - Third-party service integrations
  - `tanstack-query/` - Query client setup and devtools
  - `better-auth/` - Auth UI components
- **`src/data/`** - Static data and fixtures

### Routing (TanStack Router)

This project uses file-based routing. Routes are defined in `src/routes/`:

- Route files export a `Route` object created with `createFileRoute()`
- **`__root.tsx`** - Root layout with Header and devtools
- **`index.tsx`** - Homepage route at `/`
- **API routes**: Files like `api.*.ts` define server endpoints
  - Use `server.handlers` with GET/POST/etc.
  - Example: `src/routes/api/auth/$.ts` handles all `/api/auth/*` requests

Route generation happens automatically. The generated route tree is in `src/routeTree.gen.ts` (do not edit manually).

### State Management (TanStack Store)

- Global stores are defined in `src/lib/` (e.g., `demo-store.ts`)
- Use `new Store(initialValue)` to create stores
- Use `new Derived({ fn, deps })` for derived state (must call `.mount()`)
- Access in components with `useStore(store)`
- Update with `store.setState((prev) => newValue)`

### Data Fetching

Two primary patterns:

1. **Route loaders**: Use the `loader` property in route definitions for SSR-compatible data fetching
2. **TanStack Query**: Use `useQuery`/`useMutation` for client-side data fetching

Router and Query Client are integrated via `setupRouterSsrQueryIntegration` in `src/router.tsx`.

### Server Functions & API Routes

- **API routes**: Create files in `src/routes/` with names like `api.*.ts`
- Use `server.handlers` to define GET/POST/etc. handlers
- Example pattern:
  ```typescript
  export const Route = createFileRoute('/api/example')({
    server: {
      handlers: {
        POST: async ({ request }) => {
          const body = await request.json()
          // ... handle request
          return new Response(JSON.stringify(result))
        },
      },
    },
  })
  ```

### Database (Drizzle ORM)

- Schema defined in `src/db/schema.ts`
- Database client exported from `src/db/index.ts` as `db`
- Connection configured via `DATABASE_URL` environment variable
- Drizzle config in `drizzle.config.ts` (uses `.env.local` and `.env`)
- After schema changes, run `pnpm db:generate` then `pnpm db:push` or `pnpm db:migrate`

### Authentication (Better Auth)

- Server config: `src/lib/auth.ts` - uses `betterAuth()` with email/password
- Client hooks: `src/lib/auth-client.ts` - use `useSession()`, `signIn()`, etc.
- Auth handler: `src/routes/api/auth/$.ts` - proxies all auth requests
- TanStack Start integration via `tanstackStartCookies()` plugin
- Environment variable: `BETTER_AUTH_SECRET` (generate with `npx @better-auth/cli secret`)

### AI Integration (TanStack AI)

Multi-provider AI support with adapter pattern:

- Providers: Anthropic (Claude), OpenAI (GPT), Gemini, Ollama
- Provider selection based on environment variables (ANTHROPIC_API_KEY, etc.)
- Uses `chat()` from `@tanstack/ai` for streaming responses
- Tool support for function calling (server and client-side tools)
- See `src/routes/demo/api.ai.chat.ts` for implementation pattern

Key concepts:

- Server tools execute on backend (e.g., database queries)
- Client tools render custom UI components
- Use `toServerSentEventsResponse()` for streaming
- Handle request abortion properly with AbortController

### Environment Variables (T3 Env)

- Defined in `src/env.ts` using `@t3-oss/env-core`
- Server vars: `SERVER_URL`, `DATABASE_URL`, API keys, etc.
- Client vars: Must be prefixed with `VITE_` (e.g., `VITE_APP_TITLE`)
- Import with `import { env } from '@/env'`
- Type-safe with Zod validation

### UI Components (Shadcn)

Add new components using:

```bash
pnpm dlx shadcn@latest add <component-name>
```

Components are added to `src/components/ui/`. Configuration in `components.json`.

Uses class-variance-authority (CVA) for component variants and `tailwind-merge` for className merging. Utility function `cn()` in `src/lib/utils.ts`.

### Path Aliases

- `@/*` maps to `src/*` (configured in `tsconfig.json` and `vite.config.ts`)
- Import example: `import { db } from '@/db'`

### Demo Files

Files prefixed with `demo` or `demo-` are examples and can be safely deleted. They demonstrate features like AI chat, forms, tables, and state management.

## Common Development Patterns

### Adding a New Route

1. Create file in `src/routes/` (e.g., `src/routes/about.tsx`)
2. Export Route with `createFileRoute('/about')`
3. Define component with `Route.component`
4. Use `<Link to="/about">` for navigation

### Creating an API Endpoint

1. Create file like `src/routes/api.myendpoint.ts`
2. Export Route with server handlers
3. Access at `/api/myendpoint`

### Using TanStack Query with SSR

1. Define loader in route with data fetching
2. Or use `useQuery` with `queryClient.ensureQueryData` in loader
3. Query client is available in route context

### Adding a Database Table

1. Define schema in `src/db/schema.ts`
2. Run `pnpm db:generate` to create migration
3. Run `pnpm db:push` to apply changes
4. Import and use with `db.select()`, `db.insert()`, etc.

## Important Notes

- The dev server runs on port 3008 by default
- Devtools are integrated into a unified panel (bottom-right): Router, Store, Query, AI
- TypeScript is configured with strict mode
- ESLint uses `@tanstack/eslint-config`
- Better Auth requires `BETTER_AUTH_SECRET` in `.env.local`
- Database operations require `DATABASE_URL` in `.env.local`
