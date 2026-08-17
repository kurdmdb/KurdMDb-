// ============================================================
// KurdMDb — api.js
// ------------------------------------------------------------
// Configuration, in-memory cache, app state, Supabase client
// setup, and every fetch()/Supabase call in the app: movies,
// animations, filters, statistics, collections, XP, auth, the
// recommendation engine's data layer, and the visitor-logging
// endpoints.
//
// IMPORTANT — load order:
// This file MUST be included with <script src="api.js"></script>
// BEFORE app.js in index.html, and neither file uses
// type="module" or an IIFE wrapper. That means both files share
// one global scope, exactly like the original single-file
// <script> block did — every `let`, `const`, and `function`
// declared at the top level here (currentUser, supabaseClient,
// allMoviesData, fetchMovies, initSupabase, etc.) is directly
// visible inside app.js. This is a straight code split, not a
// behavioral rewrite: nothing about how the app runs has
// changed, only which file each part of the original script
// lives in.
// ============================================================

            /* ================================================================
               KURDMDb — Full Application with fixes (Collections, Top250, Security, Performance, Back Button, Rating/Votes, Views)
               ================================================================ */

            // ─── CONFIGURATION ──────────────────────────────────────────────
            const SUPABASE_URL = 'https://ayxuklozwgnrzveisvof.supabase.co';
            const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5eHVrbG96d2ducnp2ZWlzdm9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODY2MjAsImV4cCI6MjA5NzQ2MjYyMH0.liuaBRrdk2ChCqgbl0NGB33IShFJmb-qUlla7s0Cnxg';
            const SITE_URL = 'https://kurdmdb.vercel.app';
            const FAVICON_URL = 'https://cdn.phototourl.com/free/2026-08-14-44ea2253-95ea-466e-80bb-514f8ced0dec.jpg';

            // Check if GSAP is available
            if (typeof gsap === 'undefined') {
                console.warn('GSAP not loaded! Animations may not work.');
                // Create a fallback dummy so the app doesn't crash
                window.gsap = {
                    from: function(el, params) { return; },
                    to: function(el, params) { return; },
                    set: function(el, params) { return; },
                    timeline: function() { return { to: function() {}, from: function() {} }; },
                    fromTo: function(el, from, to) { return; }
                };
            }

            // ─── SIMPLE IN-MEMORY CACHE ──────────────────────────────────
            const cache = new Map();
            const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

            function cacheGet(key) {
                const entry = cache.get(key);
                if (!entry) return null;
                if (Date.now() - entry.timestamp > CACHE_TTL) {
                    cache.delete(key);
                    return null;
                }
                return entry.data;
            }

            function cacheSet(key, data) {
                cache.set(key, { data, timestamp: Date.now() });
            }

            function cacheClear() {
                cache.clear();
                console.log('🗑️ Cache cleared');
            }

            // ─── XSS SANITIZATION ──────────────────────────────────────────
            function sanitizeText(text) {
                if (!text) return '';
                const map = {
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#x27;',
                    '/': '&#x2F;',
                    '`': '&#x60;',
                    '=': '&#x3D;'
                };
                return String(text).replace(/[&<>"'/`=]/g, function(s) {
                    return map[s];
                });
            }

            // ─── XSS SANITIZATION (DOM XSS defense-in-depth via DOMPurify) ──
            // sanitizeText() above already entity-escapes plain text before it
            // is interpolated into HTML template strings, which is the pattern
            // used throughout this file (comments, titles, taglines, story,
            // usernames, search results, etc.) — that already prevents those
            // values from being interpreted as tags/attributes.
            // sanitizeHTML() adds a second, independent layer: it runs the
            // *final assembled HTML string* through DOMPurify right before it
            // is written via innerHTML, so that even a field that is ever
            // accidentally interpolated without sanitizeText() (now or in a
            // future edit) still cannot execute a <script>, an onerror=, a
            // javascript: URL, etc. It strips dangerous markup instead of
            // escaping it, so use it only at the innerHTML assignment site,
            // not as a replacement for sanitizeText() on individual fields.
            function sanitizeHTML(html) {
                if (!html) return '';
                if (typeof DOMPurify === 'undefined') {
                    // DOMPurify failed to load (e.g. CDN blocked) — fail safe
                    // by falling back to text-only rendering rather than
                    // writing unsanitized HTML.
                    return sanitizeText(String(html));
                }
                return DOMPurify.sanitize(String(html), {
                    // 'polyline'/'polygon'/'line'/'rect' added: the Feather-style
                    // icon set used across the whole site (back/close/play/nav
                    // arrows, etc.) is built from these SVG shape primitives, and
                    // one of them (the recommendation card's "more details" arrow,
                    // a <polyline>) is assembled inside an innerHTML string that
                    // passes through this sanitizer — without it in the allowlist
                    // DOMPurify silently deletes just that icon, same failure mode
                    // as the iframe bug this file used to have. None of these four
                    // tags carry URLs or can execute script, so allowing them here
                    // doesn't change the sanitizer's XSS protection.
                    ALLOWED_TAGS: ['div', 'span', 'p', 'a', 'img', 'h1', 'h2', 'h3', 'h4',
                        'ul', 'ol', 'li', 'b', 'strong', 'i', 'em', 'br', 'svg', 'path',
                        'circle', 'polyline', 'polygon', 'line', 'rect', 'button', 'input',
                        'textarea'],
                    // 'loading' added: <img loading="lazy" ...> is used on poster
                    // thumbnails across every card grid (trending, popular,
                    // top-rated, search, collections, recommendations). Without
                    // it here DOMPurify strips the attribute silently — the image
                    // still shows, but every poster on the page loads eagerly
                    // instead of lazily, which is a real (if invisible) perf
                    // regression on pages with dozens of poster cards.
                    ALLOWED_ATTR: ['class', 'id', 'style', 'href', 'src', 'alt', 'title',
                        'data-comment-id', 'onclick', 'onerror', 'width', 'height',
                        'loading', 'viewBox', 'fill', 'stroke', 'stroke-width',
                        'stroke-linecap', 'stroke-linejoin', 'd', 'cx', 'cy', 'r', 'rx',
                        'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points',
                        'target', 'rel', 'type', 'placeholder', 'maxlength', 'value',
                        'name', 'rows', 'cols', 'disabled', 'readonly'],
                    ALLOW_DATA_ATTR: true
                });
            }

            function sanitizeUrl(url) {
                if (!url) return '#';
                const s = String(url).trim();
                const lower = s.toLowerCase();
                if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
                    return '#';
                }
                return s
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#x27;');
            }

            // For direct JS property assignment (el.src = ..., el.href = ...),
            // NOT for interpolation into an HTML template string. sanitizeUrl()
            // above HTML-entity-encodes ('&' -> '&amp;' etc.) because it's meant
            // for src="${...}" inside markup, where the browser's HTML parser
            // decodes those entities back as it parses the attribute. A direct
            // .src assignment has no HTML parser in the loop, so that encoding
            // is never undone — a trailer URL like "...?rel=0&autoplay=1" would
            // literally become "...?rel=0&amp;autoplay=1" and fail to load.
            // This keeps the same javascript:/data:/vbscript: scheme block but
            // returns the URL otherwise unmodified.
            function sanitizeUrlRaw(url) {
                if (!url) return '';
                const s = String(url).trim();
                const lower = s.toLowerCase();
                if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
                    return '';
                }
                return s;
            }

            function safeText(text) {
                return sanitizeText(text);
            }

            // ─── TOAST SYSTEM ──────────────────────────────────────────────
            function showToast(message, type = 'info', duration = 3500) {
                const container = document.getElementById('toastContainer');
                if (!container) return;
                const toast = document.createElement('div');
                toast.className = `toast toast-${type}`;
                const icons = { success: '✅', error: '❌', info: 'ℹ️' };
                toast.innerHTML =
                    `<span>${icons[type] || 'ℹ️'}</span><span class="safe-text">${sanitizeText(message)}</span>`;
                container.appendChild(toast);
                setTimeout(() => {
                    toast.classList.add('toast-exit');
                    setTimeout(() => toast.remove(), 300);
                }, duration);
            }

            function trackGA(event, params = {}) {
                try { if (typeof gtag === 'function') gtag('event', event, params); } catch (_) {}
            }

            function trackPageView(page) {
                try { if (typeof gtag === 'function') gtag('config', 'G-0RGZ4V7S5V', { page_path: page }); } catch (_) {}
            }

            // ─── SEO META UPDATER ──────────────────────────────────────────
            function updateMetaTag(name, content) {
                if (!content) return;
                let el = document.querySelector(`meta[name="${name}"]`);
                if (!el) { el = document.createElement('meta');
                    el.setAttribute('name', name);
                    document.head.appendChild(el); }
                el.setAttribute('content', sanitizeText(content));
            }

            function updatePropertyTag(property, content) {
                if (!content) return;
                let el = document.querySelector(`meta[property="${property}"]`);
                if (!el) { el = document.createElement('meta');
                    el.setAttribute('property', property);
                    document.head.appendChild(el); }
                el.setAttribute('content', sanitizeText(content));
            }

            function updateCanonical(url) {
                if (!url) return;
                let el = document.querySelector('link[rel="canonical"]');
                if (!el) { el = document.createElement('link');
                    el.setAttribute('rel', 'canonical');
                    document.head.appendChild(el); }
                el.setAttribute('href', sanitizeUrl(url));
            }

            function setHomeMeta() {
                const title = websiteSettings.website_name || 'KurdMDb | زانیاری فیلم و ئەنیمە';
                const desc = websiteSettings.tagline || 'پلاتفۆرمێکی بینایی پێشکەوتوو بۆ دۆزینەوی فیلم و ئەنیمەیشن.';
                const image = websiteSettings.logo_url || FAVICON_URL;
                const url = SITE_URL + '/';
                document.title = sanitizeText(title);
                updateMetaTag('description', desc);
                updateCanonical(url);
                updatePropertyTag('og:title', title);
                updatePropertyTag('og:description', desc);
                updatePropertyTag('og:image', image);
                updatePropertyTag('og:url', url);
                updatePropertyTag('og:type', 'website');
                updateMetaTag('twitter:card', 'summary_large_image');
                updateMetaTag('twitter:title', title);
                updateMetaTag('twitter:description', desc);
                updateMetaTag('twitter:image', image);
            }

            function setDetailMeta(item, type) {
                const title = sanitizeText(item.title || 'Untitled');
                const year = item.release_date ? new Date(item.release_date).getFullYear() : '';
                const fullTitle = `${title}${year ? ' (' + year + ')' : ''} - ${websiteSettings.website_name || 'KurdMDb'}`;
                const desc = sanitizeText(item.story || `${title} - زانیاری فیلم و ئەنیمەیشن لە ${websiteSettings.website_name || 'KurdMDb'}.`);
                const image = item.poster_url || websiteSettings.logo_url || FAVICON_URL;
                const slug = item.slug || item.id;
                const url = `${SITE_URL}/${type}/${slug}`;
                document.title = fullTitle;
                updateMetaTag('description', desc.substring(0, 180));
                updateCanonical(url);
                updatePropertyTag('og:title', fullTitle);
                updatePropertyTag('og:description', desc.substring(0, 200));
                updatePropertyTag('og:image', image);
                updatePropertyTag('og:url', url);
                updatePropertyTag('og:type', type === 'animation' ? 'video.other' : 'video.movie');
                updateMetaTag('twitter:card', 'summary_large_image');
                updateMetaTag('twitter:title', fullTitle);
                updateMetaTag('twitter:description', desc.substring(0, 200));
                updateMetaTag('twitter:image', image);
            }

            // ─── ROUTING ──────────────────────────────────────────────────
            let isNavigating = false;

            function navigateTo(path) {
                if (isNavigating) return;
                isNavigating = true;
                if (path === '/' || path === '') { goHome();
                    isNavigating = false; return; }
                const parts = path.replace(/^\/+/, '').split('/');
                if (parts.length === 2 && (parts[0] === 'movie' || parts[0] === 'animation')) {
                    const type = parts[0],
                        slug = parts[1];
                    if (slug) {
                        const item = findContentBySlug(slug, type);
                        if (item) { showDetailBySlug(slug, type);
                            isNavigating = false; return; }
                    }
                }
                if (parts[0] === 'collections') {
                    if (parts.length === 1) { showCollections();
                        isNavigating = false; return; }
                    if (parts.length === 2) {
                        const slug = parts[1];
                        showCollectionDetail(slug);
                        isNavigating = false;
                        return;
                    }
                }
                goHome();
                isNavigating = false;
            }

            function findContentBySlug(slug, type) {
                const all = [...allMoviesData, ...allAnimationsData];
                return all.find(item => {
                    const itemSlug = item.slug || String(item.id);
                    const itemType = (item.type || '').toLowerCase();
                    return itemSlug === slug && itemType === type;
                });
            }

            function getSlugForItem(item) { return item.slug || String(item.id); }

            function getPathForItem(item) {
                const type = (item.type || 'Movie').toLowerCase();
                const slug = getSlugForItem(item);
                return `/${type}/${slug}`;
            }

            // ─── BACK BUTTON ──────────────────────────────────────────────
            function goBack() {
                if (window.history.length > 1 && document.referrer && document.referrer.includes(window.location.hostname)) {
                    window.history.back();
                } else if (window.history.length > 1) {
                    window.history.back();
                } else {
                    goHome();
                }
            }
            window.goBack = goBack;

            // ─── SHOW DETAIL ─────────────────────────────────────────────
            window.showDetail = function(idOrSlug, type) {
                const all = [...allMoviesData, ...allAnimationsData];
                let item = null;
                if (typeof idOrSlug === 'number' || !isNaN(Number(idOrSlug))) {
                    item = all.find(m => m.id === Number(idOrSlug));
                }
                if (!item) {
                    item = all.find(m => (m.slug || String(m.id)) === String(idOrSlug) && (m.type || '').toLowerCase() === type
                        .toLowerCase());
                }
                if (!item) item = all.find(m => (m.slug || String(m.id)) === String(idOrSlug));
                if (!item) { showToast('ناوەڕۆک نەدۆزرایەوە.', 'error'); return; }
                const path = getPathForItem(item);
                if (window.location.pathname !== path) {
                    window.history.pushState({ type: 'detail', slug: getSlugForItem(item), id: item.id }, '', path);
                }
                setDetailMeta(item, (item.type || '').toLowerCase());
                renderDetail(item);
                trackPageView(path);
                trackGA('view_item', { content_id: item.id, content_type: item.type });
            };

            function showDetailBySlug(slug, type) {
                const item = findContentBySlug(slug, type);
                if (!item) { showToast('ناوەڕۆک نەدۆزرایەوە.', 'error');
                    goHome(); return; }
                const path = getPathForItem(item);
                if (window.location.pathname !== path) {
                    window.history.replaceState({ type: 'detail', slug: slug, id: item.id }, '', path);
                }
                setDetailMeta(item, type);
                renderDetail(item);
                trackPageView(path);
                trackGA('view_item', { content_id: item.id, content_type: item.type });
            }

            // ─── TOP 250 ──────────────────────────────────────────────────
            let top250Ranks = {};

            function top250Key(id, type) {
                return id + '|' + (type || '').toLowerCase();
            }

            async function fetchTop250() {
                try {
                    if (!supabaseInitialized) initSupabase();
                    if (!supabaseClient) {
                        top250Ranks = {};
                        return top250Ranks;
                    }
                    const cached = cacheGet('top250');
                    if (cached) {
                        top250Ranks = cached;
                        return top250Ranks;
                    }
                    const { data, error } = await supabaseClient
                        .from('top250')
                        .select('content_id, content_type, rank')
                        .order('rank', { ascending: true });
                    if (error) throw error;
                    const map = {};
                    (data || []).forEach(item => {
                        const key = top250Key(item.content_id, item.content_type);
                        map[key] = item.rank;
                    });
                    top250Ranks = map;
                    cacheSet('top250', map);
                    return top250Ranks;
                } catch (e) {
                    console.warn('Top 250 fetch error:', e);
                    top250Ranks = {};
                    return top250Ranks;
                }
            }

            function isTop250(item) {
                const key = top250Key(item.id, item.type);
                return Object.prototype.hasOwnProperty.call(top250Ranks, key);
            }

            function getTop250Rank(item) {
                const key = top250Key(item.id, item.type);
                return Object.prototype.hasOwnProperty.call(top250Ranks, key) ? top250Ranks[key] : null;
            }

            // ─── SCROLL LOCK SYSTEM ──────────────────────────────────────────
            let scrollLockCount = 0;

            function lockScroll() {
                scrollLockCount++;
                document.body.style.overflow = 'hidden';
            }

            function unlockScroll() {
                if (scrollLockCount <= 0) {
                    document.body.style.overflow = '';
                    return;
                }
                scrollLockCount--;
                if (scrollLockCount === 0) {
                    document.body.style.overflow = '';
                }
            }

            function closeAllOverlays() {
                const searchOverlay = document.getElementById('searchModalOverlay');
                if (searchOverlay && searchOverlay.classList.contains('active')) {
                    closeSearchFn();
                }
                const profileOverlay = document.getElementById('profileModalOverlay');
                if (profileOverlay && profileOverlay.classList.contains('active')) {
                    closeProfileModal();
                }
                const lightboxes = document.querySelectorAll('.lightbox-overlay.active');
                lightboxes.forEach(lb => {
                    lb.classList.remove('active');
                    unlockScroll();
                });
                if (scrollLockCount > 0) {
                    scrollLockCount = 0;
                    document.body.style.overflow = '';
                }
            }

            // ─── PAGINATION HELPER ────────────────────────────────────────
            function getPaginationRange(current, total, delta = 2) {
                const range = [];
                const rangeWithDots = [];
                let l;
                for (let i = 1; i <= total; i++) {
                    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
                        range.push(i);
                    }
                }
                for (let i of range) {
                    if (l) {
                        if (i - l === 2) {
                            rangeWithDots.push(l + 1);
                        } else if (i - l !== 1) {
                            rangeWithDots.push('…');
                        }
                    }
                    rangeWithDots.push(i);
                    l = i;
                }
                return rangeWithDots;
            }

            // ─── CHECK IF USER HAS WATCHED CONTENT ──────────────────────
            async function hasWatched(userId, contentId) {
                if (!userId || !contentId) return false;
                try {
                    const { data, error } = await supabaseClient
                        .from('watched')
                        .select('id')
                        .eq('user_id', userId)
                        .eq('content_id', contentId)
                        .maybeSingle();
                    if (error) throw error;
                    return !!data;
                } catch (e) {
                    console.warn('hasWatched check error:', e);
                    return false;
                }
            }

            // ─── MANUAL INCREMENT (primary method) ──────────────────────
            // This function uses the RPC 'increment_views_voters_only' which only increments views/voters
            async function manualIncrement(contentId, contentType, isNewRating = false) {
                try {
                    const { error } = await supabaseClient.rpc('increment_views_voters_only', {
                        content_id: contentId,
                        content_type: contentType,
                        is_new_rating: isNewRating
                    });
                    if (error) throw error;
                    console.log(`✅ manualIncrement succeeded for ${contentId} (type: ${contentType}, newRating: ${isNewRating})`);
                } catch (e) {
                    console.warn('manualIncrement failed, fallback to direct update:', e);
                    // Fallback: direct update if RPC not available
                    try {
                        const table = contentType.toLowerCase() === 'movie' ? 'movies' : 'animation';
                        const { data: viewRow, error: viewReadErr } = await supabaseClient
                            .from(table).select('views').eq('id', contentId).maybeSingle();
                        if (viewReadErr) throw viewReadErr;
                        const currentViews = (viewRow && viewRow.views) || 0;
                        const { error: viewWriteErr } = await supabaseClient
                            .from(table).update({ views: currentViews + 1 }).eq('id', contentId);
                        if (viewWriteErr) throw viewWriteErr;

                        if (isNewRating) {
                            const { data: voteRow, error: voteReadErr } = await supabaseClient
                                .from(table).select('voters').eq('id', contentId).maybeSingle();
                            if (voteReadErr) throw voteReadErr;
                            const currentVoters = (voteRow && voteRow.voters) || 0;
                            const { error: voteWriteErr } = await supabaseClient
                                .from(table).update({ voters: currentVoters + 1 }).eq('id', contentId);
                            if (voteWriteErr) throw voteWriteErr;
                        }
                        console.log(`✅ manualIncrement fallback (direct update) succeeded for ${contentId}`);
                    } catch (e2) {
                        console.warn('manualIncrement direct update also failed:', e2);
                    }
                }
            }

            // ─── DECREMENT VIEW (for unwatch) ──────────────────────────────
            async function decrementView(contentId, contentType) {
                try {
                    // Use direct update to decrement views by 1
                    const table = contentType.toLowerCase() === 'movie' ? 'movies' : 'animation';
                    const { data: viewRow, error: viewReadErr } = await supabaseClient
                        .from(table).select('views').eq('id', contentId).maybeSingle();
                    if (viewReadErr) throw viewReadErr;
                    const currentViews = (viewRow && viewRow.views) || 0;
                    if (currentViews > 0) {
                        const { error: viewWriteErr } = await supabaseClient
                            .from(table).update({ views: currentViews - 1 }).eq('id', contentId);
                        if (viewWriteErr) throw viewWriteErr;
                        console.log(`✅ decrementView succeeded for ${contentId}, new views: ${currentViews - 1}`);
                    } else {
                        console.log(`⚠️ decrementView: views already 0 for ${contentId}`);
                    }
                } catch (e) {
                    console.warn('decrementView failed:', e);
                }
            }

            // ─── INCREMENT VIEW AND RATING (now uses manualIncrement) ────
            async function incrementViewAndRating(contentId, contentType, isNewRating = false) {
                try {
                    if (!supabaseClient) return;
                    // Always use manualIncrement (which uses the dedicated RPC)
                    await manualIncrement(contentId, contentType, isNewRating);
                    cacheClear();
                } catch (e) {
                    console.warn('incrementViewAndRating error:', e);
                    cacheClear();
                }
            }

            // ─── RENDER DETAIL ──────────────────────────────────────────
            async function renderDetail(item) {
                closeAllOverlays();

                const type = (item.type || 'Movie').toLowerCase();
                const id = item.id;

                const main = document.getElementById('detailMain');
                const bg = document.getElementById('movieBg');
                if (!main || !bg) return;

                const safeTitle = sanitizeText(item.title || 'Untitled');
                const safeKurdishTitle = sanitizeText(item.kurdish_title || '');
                const safeTagline = sanitizeText(item.tagline || '');
                const safeStory = sanitizeText(item.story || '');
                const safeWriter = sanitizeText(item.writer || 'N/A');
                const safeDirector = sanitizeText(item.director || 'N/A');
                const safeLanguage = sanitizeText(item.language || 'N/A');
                const safeBudget = item.budget ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
                    .format(item.budget) : 'N/A';
                const safeReleaseDate = item.release_date ? new Date(item.release_date).toLocaleDateString('ku') : 'N/A';
                const safeRuntime = item.runtime || 'N/A';
                const safeImdb = item.imdb_rating || '-';
                const safeRt = item.rt_rating ? item.rt_rating + '%' : '-';
                const safeMc = item.mc_rating || '-';

                const rating = item.rating || item.kurddb_rating || 0;
                const voters = item.voters || 0;
                const year = item.release_date ? new Date(item.release_date).getFullYear() : 'N/A';
                const poster = item.poster_url || '';
                const backdrop = item.backdrop_url || poster || 'https://picsum.photos/seed/' + item.id + '/1920/1080';
                const genres = Array.isArray(item.genres) ? item.genres.map(sanitizeText) : [];
                const countries = Array.isArray(item.countries) ? item.countries.map(sanitizeText) : [];
                const views = item.views || 0;
                const trailer = item.trailer_url || '';
                const cast = item.cast || [];
                const typeLabel = item.type || 'Movie';
                const hasKurdishSubtitle = item.has_kurdish_subtitle || false;
                const photos = item.photos || [];
                let userRating = null;
                let avgRating = rating;

                bg.style.backgroundImage = `url('${sanitizeUrl(backdrop)}')`;

                const top250Rank = getTop250Rank(item);
                const isTop = top250Rank !== null;
                let top250BadgeHTML = '';
                let top250DetailBadgeHTML = '';
                if (isTop) {
                    top250BadgeHTML =
                        `<div class="top250-badge top250-badge-sm">#${top250Rank} · Top 250</div>`;
                    top250DetailBadgeHTML =
                        `<div class="top250-detail-badge">🏆 <span class="rank-num">#${top250Rank}</span> <span>لە باشترین ٢٥٠ فیلمی مێژوو</span></div>`;
                }

                let subtitleBadge = '';
                if (hasKurdishSubtitle) {
                    const websiteIds = item.website_ids || [];
                    let sitesToShow = [];
                    if (websiteIds.length > 0) sitesToShow = allWebsitesData.filter(site => websiteIds.includes(site.id));
                    else sitesToShow = allWebsitesData;
                    let sitesHtml = '';
                    if (sitesToShow.length > 0) {
                        sitesHtml = sitesToShow.map(site => `
                                <a href="${sanitizeUrl(site.url || '#')}" target="_blank" class="site-badge inline-flex items-center gap-2 transition hover:bg-white/10 rounded-full px-3 py-1">
                                    ${site.logo_url ? `<img src="${sanitizeUrl(site.logo_url)}" alt="${sanitizeText(site.name)}" style="height:50px;width:auto;object-fit:contain;" onerror="this.style.display='none'" />` : ''}
                                    <span class="text-white/80 text-sm">${sanitizeText(site.name)}</span>
                                </a>
                            `).join('');
                    } else {
                        sitesHtml = '<span class="text-white/50 text-sm">هیچ وێبسایتێک تۆمار نەکراوە</span>';
                    }
                    subtitleBadge = `
                            <div class="subtitle-badge mt-4 flex flex-wrap items-center gap-2">
                                <img src="${sanitizeUrl(websiteSettings.logo_url || FAVICON_URL)}" alt="KurdMDb" style="height:28px;width:auto;" />
                                <span>ئەم بەرهەمە بە ژێرنووسی کوردی لەم وێبسایتانە بەردەستە:</span>
                                ${sitesHtml}
                            </div>
                        `;
                }

                let photosHTML = '';
                if (photos && photos.length > 0) {
                    const lightboxId = 'lightbox-' + id;
                    photosHTML = `
                            <div class="max-w-7xl mx-auto mt-12">
                                <div class="glass-panel p-6 md:p-8">
                                    <h2 class="text-xl font-semibold mb-6 text-purple-200">وێنەکان</h2>
                                    <div class="photos-grid">
                                        ${photos.map((p, idx) => `
                                            <div class="photo-item" data-src="${sanitizeUrl(p)}">
                                                <img src="${sanitizeUrl(p)}" alt="${safeTitle} - ${idx+1}" loading="lazy" onerror="this.style.display='none'" />
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                            <div class="lightbox-overlay" id="${lightboxId}">
                                <button class="lightbox-close" aria-label="Close">&times;</button>
                                <img src="" alt="Full size" />
                            </div>
                        `;
                }

                const imdbLogo = 'https://i.postimg.cc/Vk7h3ry6/IMG-8461.png';
                const rtLogo = 'https://i.postimg.cc/fTN1XQ7G/IMG-8462.png';
                const mcLogo = 'https://i.postimg.cc/5yLdJxBy/IMG-8459.png';

                const iconClock =
                    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
                const iconGlobe =
                    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
                const iconFilm =
                    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="8" y1="2" x2="8" y2="22"/><line x1="16" y1="2" x2="16" y2="22"/><line x1="2" y1="8" x2="22" y2="8"/><line x1="2" y1="16" x2="22" y2="16"/></svg>`;
                const iconCalendar =
                    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
                const iconEye =
                    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

                // Collections mapping
                const collsForContent = window.contentCollectionsMap ? (window.contentCollectionsMap[top250Key(item.id, item.type)] || []) : [];
                let collectionAlertHTML = '';
                if (collsForContent.length > 0) {
                    const badgeLinks = collsForContent.map(c => `
                            <span class="coll-badge-sm" onclick="showCollectionDetail('${sanitizeText(c.slug)}')">
                                ${sanitizeText(c.name)}
                            </span>
                        `).join('');
                    collectionAlertHTML = `
                            <div class="collection-alert">
                                <div class="label">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="2" y="3" width="20" height="18" rx="2" />
                                        <line x1="8" y1="21" x2="8" y2="3" />
                                        <line x1="16" y1="21" x2="16" y2="3" />
                                    </svg>
                                    ئەم بەرهەمە لە کۆکراوەکانی خوارەوەدا هەیە:
                                </div>
                                <div class="badges">${badgeLinks}</div>
                            </div>
                        `;
                }

                const posterHTML = poster ?
                    `<div class="detail-poster-wrapper"><img src="${sanitizeUrl(poster)}" alt="${safeTitle} - پۆستەر" class="w-full h-auto rounded-2xl shadow-2xl border border-white/10 transition-transform duration-500 hover:scale-105" onerror="this.style.display='none'" /></div>` :
                    '<div class="w-full aspect-[2/3] bg-gray-800 rounded-2xl flex items-center justify-center text-white/20">No Poster</div>';

                // Brand logo in detail page (from database)
                const logoUrl = websiteSettings.logo_url || FAVICON_URL;
                const brandHTML = `
                            <div class="kurddb-brand-large">
                                <img src="${sanitizeUrl(logoUrl)}" alt="${sanitizeText(websiteSettings.website_name || 'KurdMDb')}" />
                                <div class="brand-rating">${typeof avgRating === 'number' ? avgRating.toFixed(1) : '0.0'}</div>
                                <div class="brand-voters">${voters} دەنگ</div>
                            </div>
                        `;

                let detailHTML = `
                        <div class="max-w-7xl mx-auto flex flex-col lg:flex-row gap-10 lg:gap-16 items-start">

                            <div class="flex-shrink-0 w-full lg:w-80 xl:w-96 relative">
                                ${posterHTML}
                                ${top250BadgeHTML}
                            </div>

                            <div class="flex-1 w-full">
                                <div class="glass-panel p-6 md:p-8 lg:p-10 space-y-5">
                                    ${top250DetailBadgeHTML}
                                    ${safeKurdishTitle ? `<p class="text-purple-300 text-lg md:text-xl font-medium">${safeKurdishTitle}</p>` : ''}
                                    <h1 class="text-3xl md:text-4xl lg:text-5xl font-cinematic font-bold tracking-wide leading-tight text-white">${safeTitle}</h1>
                                    ${safeTagline ? `<p class="text-base md:text-lg italic opacity-70 text-purple-200">${safeTagline}</p>` : ''}
                                    ${collectionAlertHTML}
                                    <div class="flex flex-wrap gap-6 text-sm text-white/70">
                                        ${safeRuntime !== 'N/A' ? `<span class="inline-flex items-center gap-1.5">${iconClock} ${safeRuntime}</span>` : ''}
                                        ${countries.length > 0 ? `<span class="inline-flex items-center gap-1.5">${iconGlobe} ${countries.join(', ')}</span>` : ''}
                                        <span class="inline-flex items-center gap-1.5">${iconFilm} ${sanitizeText(typeLabel)}</span>
                                        <span class="inline-flex items-center gap-1.5">${iconCalendar} ${year}</span>
                                        ${genres.length > 0 ? `<span>${genres.join(', ')}</span>` : ''}
                                    </div>

                                    ${subtitleBadge}

                                    <div class="flex flex-wrap gap-4 pt-4">
                                        <button class="btn-primary" onclick="handleWatchlistToggle(${item.id}, '${sanitizeText(type)}')">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                            </svg>
                                            <span id="watchlistText">زیادکردن بۆ پێڕستی بینین</span>
                                        </button>
                                        <button class="btn-secondary" id="watchedBtn" onclick="handleWatched(${item.id}, '${sanitizeText(type)}')">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                            <span id="watchedText">بینیم</span>
                                        </button>
                                        <div class="flex items-center gap-2 text-white/50 text-sm">
                                            ${iconEye}
                                            <span id="viewCount">${views} بینین</span>
                                        </div>
                                    </div>

                                    ${safeStory ? `
                                    <div class="mt-6 pt-6 border-t border-white/10">
                                        <h3 class="text-lg font-semibold text-purple-200 mb-2">چیرۆک</h3>
                                        <p class="text-white/70 leading-relaxed safe-text">${safeStory}</p>
                                    </div>` : ''}
                                </div>
                            </div>
                        </div>

                        <div class="max-w-7xl mx-auto mt-16 grid gap-8 lg:grid-cols-2">
                            <div class="glass-panel p-6 md:p-8">
                                <h2 class="text-xl font-semibold mb-6 text-purple-200">زانیاری فیلم</h2>
                                ${[
                                    {l:'ساڵی بڵاوبوونەوە', v: year},
                                    {l:'ماوە', v: safeRuntime},
                                    {l:'جۆر', v: genres.join(', ') || 'N/A'},
                                    {l:'وڵات', v: countries.join(', ') || 'N/A'},
                                    {l:'زمان', v: safeLanguage},
                                    {l:'جۆری ناوەڕۆک', v: sanitizeText(typeLabel)},
                                    {l:'بەرواری بڵاوبوونەوە', v: safeReleaseDate},
                                    {l:'بودجە', v: safeBudget},
                                    {l:'نوسەر', v: safeWriter},
                                    {l:'دەرهێنەر', v: safeDirector}
                                ].map(i => `<div class="info-row"><span class="info-label">${i.l}</span><span class="info-value safe-text">${i.v}</span></div>`).join('')}
                            </div>
                            <div class="glass-panel p-6 md:p-8 text-center">
                                <h2 class="text-xl font-semibold mb-8 text-purple-200">پلەکان</h2>
                                ${brandHTML}
                                <div class="flex flex-wrap justify-center items-center gap-6 text-sm mt-6">
                                    <div class="rating-logo flex items-center gap-1.5">
                                        <img src="${imdbLogo}" alt="IMDb" class="h-10 w-auto" />
                                        <span class="text-white font-semibold text-lg">${safeImdb}</span>
                                    </div>
                                    <div class="rating-logo flex items-center gap-1.5">
                                        <img src="${rtLogo}" alt="Rotten Tomatoes" class="h-20 w-auto" />
                                        <span class="text-white font-semibold text-lg">${safeRt}</span>
                                    </div>
                                    <div class="rating-logo flex items-center gap-1.5">
                                        <img src="${mcLogo}" alt="Metacritic" class="h-10 w-auto" />
                                        <span class="text-white font-semibold text-lg">${safeMc}</span>
                                    </div>
                                </div>
                                <div class="mt-8">
                                    <p class="text-sm text-white/60 mb-2">پلەی تۆ</p>
                                    <div class="user-rating-stars" id="userRatingStars"></div>
                                    <p class="text-xs text-white/40 mt-1" id="userRatingMsg">${userRating ? `پلەی تۆ: ${userRating}` : 'پلەی خۆت بدە (١-١٠)'}</p>
                                </div>
                            </div>
                        </div>

                        ${trailer ? `
                        <div class="max-w-7xl mx-auto mt-16">
                            <div class="glass-panel p-6 md:p-8">
                                <h2 class="text-xl font-semibold mb-6 text-purple-200">ترەیلەری فەرمی</h2>
                                <div id="trailerPlaceholder" class="text-center py-12">
                                    <button id="watchTrailerBtn" class="btn-primary text-lg px-10 py-5">
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                        بینینی ترەیلەر
                                    </button>
                                </div>
                                <div id="trailerVideo" class="hidden">
                                    <div class="trailer-container" id="trailerContainer"></div>
                                </div>
                            </div>
                        </div>` : ''}

                        ${cast.length > 0 ? `
                        <div class="max-w-7xl mx-auto mt-12">
                            <div class="glass-panel p-6 md:p-8">
                                <h2 class="text-xl font-semibold mb-6 text-purple-200">ئەکتەرەکان</h2>
                                <div class="cast-scroll">
                                    ${cast.map(a => `
                                        <div class="cast-card">
                                            <img src="${sanitizeUrl(a.image || 'https://picsum.photos/seed/actor/200/200')}" alt="${sanitizeText(a.name || 'Actor')}" loading="lazy" onerror="this.src='https://picsum.photos/seed/actor/200/200'" />
                                            <h3 class="font-semibold text-sm safe-text">${sanitizeText(a.name || 'نەناسراو')}</h3>
                                            <p class="text-xs text-white/60 safe-text">${sanitizeText(a.character || '')}</p>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>` : ''}

                        ${photosHTML}

                        <div class="max-w-7xl mx-auto mt-12">
                            <div class="glass-panel p-6 md:p-8">
                                <h2 class="text-xl font-semibold mb-6 text-purple-200">بۆچوونەکان</h2>
                                <div id="commentsList" class="space-y-4 mb-6"></div>
                                <div class="flex flex-col sm:flex-row gap-3">
                                    <input type="text" id="commentInput" placeholder="بۆچوونێک بنووسە…" class="input-field flex-1" maxlength="500" />
                                    <button id="submitComment" class="btn-primary px-6 py-3">ناردن</button>
                                </div>
                            </div>
                        </div>
                    `;

                main.innerHTML = sanitizeHTML(detailHTML);

                // ─── Schema.org (داینامیکی) ──────────────────────────────
                const schema = document.createElement('script');
                schema.setAttribute('type', 'application/ld+json');
                const schemaData = {
                    "@context": "https://schema.org",
                    "@type": "Movie",
                    "name": safeTitle,
                    "description": safeStory || `${safeTitle} - فیلمی بەناوبانگ لە KurdMDb`,
                    "datePublished": item.release_date || '',
                    "director": { "@type": "Person", "name": safeDirector },
                    "actors": cast.map(a => ({ "@type": "Person", "name": sanitizeText(a.name || '') })).filter(a => a.name),
                    "genre": genres,
                    "countryOfOrigin": countries,
                    "image": poster,
                    "aggregateRating": {
                        "@type": "AggregateRating",
                        "ratingValue": avgRating,
                        "ratingCount": voters
                    }
                };
                schema.textContent = JSON.stringify(schemaData);
                document.head.appendChild(schema);

                // ─── Lightbox logic ────────────────────────────────────────
                const lightboxOverlay = document.getElementById('lightbox-' + id);
                if (lightboxOverlay) {
                    const lightboxImg = lightboxOverlay.querySelector('img');
                    const closeBtn = lightboxOverlay.querySelector('.lightbox-close');
                    document.querySelectorAll('.photo-item').forEach(item => {
                        item.addEventListener('click', function() {
                            const src = this.dataset.src;
                            if (src && lightboxImg) {
                                lightboxImg.src = src;
                                lightboxOverlay.classList.add('active');
                                lockScroll();
                            }
                        });
                    });
                    const closeLightbox = () => {
                        lightboxOverlay.classList.remove('active');
                        unlockScroll();
                    };
                    closeBtn.addEventListener('click', closeLightbox);
                    lightboxOverlay.addEventListener('click', function(e) {
                        if (e.target === this) closeLightbox();
                    });
                    document.addEventListener('keydown', function(e) {
                        if (e.key === 'Escape' && lightboxOverlay.classList.contains('active')) closeLightbox();
                    });
                }

                // ─── Trailer ────────────────────────────────────────────────
                // The <iframe> is built here as a real DOM node (createElement +
                // property assignment) instead of being part of the HTML string
                // that main.innerHTML runs through sanitizeHTML()/DOMPurify.
                // DOMPurify's ALLOWED_TAGS intentionally has no bare "iframe"
                // (an unrestricted iframe tag in arbitrary HTML is an XSS/
                // clickjacking vector), so any <iframe ...> written as markup
                // gets silently stripped before it reaches the page — which is
                // exactly why the trailer button used to do nothing on click
                // (getElementById('trailerIframe') returned null). Creating the
                // element in JS and only ever setting .src via sanitizeUrlRaw()
                // (which still blocks javascript:/data:/vbscript:) keeps that
                // protection for the rest of the page while letting the one
                // legitimate, admin-provided trailer URL actually load.
                const watchBtn = document.getElementById('watchTrailerBtn');
                if (watchBtn && trailer) {
                    watchBtn.onclick = function() {
                        const container = document.getElementById('trailerContainer');
                        const safeSrc = sanitizeUrlRaw(trailer);
                        if (container && safeSrc) {
                            container.innerHTML = '';
                            const iframe = document.createElement('iframe');
                            iframe.id = 'trailerIframe';
                            iframe.src = safeSrc;
                            iframe.setAttribute('frameborder', '0');
                            iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
                            iframe.setAttribute('allowfullscreen', '');
                            iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
                            container.appendChild(iframe);
                            document.getElementById('trailerPlaceholder').classList.add('hidden');
                            document.getElementById('trailerVideo').classList.remove('hidden');
                            gsap.from(document.getElementById('trailerVideo'), { opacity: 0, y: 20, duration: 0.5 });
                        } else if (!safeSrc) {
                            showToast('لینکی ترەیلەر نادروستە.', 'error');
                        }
                    };
                }

                // ─── Rating stars ──────────────────────────────────────────
                const starsContainer = document.getElementById('userRatingStars');
                if (starsContainer) {
                    starsContainer.innerHTML = '';
                    for (let i = 1; i <= 10; i++) {
                        const starBtn = document.createElement('button');
                        starBtn.textContent = '★';
                        starBtn.dataset.value = i;
                        starBtn.addEventListener('click', async function() {
                            if (!isLoggedIn()) { openProfileModal(); return; }
                            const watched = await hasWatched(currentUser.id, id);
                            if (!watched) {
                                showToast('تکایە یەکەم "بینیم" کلیک بکە بۆ ئەم بەرهەمە، پاشان پلە بدە.', 'info');
                                return;
                            }
                            const ratingVal = parseInt(this.dataset.value);
                            handleRating(item.id, ratingVal, type);
                            for (let j = 0; j < starsContainer.children.length; j++) {
                                starsContainer.children[j].classList.toggle('active', j < ratingVal);
                            }
                            document.getElementById('userRatingMsg').textContent = `پلەی تۆ: ${ratingVal}`;
                        });
                        if (userRating && i <= userRating) starBtn.classList.add('active');
                        starsContainer.appendChild(starBtn);
                    }
                }
                fetchUserDetailData(item.id, type);

                // ─── Comments ──────────────────────────────────────────────
                async function fetchComments() {
                    if (!supabaseClient) return [];
                    const cached = cacheGet('comments_' + id);
                    if (cached) return cached;
                    const { data, error } = await supabaseClient.from('comments').select('*').eq('content_id', id).order(
                        'created_at', { ascending: false });
                    if (error) return [];
                    cacheSet('comments_' + id, data);
                    return data;
                }

                function renderCommentItem(c) {
                    const avatar = sanitizeText(c.username ? c.username.charAt(0).toUpperCase() : 'U');
                    const date = c.created_at ? new Date(c.created_at).toLocaleDateString('ku') : '';
                    const safeUsername = sanitizeText(c.username || 'User');
                    const safeText = sanitizeText(c.text || '');
                    return `
                            <div class="comment-item flex items-start gap-4" data-comment-id="${c.id}">
                                <div class="comment-avatar">${avatar}</div>
                                <div class="flex-1">
                                    <div class="flex justify-between items-center mb-1">
                                        <span class="font-medium text-sm safe-text">${safeUsername}</span>
                                        <span class="text-xs text-white/40">${date}</span>
                                    </div>
                                    <p class="text-white/80 text-sm safe-text">${safeText}</p>
                                </div>
                            </div>
                        `;
                }

                async function renderComments() {
                    const list = document.getElementById('commentsList');
                    if (!list) return;
                    const comments = await fetchComments();
                    if (comments.length === 0) {
                        list.innerHTML = '<div class="text-white/40 text-center py-4">هیچ بۆچوونێک نیە. یەکەم بۆچوون بنووسە!</div>';
                        return;
                    }
                    list.innerHTML = sanitizeHTML(comments.map(c => renderCommentItem(c)).join(''));
                }

                renderComments();

                // ─── Submit comment ────────────────────────────────────────
                const submitBtn = document.getElementById('submitComment');
                const commentInput = document.getElementById('commentInput');
                if (submitBtn && commentInput) {
                    submitBtn.onclick = async function() {
                        if (!isLoggedIn()) { openProfileModal(); return; }
                        const watched = await hasWatched(currentUser.id, id);
                        if (!watched) {
                            showToast('تکایە یەکەم "بینیم" کلیک بکە بۆ ئەم بەرهەمە، پاشان کۆمێنت بنووسە.', 'info');
                            return;
                        }
                        const text = commentInput.value.trim();
                        if (text && supabaseClient && currentUser && currentUser.id) {
                            try {
                                const result = await callVisitorAction('comment', {
                                    content_id: id,
                                    content_type: type,
                                    text: text,
                                    username: currentUser.username || 'User'
                                });
                                if (!result.success) {
                                    showToast(result.message || result.error || 'سەرکەوتوو نەبوو لە ناردنی بۆچوون', result.limited ? 'info' : 'error');
                                    return;
                                }
                                commentInput.value = '';
                                cacheClear();
                                await renderComments();
                                await addXP(30);
                                trackGA('comment', { content_id: id, content_type: type });
                                showToast('بۆچوون زیاد کرا!', 'success');
                            } catch (e) {
                                console.error('Comment error:', e);
                                showToast('سەرکەوتوو نەبوو لە ناردنی بۆچوون: ' + (e.message || 'هەڵەی نەناسراو'), 'error');
                            }
                        }
                    };
                }

                hideAllPages();
                document.getElementById('detailPage').style.display = 'block';
                window.scrollTo(0, 0);
                gsap.from('#detailPage', { opacity: 0, duration: 0.4 });
            }

            // ─── FETCH USER DETAIL DATA ──────────────────────────────────
            async function fetchUserDetailData(contentId, type) {
                if (!supabaseClient || !currentUser || !currentUser.id) return;
                try {
                    const cacheKey = 'userdetail_' + currentUser.id + '_' + contentId;
                    const cached = cacheGet(cacheKey);
                    if (cached) {
                        applyUserDetailData(cached, contentId);
                        return;
                    }
                    const [ratingRes, wlRes, wRes, avgRes] = await Promise.all([
                        supabaseClient.from('ratings').select('rating').eq('user_id', currentUser.id).eq('content_id',
                            contentId).maybeSingle(),
                        supabaseClient.from('watchlists').select('id').eq('user_id', currentUser.id).eq('content_id',
                            contentId).maybeSingle(),
                        supabaseClient.from('watched').select('id').eq('user_id', currentUser.id).eq('content_id', contentId)
                        .maybeSingle(),
                        supabaseClient.from('ratings').select('rating').eq('content_id', contentId)
                    ]);
                    const data = { rating: ratingRes.data, watchlist: wlRes.data, watched: wRes.data, avg: avgRes.data };
                    cacheSet(cacheKey, data);
                    applyUserDetailData(data, contentId);
                } catch (e) { console.warn('User detail data fetch error:', e); }
            }

            function applyUserDetailData(data, contentId) {
                if (data.rating && !data.rating.error) {
                    const userRating = data.rating.rating;
                    const starsContainer = document.getElementById('userRatingStars');
                    const msgEl = document.getElementById('userRatingMsg');
                    if (starsContainer) {
                        for (let i = 0; i < starsContainer.children.length; i++) {
                            starsContainer.children[i].classList.toggle('active', i < userRating);
                        }
                    }
                    if (msgEl) msgEl.textContent = `پلەی تۆ: ${userRating}`;
                }
                if (data.watchlist && !data.watchlist.error && data.watchlist.data) {
                    const textEl = document.getElementById('watchlistText');
                    if (textEl) textEl.textContent = 'لە پێڕستی بینیندا';
                }
                if (data.watched && !data.watched.error && data.watched.data) {
                    const btn = document.getElementById('watchedBtn');
                    if (btn) {
                        const span = btn.querySelector('#watchedText');
                        if (span) span.textContent = 'بینراو';
                        btn.style.borderColor = 'rgba(52,211,153,0.5)';
                    }
                }
                if (data.avg && !data.avg.error && data.avg.data && data.avg.data.length > 0) {
                    const sum = data.avg.data.reduce((a, b) => a + b.rating, 0);
                    const avg = sum / data.avg.data.length;
                    const ratingEl = document.querySelector('.brand-rating');
                    if (ratingEl) ratingEl.textContent = avg.toFixed(1);
                    const votersEl = document.querySelector('.brand-voters');
                    if (votersEl) {
                        const totalVoters = data.avg.data.length;
                        votersEl.textContent = `${totalVoters} دەنگ`;
                    }
                }
            }

            // ─── EXPOSE GLOBAL FUNCTIONS ──────────────────────────────────
            window.handleWatchlistToggle = async function(contentId, contentType) {
                if (!isLoggedIn()) { openProfileModal(); return; }
                if (!supabaseClient || !currentUser || !currentUser.id) { showToast('تکایە دووبارە بچۆ ژوورەوە.', 'error'); return; }
                try {
                    const result = await callVisitorAction('watchlist', {
                        content_id: contentId,
                        content_type: contentType
                    });
                    if (!result.success) {
                        showToast(result.message || result.error || 'سەرکەوتوو نەبوو', result.limited ? 'info' : 'error');
                        return;
                    }
                    if (result.added) {
                        document.getElementById('watchlistText').textContent = 'لە پێڕستی بینیندا';
                        await addXP(20);
                        showToast('زیاد کرا بۆ پێڕستی بینین!', 'success');
                        trackGA('add_to_watchlist', { content_id: contentId });
                    } else {
                        document.getElementById('watchlistText').textContent = 'زیادکردن بۆ پێڕستی بینین';
                        showToast('لە پێڕستی بینین لابرا.', 'info');
                        trackGA('remove_from_watchlist', { content_id: contentId });
                    }
                    cacheClear();
                } catch (e) {
                    console.error('Watchlist error:', e);
                    showToast('سەرکەوتوو نەبوو: ' + (e.message || 'هەڵەی نەناسراو'), 'error');
                }
            };

            window.handleWatched = async function(contentId, contentType) {
                if (!isLoggedIn()) { openProfileModal(); return; }
                if (!supabaseClient || !currentUser || !currentUser.id) { showToast('تکایە دووبارە بچۆ ژوورەوە.', 'error'); return; }

                try {
                    const result = await callVisitorAction('watched', {
                        content_id: contentId,
                        content_type: contentType
                    });
                    if (!result.success) {
                        showToast(result.message || result.error || 'سەرکەوتوو نەبوو', result.limited ? 'info' : 'error');
                        return;
                    }

                    const btn = document.getElementById('watchedBtn');
                    const span = btn ? btn.querySelector('#watchedText') : null;

                    if (!result.watched) {
                        // Removed from watched
                        await decrementView(contentId, contentType);
                        if (span) span.textContent = 'بینیم';
                        if (btn) btn.style.borderColor = '';
                        showToast('لە پێڕستی بینراو لابرا.', 'info');
                        trackGA('unmark_watched', { content_id: contentId });
                        // Update view count
                        const viewEl = document.getElementById('viewCount');
                        if (viewEl) {
                            const currentViews = parseInt(viewEl.textContent) || 0;
                            if (currentViews > 0) viewEl.textContent = (currentViews - 1) + ' بینین';
                        }
                        // Update local data
                        const allItems = [...allMoviesData, ...allAnimationsData];
                        const idx = allItems.findIndex(m => m.id === contentId);
                        if (idx !== -1 && allItems[idx].views > 0) allItems[idx].views--;
                        cacheClear();
                        return;
                    }

                    // Added to watched
                    await addXP(40);
                    showToast('وەک بینراو دیاری کرا!', 'success');
                    trackGA('mark_watched', { content_id: contentId });
                    await incrementViewAndRating(contentId, contentType, false);
                    const viewEl = document.getElementById('viewCount');
                    if (viewEl) {
                        const currentViews = parseInt(viewEl.textContent) || 0;
                        viewEl.textContent = (currentViews + 1) + ' بینین';
                    }
                    if (span) span.textContent = 'بینراو';
                    if (btn) btn.style.borderColor = 'rgba(52,211,153,0.5)';
                    // Update local data
                    const allItems = [...allMoviesData, ...allAnimationsData];
                    const idx = allItems.findIndex(m => m.id === contentId);
                    if (idx !== -1) allItems[idx].views = (allItems[idx].views || 0) + 1;
                    cacheClear();
                } catch (e) {
                    console.error('Watched error:', e);
                    showToast('سەرکەوتوو نەبوو: ' + (e.message || 'هەڵەی نەناسراو'), 'error');
                }
            };

            window.handleRating = async function(contentId, ratingVal, contentType) {
                if (!isLoggedIn()) { openProfileModal(); return; }
                if (!supabaseClient || !currentUser || !currentUser.id) { showToast('تکایە دووبارە بچۆ ژوورەوە.', 'error'); return; }
                try {
                    const result = await callVisitorAction('rate', {
                        content_id: contentId,
                        content_type: contentType,
                        rating: ratingVal
                    });
                    if (!result.success) {
                        showToast(result.message || result.error || 'سەرکەوتوو نەبوو لە پلەدان', result.limited ? 'info' : 'error');
                        return;
                    }
                    const isNew = !!result.isNew;
                    if (isNew) {
                        await addXP(50);
                        await incrementViewAndRating(contentId, contentType, true);
                    } else {
                        await addXP(10);
                    }
                    cacheClear();
                    trackGA('rate_item', { content_id: contentId, rating: ratingVal });
                    showToast('سوپاس بۆ پلەدان!', 'success');

                    const { data: avgData, error: avgErr } = await supabaseClient.from('ratings').select('rating').eq(
                        'content_id', contentId);
                    if (!avgErr && avgData && avgData.length > 0) {
                        const sum = avgData.reduce((a, b) => a + b.rating, 0);
                        const newAvg = sum / avgData.length;
                        const ratingEl = document.querySelector('.brand-rating');
                        if (ratingEl) ratingEl.textContent = newAvg.toFixed(1);
                        const votersEl = document.querySelector('.brand-voters');
                        if (votersEl) votersEl.textContent = `${avgData.length} دەنگ`;
                    }
                    // Update local data
                    const allItems = [...allMoviesData, ...allAnimationsData];
                    const idx = allItems.findIndex(m => m.id === contentId);
                    if (idx !== -1) {
                        if (isNew) allItems[idx].voters = (allItems[idx].voters || 0) + 1;
                        // rating will be fetched from DB on next render
                    }
                } catch (e) {
                    console.error('Rating error:', e);
                    showToast('سەرکەوتوو نەبوو لە پلەدان: ' + (e.message || 'هەڵەی نەناسراو'), 'error');
                }
            };

            // ─── STATE ──────────────────────────────────────────────────────
            let currentUser = null;
            let allMoviesData = [];
            let allAnimationsData = [];
            let allHeroSlides = [];
            let allAds = [];
            let allWebsitesData = [];
            let websiteSettings = {};
            let allGenres = [];
            let allCountries = [];
            let allYears = [];
            let allLanguages = [];
            let currentWorksTab = 'movies';
            let currentPage = 1;
            let itemsPerPage = 12;
            let swiperInstances = [];
            let isInitialized = false;
            let currentRankTab = 'top_movies';
            let recommendedIds = [];
            let allCollections = [];
            let allCollectionItems = [];
            let contentCollectionsMap = {};
            let supabaseClient = null;
            let supabaseInitialized = false;

            // ─── SUPABASE INIT ──────────────────────────────────────────────
            function initSupabase() {
                try {
                    if (typeof supabase === 'undefined') {
                        console.warn('Supabase library not loaded.');
                        return false;
                    }
                    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
                        console.warn('Supabase credentials missing.');
                        return false;
                    }
                    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                    supabaseInitialized = true;
                    return true;
                } catch (e) {
                    console.error('Supabase init error:', e);
                    return false;
                }
            }

            // ─── ONLINE USERS ──────────────────────────────────────────────
            let onlineChannel = null;
            let onlineCount = 0;
            let onlineUpdateInterval = null;

            function initPresence() {
                if (!supabaseClient) return;
                if (onlineChannel) { onlineChannel.unsubscribe();
                    onlineChannel = null; }
                const channel = supabaseClient.channel('online-users', {
                    config: { presence: { key: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36)
                            .substring(2) } }
                });
                channel.on('presence', { event: 'sync' }, () => {
                    const state = channel.presenceState();
                    const users = Object.keys(state).length;
                    onlineCount = users;
                    updateOnlineBadge(users);
                    updateOnlineStatistics(users);
                });
                channel.on('presence', { event: 'join', filter: (key) => {} }, () => {});
                channel.on('presence', { event: 'leave', filter: (key) => {} }, () => {});
                channel.subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        await channel.track({ user_id: currentUser?.id || 'anonymous', online_at: new Date().toISOString() });
                    }
                });
                onlineChannel = channel;
                if (onlineUpdateInterval) clearInterval(onlineUpdateInterval);
                onlineUpdateInterval = setInterval(() => {
                    if (onlineCount > 0) updateOnlineStatistics(onlineCount);
                }, 30000);
            }

            async function updateOnlineStatistics(count) {
                try {
                    if (!supabaseClient) return;
                    const { data, error } = await supabaseClient.from('statistics').select('id').maybeSingle();
                    if (error || !data) {
                        await supabaseClient.from('statistics').insert({ online_users: count, total_views: 0 });
                    } else {
                        await supabaseClient.from('statistics').update({ online_users: count }).eq('id', data.id);
                    }
                } catch (e) { console.warn('Failed to update online stats:', e); }
            }

            function updateOnlineBadge(count) {
                const badge = document.getElementById('onlineUsersBadge');
                const countEl = document.getElementById('onlineCount');
                const labelEl = document.getElementById('onlineLabel');
                if (!badge || !countEl || !labelEl) return;
                countEl.textContent = count;
                if (count === 0) labelEl.textContent = 'کەس لەسەر ماڵپەڕەکە نیە';
                else if (count === 1) labelEl.textContent = 'کەس ئێستا لەسەر ماڵپەڕەکەیە';
                else labelEl.textContent = 'کەس ئێستا لەسەر ماڵپەڕەکەن';
                gsap.fromTo(badge, { scale: 0.95, opacity: 0.8 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'power2.out' });
            }

            // ─── STATISTICS ──────────────────────────────────────────────
            async function fetchAndSendStatistics() {
                try {
                    if (!supabaseInitialized) initSupabase();
                    if (!supabaseClient) return;
                    const cachedStats = cacheGet('stats_aggregated');
                    if (cachedStats) {
                        console.log('📊 Using cached stats');
                        return;
                    }
                    const { count: totalUsers } = await supabaseClient.from('profiles').select('*', { count: 'exact',
                        head: true });
                    const { count: totalMovies } = await supabaseClient.from('movies').select('*', { count: 'exact',
                        head: true });
                    const { count: totalAnimations } = await supabaseClient.from('animation').select('*', { count: 'exact',
                        head: true });
                    const { count: totalComments } = await supabaseClient.from('comments').select('*', { count: 'exact',
                        head: true });
                    const { count: totalWatchlists } = await supabaseClient.from('watchlists').select('*', { count: 'exact',
                        head: true });
                    const { count: totalRatings } = await supabaseClient.from('ratings').select('*', { count: 'exact',
                        head: true });

                    const statsPayload = {
                        total_users: totalUsers || 0,
                        total_movies: totalMovies || 0,
                        total_animations: totalAnimations || 0,
                        total_comments: totalComments || 0,
                        total_watchlists: totalWatchlists || 0,
                        total_ratings: totalRatings || 0,
                        online_users: onlineCount || 0,
                        updated_at: new Date().toISOString()
                    };

                    const { data: existingStats } = await supabaseClient.from('stats_aggregated').select('id').maybeSingle();
                    if (existingStats) {
                        await supabaseClient.from('stats_aggregated').update(statsPayload).eq('id', existingStats.id);
                    } else {
                        await supabaseClient.from('stats_aggregated').insert(statsPayload);
                    }
                    cacheSet('stats_aggregated', statsPayload);
                    console.log('📊 Statistics sent to DB.');
                } catch (e) { console.warn('Stats send error:', e); }
            }

            // ─── XP / LEVEL ──────────────────────────────────────────────
            const DEFAULT_TITLES = [
                { level: 1, title: 'ئەندامی نوێ' }, { level: 3, title: 'هەواداری فیلم' }, { level: 5, title: 'ڕەخنەگری ئاسایی' },
                { level: 8, title: 'خۆشەویستی فیلم' }, { level: 10, title: 'گەڕۆکی فیلم' }, { level: 12, title: 'خۆشەویستی سینەما' },
                { level: 15, title: 'هەواداری سینەما' }, { level: 18, title: 'بینەری تایبەت' }, { level: 20, title: 'پیشەسازی ڕەخنەگر' },
                { level: 25, title: 'شارەزای فیلم' }, { level: 30, title: 'توێژەری فیلم' }, { level: 35, title: 'شارەزای سینەما' },
                { level: 40, title: 'ڕەخنەگری ئەفسانەیی' }, { level: 45, title: 'پیشەسازی سینەما' }, { level: 50, title: 'هەڵبژێردراوی KurdMDb' },
                { level: 60, title: 'شارەزای سینەما' }, { level: 75, title: 'ئەفسانەی سینەما' }, { level: 90, title: 'ئەفسانەی سینەما' },
                { level: 100, title: 'پیشەسازی گەورەی سینەما' }
            ];
            let titlesData = DEFAULT_TITLES;

            function xpForLevel(level) { return 100 * level * level; }

            function getLevelFromXP(xp) {
                let level = 1;
                while (xpForLevel(level + 1) <= xp) level++;
                return level;
            }

            function getTitleForLevel(level) {
                let best = titlesData[0] || { title: 'ئەندامی نوێ' };
                for (const t of titlesData) { if (level >= t.level) best = t; }
                return best;
            }

            function getNextTitle(level) {
                for (const t of titlesData) { if (t.level > level) return t; }
                return null;
            }

            // ─── AUTH ──────────────────────────────────────────────────────
            async function getCurrentUser() {
                if (currentUser) return currentUser;
                try {
                    if (!supabaseInitialized) initSupabase();
                    if (supabaseClient) {
                        const { data: { user }, error } = await supabaseClient.auth.getUser();
                        if (error || !user) return null;
                        const { data: profile, error: pErr } = await supabaseClient.from('profiles').select('*').eq('id',
                            user.id).single();
                        if (pErr || !profile) return null;
                        if (profile.xp === undefined || profile.xp === null) profile.xp = 0;
                        if (profile.level === undefined || profile.level === null) profile.level = 1;
                        currentUser = { ...profile, email: user.email };
                        return currentUser;
                    }
                } catch (e) { console.warn('getCurrentUser error:', e); }
                return null;
            }

            async function signIn(email, password) {
                if (!supabaseInitialized) initSupabase();
                if (!supabaseClient) throw new Error('Supabase not available.');
                const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (error) throw error;
                const { data: profile, error: pErr } = await supabaseClient.from('profiles').select('*').eq('id', data.user.id)
                    .single();
                if (pErr) throw pErr;
                if (profile.xp === undefined || profile.xp === null) profile.xp = 0;
                if (profile.level === undefined || profile.level === null) profile.level = 1;
                currentUser = { ...profile, email: data.user.email };
                trackGA('login', { method: 'email' });
                return currentUser;
            }

            async function signUp(email, password, username) {
                if (!supabaseInitialized) initSupabase();
                if (!supabaseClient) throw new Error('Supabase not available.');
                const { data, error } = await supabaseClient.auth.signUp({
                    email,
                    password,
                    options: { data: { username: username } }
                });
                if (error) throw error;
                if (!data.session) {
                    trackGA('sign_up', { method: 'email' });
                    return { pendingConfirmation: true, email, username };
                }
                const { data: profile, error: pErr } = await supabaseClient.from('profiles').select('*').eq('id', data.user.id)
                    .single();
                if (!pErr && profile) {
                    if (profile.xp === undefined || profile.xp === null) profile.xp = 0;
                    if (profile.level === undefined || profile.level === null) profile.level = 1;
                    currentUser = { ...profile, email: data.user.email };
                } else {
                    currentUser = {
                        id: data.user.id,
                        username,
                        email,
                        join_date: new Date().toISOString(),
                        xp: 0,
                        level: 1,
                        avatar_url: null,
                        role: 'user'
                    };
                    try {
                        await supabaseClient.from('profiles').upsert({
                            id: data.user.id,
                            username: username,
                            join_date: new Date().toISOString(),
                            xp: 0,
                            level: 1,
                            avatar_url: null,
                            role: 'user'
                        }, { onConflict: 'id' });
                    } catch (_) {}
                }
                trackGA('sign_up', { method: 'email' });
                return currentUser;
            }

            async function signOut() {
                if (supabaseClient) {
                    try { await supabaseClient.auth.signOut(); } catch (_) {}
                }
                currentUser = null;
                updateAllAvatars();
                trackGA('logout', {});
                goHome();
            }

            function isLoggedIn() { return !!currentUser && !!currentUser.id; }

            function updateAllAvatars() {
                const user = currentUser;
                document.querySelectorAll('.user-avatar').forEach(el => {
                    el.innerHTML = '';
                    if (user && user.avatar_url) {
                        const img = document.createElement('img');
                        img.src = sanitizeUrl(user.avatar_url);
                        img.alt = user.username || 'User';
                        el.appendChild(img);
                    } else if (user) {
                        el.textContent = (user.username || 'U').charAt(0).toUpperCase();
                    } else {
                        el.textContent = 'U';
                    }
                });
            }

            // ─── FETCH WEBSITE SETTINGS ──────────────────────────────────
            async function fetchWebsiteSettings() {
                try {
                    if (!supabaseInitialized) initSupabase();
                    if (!supabaseClient) {
                        websiteSettings = {
                            website_name: 'KurdMDb',
                            tagline: 'پلاتفۆرمێکی بینایی پێشکەوتوو.',
                            logo_url: FAVICON_URL,
                            favicon_url: FAVICON_URL,
                            facebook_url: '#',
                            instagram_url: '#',
                            tiktok_url: '#',
                            contact_email: 'contact@kurddb.com',
                            logo_size: 120
                        };
                        applySettings();
                        return websiteSettings;
                    }
                    const cached = cacheGet('website_settings');
                    if (cached) { websiteSettings = cached;
                        applySettings(); return websiteSettings; }
                    const { data, error } = await supabaseClient.from('website_settings').select('*').maybeSingle();
                    if (error) throw error;
                    if (data) websiteSettings = data;
                    else {
                        websiteSettings = {
                            website_name: 'KurdMDb',
                            tagline: 'پلاتفۆرمێکی بینایی پێشکەوتوو.',
                            logo_url: FAVICON_URL,
                            favicon_url: FAVICON_URL,
                            facebook_url: '#',
                            instagram_url: '#',
                            tiktok_url: '#',
                            contact_email: 'contact@kurddb.com',
                            logo_size: 120
                        };
                    }
                    cacheSet('website_settings', websiteSettings);
                    applySettings();
                    return websiteSettings;
                } catch (e) {
                    console.warn('Settings fetch error:', e);
                    websiteSettings = {
                        website_name: 'KurdMDb',
                        tagline: 'پلاتفۆرمێکی بینایی پێشکەوتوو.',
                        logo_url: FAVICON_URL,
                        favicon_url: FAVICON_URL,
                        facebook_url: '#',
                        instagram_url: '#',
                        tiktok_url: '#',
                        contact_email: 'contact@kurddb.com',
                        logo_size: 120
                    };
                    applySettings();
                    return websiteSettings;
                }
            }

            function applySettings() {
                const s = websiteSettings;
                const logoUrl = s.logo_url || FAVICON_URL;
                const faviconUrl = s.favicon_url || FAVICON_URL;
                document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach(el => {
                    if (el.getAttribute('rel') === 'icon' || el.getAttribute('rel') === 'shortcut icon') {
                        el.href = faviconUrl;
                    }
                });

                const heroLogo = document.getElementById('heroLogoImg');
                if (heroLogo) heroLogo.src = logoUrl;
                const glassLogo = document.getElementById('glassLogoImg');
                if (glassLogo) glassLogo.src = logoUrl;

                const aboutTitle = document.getElementById('footerAboutTitle');
                if (aboutTitle) aboutTitle.textContent = `دەربارەی ${s.website_name || 'KurdMDb'}`;
                const aboutText = document.getElementById('footerAboutText');
                if (aboutText) aboutText.textContent = s.tagline || 'پلاتفۆرمێکی بینایی پێشکەوتوو.';
                const emailEl = document.getElementById('footerEmail');
                if (emailEl) emailEl.textContent = s.contact_email || 'contact@kurddb.com';
                const copyEl = document.getElementById('footerCopyright');
                if (copyEl) {
                    copyEl.innerHTML =
                        `<span>&copy; ${new Date().getFullYear()} ${s.website_name || 'KurdMDb'}. هەموو مافەکان پارێزراون.</span>`;
                }
                const fb = document.getElementById('socialFb');
                if (fb) fb.href = sanitizeUrl(s.facebook_url || '#');
                const ig = document.getElementById('socialIg');
                if (ig) ig.href = sanitizeUrl(s.instagram_url || '#');
                const tt = document.getElementById('socialTt');
                if (tt) tt.href = sanitizeUrl(s.tiktok_url || '#');
                document.title = s.website_name || 'KurdMDb';
            }

            // ─── FETCH HERO SLIDES ────────────────────────────────────────
            async function fetchHeroSlides() {
                try {
                    if (!supabaseInitialized) initSupabase();
                    if (!supabaseClient) { allHeroSlides = []; return allHeroSlides; }
                    const cached = cacheGet('hero_slides');
                    if (cached) { allHeroSlides = cached; return allHeroSlides; }
                    const { data, error } = await supabaseClient.from('hero_slides').select('*').order('display_order',
                    { ascending: true });
                    if (error) throw error;
                    allHeroSlides = data || [];
                    cacheSet('hero_slides', allHeroSlides);
                    return allHeroSlides;
                } catch (e) { console.warn('Hero slides fetch error:', e);
                    allHeroSlides = []; return allHeroSlides; }
            }

            // ─── FETCH ADS ────────────────────────────────────────────────
            async function fetchAds() {
                try {
                    if (!supabaseInitialized) initSupabase();
                    if (!supabaseClient) { allAds = []; return allAds; }
                    const cached = cacheGet('ads');
                    if (cached) { allAds = cached; return allAds; }
                    const { data, error } = await supabaseClient.from('ads').select('*').eq('is_active', true).order('order',
                    { ascending: true });
                    if (error) throw error;
                    allAds = data || [];
                    cacheSet('ads', allAds);
                    return allAds;
                } catch (e) { console.warn('Ads fetch error:', e);
                    allAds = []; return allAds; }
            }

            // ─── FETCH WEBSITES ──────────────────────────────────────────
            async function fetchWebsites() {
                try {
                    if (!supabaseInitialized) initSupabase();
                    if (!supabaseClient) { allWebsitesData = []; return allWebsitesData; }
                    const cached = cacheGet('websites');
                    if (cached) { allWebsitesData = cached; return allWebsitesData; }
                    const { data, error } = await supabaseClient.from('websites').select('*').order('name', { ascending: true });
                    if (error) throw error;
                    allWebsitesData = data || [];
                    cacheSet('websites', allWebsitesData);
                    return allWebsitesData;
                } catch (e) { console.warn('Websites fetch error:', e);
                    allWebsitesData = []; return allWebsitesData; }
            }

            // ─── FETCH MOVIES ────────────────────────────────────────────
            async function fetchMovies() {
                try {
                    if (!supabaseInitialized) initSupabase();
                    if (!supabaseClient) { allMoviesData = []; return allMoviesData; }
                    const cached = cacheGet('movies');
                    if (cached) { allMoviesData = cached; return allMoviesData; }
                    const [genresResult, countriesResult, moviesResult] = await Promise.all([
                        supabaseClient.from('genres').select('id, name'),
                        supabaseClient.from('countries').select('id, name'),
                        supabaseClient.from('movies').select(`
                                *,
                                movie_genres(genre_id),
                                movie_countries(country_id)
                            `).order('created_at', { ascending: false })
                    ]);
                    if (genresResult.error) throw genresResult.error;
                    if (countriesResult.error) throw countriesResult.error;
                    if (moviesResult.error) throw moviesResult.error;
                    const genreMap = {};
                    genresResult.data.forEach(g => { genreMap[g.id] = g.name; });
                    const countryMap = {};
                    countriesResult.data.forEach(c => { countryMap[c.id] = c.name; });
                    allMoviesData = (moviesResult.data || []).map(m => {
                        const genres = (m.movie_genres || []).map(g => genreMap[g.genre_id]).filter(Boolean);
                        const countries = (m.movie_countries || []).map(c => countryMap[c.country_id]).filter(Boolean);
                        return {
                            ...m,
                            genres: genres,
                            countries: countries,
                            type: 'Movie',
                            language: m.language || 'English',
                            website_ids: m.website_ids || [],
                            budget: m.budget || null,
                            writer: m.writer || null,
                            director: m.director || null,
                            slug: m.slug || String(m.id),
                            views: m.views || 0,
                            voters: m.voters || 0
                        };
                    });
                    cacheSet('movies', allMoviesData);
                    return allMoviesData;
                } catch (e) { console.warn('Movies fetch error:', e);
                    allMoviesData = []; return allMoviesData; }
            }

            // ─── FETCH ANIMATIONS ────────────────────────────────────────
            async function fetchAnimations() {
                try {
                    if (!supabaseInitialized) initSupabase();
                    if (!supabaseClient) { allAnimationsData = []; return allAnimationsData; }
                    const cached = cacheGet('animations');
                    if (cached) { allAnimationsData = cached; return allAnimationsData; }
                    const [genresResult, countriesResult, animsResult] = await Promise.all([
                        supabaseClient.from('genres').select('id, name'),
                        supabaseClient.from('countries').select('id, name'),
                        supabaseClient.from('animation').select(`
                                *,
                                animation_genres(genre_id),
                                animation_countries(country_id)
                            `).order('created_at', { ascending: false })
                    ]);
                    if (genresResult.error) throw genresResult.error;
                    if (countriesResult.error) throw countriesResult.error;
                    if (animsResult.error) throw animsResult.error;
                    const genreMap = {};
                    genresResult.data.forEach(g => { genreMap[g.id] = g.name; });
                    const countryMap = {};
                    countriesResult.data.forEach(c => { countryMap[c.id] = c.name; });
                    allAnimationsData = (animsResult.data || []).map(m => {
                        const genres = (m.animation_genres || []).map(g => genreMap[g.genre_id]).filter(Boolean);
                        const countries = (m.animation_countries || []).map(c => countryMap[c.country_id]).filter(Boolean);
                        return {
                            ...m,
                            genres: genres,
                            countries: countries,
                            type: 'Animation',
                            language: m.language || 'English',
                            website_ids: m.website_ids || [],
                            budget: m.budget || null,
                            writer: m.writer || null,
                            director: m.director || null,
                            slug: m.slug || String(m.id),
                            views: m.views || 0,
                            voters: m.voters || 0
                        };
                    });
                    cacheSet('animations', allAnimationsData);
                    return allAnimationsData;
                } catch (e) { console.warn('Animations fetch error:', e);
                    allAnimationsData = []; return allAnimationsData; }
            }

            // ─── FETCH FILTER DATA ────────────────────────────────────────
            async function fetchFilterData() {
                try {
                    if (!supabaseInitialized) initSupabase();
                    if (!supabaseClient) { allGenres = [];
                        allCountries = [];
                        allYears = [];
                        allLanguages = []; return; }
                    const cached = cacheGet('filter_data');
                    if (cached) { allGenres = cached.genres;
                        allCountries = cached.countries;
                        allYears = cached.years;
                        allLanguages = cached.languages; return; }
                    const { data: genres, error: gErr } = await supabaseClient.from('genres').select('name').order('name');
                    if (!gErr && genres) allGenres = genres.map(g => g.name);
                    const { data: countries, error: cErr } = await supabaseClient.from('countries').select('name').order(
                    'name');
                    if (!cErr && countries) allCountries = countries.map(c => c.name);
                    const { data: mYears, error: yErr } = await supabaseClient.from('movies').select('release_date').not(
                        'release_date', 'is', null).order('release_date', { ascending: false });
                    let yearsSet = new Set();
                    if (!yErr && mYears) {
                        mYears.forEach(m => {
                            if (m.release_date) {
                                const y = new Date(m.release_date).getFullYear();
                                if (!isNaN(y)) yearsSet.add(String(y));
                            }
                        });
                    }
                    const { data: aYears, error: aYErr } = await supabaseClient.from('animation').select('release_date').not(
                        'release_date', 'is', null).order('release_date', { ascending: false });
                    if (!aYErr && aYears) {
                        aYears.forEach(m => {
                            if (m.release_date) {
                                const y = new Date(m.release_date).getFullYear();
                                if (!isNaN(y)) yearsSet.add(String(y));
                            }
                        });
                    }
                    allYears = yearsSet.size > 0 ? Array.from(yearsSet).sort((a, b) => Number(b) - Number(a)) : [];
                    const { data: mLang, error: mLangErr } = await supabaseClient.from('movies').select('language').not(
                        'language', 'is', null).not('language', 'eq', '');
                    const langSet = new Set();
                    if (!mLangErr && mLang) { mLang.forEach(m => { if (m.language) langSet.add(m.language); }); }
                    const { data: aLang, error: aLangErr } = await supabaseClient.from('animation').select('language').not(
                        'language', 'is', null).not('language', 'eq', '');
                    if (!aLangErr && aLang) { aLang.forEach(m => { if (m.language) langSet.add(m.language); }); }
                    allLanguages = langSet.size > 0 ? Array.from(langSet).sort() : [];
                    cacheSet('filter_data', { genres: allGenres, countries: allCountries, years: allYears, languages: allLanguages });
                } catch (e) { console.warn('Filter data fetch error:', e);
                    allGenres = [];
                    allCountries = [];
                    allYears = [];
                    allLanguages = []; }
            }

            // ─── FETCH STATISTICS ──────────────────────────────────────────
            async function fetchStatistics() {
                try {
                    if (!supabaseInitialized) initSupabase();
                    if (!supabaseClient) return;
                    const { data, error } = await supabaseClient.from('statistics').select('*').maybeSingle();
                    if (error) throw error;
                    if (data) console.log('📊 Statistics updated');
                } catch (e) { console.warn('Statistics fetch error:', e); }
            }

            // ─── RECOMMENDATION ENGINE ────────────────────────────────────
            async function fetchContentStats() {
                if (!supabaseClient) return {};
                const cacheKey = 'content_stats';
                const cached = cacheGet(cacheKey);
                if (cached) return cached;
                try {
                    const { data: wlData, error: wlErr } = await supabaseClient
                        .from('watchlists')
                        .select('content_id, content_type')
                        .not('content_id', 'is', null);
                    const wlCounts = {};
                    if (!wlErr && wlData) {
                        wlData.forEach(r => {
                            const key = r.content_id + '|' + (r.content_type || '');
                            wlCounts[key] = (wlCounts[key] || 0) + 1;
                        });
                    }
                    const { data: cmData, error: cmErr } = await supabaseClient
                        .from('comments')
                        .select('content_id, content_type')
                        .not('content_id', 'is', null);
                    const cmCounts = {};
                    if (!cmErr && cmData) {
                        cmData.forEach(r => {
                            const key = r.content_id + '|' + (r.content_type || '');
                            cmCounts[key] = (cmCounts[key] || 0) + 1;
                        });
                    }
                    const result = { wlCounts, cmCounts };
                    cacheSet(cacheKey, result);
                    return result;
                } catch (e) {
                    console.warn('Failed to fetch content stats:', e);
                    return { wlCounts: {}, cmCounts: {} };
                }
            }

            async function getSmartRecommendations(limit = 12) {
                const allItems = [...allMoviesData, ...allAnimationsData];
                if (allItems.length === 0) return [];
                const stats = await fetchContentStats();
                const { wlCounts, cmCounts } = stats;
                let maxViews = 0,
                    maxRating = 0,
                    maxWl = 0,
                    maxCm = 0;
                const scored = allItems.map(item => {
                    const views = item.views || 0;
                    const rating = item.rating || item.kurddb_rating || 0;
                    const key = item.id + '|' + (item.type || '');
                    const wl = wlCounts[key] || 0;
                    const cm = cmCounts[key] || 0;
                    if (views > maxViews) maxViews = views;
                    if (rating > maxRating) maxRating = rating;
                    if (wl > maxWl) maxWl = wl;
                    if (cm > maxCm) maxCm = cm;
                    return { ...item, views, rating, wl, cm };
                });
                if (maxViews === 0 && maxRating === 0 && maxWl === 0 && maxCm === 0) {
                    return scored.sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, limit);
                }
                const scoredNorm = scored.map(item => {
                    const v = maxViews > 0 ? item.views / maxViews : 0;
                    const r = maxRating > 0 ? item.rating / maxRating : 0;
                    const w = maxWl > 0 ? item.wl / maxWl : 0;
                    const c = maxCm > 0 ? item.cm / maxCm : 0;
                    const score = v * 0.25 + r * 0.30 + w * 0.25 + c * 0.20;
                    return { ...item, score };
                });
                scoredNorm.sort((a, b) => (b.score || 0) - (a.score || 0));
                return scoredNorm.slice(0, limit);
            }

            function getRecommendations(method = 'trending', limit = 12) {
                const allItems = [...allMoviesData, ...allAnimationsData];
                let result = [];
                switch (method) {
                    case 'smart':
                        return [];
                    case 'trending':
                        result = [...allItems].sort((a, b) => {
                            const scoreA = (a.views || 0) * 0.4 + (a.rating || 0) * 0.6;
                            const scoreB = (b.views || 0) * 0.4 + (b.rating || 0) * 0.6;
                            return scoreB - scoreA;
                        });
                        break;
                    case 'top_rated':
                        result = [...allItems].sort((a, b) => (b.rating || b.kurddb_rating || 0) - (a.rating || a
                            .kurddb_rating || 0));
                        break;
                    case 'newest':
                        result = [...allItems].sort((a, b) => {
                            const da = a.release_date ? new Date(a.release_date) : new Date(0);
                            const db = b.release_date ? new Date(b.release_date) : new Date(0);
                            return db - da;
                        });
                        break;
                    case 'popular':
                        result = [...allItems].sort((a, b) => (b.views || 0) - (a.views || 0));
                        break;
                    case 'random':
                        result = [...allItems];
                        for (let i = result.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [result[i], result[j]] = [result[j], result[i]];
                        }
                        break;
                    default:
                        result = [...allItems].sort((a, b) => (b.rating || b.kurddb_rating || 0) - (a.rating || a
                            .kurddb_rating || 0));
                }
                const seen = new Set();
                result = result.filter(item => {
                    if (seen.has(item.id)) return false;
                    seen.add(item.id);
                    return true;
                });
                return result.slice(0, limit);
            }

