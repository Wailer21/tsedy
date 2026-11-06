# OpenPage

A free reading and writing app for independent creators. Readers land on a shared story feed, open writer profiles from bylines, and read, search, like, or comment without registering. Each writer has a separate private workspace for publishing stories, managing comments, and viewing basic statistics.

## Requirements

- Node.js 20.19 or newer
- A MongoDB Atlas database

See [DATABASE.md](DATABASE.md) for the collection design, relationships, validation, and indexes.

## Sample content

To add sample stories, open the `content_creator.contents` collection in Atlas Data Explorer, choose **Add Data → Insert Document**, switch to **JSON mode**, and paste the array from [backend/sample-content.json](backend/sample-content.json). The sample articles are assigned to the initial creator account configured in `backend/.env`. Comments and likes are created through the normal app flows.

## Run locally

1. The local `backend/.env` is already configured for the Atlas connection and an initial creator account. It is gitignored. Use `backend/.env.example` as a template if you need to recreate it.
2. Optionally copy `frontend/.env.example` to `frontend/.env` and set the creator's public profile details.
3. In a terminal, run `npm install` inside both `backend` and `frontend`.
4. Start the API with `npm run dev` inside `backend`.
5. Start the web app with `npm run dev` inside `frontend`.
6. Open the URL printed by Create React App (normally `http://localhost:3000`). The local frontend proxies `/api` requests to the API.

The backend creates the initial creator account from `CREATOR_EMAIL` and `CREATOR_PASSWORD` the first time it starts. It hashes the password before storing it. Each profile has its own writing workspace, and new content belongs to the signed-in writer.

## Deploy

- Deploy `backend` as a Node web service (Render is configured by `render.yaml`). Set `MONGODB_URI`, `JWT_SECRET`, `CREATOR_EMAIL`, `CREATOR_PASSWORD`, and `CLIENT_URL` in the hosting environment. Set the frontend's public URL as `CLIENT_URL`.
- Deploy `frontend` to Vercel using `frontend` as the project root. Set `REACT_APP_API_BASE_URL` to the deployed backend URL and set `REACT_APP_CREATOR_NAME`, `REACT_APP_CREATOR_BIO`, and `REACT_APP_CREATOR_AVATAR_URL` to the creator's public profile details.
- Add the backend host to the MongoDB Atlas network access allowlist. For production, use the narrowest network access rule your hosting provider supports.

The app is prepared for deployment, but it still needs to be connected to your hosting accounts and assigned public URLs.
