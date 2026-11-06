# Creator Studio

A full-stack content management app for a creator and their viewers. The React viewer portal supports browsing, search, category filters, views, likes, and comments. The private creator dashboard supports login, content CRUD, drafts and scheduled publishing, dashboard statistics, and comment moderation.

## Requirements

- Node.js 20.19 or newer
- A MongoDB Atlas database

## Run locally

1. The local `backend/.env` is already configured for the supplied Atlas connection and an initial creator account. It is gitignored. Use `backend/.env.example` as a template if you need to recreate it.
2. Optionally copy `frontend/.env.example` to `frontend/.env` and set the creator's public profile details.
3. In a terminal, run `npm install` inside both `backend` and `frontend`.
4. Start the API with `npm run dev` inside `backend`.
5. Start the web app with `npm run dev` inside `frontend`.
6. Open the URL printed by Vite. The local frontend proxies `/api` requests to the API.

The backend creates the initial creator account from `CREATOR_EMAIL` and `CREATOR_PASSWORD` the first time it starts. It hashes the password before storing it. If you change those values after the account exists, update that account's password in the database or use a fresh database.

## Deploy

- Deploy `backend` as a Node web service (Render is configured by `render.yaml`). Set `MONGODB_URI`, `JWT_SECRET`, `CREATOR_EMAIL`, `CREATOR_PASSWORD`, and `CLIENT_URL` in the hosting environment. Set the frontend's public URL as `CLIENT_URL`.
- Deploy `frontend` to Vercel using `frontend` as the project root. Set `VITE_API_BASE_URL` to the deployed backend URL and set `VITE_CREATOR_NAME`, `VITE_CREATOR_BIO`, and `VITE_CREATOR_AVATAR_URL` to the creator's public profile details.
- Add the backend host to the MongoDB Atlas network access allowlist. For production, use the narrowest network access rule your hosting provider supports.

The app is prepared for deployment, but it still needs to be connected to your hosting accounts and assigned public URLs.
