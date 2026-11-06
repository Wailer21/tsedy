# Database design

Creator Studio uses MongoDB through Mongoose. The API connects to the database named in `MONGODB_URI` before it starts listening. The local template points to a database named `content_creator`; Atlas can use a different database name if the connection URI specifies one.

## Collections

| Collection | Purpose | Main fields |
| --- | --- | --- |
| `users` | Creator login and public profile | `email`, `passwordHash`, `displayName`, `bio`, `avatarUrl`, `role`, timestamps |
| `contents` | Creator-owned content and publishing state | `creator`, `title`, `description`, `category`, `contentType`, `thumbnailUrl`, `mediaUrl`, `articleBody`, `status`, `publishAt`, `featured`, `views`, timestamps |
| `comments` | Viewer comments and moderation state | `content`, `displayName`, `body`, `status`, timestamps |
| `likes` | A viewer's like on a content item | `content`, `viewerKey`, timestamps |

The app does not require viewer registration. Viewers use a locally generated browser key for likes and enter a display name when commenting, so a separate `viewers` collection is not needed. If viewer accounts are added later, create that collection and reference its IDs from likes and comments.

## Relationships

- One content item can have many comments and likes. Both collections store the content item's MongoDB ObjectId.
- Each content item stores its creator's user ObjectId. Public profiles show only a creator name, bio, and avatar; they do not expose login emails.
- Each creator has an independent dashboard. Content, view totals, and comment moderation are filtered to the signed-in creator.
- Deleting content through the API also deletes its comments and likes.
- The `users` collection stores creator accounts. Passwords are hashed with bcrypt before storage, and password hashes are excluded from normal query results.

## Validation and access

- Content fields are checked in the API and again by Mongoose for required values, allowed categories and types, status, string lengths, dates, and nonnegative view counts. Media links must use HTTP or HTTPS.
- Comments require an existing published content item, a display name, and a body within the configured length limits. New comments start as `Pending`; only `Approved` comments appear in the public portal.
- Creator emails are normalized to lowercase and are unique. Creator-only database operations require a valid JWT and are always scoped to that token's creator ID.
- The public feed at `GET /api/feed` returns published content with its creator's public profile. `GET /api/creators` lists profiles, and `GET /api/contents` requires a `creatorId` so each creator profile loads its own library.
- Public content queries return only published items whose publication date has arrived. Scheduled items are promoted to `Published` when their publication time arrives.

## Indexes

- `users.email` is unique, preventing duplicate creator accounts.
- `contents.creator`, `contents.status`, and `contents.publishAt` are indexed together to support creator-specific published-content and scheduled-content lookups.
- `comments.content`, `comments.status`, and `comments.createdAt` are indexed together for loading and moderating comments by content.
- `likes.content` and `likes.viewerKey` have a unique compound index, allowing one like per browser key for each item.

Mongoose initializes the models and indexes when the API connects to MongoDB. The connection string and other secrets belong in `backend/.env` locally and in the hosting provider's environment settings; they must not be committed to Git.
