import { useEffect, useMemo, useState } from 'react';

const API = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const CREATOR_NAME = import.meta.env.VITE_CREATOR_NAME || 'The Creator Studio';
const CREATOR_BIO = import.meta.env.VITE_CREATOR_BIO || 'A home for useful ideas, fresh perspectives, and stories worth sharing.';
const CREATOR_AVATAR = import.meta.env.VITE_CREATOR_AVATAR_URL || '';
const CATEGORIES = ['Education', 'Technology', 'Entertainment', 'Lifestyle', 'Other'];
const TYPES = ['Video', 'Article', 'Image', 'Podcast', 'Other'];

async function request(path, options = {}) {
  const response = await fetch(`${API}/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || 'Something went wrong. Please try again.');
  return payload;
}

function getViewerKey() {
  let key = localStorage.getItem('creator-studio-viewer');
  if (!key) {
    key = window.crypto?.randomUUID?.() || `viewer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('creator-studio-viewer', key);
  }
  return key;
}

function dateLabel(value) {
  if (!value) return 'Coming soon';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function Avatar({ size = 'large' }) {
  return CREATOR_AVATAR
    ? <img className={`avatar avatar-${size}`} src={CREATOR_AVATAR} alt={`${CREATOR_NAME} profile`} />
    : <div className={`avatar avatar-${size} avatar-fallback`} aria-label={`${CREATOR_NAME} profile`}>{CREATOR_NAME.slice(0, 1).toUpperCase()}</div>;
}

function App() {
  const [section, setSection] = useState('home');
  const [contents, setContents] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentForm, setCommentForm] = useState({ displayName: '', body: '' });
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [flash, setFlash] = useState('');
  const [token, setToken] = useState(() => localStorage.getItem('creator-studio-token') || '');
  const [login, setLogin] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [stats, setStats] = useState(null);
  const [adminContents, setAdminContents] = useState([]);
  const [adminComments, setAdminComments] = useState([]);
  const [adminTab, setAdminTab] = useState('overview');
  const [editing, setEditing] = useState(null);
  const [adminError, setAdminError] = useState('');
  const viewerKey = useMemo(getViewerKey, []);

  useEffect(() => {
    const initialContent = new URLSearchParams(window.location.search).get('content');
    if (initialContent) setSelected(initialContent);
  }, []);

  async function loadContents() {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (category !== 'All') params.set('category', category);
      const data = await request(`/contents?${params}`);
      setContents(data.contents || []);
    } catch (error) { setFlash(error.message); }
  }

  useEffect(() => { loadContents(); }, [search, category]);
  useEffect(() => {
    if (section === 'dashboard' && token) loadDashboard();
  }, [section, token]);
  useEffect(() => {
    if (!selected) { setDetail(null); setComments([]); return; }
    let active = true;
    request(`/contents/${selected}?viewerKey=${encodeURIComponent(viewerKey)}`).then(async (data) => {
      if (!active) return;
      setDetail(data.content);
      setLikeCount(data.likeCount || 0);
      setLiked(data.liked || false);
      const commentData = await request(`/comments/${selected}`);
      if (active) setComments(commentData.comments || []);
    }).catch((error) => { if (active) setFlash(error.message); });
    return () => { active = false; };
  }, [selected, viewerKey]);

  async function loadDashboard() {
    try {
      const [statData, contentData, commentData] = await Promise.all([
        request('/dashboard/stats', { token }),
        request('/dashboard/contents', { token }),
        request('/dashboard/comments', { token }),
      ]);
      setStats(statData.stats);
      setAdminContents(contentData.contents || []);
      setAdminComments(commentData.comments || []);
      setAdminError('');
    } catch (error) {
      if (/token|auth/i.test(error.message)) signOut();
      else setAdminError(error.message);
    }
  }

  function openDashboard() {
    setSection('dashboard');
    setSelected(null);
  }

  async function submitLogin(event) {
    event.preventDefault();
    setLoginError('');
    try {
      const data = await request('/auth/login', { method: 'POST', body: JSON.stringify(login) });
      localStorage.setItem('creator-studio-token', data.token);
      setToken(data.token);
      setLogin({ email: '', password: '' });
    } catch (error) { setLoginError(error.message); }
  }

  function signOut() {
    localStorage.removeItem('creator-studio-token');
    setToken('');
    setStats(null);
  }

  async function submitComment(event) {
    event.preventDefault();
    try {
      await request('/comments', { method: 'POST', body: JSON.stringify({ ...commentForm, contentId: selected }) });
      setCommentForm({ ...commentForm, body: '' });
      setFlash('Thanks! Your comment was sent for review.');
    } catch (error) { setFlash(error.message); }
  }

  async function toggleLike() {
    try {
      const data = await request('/likes', { method: 'POST', body: JSON.stringify({ contentId: selected, viewerKey }) });
      setLiked(data.liked);
      setLikeCount(data.likeCount);
    } catch (error) { setFlash(error.message); }
  }

  async function shareContent() {
    const url = `${window.location.origin}/?content=${selected}`;
    try {
      if (navigator.share) await navigator.share({ title: detail?.title || CREATOR_NAME, url });
      else { await navigator.clipboard.writeText(url); setFlash('Link copied to clipboard.'); }
    } catch (error) {
      if (error.name !== 'AbortError') setFlash('Could not share this link.');
    }
  }

  async function saveContent(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    body.featured = form.get('featured') === 'on';
    body.publishAt = body.publishAt ? new Date(body.publishAt).toISOString() : null;
    try {
      const path = editing?._id ? `/contents/${editing._id}` : '/contents';
      await request(path, { method: editing?._id ? 'PUT' : 'POST', token, body: JSON.stringify(body) });
      setEditing(null);
      setAdminTab('content');
      await loadDashboard();
      await loadContents();
      setFlash('Content saved.');
    } catch (error) { setAdminError(error.message); }
  }

  async function deleteContent(id) {
    if (!window.confirm('Delete this content and its related comments and likes?')) return;
    try {
      await request(`/contents/${id}`, { method: 'DELETE', token });
      await loadDashboard();
      await loadContents();
    } catch (error) { setAdminError(error.message); }
  }

  async function moderateComment(id, status) {
    try {
      await request(`/dashboard/comments/${id}`, { method: 'PATCH', token, body: JSON.stringify({ status }) });
      await loadDashboard();
    } catch (error) { setAdminError(error.message); }
  }

  async function deleteComment(id) {
    try {
      await request(`/dashboard/comments/${id}`, { method: 'DELETE', token });
      await loadDashboard();
    } catch (error) { setAdminError(error.message); }
  }

  const featured = contents.find((content) => content.featured) || contents[0];

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => { setSection('home'); setSelected(null); }}>
          <span className="brand-mark">C</span><span>creator<span className="brand-light">studio</span></span>
        </button>
        <nav aria-label="Main navigation">
          <button className={section === 'home' ? 'nav-link active' : 'nav-link'} onClick={() => { setSection('home'); setSelected(null); }}>Explore</button>
          <button className={section === 'dashboard' ? 'nav-link active' : 'nav-link'} onClick={openDashboard}>Creator dashboard</button>
        </nav>
        <button className="top-cta" onClick={openDashboard}>Creator login <span>↗</span></button>
      </header>

      {section === 'home' ? (
        <main>
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow"><span className="eyebrow-dot" /> A CREATOR'S WORLD, IN ONE PLACE</div>
              <h1>Good ideas deserve<br /><em>a bigger audience.</em></h1>
              <p>Explore the latest stories, videos, and conversations from {CREATOR_NAME}.</p>
              <a className="button button-primary" href="#library">Explore the library <span>↓</span></a>
              <div className="hero-meta"><span className="meta-line" /> New ideas added regularly</div>
            </div>
            <div className="hero-art">
              <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
              <div className="hero-card-back" />
              <div className="hero-feature-card">
                {featured?.thumbnailUrl ? <img src={featured.thumbnailUrl} alt="" /> : <div className="hero-image-fallback">{featured?.contentType === 'Podcast' ? '♫' : '✳'}</div>}
                <div className="feature-overlay"><span className="pill">FEATURED</span><h3>{featured?.title || 'A little inspiration for your next big idea'}</h3><span className="feature-arrow">↗</span></div>
              </div>
              <div className="floating-note"><span className="note-icon">✦</span><div><strong>Stay curious.</strong><small>There is always more to discover.</small></div></div>
              <div className="hero-counter"><strong>{contents.length.toString().padStart(2, '0')}</strong><span>STORIES<br />TO EXPLORE</span></div>
            </div>
          </section>

          <section className="creator-strip">
            <Avatar size="small" />
            <div><span className="overline">MEET YOUR CREATOR</span><strong>{CREATOR_NAME}</strong></div>
            <p>{CREATOR_BIO}</p>
            <span className="strip-star">✳</span>
          </section>

          <section id="library" className="library-section">
            <div className="section-head">
              <div><span className="overline">THE LATEST</span><h2>Explore the library<span className="green-dot">.</span></h2></div>
              <div className="result-count">{contents.length} {contents.length === 1 ? 'piece' : 'pieces'} of content <span>↘</span></div>
            </div>
            <div className="filters">
              <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search stories, topics, ideas..." /><kbd>⌘ K</kbd></label>
              <div className="category-tabs" aria-label="Filter by category">
                {['All', ...CATEGORIES].map((item) => <button key={item} className={category === item ? 'category-tab selected' : 'category-tab'} onClick={() => setCategory(item)}>{item}</button>)}
              </div>
            </div>
            <div className="content-grid">
              {contents.map((content, index) => <article key={content._id} className={`content-card card-tone-${index % 4}`} onClick={() => setSelected(content._id)} tabIndex="0" onKeyDown={(event) => event.key === 'Enter' && setSelected(content._id)}>
                <div className="card-visual">
                  {content.thumbnailUrl ? <img src={content.thumbnailUrl} alt="" /> : <div className="card-art"><span>{content.contentType === 'Podcast' ? '♫' : content.contentType === 'Article' ? '¶' : '✳'}</span><i /></div>}
                  <span className="type-tag">{content.contentType}</span><span className="card-arrow">↗</span>
                </div>
                <div className="card-body"><div className="card-meta"><span>{content.category}</span><span>{dateLabel(content.publishAt)}</span></div><h3>{content.title}</h3><p>{content.description}</p><div className="card-footer"><span>Read more</span><span className="arrow-line">⟶</span></div></div>
              </article>)}
              {!contents.length && <div className="empty-state"><span>✳</span><h3>No stories found</h3><p>Try a different search or category. New content will appear here when it is published.</p></div>}
            </div>
          </section>
          <footer className="footer"><span>© {new Date().getFullYear()} {CREATOR_NAME}</span><span>Made for curiosity <b>✳</b></span><button onClick={openDashboard}>Creator access ↗</button></footer>
        </main>
      ) : (
        <main className="dashboard-page">
          {!token ? <section className="login-layout"><div className="login-art"><span className="login-spark">✳</span><span className="overline">YOUR CREATIVE SPACE</span><h1>Make good<br />things happen.</h1><p>Manage your stories, understand your audience, and keep everything moving.</p></div><form className="login-card" onSubmit={submitLogin}><span className="overline">CREATOR ACCESS</span><h2>Welcome back</h2><p>Sign in to manage your content.</p>{loginError && <div className="error-message">{loginError}</div>}<label>Email address<input type="email" required autoComplete="username" value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} placeholder="you@example.com" /></label><label>Password<input type="password" required autoComplete="current-password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} placeholder="Enter your password" /></label><button className="button button-dark" type="submit">Sign in <span>→</span></button><small>Your dashboard is private and protected.</small></form></section> : (
            <section className="admin-wrap">
              <div className="admin-header"><div><span className="overline">YOUR WORKSPACE</span><h1>Creator dashboard<span className="green-dot">.</span></h1><p>Manage your content and keep your community close.</p></div><button className="button button-outline" onClick={signOut}>Sign out <span>↗</span></button></div>
              {adminError && <div className="error-message">{adminError}</div>}
              <div className="admin-tabs">{[['overview', 'Overview'], ['content', 'Content'], ['comments', 'Comments']].map(([key, label]) => <button key={key} className={adminTab === key ? 'admin-tab active' : 'admin-tab'} onClick={() => { setAdminTab(key); setEditing(null); }}>{label}{key === 'comments' && stats?.pendingComments > 0 && <i>{stats.pendingComments}</i>}</button>)}<button className="button button-primary add-button" onClick={() => { setEditing({}); setAdminTab('form'); }}>+ Add content</button></div>
              {adminTab === 'overview' && <>
                <div className="stat-grid">{[['Total content', stats?.totalContent ?? 0, 'All your work'], ['Published', stats?.published ?? 0, 'Live for viewers'], ['Drafts', stats?.drafts ?? 0, 'Ready when you are'], ['Scheduled', stats?.scheduled ?? 0, 'Set to go live'], ['Comments', stats?.comments ?? 0, 'Community conversation'], ['Total views', stats?.views ?? 0, 'Across published content']].map(([label, value, note]) => <div className="stat-card" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div>
                <div className="admin-panel"><div className="panel-heading"><div><span className="overline">RECENT WORK</span><h2>Your content</h2></div><button className="text-button" onClick={() => setAdminTab('content')}>View all ↗</button></div>{adminContents.slice(0, 5).map((content) => <ContentRow key={content._id} content={content} onEdit={() => { setEditing(content); setAdminTab('form'); }} onDelete={() => deleteContent(content._id)} />)}{!adminContents.length && <p className="panel-empty">Your first story starts here. Add content to get going.</p>}</div>
              </>}
              {adminTab === 'content' && <div className="admin-panel"><div className="panel-heading"><div><span className="overline">CONTENT LIBRARY</span><h2>All content</h2></div></div>{adminContents.map((content) => <ContentRow key={content._id} content={content} onEdit={() => { setEditing(content); setAdminTab('form'); }} onDelete={() => deleteContent(content._id)} />)}{!adminContents.length && <p className="panel-empty">No content yet. Add your first story.</p>}</div>}
              {adminTab === 'comments' && <div className="admin-panel"><div className="panel-heading"><div><span className="overline">COMMUNITY</span><h2>Comments</h2></div></div>{adminComments.map((comment) => <div className="comment-row" key={comment._id}><div className="comment-avatar">{comment.displayName.slice(0, 1).toUpperCase()}</div><div className="comment-main"><div className="comment-head"><strong>{comment.displayName}</strong><span className={`status status-${comment.status.toLowerCase()}`}>{comment.status}</span><time>{dateLabel(comment.createdAt)}</time></div><p>{comment.body}</p><small>On: {comment.content?.title || 'Deleted content'}</small></div><div className="comment-actions">{comment.status !== 'Approved' && <button onClick={() => moderateComment(comment._id, 'Approved')}>Approve</button>}{comment.status !== 'Hidden' && <button onClick={() => moderateComment(comment._id, 'Hidden')}>Hide</button>}<button className="danger-text" onClick={() => deleteComment(comment._id)}>Delete</button></div></div>)}{!adminComments.length && <p className="panel-empty">No comments to review yet.</p>}</div>}
              {adminTab === 'form' && <div className="admin-panel form-panel"><div className="panel-heading"><div><span className="overline">CONTENT EDITOR</span><h2>{editing?._id ? 'Edit content' : 'Create content'}</h2></div><button className="text-button" onClick={() => { setEditing(null); setAdminTab('content'); }}>Cancel</button></div><ContentForm key={editing?._id || 'new'} content={editing} onSubmit={saveContent} />{adminError && <div className="error-message">{adminError}</div>}</div>}
            </section>
          )}
        </main>
      )}

      {selected && detail && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><article className="detail-modal"><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close">×</button><div className="detail-visual">{detail.thumbnailUrl ? <img src={detail.thumbnailUrl} alt="" /> : <span>✳</span>}</div><div className="detail-content"><div className="card-meta"><span>{detail.category} · {detail.contentType}</span><span>{dateLabel(detail.publishAt)}</span></div><h2>{detail.title}</h2><p className="detail-description">{detail.description}</p>{detail.articleBody && <div className="article-body">{detail.articleBody.split('\n').map((line, index) => <p key={index}>{line}</p>)}</div>}{detail.mediaUrl && <a className="media-link" href={detail.mediaUrl} target="_blank" rel="noreferrer">Open {detail.contentType.toLowerCase()} ↗</a>}<div className="engagement"><button className={liked ? 'engage-button liked' : 'engage-button'} onClick={toggleLike}><span>{liked ? '♥' : '♡'}</span> {likeCount} likes</button><button className="engage-button" onClick={shareContent}>↗ Share</button><span>{detail.views || 0} views</span></div><div className="comments-section"><h3>Join the conversation <span>{comments.length}</span></h3>{comments.map((comment) => <div className="public-comment" key={comment._id}><div className="comment-avatar">{comment.displayName.slice(0, 1).toUpperCase()}</div><div><strong>{comment.displayName}</strong><p>{comment.body}</p></div></div>)}{!comments.length && <p className="muted">Be the first to join the conversation.</p>}<form className="public-comment-form" onSubmit={submitComment}><input required maxLength="40" placeholder="Your name" value={commentForm.displayName} onChange={(event) => setCommentForm({ ...commentForm, displayName: event.target.value })} /><textarea required minLength="5" maxLength="1000" placeholder="Write a thoughtful comment..." value={commentForm.body} onChange={(event) => setCommentForm({ ...commentForm, body: event.target.value })} /><button className="button button-dark" type="submit">Post comment <span>→</span></button></form></div></div></article></div>}
      {flash && <button className="toast" onClick={() => setFlash('')}>{flash}<span>×</span></button>}
    </div>
  );
}

