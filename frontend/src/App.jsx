import { useEffect, useMemo, useState } from 'react';

const API = (process.env.REACT_APP_API_BASE_URL || '').replace(/\/$/, '');
const CREATOR_NAME = process.env.REACT_APP_CREATOR_NAME || 'The Creator Studio';
const CREATOR_BIO = process.env.REACT_APP_CREATOR_BIO || 'A home for useful ideas, fresh perspectives, and stories worth sharing.';
const CREATOR_AVATAR = process.env.REACT_APP_CREATOR_AVATAR_URL || '';
const CATEGORIES = ['News', 'Education', 'Technology', 'Entertainment', 'Lifestyle', 'Other'];
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

function readingTime(content) {
  const words = `${content?.title || ''} ${content?.description || ''} ${content?.articleBody || ''}`.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

function Avatar({ size = 'large', name = CREATOR_NAME, imageUrl = CREATOR_AVATAR }) {
  return imageUrl
    ? <img className={`avatar avatar-${size}`} src={imageUrl} alt={`${name} profile`} />
    : <div className={`avatar avatar-${size} avatar-fallback`} aria-label={`${name} profile`}>{name.slice(0, 1).toUpperCase()}</div>;
}

function ContentCard({ content, index, showCreator = false, onSelect, onOpenCreator }) {
  const creatorName = content.creator?.displayName || 'Creator';
  return <article className={`story-row card-tone-${index % 4}`}>
    <div className="story-copy">
      {showCreator && content.creator && <button type="button" className="story-author" onClick={() => onOpenCreator(content.creator._id)} aria-label={`Open ${creatorName}'s profile`}><Avatar size="byline" name={creatorName} imageUrl={content.creator.avatarUrl} /><span>{creatorName}</span></button>}
      <button type="button" className="story-title" onClick={() => onSelect(content._id)}>{content.title}</button>
      <p className="story-description">{content.description}</p>
      <div className="story-meta"><span>{content.category}</span><i>·</i><span>{dateLabel(content.publishAt)}</span><i>·</i><span>{readingTime(content)} min read</span></div>
    </div>
    <button type="button" className="story-thumbnail" aria-label={`Read ${content.title}`} onClick={() => onSelect(content._id)}>
      {content.thumbnailUrl ? <img src={content.thumbnailUrl} alt="" /> : <span>{content.contentType === 'Podcast' ? '♫' : content.contentType === 'Article' ? '¶' : '✳'}</span>}
    </button>
  </article>;
}

function App() {
  const [section, setSection] = useState('home');
  const [creators, setCreators] = useState([]);
  const [creatorId, setCreatorId] = useState(() => new URLSearchParams(window.location.search).get('creator') || '');
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
  const [sessionCreator, setSessionCreator] = useState(() => {
    try { return JSON.parse(localStorage.getItem('creator-studio-creator') || 'null'); }
    catch { return null; }
  });
  const [login, setLogin] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [stats, setStats] = useState(null);
  const [adminContents, setAdminContents] = useState([]);
  const [adminComments, setAdminComments] = useState([]);
  const [adminTab, setAdminTab] = useState('overview');
  const [editing, setEditing] = useState(null);
  const [adminError, setAdminError] = useState('');
  const viewerKey = useMemo(getViewerKey, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialContent = params.get('content');
    if (initialContent) setSelected(initialContent);
  }, []);

  useEffect(() => {
    function syncLocation() {
      const params = new URLSearchParams(window.location.search);
      setCreatorId(params.get('creator') || '');
      setSelected(params.get('content'));
      setSection('home');
    }
    window.addEventListener('popstate', syncLocation);
    return () => window.removeEventListener('popstate', syncLocation);
  }, []);

  useEffect(() => {
    let active = true;
    request('/creators').then((data) => {
      if (active) setCreators(data.creators || []);
    }).catch((error) => { if (active) setFlash(error.message); });
    return () => { active = false; };
  }, []);

  async function loadContents() {
    try {
      const params = new URLSearchParams();
      if (creatorId) params.set('creatorId', creatorId);
      if (search.trim()) params.set('search', search.trim());
      if (category !== 'All') params.set('category', category);
      const query = params.toString();
      const route = creatorId ? '/contents' : '/feed';
      const data = await request(`${route}${query ? `?${query}` : ''}`);
      setContents(data.contents || []);
    } catch (error) { setFlash(error.message); }
  }

  useEffect(() => { loadContents(); }, [search, category, creatorId]);
  useEffect(() => {
    if (section === 'dashboard' && token) loadDashboard();
  }, [section, token]);
  useEffect(() => {
    if (!selected) { setDetail(null); setComments([]); return; }
    let active = true;
    request(`/contents/${selected}?creatorId=${encodeURIComponent(creatorId)}&viewerKey=${encodeURIComponent(viewerKey)}`).then(async (data) => {
      if (!active) return;
      setDetail(data.content);
      setLikeCount(data.likeCount || 0);
      setLiked(data.liked || false);
      const commentData = await request(`/comments/${selected}`);
      if (active) setComments(commentData.comments || []);
    }).catch((error) => { if (active) setFlash(error.message); });
    return () => { active = false; };
  }, [selected, creatorId, viewerKey]);

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

  function openStory(id) {
    setSelected(id);
    const params = new URLSearchParams();
    if (creatorId) params.set('creator', creatorId);
    params.set('content', id);
    window.history.pushState({}, '', `/?${params.toString()}`);
  }

  function closeStory() {
    setSelected(null);
    window.history.pushState({}, '', creatorId ? `/?creator=${encodeURIComponent(creatorId)}` : '/');
  }

  function openFeed() {
    setSection('home');
    setCreatorId('');
    setSelected(null);
    setSearch('');
    setCategory('All');
    window.history.pushState({}, '', '/');
  }

  function openCreator(id) {
    setSection('home');
    setCreatorId(id);
    setSelected(null);
    setSearch('');
    setCategory('All');
    window.history.pushState({}, '', `/?creator=${encodeURIComponent(id)}`);
  }

  async function submitLogin(event) {
    event.preventDefault();
    setLoginError('');
    try {
      const data = await request('/auth/login', { method: 'POST', body: JSON.stringify(login) });
      localStorage.setItem('creator-studio-token', data.token);
      localStorage.setItem('creator-studio-creator', JSON.stringify(data.creator));
      setSessionCreator(data.creator);
      setToken(data.token);
      setLogin({ email: '', password: '' });
    } catch (error) { setLoginError(error.message); }
  }

  async function submitRegistration(event) {
    event.preventDefault();
    setLoginError('');
    try {
      const data = await request('/auth/register', { method: 'POST', body: JSON.stringify(login) });
      localStorage.setItem('creator-studio-token', data.token);
      localStorage.setItem('creator-studio-creator', JSON.stringify(data.creator));
      setSessionCreator(data.creator);
      setToken(data.token);
      setLogin({ email: '', password: '', displayName: '' });
      setFlash('Your writer workspace is ready.');
    } catch (error) { setLoginError(error.message); }
  }

  function signOut() {
    localStorage.removeItem('creator-studio-token');
    localStorage.removeItem('creator-studio-creator');
    setSessionCreator(null);
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
    const sharedCreatorId = creatorId || detail?.creator?._id || detail?.creator;
    const creatorQuery = sharedCreatorId ? `creator=${encodeURIComponent(sharedCreatorId)}&` : '';
    const url = `${window.location.origin}/?${creatorQuery}content=${selected}`;
    try {
      if (navigator.share) await navigator.share({ title: detail?.title || creatorName, url });
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

  const creatorProfile = creators.find((creator) => creator._id === creatorId) || null;
  const creatorName = creatorProfile?.displayName || CREATOR_NAME;
  const creatorBio = creatorProfile?.bio || (creatorProfile ? `Explore the latest content from ${creatorName}.` : CREATOR_BIO);
  const creatorAvatar = creatorProfile?.avatarUrl || CREATOR_AVATAR;
  const detailCreatorId = detail?.creator?._id || detail?.creator || creatorId;
  const detailCreator = creators.find((creator) => creator._id === detailCreatorId) || null;
  const detailCreatorName = detailCreator?.displayName || (creatorId ? creatorName : 'OpenPage writer');

  return (
    <div className="app-shell">
      {section !== 'dashboard' && <header className="topbar">
        <button className="brand" onClick={openFeed}>
          <span className="brand-word">OpenPage</span>
        </button>
        <nav aria-label="Main navigation">
          <button className={!creatorId && section === 'home' ? 'nav-link active' : 'nav-link'} onClick={openFeed}>Explore</button>
          {creatorId && <button className={section === 'home' ? 'nav-link active' : 'nav-link'} onClick={() => { setSection('home'); closeStory(); }}>{creatorName}</button>}
        </nav>
        <button className="top-cta" onClick={openDashboard}>{token ? 'Write' : 'Start writing'}</button>
      </header>}

      {section === 'home' ? (creatorId ? (
        <main className="writer-page">
          <section className="writer-profile">
            <Avatar size="writer" name={creatorName} imageUrl={creatorAvatar} />
            <div className="writer-profile-copy"><span className="overline">WRITER PROFILE</span><h1>{creatorName}</h1><p>{creatorBio}</p><div className="writer-stats">{contents.length} {contents.length === 1 ? 'story' : 'stories'} <span>·</span> Free to read</div></div>
            <button className="button button-dark" onClick={openFeed}>Explore stories <span>↗</span></button>
          </section>
          <section id="library" className="writer-stories">
            <div className="section-head"><div><span className="overline">PUBLISHED WRITING</span><h2>Stories by {creatorName}</h2></div><div className="result-count">{contents.length} {contents.length === 1 ? 'story' : 'stories'}</div></div>
            <div className="filters">
              <label className="search-box"><span aria-hidden="true">⌕</span><input type="search" aria-label={`Search ${creatorName}'s stories`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search these stories..." /></label>
              <div className="category-tabs" aria-label="Filter by category">
                {['All', ...CATEGORIES].map((item) => <button key={item} className={category === item ? 'category-tab selected' : 'category-tab'} onClick={() => setCategory(item)}>{item}</button>)}
              </div>
            </div>
            <div className="story-list">
              {contents.map((content, index) => <ContentCard key={content._id} content={content} index={index} onSelect={openStory} />)}
              {!contents.length && <div className="empty-state"><span>✳</span><h3>No stories found</h3><p>Try another search, or check back when {creatorName} publishes again.</p></div>}
            </div>
          </section>
          <footer className="footer"><span>© {new Date().getFullYear()} OpenPage</span><span>Every story is free to read</span><button onClick={openFeed}>Explore all stories ↗</button></footer>
        </main>
      ) : (
        <main className="feed-page">
          <section className="feed-hero">
            <div><span className="overline">A PLACE FOR GOOD IDEAS</span><h1>Read freely.<br /><em>Think deeply.</em></h1><p>Stories and ideas from independent writers. Always free to read.</p></div>
            <div className="feed-hero-note"><span>OPEN TO EVERYONE</span><strong>No paywalls.<br />Just good writing.</strong><button onClick={openDashboard}>Start writing <span>↗</span></button></div>
          </section>
          <div className="feed-layout">
            <section className="feed-section" aria-labelledby="feed-heading">
              <div className="section-head"><div><span className="overline">LATEST FROM THE COMMUNITY</span><h2 id="feed-heading">Stories for you</h2></div><div className="result-count">{contents.length} {contents.length === 1 ? 'story' : 'stories'}</div></div>
              <div className="feed-categories" aria-label="Filter by topic">
                {['All', ...CATEGORIES].map((item) => <button key={item} className={category === item ? 'category-tab selected' : 'category-tab'} onClick={() => setCategory(item)}>{item === 'All' ? 'For you' : item}</button>)}
              </div>
              <label className="search-box feed-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search stories" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search stories" /></label>
              <div className="story-list">
                {contents.map((content, index) => <ContentCard key={content._id} content={content} index={index} showCreator onSelect={openStory} onOpenCreator={openCreator} />)}
                {!contents.length && <div className="empty-state"><span>✳</span><h3>No stories yet</h3><p>Published writing will appear here. Every story is free to read.</p></div>}
              </div>
            </section>
            <aside className="feed-aside">
              <section className="aside-block"><span className="overline">WRITERS TO EXPLORE</span><h2>Meet the people<br />behind the stories.</h2>
                {creators.map((creator) => <button type="button" className="writer-link" key={creator._id} onClick={() => openCreator(creator._id)}><Avatar size="byline" name={creator.displayName} imageUrl={creator.avatarUrl} /><span><strong>{creator.displayName}</strong><small>{creator.bio || 'Independent writer'}</small></span><b>↗</b></button>)}
                {!creators.length && <p className="aside-empty">Writer profiles will appear here.</p>}
              </section>
              <section className="aside-note"><span className="overline">OPENPAGE IS FREE</span><p>Read every published story. Create an account only when you’re ready to write.</p><button onClick={openDashboard}>Write your first story ↗</button></section>
            </aside>
          </div>
          <footer className="footer"><span>© {new Date().getFullYear()} OpenPage</span><span>Read freely. Write freely.</span><button onClick={openDashboard}>Start writing ↗</button></footer>
        </main>
      )) : (
        <main className={token ? 'dashboard-page dashboard-page-private' : 'dashboard-page'}>
          {!token ? <main className="login-page">
            <header className="login-topbar">
              <button className="login-brand" onClick={openFeed}><span className="login-brand-mark">O</span><span>OpenPage</span></button>
              <span className="login-topbar-label">WRITER EDITION</span>
              <button className="login-return" onClick={openFeed}>← Back to reading</button>
            </header>
            <section className="login-frame">
              <div className="login-editorial">
                <span className="login-edition">OPENPAGE / WRITER ACCESS</span>
                <div className="login-manifesto">
                  <span className="login-manifesto-label">A HOME FOR YOUR IDEAS</span>
                  <h1>Make room<br />for your next<br /><em>good idea.</em></h1>
                  <p>Write, publish, and share your stories with readers who are ready to listen.</p>
                </div>
                <div className="login-note"><span>01 — YOUR WORKSPACE</span><strong>Your words have somewhere to go.</strong></div>
                <span className="login-watermark" aria-hidden="true">O</span>
              </div>
              <form className="login-card login-panel" onSubmit={authMode === 'login' ? submitLogin : submitRegistration}>
                <span className="login-form-kicker">{authMode === 'login' ? 'WRITER SIGN IN' : 'JOIN OPENPAGE'}</span>
                <h2>{authMode === 'login' ? 'Welcome back.' : 'Start writing.'}</h2>
                <p>{authMode === 'login' ? 'Sign in to pick up where you left off.' : 'Create your free writer account and publish your first story.'}</p>
                {loginError && <div className="error-message">{loginError}</div>}
                {authMode === 'register' && <label>Your name<input type="text" required minLength="2" maxLength="80" autoComplete="name" value={login.displayName || ''} onChange={(event) => setLogin({ ...login, displayName: event.target.value })} placeholder="How readers will know you" /></label>}
                <label>Email address<input type="email" required autoComplete="username" value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} placeholder="you@example.com" /></label>
                <label>Password<input type="password" required minLength={authMode === 'register' ? 8 : undefined} maxLength={authMode === 'register' ? 72 : undefined} autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} placeholder={authMode === 'register' ? 'At least 8 characters' : 'Enter your password'} /></label>
                <button className="button button-dark" type="submit">{authMode === 'login' ? 'Continue to your stories' : 'Create writer account'} <span>→</span></button>
                <small>{authMode === 'login' ? 'Your writing space is private to your account.' : 'Free to join. Your workspace is private to you.'}</small>
                <div className="login-mode-switch">{authMode === 'login' ? 'New to OpenPage?' : 'Already have an account?'} <button type="button" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setLoginError(''); }}>{authMode === 'login' ? 'Create a writer account' : 'Sign in'}</button></div>
              </form>
            </section>
            <footer className="login-footer"><span>OpenPage</span><span>Read freely. Write freely.</span><span>© {new Date().getFullYear()}</span></footer>
          </main> : (
            <section className="admin-wrap">
              <div className="admin-header"><div><span className="overline">YOUR WORKSPACE</span><h1>{sessionCreator?.displayName ? `${sessionCreator.displayName}’s dashboard` : 'Creator dashboard'}<span className="green-dot">.</span></h1><p>Manage your content and keep your community close.</p></div><button className="button button-outline" onClick={signOut}>Sign out <span>↗</span></button></div>
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

      {selected && <div className="reader-screen">
        <div className="reader-topbar"><button type="button" className="reader-back" onClick={closeStory}>← Back to stories</button><span className="reader-wordmark">OpenPage</span><button type="button" className="reader-share" onClick={shareContent}>Share</button></div>
        {!detail ? <div className="reader-loading">Opening story…</div> : <article className="reader-article" aria-labelledby="content-detail-title">
          <button type="button" className="reader-author" onClick={() => detailCreatorId && openCreator(detailCreatorId)}><Avatar size="byline" name={detailCreatorName} imageUrl={detailCreator?.avatarUrl || ''} /><span><strong>{detailCreatorName}</strong><small>{dateLabel(detail.publishAt)} · {readingTime(detail)} min read · Free to read</small></span></button>
          <header className="reader-heading"><div className="reader-kicker">{detail.category} <span>·</span> {detail.contentType} <span>·</span> Free to read</div><h1 id="content-detail-title">{detail.title}</h1><p>{detail.description}</p></header>
          <div className="reader-actions"><button className={liked ? 'engage-button liked' : 'engage-button'} onClick={toggleLike}><span>{liked ? '♥' : '♡'}</span>{likeCount}</button><button className="engage-button" onClick={shareContent}>↗ Share</button><span>{detail.views || 0} reads</span></div>
          {detail.thumbnailUrl && <figure className="reader-cover"><img src={detail.thumbnailUrl} alt="" /><figcaption>{detail.title}</figcaption></figure>}
          <div className="article-body">{detail.articleBody ? detail.articleBody.split(/\n+/).filter((line) => line.trim()).map((line, index) => <p key={index}>{line}</p>) : <p>{detail.description}</p>}</div>
          {detail.mediaUrl && <a className="media-link" href={detail.mediaUrl} target="_blank" rel="noreferrer">Open {detail.contentType.toLowerCase()} ↗</a>}
          {detailCreatorId && <button type="button" className="more-from-writer" onClick={() => openCreator(detailCreatorId)}>More stories by {detailCreatorName} ↗</button>}
          <section className="comments-section"><h2>Conversation <span>{comments.length}</span></h2>{comments.map((comment) => <div className="public-comment" key={comment._id}><div className="comment-avatar">{comment.displayName.slice(0, 1).toUpperCase()}</div><div><strong>{comment.displayName}</strong><p>{comment.body}</p></div></div>)}{!comments.length && <p className="muted">Be the first to respond.</p>}<form className="public-comment-form" onSubmit={submitComment}><input required maxLength="40" placeholder="Your name" value={commentForm.displayName} onChange={(event) => setCommentForm({ ...commentForm, displayName: event.target.value })} /><textarea required minLength="5" maxLength="1000" placeholder="Add to the conversation..." value={commentForm.body} onChange={(event) => setCommentForm({ ...commentForm, body: event.target.value })} /><button className="button button-dark" type="submit">Respond</button></form></section>
        </article>}
      </div>}
      {flash && <button className="toast" onClick={() => setFlash('')}>{flash}<span>×</span></button>}
    </div>
  );
}

function ContentRow({ content, onEdit, onDelete }) {
  return <div className="content-row"><div className="row-thumb">{content.thumbnailUrl ? <img src={content.thumbnailUrl} alt="" /> : <span>✳</span>}</div><div className="row-title"><strong>{content.title}</strong><small>{content.category} · {content.contentType} · {dateLabel(content.publishAt)}</small></div><span className={`status status-${content.status.toLowerCase()}`}>{content.status}</span><span className="row-views">{content.views || 0} views</span><div className="row-actions"><button onClick={onEdit}>Edit</button><button className="danger-text" onClick={onDelete}>Delete</button></div></div>;
}

function ContentForm({ content, onSubmit }) {
  const [thumbnailPreview, setThumbnailPreview] = useState(content?.thumbnailUrl || '');
  const [thumbnailPreviewFailed, setThumbnailPreviewFailed] = useState(false);
  const localDate = content?.publishAt ? (() => { const date = new Date(content.publishAt); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16); })() : '';
  return <form className="content-form" onSubmit={onSubmit}>
    <label className="wide">Title<input name="title" required maxLength="140" defaultValue={content?.title || ''} placeholder="Give your story a name" /></label>
    <label>Category<select name="category" defaultValue={content?.category || 'Education'}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label>Content type<select name="contentType" defaultValue={content?.contentType || 'Article'}>{TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="wide">Short description<textarea name="description" required maxLength="500" defaultValue={content?.description || ''} placeholder="What should viewers know about this?" /></label>
    <label>Thumbnail image URL<input name="thumbnailUrl" type="text" maxLength="500" defaultValue={content?.thumbnailUrl || ''} placeholder="https://... or /thumbnails/..." onChange={(event) => { setThumbnailPreview(event.target.value.trim()); setThumbnailPreviewFailed(false); }} /></label>
    <div className="thumbnail-preview" aria-label="Thumbnail preview">
      {thumbnailPreview && !thumbnailPreviewFailed ? <img src={thumbnailPreview} alt="Thumbnail preview" onError={() => setThumbnailPreviewFailed(true)} /> : <div><span>✳</span><small>{thumbnailPreviewFailed ? 'Preview unavailable' : 'Thumbnail preview'}</small></div>}
    </div>
    <label>Media URL<input name="mediaUrl" type="url" defaultValue={content?.mediaUrl || ''} placeholder="Video, audio, or external article URL" /></label>
    <label className="wide">Article text <span className="optional">(optional)</span><textarea name="articleBody" className="article-input" defaultValue={content?.articleBody || ''} placeholder="Paste article content here, if applicable." /></label>
    <label>Status<select name="status" defaultValue={content?.status || 'Draft'}><option>Draft</option><option>Published</option><option>Scheduled</option></select></label>
    <label>Publication date<input name="publishAt" type="datetime-local" defaultValue={localDate} /></label>
    <label className="check-label wide"><input name="featured" type="checkbox" defaultChecked={content?.featured || false} /> Feature this on the viewer portal</label>
    <div className="form-actions wide"><button className="button button-dark" type="submit">Save content <span>→</span></button><button type="button" className="button button-plain" onClick={(event) => { event.currentTarget.form.reset(); setThumbnailPreview(content?.thumbnailUrl || ''); setThumbnailPreviewFailed(false); }}>Reset form</button></div>
  </form>;
}

export default App;
