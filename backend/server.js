import 'dotenv/config';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const app = express();
const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET;
if (!process.env.MONGODB_URI || !jwtSecret || jwtSecret.length < 32) {
  throw new Error('Set MONGODB_URI and a JWT_SECRET of at least 32 characters in the environment.');
}

const contentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 140 },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  category: { type: String, required: true, enum: ['Education', 'Technology', 'Entertainment', 'Lifestyle', 'Other'] },
  contentType: { type: String, required: true, enum: ['Video', 'Article', 'Image', 'Podcast', 'Other'] },
  thumbnailUrl: { type: String, default: '', trim: true },
  mediaUrl: { type: String, default: '', trim: true },
  articleBody: { type: String, default: '', maxlength: 50000 },
  status: { type: String, enum: ['Draft', 'Published', 'Scheduled'], default: 'Draft' },
  publishAt: { type: Date, default: null },
  featured: { type: Boolean, default: false },
  views: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['creator'], default: 'creator' },
}, { timestamps: true });

const commentSchema = new mongoose.Schema({
  content: { type: mongoose.Schema.Types.ObjectId, ref: 'Content', required: true, index: true },
  displayName: { type: String, required: true, trim: true, maxlength: 40 },
  body: { type: String, required: true, trim: true, minlength: 5, maxlength: 1000 },
  status: { type: String, enum: ['Pending', 'Approved', 'Hidden'], default: 'Pending', index: true },
}, { timestamps: true });

const likeSchema = new mongoose.Schema({
  content: { type: mongoose.Schema.Types.ObjectId, ref: 'Content', required: true },
  viewerKey: { type: String, required: true, maxlength: 100 },
}, { timestamps: true });
likeSchema.index({ content: 1, viewerKey: 1 }, { unique: true });

const Content = mongoose.model('Content', contentSchema);
const User = mongoose.model('User', userSchema);
const Comment = mongoose.model('Comment', commentSchema);
const Like = mongoose.model('Like', likeSchema);

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((origin) => origin.trim());
app.use(helmet());
app.use(cors({ origin: allowedOrigins, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api/comments', rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false }));

function fail(res, status, message) { return res.status(status).json({ message }); }
function validId(id) { return mongoose.isValidObjectId(id); }
function asyncRoute(handler) { return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next); }
function requireAuth(req, res, next) {
  const value = req.headers.authorization || '';
  const [scheme, token] = value.split(' ');
  if (scheme !== 'Bearer' || !token) return fail(res, 401, 'Please sign in to continue.');
  try { req.creator = jwt.verify(token, jwtSecret); next(); }
  catch { return fail(res, 401, 'Your session has expired. Please sign in again.'); }
}

function cleanUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

function contentInput(body) {
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const category = String(body.category || '');
  const contentType = String(body.contentType || '');
  const status = String(body.status || 'Draft');
  const thumbnailUrl = cleanUrl(body.thumbnailUrl);
  const mediaUrl = cleanUrl(body.mediaUrl);
  if (title.length < 2 || title.length > 140) throw new Error('Title must be between 2 and 140 characters.');
  if (!description || description.length > 500) throw new Error('Add a description of up to 500 characters.');
  if (!['Education', 'Technology', 'Entertainment', 'Lifestyle', 'Other'].includes(category)) throw new Error('Choose a valid category.');
  if (!['Video', 'Article', 'Image', 'Podcast', 'Other'].includes(contentType)) throw new Error('Choose a valid content type.');
  if (!['Draft', 'Published', 'Scheduled'].includes(status)) throw new Error('Choose a valid status.');
  if (thumbnailUrl === null || mediaUrl === null) throw new Error('Media links must be valid HTTP or HTTPS URLs.');
  let publishAt = null;
  if (body.publishAt) {
    publishAt = new Date(body.publishAt);
    if (Number.isNaN(publishAt.getTime())) throw new Error('Publication date is invalid.');
  }
  if (status === 'Scheduled' && !publishAt) throw new Error('Choose a publication date for scheduled content.');
  if (status === 'Published' && !publishAt) publishAt = new Date();
  return {
    title, description, category, contentType, status, publishAt,
    thumbnailUrl: thumbnailUrl || '', mediaUrl: mediaUrl || '',
    articleBody: String(body.articleBody || '').slice(0, 50000), featured: Boolean(body.featured),
  };
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'connecting' }));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return fail(res, 400, 'Email and password are required.');
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return fail(res, 401, 'Email or password is incorrect.');
  const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, jwtSecret, { expiresIn: '8h' });
  return res.json({ token, creator: { email: user.email } });
}));

