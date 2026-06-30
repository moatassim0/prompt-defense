# Local Setup & Quickstart

This application uses a Node.js backend and a React/Vite frontend. It relies on **Neon** for a Serverless Postgres database and **Doppler** for secure environment variables.

## Prerequisites
- Node.js `v18+`
- Postgres/Neon Database
- [Doppler CLI](https://docs.doppler.com/docs/install-cli)

## 1. Project Initialization

Install dependencies for both the frontend and backend architectures:
```bash
# Setup backend
cd backend
npm install

# Setup frontend
cd ../frontend
npm install
```

## 2. Environment Variables & Doppler Integration

This project avoids `.env` files committed to disk and instead relies on Doppler to inject environment variables securely.

1. Ensure the Doppler CLI is installed.
2. Login to Doppler:
```bash
doppler login
```
3. Run the automated Doppler setup script situated in the root:
```bash
# Windows (Requires Git Bash or WSL)
./dopplersetup.sh
```
This script will:
- Check for Doppler authentication.
- Read secrets from `.env.example` to establish required keys for Doppler.
- Link the project locally and sync the parameters to your local backend execution context.

## 3. Database Initialization

Migrations are run programmatically on server startup. However, you MUST ensure you have initialized a local Neon project and pasted the matching `DATABASE_URL` into your Doppler configuration.

```bash
cd backend
npx tsx src/db/migrate.ts
```
The migration script automatically seeds two default accounts to use within the testing environment:
- **Admin**: `admin@lab.com` / `admin1234`
- **User**: `user@lab.com` / `user1234`

## 4. Run the Environments

Because Doppler injects the variables safely, always launch the backend through the Doppler execution layer:

```bash
# Terminal 1: Backend
cd backend
doppler run -- npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

Browse to `http://localhost:5173` and login with the seeded `admin@lab.com` credentials.