function ContentRow({ content, onEdit, onDelete }) {
  return <div className="content-row"><div className="row-thumb">{content.thumbnailUrl ? <img src={content.thumbnailUrl} alt="" /> : <span>✳</span>}</div><div className="row-title"><strong>{content.title}</strong><small>{content.category} · {content.contentType} · {dateLabel(content.publishAt)}</small></div><span className={`status status-${content.status.toLowerCase()}`}>{content.status}</span><span className="row-views">{content.views || 0} views</span><div className="row-actions"><button onClick={onEdit}>Edit</button><button className="danger-text" onClick={onDelete}>Delete</button></div></div>;
}

function ContentForm({ content, onSubmit }) {
  const localDate = content?.publishAt ? (() => { const date = new Date(content.publishAt); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16); })() : '';
  return <form className="content-form" onSubmit={onSubmit}>
    <label className="wide">Title<input name="title" required maxLength="140" defaultValue={content?.title || ''} placeholder="Give your story a name" /></label>
    <label>Category<select name="category" defaultValue={content?.category || 'Education'}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label>Content type<select name="contentType" defaultValue={content?.contentType || 'Article'}>{TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="wide">Short description<textarea name="description" required maxLength="500" defaultValue={content?.description || ''} placeholder="What should viewers know about this?" /></label>
    <label>Thumbnail image URL<input name="thumbnailUrl" type="url" defaultValue={content?.thumbnailUrl || ''} placeholder="https://..." /></label>
    <label>Media URL<input name="mediaUrl" type="url" defaultValue={content?.mediaUrl || ''} placeholder="Video, audio, or external article URL" /></label>
    <label className="wide">Article text <span className="optional">(optional)</span><textarea name="articleBody" className="article-input" defaultValue={content?.articleBody || ''} placeholder="Paste article content here, if applicable." /></label>
    <label>Status<select name="status" defaultValue={content?.status || 'Draft'}><option>Draft</option><option>Published</option><option>Scheduled</option></select></label>
    <label>Publication date<input name="publishAt" type="datetime-local" defaultValue={localDate} /></label>
    <label className="check-label wide"><input name="featured" type="checkbox" defaultChecked={content?.featured || false} /> Feature this on the viewer portal</label>
    <div className="form-actions wide"><button className="button button-dark" type="submit">Save content <span>→</span></button><button type="button" className="button button-plain" onClick={(event) => event.currentTarget.form.reset()}>Reset form</button></div>
  </form>;
}

export default App;