app.get('/api/contents', asyncRoute(async (req, res) => {
  const query = { status: 'Published', $or: [{ publishAt: null }, { publishAt: { $lte: new Date() } }] };
  if (req.query.category) query.category = String(req.query.category);
  if (req.query.search) {
    const escaped = String(req.query.search).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$and = [{ $or: [{ title: { $regex: escaped, $options: 'i' } }, { description: { $regex: escaped, $options: 'i' } }, { articleBody: { $regex: escaped, $options: 'i' } }] }];
  }
  const contents = await Content.find(query).sort({ featured: -1, publishAt: -1, createdAt: -1 }).limit(100).lean();
  res.json({ contents });
}));

app.get('/api/contents/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return fail(res, 400, 'Content was not found.');
  const content = await Content.findOneAndUpdate({
    _id: req.params.id, status: 'Published', $or: [{ publishAt: null }, { publishAt: { $lte: new Date() } }],
  }, { $inc: { views: 1 } }, { new: true }).lean();
  if (!content) return fail(res, 404, 'Content was not found.');
  const [likeCount, liked] = await Promise.all([
    Like.countDocuments({ content: content._id }),
    req.query.viewerKey ? Like.exists({ content: content._id, viewerKey: String(req.query.viewerKey).slice(0, 100) }) : false,
  ]);
  res.json({ content, likeCount, liked: Boolean(liked) });
}));

app.post('/api/contents', requireAuth, asyncRoute(async (req, res) => {
  let input;
  try { input = contentInput(req.body); } catch (error) { return fail(res, 400, error.message); }
  const content = await Content.create(input);
  res.status(201).json({ content });
}));

app.put('/api/contents/:id', requireAuth, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return fail(res, 400, 'Content was not found.');
  let input;
  try { input = contentInput(req.body); } catch (error) { return fail(res, 400, error.message); }
  const content = await Content.findByIdAndUpdate(req.params.id, input, { new: true, runValidators: true });
  if (!content) return fail(res, 404, 'Content was not found.');
  res.json({ content });
}));

app.delete('/api/contents/:id', requireAuth, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return fail(res, 400, 'Content was not found.');
  const content = await Content.findByIdAndDelete(req.params.id);
  if (!content) return fail(res, 404, 'Content was not found.');
  await Promise.all([Comment.deleteMany({ content: content._id }), Like.deleteMany({ content: content._id })]);
  res.status(204).end();
}));

app.get('/api/comments/:contentId', asyncRoute(async (req, res) => {
  if (!validId(req.params.contentId)) return fail(res, 400, 'Content was not found.');
  const comments = await Comment.find({ content: req.params.contentId, status: 'Approved' }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ comments });
}));

app.post('/api/comments', asyncRoute(async (req, res) => {
  const displayName = String(req.body.displayName || '').trim();
  const body = String(req.body.body || '').trim();
  const contentId = String(req.body.contentId || '');
  if (!validId(contentId)) return fail(res, 400, 'Content was not found.');
  if (displayName.length < 2 || displayName.length > 40) return fail(res, 400, 'Name must be between 2 and 40 characters.');
  if (body.length < 5 || body.length > 1000) return fail(res, 400, 'Comment must be between 5 and 1000 characters.');
  const exists = await Content.exists({ _id: contentId, status: 'Published', $or: [{ publishAt: null }, { publishAt: { $lte: new Date() } }] });
  if (!exists) return fail(res, 404, 'Content was not found.');
  const comment = await Comment.create({ content: contentId, displayName, body });
  res.status(201).json({ message: 'Comment submitted for review.', comment: { id: comment.id, status: comment.status } });
}));

app.post('/api/likes', asyncRoute(async (req, res) => {
  const contentId = String(req.body.contentId || '');
  const viewerKey = String(req.body.viewerKey || '').slice(0, 100);
  if (!validId(contentId) || viewerKey.length < 8) return fail(res, 400, 'A valid content and viewer are required.');
  const exists = await Content.exists({ _id: contentId, status: 'Published', $or: [{ publishAt: null }, { publishAt: { $lte: new Date() } }] });
  if (!exists) return fail(res, 404, 'Content was not found.');
  const existing = await Like.findOne({ content: contentId, viewerKey });
  let liked;
  if (existing) { await existing.deleteOne(); liked = false; }
  else {
    try { await Like.create({ content: contentId, viewerKey }); liked = true; }
    catch (error) { if (error.code !== 11000) throw error; liked = true; }
  }
  const likeCount = await Like.countDocuments({ content: contentId });
  res.json({ liked, likeCount });
}));

app.get('/api/dashboard/stats', requireAuth, asyncRoute(async (_req, res) => {
  const [totalContent, published, drafts, scheduled, comments, pendingComments, views] = await Promise.all([
    Content.countDocuments(), Content.countDocuments({ status: 'Published' }), Content.countDocuments({ status: 'Draft' }),
    Content.countDocuments({ status: 'Scheduled' }), Comment.countDocuments(), Comment.countDocuments({ status: 'Pending' }),
    Content.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]),
  ]);
  res.json({ stats: { totalContent, published, drafts, scheduled, comments, pendingComments, views: views[0]?.total || 0 } });
}));

app.get('/api/dashboard/contents', requireAuth, asyncRoute(async (_req, res) => {
  const contents = await Content.find().sort({ updatedAt: -1 }).lean();
  res.json({ contents });
}));

app.get('/api/dashboard/comments', requireAuth, asyncRoute(async (_req, res) => {
  const comments = await Comment.find().populate('content', 'title').sort({ createdAt: -1 }).limit(200).lean();
  res.json({ comments });
}));

app.patch('/api/dashboard/comments/:id', requireAuth, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return fail(res, 400, 'Comment was not found.');
  const status = String(req.body.status || '');
  if (!['Approved', 'Hidden', 'Pending'].includes(status)) return fail(res, 400, 'Choose a valid comment status.');
  const comment = await Comment.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true });
  if (!comment) return fail(res, 404, 'Comment was not found.');
  res.json({ comment });
}));

app.delete('/api/dashboard/comments/:id', requireAuth, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return fail(res, 400, 'Comment was not found.');
  const comment = await Comment.findByIdAndDelete(req.params.id);
  if (!comment) return fail(res, 404, 'Comment was not found.');
  res.status(204).end();
}));

app.use((req, res) => fail(res, 404, `No route for ${req.method} ${req.path}.`));
app.use((error, _req, res, _next) => {
  console.error(error.message);
  if (error.name === 'ValidationError') return fail(res, 400, 'Some content fields are invalid.');
  if (error.code === 11000) return fail(res, 409, 'This record already exists.');
  return fail(res, 500, 'The server could not complete the request.');
});

async function bootstrapCreator() {
  const email = String(process.env.CREATOR_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.CREATOR_PASSWORD || '');
  if (!email || password.length < 12) throw new Error('Set CREATOR_EMAIL and a CREATOR_PASSWORD of at least 12 characters.');
  if (await User.exists({ email })) return;
  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({ email, passwordHash });
  console.log('Initial creator account created.');
}

async function start() {
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all([Content.init(), User.init(), Comment.init(), Like.init()]);
  await bootstrapCreator();
  setInterval(() => {
    Content.updateMany({ status: 'Scheduled', publishAt: { $lte: new Date() } }, { $set: { status: 'Published' } }).catch((error) => console.error(error.message));
  }, 60_000).unref();
  app.listen(port, '0.0.0.0', () => console.log(`Creator Studio API listening on ${port}`));
}

start().catch((error) => {
  console.error(`Startup failed: ${error.message}`);
  process.exit(1);
});
