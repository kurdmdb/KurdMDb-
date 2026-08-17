// ============================================================
// KurdMDb — app.js
// ------------------------------------------------------------
// Everything that renders and drives the UI: the recommendation
// renderer, hero/ads/cards, trending/popular/top-rated/new-
// releases sections, the works grid & filters, collections UI,
// navigation & routing, the search box, profile & auth modals,
// XP display, rankings, leaderboard, and the app's main init()
// that wires it all together and kicks the app off.
//
// IMPORTANT — load order:
// This file depends on everything declared in api.js (state
// variables like currentUser/supabaseClient/allMoviesData and
// functions like fetchMovies/initSupabase/addXP/etc.), so
// index.html MUST include:
//   <script src="api.js"></script>
//   <script src="app.js"></script>
// in that order, with neither file using type="module" or an
// IIFE wrapper, so both share one global scope — same as the
// original single-file <script> block. This is a straight code
// split: no runtime behavior has changed.
// ============================================================

            // ─── RENDER RECOMMENDATIONS ──────────────────────────────────
            async function renderRecommendations(method = 'smart') {
                const wrapper = document.getElementById('recommendationsWrapper');
                if (!wrapper) return;
                let items = [];
                if (method === 'smart') {
                    items = await getSmartRecommendations(12);
                    if (!items || items.length === 0) items = getRecommendations('trending', 12);
                } else {
                    items = getRecommendations(method, 12);
                }
                wrapper.innerHTML = '';
                if (!items || items.length === 0) {
                    wrapper.innerHTML = '<div class="p-4 text-white/50 text-center">هیچ پێشنیارێک نیە. تکایە دواتر بپشکنە.</div>';
                    return;
                }
                items.forEach(item => {
                    const slide = document.createElement('div');
                    slide.className = 'swiper-slide';
                    const rating = item.rating || item.kurddb_rating || 0;
                    const year = item.release_date ? new Date(item.release_date).getFullYear() : 'N/A';
                    const poster = item.poster_url || '';
                    const title = sanitizeText(item.title || 'Untitled');
                    const genres = item.genres || [];
                    const genreStr = Array.isArray(genres) ? genres.slice(0, 1).join(', ') : '';
                    const views = item.views || 0;
                    const wl = item.wl || 0;
                    const cm = item.cm || 0;
                    const type = item.type === 'Animation' ? 'animation' : 'movie';
                    const slug = item.slug || item.id;
                    let badgeText = 'پێشنیار';
                    if (method === 'smart') badgeText = '✨ زیرەک';
                    else if (method === 'trending') badgeText = '🔥 بەرز';
                    else if (method === 'top_rated') badgeText = '⭐ پلەبەرز';
                    else if (method === 'newest') badgeText = '🆕 نوێ';
                    else if (method === 'popular') badgeText = '👑 بەناوبانگ';
                    else if (method === 'random') badgeText = '🎲 هەڕەمەکی';

                    let topBadge = '';
                    if (isTop250(item)) {
                        const rank = getTop250Rank(item);
                        topBadge =
                            `<div class="top250-badge" style="top:50px; right:10px; font-size:0.5rem; padding:2px 8px;">🏆 #${rank}</div>`;
                    }

                    slide.innerHTML = sanitizeHTML(`
                            <div class="rec-card-new" onclick="showDetail('${sanitizeText(slug)}', '${sanitizeText(type)}')">
                                <div class="rec-poster-wrap">
                                    ${poster ? `<img src="${sanitizeUrl(poster)}" alt="${title}" loading="lazy" onerror="this.style.display='none'" />` : '<div class="w-full h-full bg-gray-800 flex items-center justify-center text-white/20">No Poster</div>'}
                                    <div class="rec-poster-overlay"></div>
                                    <span class="rec-badge-top">${badgeText}</span>
                                    ${topBadge}
                                    <div class="rec-stats">
                                        <span class="stat-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg><span class="num">${views}</span></span>
                                        <span class="stat-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg><span class="num">${wl}</span></span>
                                        <span class="stat-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg><span class="num">${cm}</span></span>
                                    </div>
                                </div>
                                <div class="rec-info-new">
                                    <div class="title">${title}</div>
                                    <div class="sub-meta">
                                        <span class="rating">★ ${typeof rating === 'number' ? rating.toFixed(1) : '0.0'}</span>
                                        <span>${year}</span>
                                        ${genreStr ? `<span class="genre">${sanitizeText(genreStr)}</span>` : ''}
                                    </div>
                                </div>
                            </div>
                        `);
                    wrapper.appendChild(slide);
                });
                if (document.querySelector('#recommendationsSwiper')) {
                    const existing = swiperInstances.find(s => s.el && s.el.id === 'recommendationsSwiper');
                    if (existing) existing.destroy(true, true);
                    const sw = new Swiper('#recommendationsSwiper', {
                        slidesPerView: 1.15,
                        spaceBetween: 20,
                        loop: items.length > 3,
                        speed: 700,
                        autoplay: { delay: 4000 },
                        touchAngle: 25,
                        threshold: 8,
                        touchStartPreventDefault: false,
                        breakpoints: { 640: { slidesPerView: 2.2, spaceBetween: 24 }, 1024: { slidesPerView: 3.5,
                                spaceBetween: 28 }, 1280: { slidesPerView: 4.2, spaceBetween: 32 } },
                        grabCursor: true
                    });
                    swiperInstances.push(sw);
                }
            }

            // ─── RENDER HERO ───────────────────────────────────────────────
            function renderHero(slides) {
                const wrapper = document.getElementById('swiperWrapper');
                if (!wrapper) return;
                wrapper.innerHTML = '';
                if (!slides || slides.length === 0) {
                    wrapper.innerHTML =
                        '<div class="swiper-slide"><div class="slide-backdrop" style="background-image:url(\'https://picsum.photos/seed/hero1/1920/1080\')"></div><div class="slide-overlay overlay-vignette"></div><div class="slide-overlay overlay-bottom"></div><div class="slide-overlay overlay-right hidden md:block"></div><div class="relative z-10 h-full w-full flex items-end md:items-center justify-start pb-20 md:pb-0 px-5 sm:px-8 md:px-12 lg:px-16 xl:px-20 mt-16 md:mt-0"><div class="glass-card p-5 sm:p-6 md:p-8 lg:p-10 w-full max-w-lg md:max-w-xl lg:max-w-2xl"><h1 class="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-cinematic font-bold tracking-wide leading-tight mb-2 text-white">بەخێربێیت بۆ KurdMDb</h1><p class="text-sm sm:text-base md:text-lg italic opacity-75 mb-3 text-purple-200">باشترین فیلم و ئەنیمەیشنەکان بدۆزەوە</p><div class="flex flex-wrap gap-3 mt-4"><button class="btn-primary" onclick="goHome();showWorks();"><span>گەڕان</span></button></div></div></div></div>';
                } else {
                    slides.forEach((slide, idx) => {
                        const div = document.createElement('div');
                        div.className = 'swiper-slide';
                        const bg = slide.hero_background || 'https://picsum.photos/seed/hero' + (idx + 1) +
                            '/1920/1080';
                        const title = sanitizeText(slide.hero_title || 'بەخێربێیت بۆ KurdMDb');
                        const subtitle = sanitizeText(slide.hero_subtitle || 'باشترین فیلم و ئەنیمەیشنەکان بدۆزەوە');
                        const btnText = sanitizeText(slide.hero_button_text || 'گەڕان');
                        div.innerHTML = sanitizeHTML(`
                                <div class="slide-backdrop" style="background-image:url('${sanitizeUrl(bg)}')"></div>
                                <div class="slide-overlay overlay-vignette"></div>
                                <div class="slide-overlay overlay-bottom"></div>
                                <div class="slide-overlay overlay-right hidden md:block"></div>
                                <div class="relative z-10 h-full w-full flex items-end md:items-center justify-start pb-20 md:pb-0 px-5 sm:px-8 md:px-12 lg:px-16 xl:px-20 mt-16 md:mt-0">
                                    <div class="glass-card p-5 sm:p-6 md:p-8 lg:p-10 w-full max-w-lg md:max-w-xl lg:max-w-2xl" data-anim="glass-card">
                                        <h1 class="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-cinematic font-bold tracking-wide leading-tight mb-2 text-white">${title}</h1>
                                        <p class="text-sm sm:text-base md:text-lg italic opacity-75 mb-3 text-purple-200">${subtitle}</p>
                                        <div class="flex flex-wrap gap-3 mt-4">
                                            <button class="btn-primary" onclick="goHome();showWorks();">
                                                <span>${btnText}</span>
                                            </button>
                                            ${slide.hero_trailer ? `<button class="btn-secondary" onclick="window.open('${sanitizeUrl(slide.hero_trailer)}','_blank')"><span>بینینی ترەیلەر</span></button>` : ''}
                                        </div>
                                    </div>
                                </div>
                            `);
                        wrapper.appendChild(div);
                    });
                }
                if (window.swiperInstances) { swiperInstances.forEach(s => s.destroy(true, true));
                    swiperInstances = []; }
                const heroSwiper = new Swiper('#heroSwiper', {
                    effect: 'fade',
                    fadeEffect: { crossFade: true },
                    loop: slides.length > 1,
                    speed: 900,
                    autoplay: { delay: 5500 },
                    touchAngle: 25,
                    threshold: 8,
                    touchStartPreventDefault: false,
                    grabCursor: true,
                    on: {
                        init: function() { animateHeroSlide(this); },
                        slideChangeTransitionEnd: function() { animateHeroSlide(this); }
                    }
                });
                swiperInstances.push(heroSwiper);

                function animateHeroSlide(sw) {
                    const active = sw.slides[sw.activeIndex];
                    if (!active) return;
                    const els = active.querySelectorAll('[data-anim]');
                    els.forEach(el => gsap.set(el, { opacity: 0, y: 15 }));
                    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
                    els.forEach((el, i) => tl.to(el, { opacity: 1, y: 0, duration: 0.5, delay: i * 0.08 }, i * 0.05));
                }
            }

            // ─── RENDER ADS ────────────────────────────────────────────────
            function renderAds(ads) {
                const wrapper = document.getElementById('adsWrapper');
                if (!wrapper) return;
                wrapper.innerHTML = '';
                if (!ads || ads.length === 0) { wrapper.style.display = 'none'; return; }
                wrapper.style.display = '';
                ads.forEach(ad => {
                    const slide = document.createElement('div');
                    slide.className = 'swiper-slide';
                    const link = sanitizeUrl(ad.link || '#');
                    const image = sanitizeUrl(ad.image_url || '');
                    const title = sanitizeText(ad.title || 'Reklam');
                    const mediaType = ad.media_type || 'image';
                    const mediaUrl = sanitizeUrl(ad.media_url || image);
                    let contentHTML = '';
                    if (mediaType === 'video' && mediaUrl) {
                        const isEmbed = mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') || mediaUrl.includes(
                            'vimeo.com');
                        if (isEmbed) {
                            contentHTML = `
                                <div class="ad-container block w-full rounded-xl overflow-hidden shadow-lg border border-white/10 transition-transform hover:scale-[1.02]">
                                    <div class="ad-video">
                                        <iframe src="${mediaUrl}" allowfullscreen loading="lazy" allow="autoplay; encrypted-media"></iframe>
                                    </div>
                                    ${title ? `<div class="p-2 text-center text-white/60 text-sm safe-text">${title}</div>` : ''}
                                </div>
                            `;
                        } else {
                            contentHTML = `
                                <div class="ad-container block w-full rounded-xl overflow-hidden shadow-lg border border-white/10 transition-transform hover:scale-[1.02]">
                                    <div class="ad-video">
                                        <video src="${mediaUrl}" autoplay loop muted playsinline preload="metadata"></video>
                                    </div>
                                    ${title ? `<div class="p-2 text-center text-white/60 text-sm safe-text">${title}</div>` : ''}
                                </div>
                            `;
                        }
                    } else {
                        contentHTML = `
                            <a href="${link}" target="_blank" class="block w-full rounded-xl overflow-hidden shadow-lg border border-white/10 transition-transform hover:scale-[1.02]">
                                ${image ? `<img src="${image}" alt="${title}" class="w-full h-auto max-h-[200px] object-cover" loading="lazy" />` : `<div class="bg-purple-900/30 p-8 text-center text-white/60 safe-text">${title}</div>`}
                            </a>
                        `;
                    }
                    slide.innerHTML = sanitizeHTML(contentHTML);
                    wrapper.appendChild(slide);
                });
                if (document.querySelector('#adsSwiper')) {
                    const existing = swiperInstances.find(s => s.el && s.el.id === 'adsSwiper');
                    if (existing) existing.destroy(true, true);
                    const sw = new Swiper('#adsSwiper', {
                        slidesPerView: 1,
                        spaceBetween: 20,
                        loop: ads.length > 1,
                        speed: 600,
                        autoplay: { delay: 4000 },
                        touchAngle: 25,
                        threshold: 8,
                        touchStartPreventDefault: false,
                        breakpoints: { 640: { slidesPerView: 2, spaceBetween: 24 }, 1024: { slidesPerView: 3,
                                spaceBetween: 28 } },
                        grabCursor: true
                    });
                    swiperInstances.push(sw);
                    sw.on('slideChange', function() {
                        document.querySelectorAll('.ad-video video').forEach(v => v.pause());
                        setTimeout(() => {
                            const activeSlide = sw.slides[sw.activeIndex];
                            if (activeSlide) {
                                const video = activeSlide.querySelector('.ad-video video');
                                if (video) video.play().catch(() => {});
                            }
                        }, 300);
                    });
                    setTimeout(() => {
                        const activeSlide = sw.slides[sw.activeIndex];
                        if (activeSlide) {
                            const video = activeSlide.querySelector('.ad-video video');
                            if (video) video.play().catch(() => {});
                        }
                    }, 500);
                }
            }

            // ─── CREATE CARD HTML ──────────────────────────────────────────
            function createCardHTML(item, type = 'movie') {
                const rating = item.rating || item.kurddb_rating || 0;
                const year = item.release_date ? new Date(item.release_date).getFullYear() : 'N/A';
                const poster = item.poster_url || '';
                const title = sanitizeText(item.title || 'Untitled');
                const genres = item.genres || [];
                const genreStr = Array.isArray(genres) ? genres.slice(0, 2).map(sanitizeText).join(', ') : '';
                const slug = sanitizeText(item.slug || item.id);

                let topBadge = '';
                if (isTop250(item)) {
                    const rank = getTop250Rank(item);
                    topBadge = `<div class="top250-badge top250-badge-sm">🏆 #${rank}</div>`;
                }

                return `
                        <div class="kurd-card" onclick="showDetail('${slug}', '${sanitizeText(type)}')">
                            <div class="kurd-poster" style="height:320px; position:relative;">
                                ${poster ? `<img src="${sanitizeUrl(poster)}" alt="${title}" loading="lazy" onerror="this.style.display='none'" />` : '<div class="w-full h-full bg-gray-800 flex items-center justify-center text-white/20">No Poster</div>'}
                                ${topBadge}
                            </div>
                            <div class="kurd-info">
                                <h3 class="kurd-title safe-text">${title}</h3>
                                <div class="kurd-meta">
                                    <span class="rating-badge" style="padding:2px 10px; font-size:0.7rem;">
                                        <span class="rating-star">★</span>${typeof rating === 'number' ? rating.toFixed(1) : '0.0'}
                                    </span>
                                    <span>${year}</span>
                                    ${genreStr ? `<span class="genre-tag" style="padding:2px 8px; font-size:0.65rem;">${genreStr}</span>` : ''}
                                </div>
                            </div>
                        </div>
                    `;
            }

            function createPopularCardHTML(item, type = 'movie') {
                const poster = item.poster_url || '';
                const title = sanitizeText(item.title || 'Untitled');
                const slug = sanitizeText(item.slug || item.id);
                const rating = item.rating || item.kurddb_rating || 0;
                const views = item.views || 0;
                const year = item.release_date ? new Date(item.release_date).getFullYear() : 'N/A';

                let topBadge = '';
                if (isTop250(item)) {
                    const rank = getTop250Rank(item);
                    topBadge =
                        `<div class="top250-badge top250-badge-sm" style="top:8px; right:8px; font-size:0.5rem; padding:2px 8px;">🏆 #${rank}</div>`;
                }

                return `
                        <div class="popular-card" onclick="showDetail('${slug}', '${sanitizeText(type)}')">
                            <div class="popular-poster" style="height:240px; position:relative;">
                                ${poster ? `<img src="${sanitizeUrl(poster)}" alt="${title}" loading="lazy" onerror="this.style.display='none'" />` : '<div class="w-full h-full bg-gray-800 flex items-center justify-center text-white/20">No Poster</div>'}
                                ${topBadge}
                                <div class="rating-overlay">
                                    <span class="star">★ ${typeof rating === 'number' ? rating.toFixed(1) : '0.0'}</span>
                                    <span class="views">${iconEye} ${views}</span>
                                    <span class="year">${year}</span>
                                </div>
                            </div>
                            <h3 class="popular-title safe-text">${title}</h3>
                        </div>
                    `;
            }

            const iconEye =
                `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

            function createNRCardHTML(item, type = 'movie') {
                const rating = item.rating || item.kurddb_rating || 0;
                const year = item.release_date ? new Date(item.release_date).getFullYear() : 'N/A';
                const poster = item.poster_url || '';
                const title = sanitizeText(item.title || 'Untitled');
                const slug = sanitizeText(item.slug || item.id);

                let topBadge = '';
                if (isTop250(item)) {
                    const rank = getTop250Rank(item);
                    topBadge =
                        `<div class="top250-badge top250-badge-sm" style="top:8px; right:8px; font-size:0.5rem; padding:2px 8px;">🏆 #${rank}</div>`;
                }

                return `
                        <div class="nr-card" onclick="showDetail('${slug}', '${sanitizeText(type)}')">
                            <div class="nr-poster-wrap" style="height:320px; position:relative;">
                                ${poster ? `<img src="${sanitizeUrl(poster)}" alt="${title}" loading="lazy" onerror="this.style.display='none'" />` : '<div class="w-full h-full bg-gray-800 flex items-center justify-center text-white/20">No Poster</div>'}
                                ${topBadge}
                                <div class="nr-overlay"></div>
                            </div>
                            <div class="nr-info">
                                <span class="nr-title safe-text">${title}</span>
                                <span class="nr-meta">
                                    <span style="color:#FBBF24;">★ ${typeof rating === 'number' ? rating.toFixed(1) : '0.0'}</span>
                                    <span>${year}</span>
                                </span>
                            </div>
                        </div>
                    `;
            }

            // ─── RENDER TRENDING ────────────────────────────────────────────
            function renderTrending(items) {
                const wrapper = document.getElementById('trendingWrapper');
                if (!wrapper) return;
                wrapper.innerHTML = '';
                if (!items || items.length === 0) {
                    wrapper.innerHTML = '<div class="p-4 text-white/50">هیچ ناوەڕۆکێکی بەرز نیە. تکایە دواتر بپشکنە.</div>';
                    return;
                }
                const sorted = [...items].sort((a, b) => {
                    const scoreA = (a.views || 0) * 0.4 + (a.rating || 0) * 0.6;
                    const scoreB = (b.views || 0) * 0.4 + (b.rating || 0) * 0.6;
                    return scoreB - scoreA;
                });
                sorted.slice(0, 12).forEach(item => {
                    const slide = document.createElement('div');
                    slide.className = 'swiper-slide';
                    const type = item.type === 'Animation' ? 'animation' : 'movie';
                    slide.innerHTML = sanitizeHTML(createCardHTML(item, type));
                    wrapper.appendChild(slide);
                });
                if (document.querySelector('#trendingSwiper')) {
                    const existing = swiperInstances.find(s => s.el && s.el.id === 'trendingSwiper');
                    if (existing) existing.destroy(true, true);
                    const sw = new Swiper('#trendingSwiper', {
                        slidesPerView: 1.15,
                        spaceBetween: 20,
                        loop: sorted.length > 3,
                        speed: 700,
                        autoplay: { delay: 4000 },
                        touchAngle: 25,
                        threshold: 8,
                        touchStartPreventDefault: false,
                        breakpoints: { 640: { slidesPerView: 2.2, spaceBetween: 24 }, 1024: { slidesPerView: 3.5,
                                spaceBetween: 28 }, 1280: { slidesPerView: 4.2, spaceBetween: 32 } },
                        grabCursor: true
                    });
                    swiperInstances.push(sw);
                }
            }

            // ─── RENDER POPULAR ──────────────────────────────────────────
            function renderPopular(items) {
                const grid = document.getElementById('popularGrid');
                if (!grid) return;
                grid.innerHTML = '';
                if (!items || items.length === 0) {
                    grid.innerHTML =
                        '<div class="col-span-full text-white/50 text-center py-10">هیچ ناوەڕۆکێکی بەناوبانگ نیە. تکایە دواتر بپشکنە.</div>';
                    return;
                }
                const sorted = [...items].sort((a, b) => {
                    const da = a.release_date ? new Date(a.release_date) : new Date(0);
                    const db = b.release_date ? new Date(b.release_date) : new Date(0);
                    return db - da;
                });
                sorted.slice(0, 8).forEach(item => {
                    const div = document.createElement('div');
                    const type = item.type === 'Animation' ? 'animation' : 'movie';
                    div.innerHTML = sanitizeHTML(createPopularCardHTML(item, type));
                    grid.appendChild(div.firstElementChild);
                });
            }

            // ─── RENDER TOP RATED ──────────────────────────────────────────
            function renderTopRatedMovies(items) {
                const wrapper = document.getElementById('topRatedMoviesWrapper');
                if (!wrapper) return;
                wrapper.innerHTML = '';
                const movies = items.filter(i => i.type === 'Movie' || i.type === 'movie').sort((a, b) => (b.rating || b
                    .kurddb_rating || 0) - (a.rating || a.kurddb_rating || 0));
                movies.slice(0, 8).forEach(item => {
                    const slide = document.createElement('div');
                    slide.className = 'swiper-slide';
                    slide.innerHTML = sanitizeHTML(createCardHTML(item, 'movie'));
                    wrapper.appendChild(slide);
                });
                if (document.querySelector('#topRatedMoviesSwiper')) {
                    const existing = swiperInstances.find(s => s.el && s.el.id === 'topRatedMoviesSwiper');
                    if (existing) existing.destroy(true, true);
                    const sw = new Swiper('#topRatedMoviesSwiper', {
                        slidesPerView: 1.15,
                        spaceBetween: 20,
                        loop: movies.length > 3,
                        speed: 700,
                        autoplay: { delay: 4500 },
                        touchAngle: 25,
                        threshold: 8,
                        touchStartPreventDefault: false,
                        breakpoints: { 640: { slidesPerView: 2.2, spaceBetween: 24 }, 1024: { slidesPerView: 3.5,
                                spaceBetween: 28 }, 1280: { slidesPerView: 4.2, spaceBetween: 32 } },
                        grabCursor: true
                    });
                    swiperInstances.push(sw);
                }
            }

            function renderTopRatedAnimation(items) {
                const wrapper = document.getElementById('topRatedAnimationWrapper');
                if (!wrapper) return;
                wrapper.innerHTML = '';
                const anims = items.filter(i => i.type === 'Animation' || i.type === 'animation').sort((a, b) => (b.rating || b
                    .kurddb_rating || 0) - (a.rating || a.kurddb_rating || 0));
                anims.slice(0, 8).forEach(item => {
                    const slide = document.createElement('div');
                    slide.className = 'swiper-slide';
                    slide.innerHTML = sanitizeHTML(createCardHTML(item, 'animation'));
                    wrapper.appendChild(slide);
                });
                if (document.querySelector('#topRatedAnimationSwiper')) {
                    const existing = swiperInstances.find(s => s.el && s.el.id === 'topRatedAnimationSwiper');
                    if (existing) existing.destroy(true, true);
                    const sw = new Swiper('#topRatedAnimationSwiper', {
                        slidesPerView: 1.15,
                        spaceBetween: 20,
                        loop: anims.length > 3,
                        speed: 700,
                        autoplay: { delay: 4500 },
                        touchAngle: 25,
                        threshold: 8,
                        touchStartPreventDefault: false,
                        breakpoints: { 640: { slidesPerView: 2.2, spaceBetween: 24 }, 1024: { slidesPerView: 3.5,
                                spaceBetween: 28 }, 1280: { slidesPerView: 4.2, spaceBetween: 32 } },
                        grabCursor: true
                    });
                    swiperInstances.push(sw);
                }
            }

            // ─── RENDER NEW RELEASES ───────────────────────────────────────
            function renderNewReleases(items) {
                const wrapper = document.getElementById('newReleasesWrapper');
                if (!wrapper) return;
                wrapper.innerHTML = '';
                const sorted = [...items].sort((a, b) => {
                    const da = a.release_date ? new Date(a.release_date) : new Date(0);
                    const db = b.release_date ? new Date(b.release_date) : new Date(0);
                    return db - da;
                });
                sorted.slice(0, 10).forEach(item => {
                    const slide = document.createElement('div');
                    slide.className = 'swiper-slide';
                    const type = item.type === 'Animation' ? 'animation' : 'movie';
                    slide.innerHTML = sanitizeHTML(createNRCardHTML(item, type));
                    wrapper.appendChild(slide);
                });
                if (document.querySelector('#newReleasesSwiper')) {
                    const existing = swiperInstances.find(s => s.el && s.el.id === 'newReleasesSwiper');
                    if (existing) existing.destroy(true, true);
                    const sw = new Swiper('#newReleasesSwiper', {
                        slidesPerView: 1.2,
                        spaceBetween: 24,
                        loop: sorted.length > 3,
                        speed: 600,
                        touchAngle: 25,
                        threshold: 8,
                        touchStartPreventDefault: false,
                        breakpoints: { 640: { slidesPerView: 2.3, spaceBetween: 24 }, 1024: { slidesPerView: 3.5,
                                spaceBetween: 28 }, 1280: { slidesPerView: 4.5, spaceBetween: 32 } },
                        grabCursor: true
                    });
                    swiperInstances.push(sw);
                }
            }

            // ─── RENDER RECENT MOVIES BY COUNTRY ──────────────────────────
            function renderRecentMoviesByCountry() {
                const container = document.getElementById('recentByCountryContainer');
                if (!container) return;
                container.innerHTML = '';

                const movies = allMoviesData.filter(m => m.type === 'Movie' || m.type === 'movie');
                const countryMap = new Map();
                movies.forEach(m => {
                    const countries = Array.isArray(m.countries) ? m.countries : [];
                    countries.forEach(c => {
                        if (!countryMap.has(c)) countryMap.set(c, []);
                        countryMap.get(c).push(m);
                    });
                });

                const sortedCountries = Array.from(countryMap.keys()).sort((a, b) => {
                    const moviesA = countryMap.get(a);
                    const moviesB = countryMap.get(b);
                    const latestA = moviesA.reduce((max, m) => {
                        const d = m.release_date ? new Date(m.release_date) : new Date(0);
                        return d > max ? d : max;
                    }, new Date(0));
                    const latestB = moviesB.reduce((max, m) => {
                        const d = m.release_date ? new Date(m.release_date) : new Date(0);
                        return d > max ? d : max;
                    }, new Date(0));
                    return latestB - latestA;
                });

                sortedCountries.forEach(country => {
                    const items = countryMap.get(country)
                        .filter(m => m.release_date)
                        .sort((a, b) => new Date(b.release_date) - new Date(a.release_date))
                        .slice(0, 8);

                    if (items.length === 0) return;

                    const section = document.createElement('div');
                    section.className = 'mb-12';

                    const title = document.createElement('h3');
                    title.className = 'country-section-title';
                    title.textContent = sanitizeText(country);
                    section.appendChild(title);

                    const scrollDiv = document.createElement('div');
                    scrollDiv.className = 'country-scroll-container';

                    items.forEach(item => {
                        const cardDiv = document.createElement('div');
                        cardDiv.className = 'swiper-slide';
                        const type = 'movie';
                        cardDiv.innerHTML = sanitizeHTML(createCardHTML(item, type));
                        const card = cardDiv.firstElementChild;
                        if (card) {
                            scrollDiv.appendChild(card);
                        } else {
                            const fallback = document.createElement('div');
                            fallback.innerHTML = sanitizeHTML(createCardHTML(item, type));
                            scrollDiv.appendChild(fallback.firstElementChild);
                        }
                    });

                    section.appendChild(scrollDiv);
                    container.appendChild(section);
                });

                if (sortedCountries.length === 0) {
                    container.innerHTML = '<p class="text-white/40 text-center py-6">هیچ فیلمێک بەپێی وڵات نەدۆزرایەوە.</p>';
                }
            }

            // ─── RENDER WORKS GRID ─────────────────────────────────────────
            function renderWorksGrid(items, page = 1) {
                const grid = document.getElementById('worksGrid');
                if (!grid) return;
                grid.innerHTML = '';
                if (!items || items.length === 0) {
                    grid.innerHTML =
                        '<div class="col-span-full text-white/50 text-center py-20">هیچ ناوەڕۆکێک نیە. تکایە دواتر بپشکنە.</div>';
                    document.getElementById('pagination').innerHTML = '';
                    return;
                }
                const start = (page - 1) * itemsPerPage;
                const pageItems = items.slice(start, start + itemsPerPage);
                pageItems.forEach(item => {
                    const card = document.createElement('div');
                    card.className = 'works-card';
                    const rating = item.rating || item.kurddb_rating || 0;
                    const year = item.release_date ? new Date(item.release_date).getFullYear() : 'N/A';
                    const poster = item.poster_url || '';
                    const title = sanitizeText(item.title || 'Untitled');
                    const slug = sanitizeText(item.slug || item.id);
                    const type = item.type === 'Animation' ? 'animation' : 'movie';

                    let topBadge = '';
                    if (isTop250(item)) {
                        const rank = getTop250Rank(item);
                        topBadge =
                            `<div class="top250-badge top250-badge-sm" style="top:8px; right:8px; font-size:0.5rem; padding:2px 8px;">🏆 #${rank}</div>`;
                    }

                    card.innerHTML = sanitizeHTML(`
                            <div class="works-poster" style="height:240px; position:relative;">
                                ${poster ? `<img src="${sanitizeUrl(poster)}" alt="${title}" loading="lazy" onerror="this.style.display='none'" />` : '<div class="w-full h-full bg-gray-800 flex items-center justify-center text-white/20">No Poster</div>'}
                                ${topBadge}
                                <div class="rating-overlay">
                                    <span class="star">★ ${typeof rating === 'number' ? rating.toFixed(1) : '0.0'}</span>
                                    <span class="year">${year}</span>
                                </div>
                            </div>
                            <div class="works-title safe-text">${title}</div>
                        `);
                    card.addEventListener('click', () => showDetail(slug, type));
                    grid.appendChild(card);
                });

                const totalPages = Math.ceil(items.length / itemsPerPage);
                const pagDiv = document.getElementById('pagination');
                if (!pagDiv) return;
                pagDiv.innerHTML = '';
                if (totalPages <= 1) return;

                const range = getPaginationRange(page, totalPages, 2);
                range.forEach(val => {
                    if (val === '…') {
                        const span = document.createElement('span');
                        span.className = 'page-btn-dots';
                        span.textContent = '…';
                        pagDiv.appendChild(span);
                    } else {
                        const btn = document.createElement('button');
                        btn.className = 'page-btn' + (val === page ? ' active' : '');
                        btn.textContent = val;
                        btn.addEventListener('click', () => { currentPage = val;
                            renderWorksGrid(items, val);
                            window.scrollTo({ top: 0, behavior: 'smooth' }); });
                        pagDiv.appendChild(btn);
                    }
                });
            }

            // ─── FILTER LOGIC ──────────────────────────────────────────────
            function getFilteredItems() {
                let allItems = [...allMoviesData, ...allAnimationsData];
                const tab = currentWorksTab;
                if (tab === 'movies') allItems = allItems.filter(i => i.type === 'Movie' || i.type === 'movie');
                else allItems = allItems.filter(i => i.type === 'Animation' || i.type === 'animation');
                const country = document.getElementById('filterCountry')?.value || '';
                const genre = document.getElementById('filterGenre')?.value || '';
                const year = document.getElementById('filterYear')?.value || '';
                const language = document.getElementById('filterLanguage')?.value || '';
                const ratingMin = document.getElementById('filterRating')?.value || '';
                const sort = document.getElementById('filterSort')?.value || 'popularity';
                if (country) allItems = allItems.filter(i => { const c = i.countries || []; return Array.isArray(c) ? c
                        .includes(country) : c === country; });
                if (genre) allItems = allItems.filter(i => { const g = i.genres || []; return Array.isArray(g) ? g.includes(
                        genre) : g === genre; });
                if (year) {
                    if (year === 'older') allItems = allItems.filter(i => { const y = i.release_date ? new Date(i
                            .release_date).getFullYear() : 0; return y < 2023; });
                    else allItems = allItems.filter(i => { const y = i.release_date ? new Date(i.release_date).getFullYear() :
                            0; return String(y) === year; });
                }
                if (language) allItems = allItems.filter(i => (i.language || '') === language);
                if (ratingMin) { const min = Number(ratingMin);
                    allItems = allItems.filter(i => (i.rating || i.kurddb_rating || 0) >= min); }
                switch (sort) {
                    case 'rating':
                        allItems.sort((a, b) => (b.rating || b.kurddb_rating || 0) - (a.rating || a.kurddb_rating || 0));
                        break;
                    case 'newest':
                        allItems.sort((a, b) => { const da = a.release_date ? new Date(a.release_date) : new Date(0);
                            const db = b.release_date ? new Date(b.release_date) : new Date(0); return db - da; });
                        break;
                    case 'oldest':
                        allItems.sort((a, b) => { const da = a.release_date ? new Date(a.release_date) : new Date(0);
                            const db = b.release_date ? new Date(b.release_date) : new Date(0); return da - db; });
                        break;
                    case 'views':
                        allItems.sort((a, b) => (b.views || 0) - (a.views || 0));
                        break;
                    case 'trending':
                        allItems.sort((a, b) => {
                            const scoreA = (a.views || 0) * 0.4 + (a.rating || 0) * 0.6;
                            const scoreB = (b.views || 0) * 0.4 + (b.rating || 0) * 0.6;
                            return scoreB - scoreA;
                        });
                        break;
                    default:
                        allItems.sort((a, b) => (b.rating || b.kurddb_rating || 0) - (a.rating || a.kurddb_rating || 0));
                }
                return allItems;
            }

            window.applyFilters = function() { currentPage = 1;
                const filtered = getFilteredItems();
                renderWorksGrid(filtered, currentPage); };

            // ─── POPULATE FILTERS ──────────────────────────────────────────
            function populateFilters() {
                const countrySel = document.getElementById('filterCountry');
                const genreSel = document.getElementById('filterGenre');
                const yearSel = document.getElementById('filterYear');
                const langSel = document.getElementById('filterLanguage');
                if (countrySel) {
                    countrySel.innerHTML = '<option value="">هەموو وڵاتان</option>';
                    allCountries.forEach(c => { const opt = document.createElement('option');
                        opt.value = sanitizeText(c);
                        opt.textContent = sanitizeText(c);
                        countrySel.appendChild(opt); });
                }
                if (genreSel) {
                    genreSel.innerHTML = '<option value="">هەموو جۆرەکان</option>';
                    allGenres.forEach(g => { const opt = document.createElement('option');
                        opt.value = sanitizeText(g);
                        opt.textContent = sanitizeText(g);
                        genreSel.appendChild(opt); });
                }
                if (yearSel) {
                    yearSel.innerHTML = '<option value="">هەموو ساڵان</option>';
                    allYears.forEach(y => { const opt = document.createElement('option');
                        opt.value = sanitizeText(y);
                        opt.textContent = sanitizeText(y);
                        yearSel.appendChild(opt); });
                    const older = document.createElement('option');
                    older.value = 'older';
                    older.textContent = 'کۆنتر';
                    yearSel.appendChild(older);
                }
                if (langSel) {
                    langSel.innerHTML = '<option value="">هەموو زمانەکان</option>';
                    allLanguages.forEach(l => { const opt = document.createElement('option');
                        opt.value = sanitizeText(l);
                        opt.textContent = sanitizeText(l);
                        langSel.appendChild(opt); });
                }
            }

            function populateRecFilters() {
                const countrySel = document.getElementById('recCountry');
                const genreSel = document.getElementById('recGenre');
                const yearSel = document.getElementById('recYear');
                if (countrySel) {
                    countrySel.innerHTML = '<option value="">هەموو وڵاتان</option>';
                    allCountries.forEach(c => { const opt = document.createElement('option');
                        opt.value = sanitizeText(c);
                        opt.textContent = sanitizeText(c);
                        countrySel.appendChild(opt); });
                }
                if (genreSel) {
                    genreSel.innerHTML = '<option value="">هەموو ژانەرەکان</option>';
                    allGenres.forEach(g => { const opt = document.createElement('option');
                        opt.value = sanitizeText(g);
                        opt.textContent = sanitizeText(g);
                        genreSel.appendChild(opt); });
                }
                if (yearSel) {
                    yearSel.innerHTML = '<option value="">هەموو ساڵان</option>';
                    allYears.forEach(y => { const opt = document.createElement('option');
                        opt.value = sanitizeText(y);
                        opt.textContent = sanitizeText(y);
                        yearSel.appendChild(opt); });
                    const older = document.createElement('option');
                    older.value = 'older';
                    older.textContent = 'کۆنتر';
                    yearSel.appendChild(older);
                }
            }

            function populateRankFilters() {
                const countrySel = document.getElementById('rankCountry');
                const genreSel = document.getElementById('rankGenre');
                const yearSel = document.getElementById('rankYear');
                if (countrySel) {
                    countrySel.innerHTML = '<option value="">هەموو وڵاتان</option>';
                    allCountries.forEach(c => { const opt = document.createElement('option');
                        opt.value = sanitizeText(c);
                        opt.textContent = sanitizeText(c);
                        countrySel.appendChild(opt); });
                }
                if (genreSel) {
                    genreSel.innerHTML = '<option value="">هەموو جۆرەکان</option>';
                    allGenres.forEach(g => { const opt = document.createElement('option');
                        opt.value = sanitizeText(g);
                        opt.textContent = sanitizeText(g);
                        genreSel.appendChild(opt); });
                }
                if (yearSel) {
                    yearSel.innerHTML = '<option value="">هەموو ساڵان</option>';
                    allYears.forEach(y => { const opt = document.createElement('option');
                        opt.value = sanitizeText(y);
                        opt.textContent = sanitizeText(y);
                        yearSel.appendChild(opt); });
                    const older = document.createElement('option');
                    older.value = 'older';
                    older.textContent = 'کۆنتر';
                    yearSel.appendChild(older);
                }
            }

            // ─── COLLECTIONS ──────────────────────────────────────────────

            async function fetchCollections() {
                try {
                    if (!supabaseInitialized) initSupabase();
                    if (!supabaseClient) { allCollections = []; return allCollections; }
                    const cached = cacheGet('collections');
                    if (cached) { allCollections = cached; return allCollections; }
                    const { data, error } = await supabaseClient
                        .from('collections')
                        .select('*')
                        .order('display_order', { ascending: true });
                    if (error) { console.error('Collections fetch error:', error);
                        allCollections = []; return allCollections; }
                    allCollections = data || [];
                    cacheSet('collections', allCollections);
                    return allCollections;
                } catch (e) { console.error('Collections fetch exception:', e);
                    allCollections = []; return allCollections; }
            }

            async function fetchCollectionItems(collectionId) {
                try {
                    if (!supabaseInitialized) initSupabase();
                    if (!supabaseClient) return [];
                    const cacheKey = 'collection_items_' + collectionId;
                    const cached = cacheGet(cacheKey);
                    if (cached) return cached;
                    const { data, error } = await supabaseClient
                        .from('collection_items')
                        .select('content_id, display_order, content_type')
                        .eq('collection_id', collectionId)
                        .order('display_order', { ascending: true });
                    if (error) { console.error('Collection items fetch error:', error); return []; }
                    cacheSet(cacheKey, data);
                    return data || [];
                } catch (e) { console.error('Collection items fetch exception:', e); return []; }
            }

            function getContentByCollectionItems(items) {
                const map = {};
                items.forEach(i => {
                    const source = (i.content_type || '').toLowerCase() === 'animation' ? allAnimationsData : allMoviesData;
                    const item = source.find(c => c.id === i.content_id);
                    if (item) map[i.content_id] = item;
                });
                return map;
            }

            // ─── RENDER HOME COLLECTIONS ────────────────────────────────────
            async function renderHomeCollections() {
                const grid = document.getElementById('homeCollectionsGrid');
                if (!grid) return;

                if (allCollections.length === 0) {
                    await fetchCollections();
                }

                grid.innerHTML = '';
                const collections = allCollections.slice(0, 3);

                if (!collections || collections.length === 0) {
                    grid.innerHTML = `
                            <div class="col-span-full text-white/50 text-center py-10">
                                هیچ کۆکراوەیەک نیە. تکایە دواتر بپشکنە.
                                <br><small class="text-xs text-white/30">تکایە دڵنیا بە کە خشتەکانی collections و collection_items داتایان تێدایە.</small>
                            </div>
                        `;
                    return;
                }

                for (const coll of collections) {
                    try {
                        const items = await fetchCollectionItems(coll.id);
                        const count = items.length;
                        const card = document.createElement('div');
                        card.className = 'collection-card';
                        const cover = coll.cover_url || 'https://picsum.photos/seed/collection' + coll.id + '/800/300';
                        const safeName = sanitizeText(coll.name);
                        card.innerHTML = sanitizeHTML(`
                                <div class="collection-cover">
                                    <img src="${sanitizeUrl(cover)}" alt="${safeName}" loading="lazy" onerror="this.style.display='none'" />
                                    <div class="cover-overlay"></div>
                                </div>
                                <div class="collection-info">
                                    <div class="name safe-text">${safeName}</div>
                                    <div class="count">${count} فیلم</div>
                                </div>
                            `);
                        card.addEventListener('click', () => {
                            showCollectionDetail(coll.slug);
                        });
                        grid.appendChild(card);
                    } catch (e) {
                        console.error('Error rendering collection:', coll.id, e);
                    }
                }
            }

            // ─── RENDER ALL COLLECTIONS ──────────────────────────────────────
            let collectionsPageNum = 1;
            const collectionsPerPage = 9;

            async function renderAllCollections(page = 1) {
                const grid = document.getElementById('allCollectionsGrid');
                const pag = document.getElementById('collectionsPagination');
                if (!grid || !pag) return;

                if (allCollections.length === 0) {
                    await fetchCollections();
                }

                grid.innerHTML = '';
                const total = allCollections.length;
                const start = (page - 1) * collectionsPerPage;
                const pageItems = allCollections.slice(start, start + collectionsPerPage);

                if (pageItems.length === 0) {
                    grid.innerHTML = `
                            <div class="col-span-full text-white/50 text-center py-10">
                                هیچ کۆکراوەیەک نیە. تکایە دواتر بپشکنە.
                                <br><small class="text-xs text-white/30">تکایە دڵنیا بە کە خشتەکانی collections و collection_items داتایان تێدایە.</small>
                            </div>
                        `;
                    pag.innerHTML = '';
                    return;
                }

                for (const coll of pageItems) {
                    try {
                        const items = await fetchCollectionItems(coll.id);
                        const count = items.length;
                        const card = document.createElement('div');
                        card.className = 'collection-card';
                        const cover = coll.cover_url || 'https://picsum.photos/seed/collection' + coll.id + '/800/300';
                        const safeName = sanitizeText(coll.name);
                        card.innerHTML = sanitizeHTML(`
                                <div class="collection-cover">
                                    <img src="${sanitizeUrl(cover)}" alt="${safeName}" loading="lazy" onerror="this.style.display='none'" />
                                    <div class="cover-overlay"></div>
                                </div>
                                <div class="collection-info">
                                    <div class="name safe-text">${safeName}</div>
                                    <div class="count">${count} فیلم</div>
                                </div>
                            `);
                        card.addEventListener('click', () => {
                            showCollectionDetail(coll.slug);
                        });
                        grid.appendChild(card);
                    } catch (e) {
                        console.error('Error rendering collection:', coll.id, e);
                    }
                }

                const totalPages = Math.ceil(total / collectionsPerPage);
                pag.innerHTML = '';
                if (totalPages <= 1) return;
                for (let i = 1; i <= totalPages; i++) {
                    const btn = document.createElement('button');
                    btn.className = 'page-btn' + (i === page ? ' active' : '');
                    btn.textContent = i;
                    btn.addEventListener('click', () => {
                        collectionsPageNum = i;
                        renderAllCollections(i);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    });
                    pag.appendChild(btn);
                }
            }

            // ─── SHOW COLLECTION DETAIL ──────────────────────────────────────
            async function showCollectionDetail(slug) {
                closeAllOverlays();

                if (allCollections.length === 0) {
                    await fetchCollections();
                }

                const coll = allCollections.find(c => c.slug === slug);
                if (!coll) {
                    showToast('کۆکراوە نەدۆزرایەوە.', 'error');
                    goHome();
                    return;
                }
                const path = `/collections/${slug}`;
                if (window.location.pathname !== path) {
                    window.history.pushState({ type: 'collection', slug: slug }, '', path);
                }
                hideAllPages();
                document.getElementById('collectionDetailPage').style.display = 'block';
                document.getElementById('navCollections').classList.add('active');
                setHomeMeta();
                const main = document.getElementById('collectionDetailMain');
                if (!main) return;

                const items = await fetchCollectionItems(coll.id);
                const contentMap = getContentByCollectionItems(items);
                const orderedItems = items.map(i => ({ ...i, content: contentMap[i.content_id] })).filter(i => i.content);

                const cover = coll.cover_url || 'https://picsum.photos/seed/collection' + coll.id + '/1200/400';
                const count = orderedItems.length;
                const safeName = sanitizeText(coll.name);
                const safeDesc = sanitizeText(coll.description || '');

                let gridHTML = '';
                if (orderedItems.length === 0) {
                    gridHTML = '<p class="text-white/40 text-center py-10">هیچ فیلمێک لەم کۆکراوەیەدا نیە.</p>';
                } else {
                    gridHTML = `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">`;
                    orderedItems.forEach((item, idx) => {
                        const content = item.content;
                        const rank = idx + 1;
                        const title = sanitizeText(content.title || 'Untitled');
                        const year = content.release_date ? new Date(content.release_date).getFullYear() : 'N/A';
                        const poster = content.poster_url || '';
                        const type = (content.type || '').toLowerCase() === 'animation' ? 'animation' : 'movie';
                        const slugId = content.slug || content.id;
                        const rating = content.rating || content.kurddb_rating || 0;

                        let topBadge = '';
                        if (isTop250(content)) {
                            const rankTop = getTop250Rank(content);
                            topBadge =
                                `<div class="top250-badge top250-badge-sm" style="top:8px; right:60px; font-size:0.5rem; padding:2px 8px;">🏆 #${rankTop}</div>`;
                        }

                        gridHTML += `
                                <div class="collection-item-wrapper" onclick="showDetail('${sanitizeText(slugId)}', '${sanitizeText(type)}')">
                                    <div class="collection-item-poster-wrap">
                                        ${poster ? `<img src="${sanitizeUrl(poster)}" alt="${title}" loading="lazy" onerror="this.style.display='none'" />` : '<div class="w-full h-full bg-gray-800 flex items-center justify-center text-white/20">No Poster</div>'}
                                        <div class="collection-item-rank-badge">#${rank}</div>
                                        ${topBadge}
                                    </div>
                                    <div class="collection-item-info">
                                        <div class="collection-item-title safe-text">${title}</div>
                                        <div class="collection-item-meta">
                                            <span class="rating-badge" style="padding:2px 10px; font-size:0.7rem;">
                                                <span class="rating-star">★</span>${typeof rating === 'number' ? rating.toFixed(1) : '0.0'}
                                            </span>
                                            <span>${year}</span>
                                            <span>${sanitizeText(content.type || 'Movie')}</span>
                                        </div>
                                    </div>
                                </div>
                            `;
                    });
                    gridHTML += `</div>`;
                }

                main.innerHTML = sanitizeHTML(`
                        <div class="max-w-7xl mx-auto">
                            <div class="collection-detail-cover">
                                <img src="${sanitizeUrl(cover)}" alt="${safeName}" onerror="this.style.display='none'" />
                            </div>
                            <h1 class="collection-detail-title safe-text">${safeName}</h1>
                            ${safeDesc ? `<p class="collection-detail-desc safe-text">${safeDesc}</p>` : ''}
                            <p class="text-white/50 text-sm mb-8">ژمارەی فیلمەکان: ${count}</p>
                            ${gridHTML}
                        </div>
                    `);
                gsap.from('#collectionDetailPage', { opacity: 0, duration: 0.4 });
                trackPageView(path);
                trackGA('view_collection', { collection_id: coll.id, slug: coll.slug });
            }

            // ─── SHOW COLLECTIONS PAGE ──────────────────────────────────────
            window.showCollections = function() {
                closeAllOverlays();
                hideAllPages();
                document.getElementById('collectionsPage').style.display = 'block';
                document.getElementById('navCollections').classList.add('active');
                if (window.location.pathname !== '/collections') window.history.pushState({ type: 'collections' }, '',
                    '/collections');
                setHomeMeta();
                window.scrollTo(0, 0);
                collectionsPageNum = 1;
                renderAllCollections(1);
                trackPageView('/collections');
                trackGA('page_view', { page_title: 'Collections' });
            };

            // ─── NAVIGATION ────────────────────────────────────────────────
            function hideAllPages() {
                ['homePage', 'detailPage', 'profilePage', 'worksPage', 'rankingsPage', 'leaderboardPage', 'recommendationsPage',
                    'collectionsPage', 'collectionDetailPage'
                ].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
                document.querySelectorAll('.bottom-nav .nav-icon').forEach(el => el.classList.remove('active'));
            }

            window.goHome = function() {
                closeAllOverlays();
                if (window.location.pathname !== '/') window.history.pushState({ type: 'home' }, '', '/');
                hideAllPages();
                document.getElementById('homePage').style.display = 'block';
                document.getElementById('navHome').classList.add('active');
                setHomeMeta();
                window.scrollTo(0, 0);
                trackPageView('/');
                trackGA('page_view', { page_title: 'Home' });
                const glassHeader = document.getElementById('glassHeader');
                if (glassHeader && window.scrollY <= 100) {
                    glassHeader.classList.remove('visible-header');
                    glassHeader.classList.add('hidden-header');
                }
            };

            window.showWorks = function() {
                closeAllOverlays();
                hideAllPages();
                document.getElementById('worksPage').style.display = 'block';
                document.getElementById('navWorks').classList.add('active');
                if (window.location.pathname !== '/works') window.history.pushState({ type: 'works' }, '', '/works');
                setHomeMeta();
                window.scrollTo(0, 0);
                currentPage = 1;
                applyFilters();
                trackPageView('/works');
                trackGA('page_view', { page_title: 'Works' });
            };

            window.showRankings = function() {
                closeAllOverlays();
                hideAllPages();
                document.getElementById('rankingsPage').style.display = 'block';
                document.getElementById('navRankings').classList.add('active');
                if (window.location.pathname !== '/rankings') window.history.pushState({ type: 'rankings' }, '', '/rankings');
                setHomeMeta();
                window.scrollTo(0, 0);
                currentRankTab = 'top_movies';
                document.querySelectorAll('#rankingsFilterContainer .rec-method-badge').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.rankTab === currentRankTab);
                });
                const rankTypeSel = document.getElementById('rankType');
                if (rankTypeSel) rankTypeSel.value = '';
                applyRankFilters();
                trackPageView('/rankings');
                trackGA('page_view', { page_title: 'Rankings' });
            };

            window.showLeaderboard = function() {
                closeAllOverlays();
                hideAllPages();
                document.getElementById('leaderboardPage').style.display = 'block';
                document.getElementById('navLeaderboard').classList.add('active');
                if (window.location.pathname !== '/leaderboard') window.history.pushState({ type: 'leaderboard' }, '',
                    '/leaderboard');
                setHomeMeta();
                window.scrollTo(0, 0);
                renderLeaderboard();
                trackPageView('/leaderboard');
                trackGA('page_view', { page_title: 'Leaderboard' });
            };

            window.showProfile = function() {
                closeAllOverlays();
                if (!isLoggedIn()) { openProfileModal(); return; }
                hideAllPages();
                document.getElementById('profilePage').style.display = 'block';
                document.getElementById('navProfile').classList.add('active');
                if (window.location.pathname !== '/profile') window.history.pushState({ type: 'profile' }, '', '/profile');
                setHomeMeta();
                window.scrollTo(0, 0);
                buildProfilePage(currentUser);
                trackPageView('/profile');
                trackGA('page_view', { page_title: 'Profile' });
            };

            window.showRecommendations = function() {
                closeAllOverlays();
                hideAllPages();
                document.getElementById('recommendationsPage').style.display = 'block';
                document.getElementById('navRecommendations').classList.add('active');
                if (window.location.pathname !== '/recommendations') window.history.pushState({ type: 'recommendations' }, '',
                    '/recommendations');
                setHomeMeta();
                window.scrollTo(0, 0);
                populateRecFilters();
                recommendedIds = [];
                document.getElementById('recSingleResult').innerHTML = '';
                document.getElementById('recStatus').textContent = 'پاڵاوتنەکان دیاری بکە و کلیک لە پێشنیار بکە.';
                trackPageView('/recommendations');
                trackGA('page_view', { page_title: 'Recommendations' });
            };

            window.hideDetail = function() { goHome(); };

            window.switchLibraryTab = function(tab) {
                currentWorksTab = tab;
                const tabMovies = document.getElementById('tabMovies');
                const tabAnim = document.getElementById('tabAnimations');
                if (tabMovies && tabAnim) {
                    tabMovies.className =
                        `text-xl font-cinematic font-bold pb-2 border-b-2 ${tab === 'movies' ? 'border-purple-500 text-white' : 'border-transparent text-white/50'}`;
                    tabAnim.className =
                        `text-xl font-cinematic font-bold pb-2 border-b-2 ${tab === 'animations' ? 'border-purple-500 text-white' : 'border-transparent text-white/50'}`;
                }
                currentPage = 1;
                applyFilters();
            };

            // ─── GENERATE RECOMMENDATIONS ──────────────────────────────────
            window.generateRecommendations = function() {
                const type = document.getElementById('recType')?.value || 'all';
                const country = document.getElementById('recCountry')?.value || '';
                const genre = document.getElementById('recGenre')?.value || '';
                const year = document.getElementById('recYear')?.value || '';

                let candidates = [...allMoviesData, ...allAnimationsData];
                if (type !== 'all') candidates = candidates.filter(i => i.type === type);
                if (country) candidates = candidates.filter(i => { const c = i.countries || []; return Array.isArray(c) ? c
                        .includes(country) : c === country; });
                if (genre) candidates = candidates.filter(i => { const g = i.genres || []; return Array.isArray(g) ? g.includes(
                        genre) : g === genre; });
                if (year) {
                    if (year === 'older') candidates = candidates.filter(i => { const y = i.release_date ? new Date(i
                            .release_date).getFullYear() : 0; return y < 2023; });
                    else candidates = candidates.filter(i => { const y = i.release_date ? new Date(i.release_date)
                            .getFullYear() : 0; return String(y) === year; });
                }
                candidates = candidates.filter(item => !recommendedIds.includes(item.id));
                if (candidates.length === 0) {
                    document.getElementById('recSingleResult').innerHTML = '';
                    document.getElementById('recStatus').textContent = 'هیچ ناوەڕۆکێکی نوێ نەدۆزرایەوە بۆ پێشنیار. تکایە پاڵاوتنەکان بگۆڕە.';
                    return;
                }
                candidates.sort((a, b) => {
                    const scoreA = (a.rating || a.kurddb_rating || 0) * 0.7 + (a.views || 0) * 0.3;
                    const scoreB = (b.rating || b.kurddb_rating || 0) * 0.7 + (b.views || 0) * 0.3;
                    return scoreB - scoreA;
                });
                const selected = candidates[0];
                recommendedIds.push(selected.id);
                const container = document.getElementById('recSingleResult');
                const status = document.getElementById('recStatus');
                const rating = selected.rating || selected.kurddb_rating || 0;
                const yearVal = selected.release_date ? new Date(selected.release_date).getFullYear() : 'N/A';
                const poster = selected.poster_url || '';
                const title = sanitizeText(selected.title || 'Untitled');
                const genres = Array.isArray(selected.genres) ? selected.genres : [];
                const genreStr = genres.map(sanitizeText).join(' · ');
                const typeVal = selected.type === 'Animation' ? 'animation' : 'movie';
                const countryStr = Array.isArray(selected.countries) ? selected.countries.map(sanitizeText).join(', ') : '';
                const story = sanitizeText(selected.story || '');
                const slug = selected.slug || selected.id;

                let topBadge = '';
                if (isTop250(selected)) {
                    const rank = getTop250Rank(selected);
                    topBadge =
                        `<div class="top250-badge" style="position:relative; display:inline-block; margin-bottom:8px;">🏆 #${rank} · باشترین ٢٥٠</div>`;
                }

                container.innerHTML = sanitizeHTML(`
                        <div class="rec-single-card" id="recSingleCard">
                            <div class="rec-single-poster" style="position:relative;">
                                ${poster ? `<img src="${sanitizeUrl(poster)}" alt="${title}" loading="lazy" onerror="this.style.display='none'" />` : '<div class="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center text-white/20">No Poster</div>'}
                                ${topBadge}
                            </div>
                            <div class="rec-single-info">
                                <div class="rec-single-title safe-text">${title}</div>
                                <div class="rec-single-meta">
                                    <span>${yearVal}</span>
                                    <span>${sanitizeText(selected.type)}</span>
                                    ${countryStr ? `<span>${countryStr}</span>` : ''}
                                    ${genreStr ? `<span>${genreStr}</span>` : ''}
                                </div>
                                <div class="rec-single-rating">★ ${typeof rating === 'number' ? rating.toFixed(1) : '0.0'}</div>
                                ${story ? `<div class="rec-single-description safe-text">${story}</div>` : ''}
                                <button class="btn-primary rec-single-btn" onclick="showDetail('${sanitizeText(slug)}', '${sanitizeText(typeVal)}')">
                                    وردەکاری زیاتر
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    `);
                status.textContent = '✨ پێشنیارە تایبەتەکەت بۆ تۆ!';
                const card = document.getElementById('recSingleCard');
                if (card) {
                    gsap.from(card, { opacity: 0, y: 50, scale: 0.95, duration: 0.8, ease: 'power3.out', onComplete: () => {
                            gsap.to(card, { scale: 1.005, duration: 0.3, yoyo: true, repeat: 1 });
                        } });
                    gsap.from(card.querySelectorAll(
                        '.rec-single-title, .rec-single-meta, .rec-single-rating, .rec-single-description, .rec-single-btn'
                        ), { opacity: 0, y: 20, duration: 0.5, stagger: 0.1, delay: 0.3, ease: 'power2.out' });
                    gsap.from(card.querySelector('.rec-single-poster'), { scale: 0.9, opacity: 0, duration: 0.7, delay: 0.1,
                        ease: 'power2.out' });
                }
                trackGA('generate_recommendation', { filters: { type, country, genre, year } });
            };

            // ─── PROFILE PAGE ──────────────────────────────────────────────
            async function buildProfilePage(user) {
                const main = document.getElementById('profileMain');
                if (!main) return;
                const username = sanitizeText(user?.username || 'User');
                const email = sanitizeText(user?.email || '');
                const joinDate = user?.join_date ? new Date(user.join_date).toLocaleDateString('ku', { year: 'numeric',
                    month: 'long', day: 'numeric' }) : 'N/A';
                const xp = user?.xp || 0;
                const level = getLevelFromXP(xp);
                const currentTitle = getTitleForLevel(level);
                const nextTitle = getNextTitle(level);
                const currentLevelXP = xpForLevel(level);
                const nextLevelXP = xpForLevel(level + 1);
                const xpInLevel = xp - currentLevelXP;
                const xpNeeded = nextLevelXP - currentLevelXP;
                const progressPercent = xpNeeded > 0 ? Math.min(100, Math.round((xpInLevel / xpNeeded) * 100)) : 100;
                const avatarUrl = user?.avatar_url || '';
                let watchlistItems = [],
                    watchedItems = [];
                let totalRatings = 0,
                    totalComments = 0;
                if (supabaseClient && user && user.id) {
                    try {
                        const [wlRes, wRes, ratingsRes, commentsRes] = await Promise.all([
                            supabaseClient.from('watchlists').select('content_id').eq('user_id', user.id),
                            supabaseClient.from('watched').select('content_id').eq('user_id', user.id),
                            supabaseClient.from('ratings').select('content_id').eq('user_id', user.id),
                            supabaseClient.from('comments').select('id').eq('user_id', user.id)
                        ]);
                        if (!wlRes.error) {
                            const ids = wlRes.data.map(r => r.content_id);
                            const allItems = [...allMoviesData, ...allAnimationsData];
                            watchlistItems = ids.map(id => allItems.find(m => m.id === id)).filter(Boolean);
                        }
                        if (!wRes.error) {
                            const ids = wRes.data.map(r => r.content_id);
                            const allItems = [...allMoviesData, ...allAnimationsData];
                            watchedItems = ids.map(id => allItems.find(m => m.id === id)).filter(Boolean);
                        }
                        if (!ratingsRes.error) totalRatings = ratingsRes.data.length;
                        if (!commentsRes.error) totalComments = commentsRes.data.length;
                    } catch (e) { console.warn('Error fetching user data:', e); }
                }
                let html = `
                        <div class="max-w-5xl mx-auto">
                            <div class="glass-panel p-6 md:p-10 text-center mb-10">
                                <div class="profile-avatar-lg mb-4" style="position:relative;">
                                    ${avatarUrl ? `<img src="${sanitizeUrl(avatarUrl)}" alt="${username}" onerror="this.outerHTML='${username.charAt(0).toUpperCase()}'" />` : username.charAt(0).toUpperCase()}
                                </div>
                                <h1 class="text-3xl font-cinematic font-bold mb-1 safe-text">${username}</h1>
                                <p class="text-purple-300 font-semibold text-lg">${sanitizeText(currentTitle.title)}</p>
                                <p class="text-white/40 text-sm">ئاست ${level}</p>
                                <p class="text-white/50 text-sm mt-1">${email} · چووەتەوە ${joinDate}</p>
                                <div class="mt-6 max-w-sm mx-auto">
                                    <div class="flex justify-between text-xs text-white/50 mb-1">
                                        <span>خاڵ: ${xp.toLocaleString()}</span>
                                        <span>ئاست ${level+1}: ${nextLevelXP.toLocaleString()} خاڵ</span>
                                    </div>
                                    <div class="xp-bar"><div class="xp-fill" style="width:${progressPercent}%"></div></div>
                                    <p class="text-xs text-white/40 mt-1">${xpInLevel.toLocaleString()} / ${xpNeeded.toLocaleString()} خاڵ (${progressPercent}%)</p>
                                    ${nextTitle ? `<p class="text-xs text-purple-300 mt-2">ناونیشانی داهاتوو: <span class="text-white/70">${sanitizeText(nextTitle.title)}</span> لە ئاست ${nextTitle.level}</p>` : '<p class="text-xs text-yellow-400 mt-2">🏆 گەورەترین ناونیشان بەدەستهات!</p>'}
                                </div>
                            </div>

                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                                <div class="stat-card"><p class="text-3xl font-bold text-purple-300">${totalRatings}</p><p class="text-white/50 text-sm mt-1">پلەدان</p></div>
                                <div class="stat-card"><p class="text-3xl font-bold text-purple-300">${totalComments}</p><p class="text-white/50 text-sm mt-1">بۆچوون</p></div>
                                <div class="stat-card"><p class="text-3xl font-bold text-purple-300">${watchlistItems.length}</p><p class="text-white/50 text-sm mt-1">پێڕستی بینین</p></div>
                                <div class="stat-card"><p class="text-3xl font-bold text-purple-300">${watchedItems.length}</p><p class="text-white/50 text-sm mt-1">بینراو</p></div>
                            </div>

                            <div class="mb-10">
                                <h2 class="text-2xl font-cinematic font-bold mb-4 text-purple-200">پێڕستی بینین</h2>
                                ${watchlistItems.length === 0 ? '<p class="text-white/40">هیچ فیلمێک لە پێڕستی بینیندا نیە.</p>' :
                                    `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">${watchlistItems.map(m => {
                                        const type = m.type === 'Animation' ? 'animation' : 'movie';
                                        const poster = m.poster_url || '';
                                        const slug = m.slug || m.id;
                                        const title = sanitizeText(m.title || 'Untitled');
                                        const rating = m.rating || m.kurddb_rating || 0;
                                        const year = m.release_date ? new Date(m.release_date).getFullYear() : 'N/A';
                                        let topBadge = '';
                                        if (isTop250(m)) {
                                            const rank = getTop250Rank(m);
                                            topBadge = `<div class="top250-badge top250-badge-sm" style="position:absolute; top:6px; right:6px; font-size:0.45rem; padding:2px 6px;">🏆 #${rank}</div>`;
                                        }
                                        return `<div class="kurd-card" onclick="showDetail('${sanitizeText(slug)}', '${sanitizeText(type)}')">
                                            <div class="kurd-poster" style="height:260px; position:relative;">${poster ? `<img src="${sanitizeUrl(poster)}" alt="${title}" loading="lazy" onerror="this.style.display='none'" />` : '<div class="w-full h-full bg-gray-800 flex items-center justify-center text-white/20">No Poster</div>'}${topBadge}</div>
                                            <div class="kurd-info"><h3 class="kurd-title safe-text" style="font-size:0.9rem;">${title}</h3><div class="kurd-meta"><span class="rating-badge" style="padding:2px 8px; font-size:0.65rem;"><span class="rating-star">★</span>${typeof rating === 'number' ? rating.toFixed(1) : '0.0'}</span><span style="font-size:0.7rem;">${year}</span></div></div></div>`;
                                    }).join('')}</div>`
                                }
                            </div>

                            <div>
                                <h2 class="text-2xl font-cinematic font-bold mb-4 text-purple-200">بینراوەکان</h2>
                                ${watchedItems.length === 0 ? '<p class="text-white/40">هیچ فیلمێک نەبینراوە.</p>' :
                                    `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">${watchedItems.map(m => {
                                        const type = m.type === 'Animation' ? 'animation' : 'movie';
                                        const poster = m.poster_url || '';
                                        const slug = m.slug || m.id;
                                        const title = sanitizeText(m.title || 'Untitled');
                                        const rating = m.rating || m.kurddb_rating || 0;
                                        const year = m.release_date ? new Date(m.release_date).getFullYear() : 'N/A';
                                        let topBadge = '';
                                        if (isTop250(m)) {
                                            const rank = getTop250Rank(m);
                                            topBadge = `<div class="top250-badge top250-badge-sm" style="position:absolute; top:6px; right:6px; font-size:0.45rem; padding:2px 6px;">🏆 #${rank}</div>`;
                                        }
                                        return `<div class="kurd-card" onclick="showDetail('${sanitizeText(slug)}', '${sanitizeText(type)}')">
                                            <div class="kurd-poster" style="height:260px; position:relative;">${poster ? `<img src="${sanitizeUrl(poster)}" alt="${title}" loading="lazy" onerror="this.style.display='none'" />` : '<div class="w-full h-full bg-gray-800 flex items-center justify-center text-white/20">No Poster</div>'}${topBadge}</div>
                                            <div class="kurd-info"><h3 class="kurd-title safe-text" style="font-size:0.9rem;">${title}</h3><div class="kurd-meta"><span class="rating-badge" style="padding:2px 8px; font-size:0.65rem;"><span class="rating-star">★</span>${typeof rating === 'number' ? rating.toFixed(1) : '0.0'}</span><span style="font-size:0.7rem;">${year}</span></div></div></div>`;
                                    }).join('')}</div>`
                                }
                            </div>
                        </div>
                    `;
                main.innerHTML = sanitizeHTML(html);
            }

            // ─── XP SYSTEM ──────────────────────────────────────────────
            async function addXP(amount) {
                // پشکنینی بوونی بەکارهێنەر و Supabase client
                if (!currentUser || !currentUser.id || !supabaseClient) {
                    console.warn('addXP: missing user or client');
                    return;
                }

                // دڵنیابوون لە بوونی توکنی چالاک
                const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
                if (sessionError || !session) {
                    console.warn('addXP: no active session');
                    showToast('تکایە دووبارە بچۆ ژوورەوە.', 'error');
                    return;
                }

                const user = currentUser;
                const currentXp = user.xp || 0;
                const newXp = currentXp + amount;
                const newLevel = getLevelFromXP(newXp);

                try {
                    // بانگکردنی RPC بە توکنی چالاک
                    const { data: updatedXp, error } = await supabaseClient.rpc('add_user_xp', {
                        xp_amount: amount,
                        computed_level: newLevel
                    });

                    if (error) {
                        console.error('add_user_xp RPC error:', error);
                        showToast('نەتوانرا خاڵەکان نوێ بکرێنەوە.', 'error');
                        return;
                    }

                    // نوێکردنەوەی داتاکانی بەکارهێنەر
                    user.xp = updatedXp || newXp;
                    user.level = newLevel;
                    currentUser = user;
                    updateAllAvatars();

                    // پشکنینی بەرزبوونەوەی ئاست
                    if (newLevel > (user.level || 1)) {
                        const title = getTitleForLevel(newLevel);
                        showToast(`🎉 ئاست بەرزبووەوە! ئاستی تۆ ${newLevel} — ${title.title}!`, 'success');
                        trackGA('level_up', { level: newLevel, title: title.title });
                    }
                } catch (e) {
                    console.error('addXP fatal error:', e);
                    showToast('نەتوانرا خاڵەکان نوێ بکرێنەوە.', 'error');
                }
            }

            // ─── AUTH UI ──────────────────────────────────────────────────
            function openProfileModal() {
                closeAllOverlays();
                const overlay = document.getElementById('profileModalOverlay');
                if (overlay) {
                    overlay.classList.add('active');
                    lockScroll();
                    switchAuthTab('login');
                    gsap.fromTo('.profile-modal', { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.4,
                        ease: 'power3.out' });
                }
            }

            window.closeProfileModal = function() {
                const overlay = document.getElementById('profileModalOverlay');
                if (overlay) {
                    overlay.classList.remove('active');
                    unlockScroll();
                }
                ['loginEmail', 'loginPassword', 'createUsername', 'createEmail', 'createPassword'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                const loginErr = document.getElementById('loginError');
                if (loginErr) loginErr.classList.add('hidden');
                const createErr = document.getElementById('createError');
                if (createErr) createErr.classList.add('hidden');
            };

            window.switchAuthTab = function(tab) {
                const loginForm = document.getElementById('loginForm');
                const createForm = document.getElementById('createForm');
                const tabLogin = document.getElementById('tabLogin');
                const tabCreate = document.getElementById('tabCreate');
                if (!loginForm || !createForm || !tabLogin || !tabCreate) return;
                if (tab === 'login') {
                    loginForm.classList.remove('hidden');
                    createForm.classList.add('hidden');
                    tabLogin.className = 'text-lg font-semibold pb-2 border-b-2 border-purple-500 text-white';
                    tabCreate.className = 'text-lg font-semibold pb-2 border-b-2 border-transparent text-white/50';
                } else {
                    loginForm.classList.add('hidden');
                    createForm.classList.remove('hidden');
                    tabCreate.className = 'text-lg font-semibold pb-2 border-b-2 border-purple-500 text-white';
                    tabLogin.className = 'text-lg font-semibold pb-2 border-b-2 border-transparent text-white/50';
                }
            };

            window.handleLogin = async function() {
                const email = document.getElementById('loginEmail')?.value?.trim() || '';
                const password = document.getElementById('loginPassword')?.value?.trim() || '';
                const errEl = document.getElementById('loginError');
                if (!email || !password) {
                    if (errEl) { errEl.classList.remove('hidden');
                        errEl.textContent = 'ئیمەیڵ و وشەی نهێنی پێویستە.'; }
                    return;
                }
                try {
                    const user = await signIn(email, password);
                    if (user) {
                        updateAllAvatars();
                        closeProfileModal();
                        showToast(`بەخێربێیتەوە، ${user.username}!`, 'success');
                        showProfile();
                        trackGA('login_success', { method: 'email' });
                    }
                } catch (e) {
                    console.error('Login error:', e);
                    if (errEl) { errEl.classList.remove('hidden');
                        errEl.textContent = e.message || 'زانیاری نادروست.'; }
                    showToast('چوونەژوورەوە سەرکەوتوو نەبوو: ' + (e.message || 'زانیاری نادروست.'), 'error');
                }
            };

            window.handleCreateAccount = async function() {
                const username = document.getElementById('createUsername')?.value?.trim() || '';
                const email = document.getElementById('createEmail')?.value?.trim() || '';
                const password = document.getElementById('createPassword')?.value?.trim() || '';
                const errEl = document.getElementById('createError');
                if (!username || !email || !password) {
                    if (errEl) { errEl.classList.remove('hidden');
                        errEl.textContent = 'هەموو خانەکان پێویستن.'; }
                    return;
                }
                if (password.length < 4) {
                    if (errEl) { errEl.classList.remove('hidden');
                        errEl.textContent = 'وشەی نهێنی پێویستە لانیکەم ٤ پیت بێت.'; }
                    return;
                }
                try {
                    const user = await signUp(email, password, username);
                    if (user && user.pendingConfirmation) {
                        showToast('هەژمار دروست کرا! تکایە ئیمەیڵەکەت پشتڕاست بکەوە بۆ چوونەژوورەوە.', 'info');
                        trackGA('sign_up_success', { method: 'email', pending_confirmation: true });
                        closeProfileModal();
                        return;
                    }
                    if (user) {
                        updateAllAvatars();
                        closeProfileModal();
                        showToast(`هەژمار دروست کرا! بەخێربێیت، ${username}!`, 'success');
                        trackGA('sign_up_success', { method: 'email' });
                        showProfile();
                    }
                } catch (e) {
                    console.error('Signup error:', e);
                    if (errEl) { errEl.classList.remove('hidden');
                        errEl.textContent = e.message || 'تۆمارکردن سەرکەوتوو نەبوو.'; }
                    showToast('تۆمارکردن سەرکەوتوو نەبوو: ' + (e.message || 'هەڵەی نەناسراو.'), 'error');
                }
            };

            window.handleLogout = async function() {
                await signOut();
                showToast('چوویتە دەرەوە.', 'info');
                trackGA('logout', {});
            };

            window.handleProfileClick = function() {
                if (isLoggedIn()) showProfile();
                else openProfileModal();
            };

            // ─── SEARCH ──────────────────────────────────────────────────
            function openSearchModal() {
                const overlay = document.getElementById('searchModalOverlay');
                if (!overlay) return;
                overlay.classList.add('active');
                lockScroll();
                const input = document.getElementById('modalSearchInput');
                if (input) setTimeout(() => input.focus(), 100);
                gsap.fromTo('.search-modal', { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.4 });
                trackGA('search_open', {});
            }

            function closeSearchFn() {
                const overlay = document.getElementById('searchModalOverlay');
                if (overlay) {
                    overlay.classList.remove('active');
                    unlockScroll();
                }
                const input = document.getElementById('modalSearchInput');
                if (input) input.value = '';
                const results = document.getElementById('modalResults');
                if (results) results.innerHTML = '<div class="p-4 text-sm text-white/50">دەستبکە بە نووسین بۆ گەڕان...</div>';
            }

            // Only 'searchIconBtn2' exists in the markup — a leftover
            // 'searchIconBtn' listener (targeting an id that isn't present
            // anywhere in the page) was removed here; it was harmless due to
            // '?.' but pointed at a dead id.
            document.getElementById('searchIconBtn2')?.addEventListener('click', openSearchModal);
            document.getElementById('closeSearchModal')?.addEventListener('click', closeSearchFn);

            document.getElementById('searchModalOverlay')?.addEventListener('click', function(e) {
                if (e.target === this) closeSearchFn();
            });

            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    const searchOverlay = document.getElementById('searchModalOverlay');
                    if (searchOverlay?.classList.contains('active')) closeSearchFn();
                    const profileOverlay = document.getElementById('profileModalOverlay');
                    if (profileOverlay?.classList.contains('active')) closeProfileModal();
                }
            });

            let searchDebounce;
            document.getElementById('modalSearchInput')?.addEventListener('input', function() {
                const query = this.value.trim();
                const results = document.getElementById('modalResults');
                if (!results) return;
                if (!query) {
                    results.innerHTML = '<div class="p-4 text-sm text-white/50">دەستبکە بە نووسین بۆ گەڕان...</div>';
                    return;
                }
                results.innerHTML =
                    '<div class="modal-shimmer"></div><div class="modal-shimmer"></div><div class="modal-shimmer"></div>';
                clearTimeout(searchDebounce);
                searchDebounce = setTimeout(() => {
                    const allItems = [...allMoviesData, ...allAnimationsData];
                    const filtered = allItems.filter(m =>
                        (m.title || '').toLowerCase().includes(query.toLowerCase()) ||
                        (m.kurdish_title || '').toLowerCase().includes(query.toLowerCase())
                    );
                    if (filtered.length === 0) {
                        results.innerHTML = '<div class="modal-empty">هیچ ئەنجامێک نەدۆزرایەوە</div>';
                        trackGA('search', { query: query, results: 0 });
                        return;
                    }
                    results.innerHTML = sanitizeHTML(filtered.slice(0, 10).map(m => {
                        const type = m.type === 'Animation' ? 'animation' : 'movie';
                        const poster = m.poster_url || '';
                        const slug = m.slug || m.id;
                        const title = sanitizeText(m.title || 'Untitled');
                        const rating = m.rating || m.kurddb_rating || 0;
                        const year = m.release_date ? new Date(m.release_date).getFullYear() : 'N/A';
                        let topBadge = '';
                        if (isTop250(m)) {
                            const rank = getTop250Rank(m);
                            topBadge = `<span class="text-yellow-400 text-xs font-bold ml-2">🏆#${rank}</span>`;
                        }
                        return `
                                <div class="modal-result-item" onclick="closeSearchFn();showDetail('${sanitizeText(slug)}', '${sanitizeText(type)}')">
                                    <div class="modal-result-poster">${poster ? `<img src="${sanitizeUrl(poster)}" alt="${title}" onerror="this.style.display='none'" />` : '<div class="w-full h-full bg-gray-800 flex items-center justify-center text-white/20 text-xs">No Poster</div>'}</div>
                                    <div>
                                        <h4 class="font-semibold safe-text">${title} ${topBadge}</h4>
                                        <div class="flex items-center gap-3 text-sm text-white/60 mt-1">
                                            <span>★ ${typeof rating === 'number' ? rating.toFixed(1) : '0.0'}</span>
                                            <span>${year}</span>
                                            ${Array.isArray(m.genres) && m.genres.length > 0 ? `<span>${sanitizeText(m.genres[0])}</span>` : ''}
                                        </div>
                                    </div>
                                </div>
                            `;
                    }).join(''));
                    trackGA('search', { query: query, results: filtered.length });
                }, 300);
            });

            // ─── GLASS HEADER ──────────────────────────────────────────────
            let glassVisible = false;
            let scrollRAF = null;

            function handleScroll() {
                if (scrollRAF) cancelAnimationFrame(scrollRAF);
                scrollRAF = requestAnimationFrame(() => {
                    const scrollY = window.scrollY;
                    const glassHeader = document.getElementById('glassHeader');
                    if (!glassHeader) return;
                    if (scrollY > 100 && !glassVisible) {
                        glassVisible = true;
                        glassHeader.classList.remove('hidden-header');
                        glassHeader.classList.add('visible-header');
                    } else if (scrollY <= 100 && glassVisible) {
                        glassVisible = false;
                        glassHeader.classList.remove('visible-header');
                        glassHeader.classList.add('hidden-header');
                    }
                });
            }

            window.addEventListener('scroll', handleScroll, { passive: true });

            // ─── RECOMMENDATION METHOD SELECTOR ──────────────────────────
            document.addEventListener('click', function(e) {
                const btn = e.target.closest('.rec-method-badge');
                if (!btn) return;
                const parent = btn.closest('#recMethodSelector');
                if (!parent) return;
                if (parent.id === 'recMethodSelector') {
                    parent.querySelectorAll('.rec-method-badge').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const method = btn.dataset.method;
                    renderRecommendations(method);
                    trackGA('select_recommendation_method', { method: method });
                }
                if (btn.dataset.rankTab) {
                    document.querySelectorAll('#rankingsFilterContainer .rec-method-badge').forEach(b => b.classList.remove(
                    'active'));
                    btn.classList.add('active');
                    currentRankTab = btn.dataset.rankTab;
                    const rankTypeSel = document.getElementById('rankType');
                    if (rankTypeSel) rankTypeSel.value = '';
                    applyRankFilters();
                    trackGA('select_rank_tab', { tab: currentRankTab });
                }
            });

            // ─── RANKINGS ──────────────────────────────────────────────────
            function getRankedItems(tab, filters = {}) {
                let allItems = [...allMoviesData, ...allAnimationsData];
                const { country, genre, year, type } = filters;

                if (country) allItems = allItems.filter(i => { const c = i.countries || []; return Array.isArray(c) ? c
                        .includes(country) : c === country; });
                if (genre) allItems = allItems.filter(i => { const g = i.genres || []; return Array.isArray(g) ? g.includes(
                        genre) : g === genre; });
                if (year) {
                    if (year === 'older') allItems = allItems.filter(i => { const y = i.release_date ? new Date(i
                            .release_date).getFullYear() : 0; return y < 2023; });
                    else allItems = allItems.filter(i => { const y = i.release_date ? new Date(i.release_date).getFullYear() :
                            0; return String(y) === year; });
                }

                if (type && type !== '') {
                    allItems = allItems.filter(i => i.type === type);
                } else {
                    if (tab === 'top_animations' || tab === 'trending_animations') {
                        allItems = allItems.filter(i => i.type === 'Animation' || i.type === 'animation');
                    } else if (tab === 'top_movies' || tab === 'trending_movies') {
                        allItems = allItems.filter(i => i.type === 'Movie' || i.type === 'movie');
                    }
                }

                let sorted = [];
                const getRating = (item) => item.rating || item.kurddb_rating || 0;
                switch (tab) {
                    case 'top_movies':
                    case 'top_animations':
                        sorted = allItems.sort((a, b) => getRating(b) - getRating(a));
                        break;
                    case 'trending_movies':
                    case 'trending_animations':
                        sorted = allItems.sort((a, b) => {
                            const scoreA = (a.views || 0) * 0.4 + getRating(a) * 0.6;
                            const scoreB = (b.views || 0) * 0.4 + getRating(b) * 0.6;
                            return scoreB - scoreA;
                        });
                        break;
                    default:
                        sorted = allItems.sort((a, b) => getRating(b) - getRating(a));
                }
                return sorted;
            }

            window.applyRankFilters = function() {
                const country = document.getElementById('rankCountry')?.value || '';
                const genre = document.getElementById('rankGenre')?.value || '';
                const year = document.getElementById('rankYear')?.value || '';
                const type = document.getElementById('rankType')?.value || '';
                const items = getRankedItems(currentRankTab, { country, genre, year, type });
                renderRankings(items);
            };

            function renderRankings(items) {
                const container = document.getElementById('rankingsList');
                if (!container) return;
                container.innerHTML = '';
                if (!items || items.length === 0) {
                    container.innerHTML = '<div class="text-white/50 text-center py-10">هیچ پلەیەک نیە. تکایە دواتر بپشکنە.</div>';
                    return;
                }
                const displayItems = items.slice(0, 50);
                displayItems.forEach((item, index) => {
                    const rank = index + 1;
                    const div = document.createElement('div');
                    let rankClass = 'rank-card';
                    if (rank === 1) rankClass += ' rank-1';
                    else if (rank === 2) rankClass += ' rank-2';
                    else if (rank === 3) rankClass += ' rank-3';
                    const poster = item.poster_url || '';
                    const title = sanitizeText(item.title || 'Untitled');
                    const rating = item.rating || item.kurddb_rating || 0;
                    const year = item.release_date ? new Date(item.release_date).getFullYear() : 'N/A';
                    const type = item.type || 'Movie';
                    const genres = Array.isArray(item.genres) ? item.genres.slice(0, 2).map(sanitizeText).join(', ') : '';
                    const views = item.views || 0;
                    const slug = item.slug || item.id;

                    let topBadge = '';
                    if (isTop250(item)) {
                        const rankTop = getTop250Rank(item);
                        topBadge =
                            `<span class="rank-badge" style="background:rgba(255,215,0,0.25);border-color:rgba(255,215,0,0.5);color:#FFD700;">🏆 #${rankTop}</span>`;
                    }

                    div.className = rankClass;
                    div.innerHTML = sanitizeHTML(`
                            <span class="rank-number">#${rank}</span>
                            <div class="rank-poster">
                                ${poster ? `<img src="${sanitizeUrl(poster)}" alt="${title}" loading="lazy" onerror="this.style.display='none'" />` : '<div class="w-full h-full bg-gray-800 flex items-center justify-center text-white/20 text-xs">No Poster</div>'}
                            </div>
                            <div class="rank-info">
                                <div class="rank-title safe-text">${title}</div>
                                <div class="rank-meta">
                                    <span class="rank-rating">★ ${typeof rating === 'number' ? rating.toFixed(1) : '0.0'}</span>
                                    <span>${year}</span>
                                    <span>${sanitizeText(type)}</span>
                                    ${genres ? `<span>${genres}</span>` : ''}
                                    <span>${iconEye} ${views}</span>
                                    ${topBadge}
                                </div>
                            </div>
                            <span class="rank-badge">${sanitizeText(type)}</span>
                        `);
                    div.addEventListener('click', () => {
                        const itemType = item.type === 'Animation' ? 'animation' : 'movie';
                        showDetail(slug, itemType);
                    });
                    container.appendChild(div);
                });
            }

            // ─── LEADERBOARD ──────────────────────────────────────────────
            async function renderLeaderboard() {
                const container = document.getElementById('leaderboardList');
                if (!container) return;
                container.innerHTML = '';
                try {
                    let users = [];
                    if (supabaseInitialized && supabaseClient) {
                        const cached = cacheGet('leaderboard');
                        if (cached) { users = cached; } else {
                            const { data, error } = await supabaseClient.from('profiles').select(
                                'id, username, avatar_url, level, xp, join_date').order('level', { ascending: false })
                                .order('xp', { ascending: false }).limit(100);
                            if (!error && data) { users = data;
                                cacheSet('leaderboard', users); } else throw new Error('Failed to fetch leaderboard');
                        }
                    }
                    if (!users || users.length === 0) {
                        container.innerHTML =
                            '<div class="text-white/50 text-center py-10">هیچ بەکارهێنەرێک نیە. یەکەم بەکارهێنەر بە!</div>';
                        return;
                    }

                    const top3 = users.slice(0, 3);
                    const rest = users.slice(3);

                    if (top3.length > 0) {
                        const podiumDiv = document.createElement('div');
                        podiumDiv.className = 'podium-container';
                        const order = [1, 0, 2];
                        const medals = ['🥈', '🥇', '🥉'];
                        const rankClasses = ['podium-2', 'podium-1', 'podium-3'];
                        order.forEach((idx, pos) => {
                            if (idx < top3.length) {
                                const user = top3[idx];
                                const rank = idx + 1;
                                const div = document.createElement('div');
                                div.className = `podium-item ${rankClasses[pos]}`;
                                const avatar = user.avatar_url || '';
                                const username = sanitizeText(user.username || 'User');
                                const level = user.level || 1;
                                const xp = user.xp || 0;
                                div.innerHTML = sanitizeHTML(`
                                        <span class="podium-rank">#${rank}</span>
                                        <div class="podium-avatar">
                                            ${avatar ? `<img src="${sanitizeUrl(avatar)}" alt="${username}" onerror="this.outerHTML='${username.charAt(0).toUpperCase()}'" />` : username.charAt(0).toUpperCase()}
                                        </div>
                                        <div class="podium-username safe-text">${username}</div>
                                        <div class="podium-details">
                                            <span>ئاست ${level}</span>
                                            <span>${xp.toLocaleString()} خاڵ</span>
                                        </div>
                                        <span class="podium-badge">${medals[pos]}</span>
                                    `);
                                podiumDiv.appendChild(div);
                            }
                        });
                        container.appendChild(podiumDiv);
                    }

                    if (rest.length > 0) {
                        const listDiv = document.createElement('div');
                        listDiv.className = 'leaderboard-list';
                        rest.forEach((user, index) => {
                            const rank = index + 4;
                            const div = document.createElement('div');
                            div.className = 'leaderboard-card';
                            const avatar = user.avatar_url || '';
                            const username = sanitizeText(user.username || 'User');
                            const level = user.level || 1;
                            const xp = user.xp || 0;
                            const joinDate = user.join_date ? new Date(user.join_date).toLocaleDateString('ku', {
                                year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
                            div.innerHTML = sanitizeHTML(`
                                    <span class="lb-rank">#${rank}</span>
                                    <div class="lb-avatar">
                                        ${avatar ? `<img src="${sanitizeUrl(avatar)}" alt="${username}" onerror="this.outerHTML='${username.charAt(0).toUpperCase()}'" />` : username.charAt(0).toUpperCase()}
                                    </div>
                                    <div class="lb-info">
                                        <div class="lb-username safe-text">${username}</div>
                                        <div class="lb-details">
                                            <span class="lb-level">ئاست ${level}</span>
                                            <span class="lb-xp">${xp.toLocaleString()} خاڵ</span>
                                            <span class="lb-join">چووەتەوە ${joinDate}</span>
                                        </div>
                                    </div>
                                `);
                            listDiv.appendChild(div);
                        });
                        container.appendChild(listDiv);
                    }
                } catch (e) {
                    console.warn('Leaderboard error:', e);
                    container.innerHTML =
                        '<div class="text-white/50 text-center py-10">نەتوانرا پێشەنگان باربکرێت. تکایە دواتر هەوڵبدە.</div>';
                }
            }

            // ─── ROUTE RESOLVER ───────────────────────────────────────────
            function resolveRoute() {
                const path = window.location.pathname;
                if (path === '/' || path === '') {
                    if (document.getElementById('homePage').style.display !== 'block') goHome();
                    return;
                }
                const parts = path.replace(/^\/+/, '').split('/');
                if (parts.length === 2 && (parts[0] === 'movie' || parts[0] === 'animation')) {
                    const type = parts[0],
                        slug = parts[1];
                    if (slug) {
                        const item = findContentBySlug(slug, type);
                        if (item) {
                            hideAllPages();
                            document.getElementById('detailPage').style.display = 'block';
                            setDetailMeta(item, type);
                            renderDetail(item);
                            document.querySelectorAll('.bottom-nav .nav-icon').forEach(el => el.classList.remove('active'));
                            trackPageView(path);
                            return;
                        }
                    }
                }
                if (parts[0] === 'collections') {
                    if (parts.length === 1) { showCollections(); return; }
                    if (parts.length === 2) {
                        const slug = parts[1];
                        showCollectionDetail(slug);
                        return;
                    }
                }
                const pageMap = {
                    '/works': { fn: showWorks, nav: 'navWorks' },
                    '/rankings': { fn: showRankings, nav: 'navRankings' },
                    '/leaderboard': { fn: showLeaderboard, nav: 'navLeaderboard' },
                    '/profile': { fn: showProfile, nav: 'navProfile' },
                    '/recommendations': { fn: showRecommendations, nav: 'navRecommendations' },
                    '/collections': { fn: showCollections, nav: 'navCollections' }
                };
                if (pageMap[path]) {
                    const entry = pageMap[path];
                    const navEl = document.getElementById(entry.nav);
                    if (navEl && !navEl.classList.contains('active')) entry.fn();
                    else if (!navEl) entry.fn();
                    return;
                }
                goHome();
            }

            window.addEventListener('popstate', function(event) {
                if (isNavigating) return;
                if (event.state && event.state.type === 'detail' && event.state.slug) {
                    const path = window.location.pathname;
                    const parts = path.replace(/^\/+/, '').split('/');
                    if (parts.length === 2) {
                        const slug = parts[1];
                        const t = parts[0] === 'animation' ? 'animation' : 'movie';
                        const item = findContentBySlug(slug, t);
                        if (item) {
                            hideAllPages();
                            document.getElementById('detailPage').style.display = 'block';
                            setDetailMeta(item, t);
                            renderDetail(item);
                            document.querySelectorAll('.bottom-nav .nav-icon').forEach(el => el.classList.remove('active'));
                            trackPageView(path);
                            return;
                        }
                    }
                }
                if (event.state && event.state.type === 'collection' && event.state.slug) {
                    const slug = event.state.slug;
                    showCollectionDetail(slug);
                    return;
                }
                resolveRoute();
            });

            // ─── MAIN INIT ────────────────────────────────────────────────
            async function init() {
                try {
                    initSupabase();
                    try {
                        const user = await getCurrentUser();
                        if (user) { currentUser = user;
                            updateAllAvatars(); }
                    } catch (_) {}

                    await fetchTop250();

                    const [settings, heroSlides, ads, movies, animations, filterData, stats, websites, collections] = await Promise.all([
                        fetchWebsiteSettings(),
                        fetchHeroSlides(),
                        fetchAds(),
                        fetchMovies(),
                        fetchAnimations(),
                        fetchFilterData(),
                        fetchStatistics(),
                        fetchWebsites(),
                        fetchCollections()
                    ]);

                    const collectionPromises = allCollections.map(coll => fetchCollectionItems(coll.id));
                    const collectionItemsResults = await Promise.all(collectionPromises);

                    contentCollectionsMap = {};
                    allCollections.forEach((coll, idx) => {
                        const items = collectionItemsResults[idx] || [];
                        for (const item of items) {
                            const cid = top250Key(item.content_id, item.content_type);
                            if (!contentCollectionsMap[cid]) contentCollectionsMap[cid] = [];
                            contentCollectionsMap[cid].push(coll);
                        }
                    });
                    window.contentCollectionsMap = contentCollectionsMap;

                    allCollectionItems = Object.values(contentCollectionsMap).flat();

                    initPresence();
                    const allContent = [...allMoviesData, ...allAnimationsData];
                    renderHero(allHeroSlides);
                    renderAds(allAds);
                    await renderRecommendations('smart');
                    await renderHomeCollections();
                    renderTrending(allContent);
                    renderPopular(allContent);
                    renderTopRatedMovies(allContent);
                    renderTopRatedAnimation(allContent);
                    renderNewReleases(allContent);
                    renderRecentMoviesByCountry();

                    setTimeout(() => fetchAndSendStatistics(), 2000);

                    currentRankTab = 'top_movies';
                    document.querySelectorAll('#rankingsFilterContainer .rec-method-badge').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.rankTab === currentRankTab);
                    });
                    const rankTypeSel = document.getElementById('rankType');
                    if (rankTypeSel) rankTypeSel.value = '';
                    applyRankFilters();
                    populateFilters();
                    populateRankFilters();
                    populateRecFilters();
                    currentPage = 1;
                    applyFilters();
                    setHomeMeta();
                    const path = window.location.pathname;
                    if (path === '/' || path === '') {
                        hideAllPages();
                        document.getElementById('homePage').style.display = 'block';
                        document.getElementById('navHome').classList.add('active');
                        setHomeMeta();
                    } else { resolveRoute(); }
                    trackPageView(window.location.pathname);
                    isInitialized = true;

                    // ─── Log visitor (first request) ─────────────────────────
                    logVisitor('page_view');

                    console.log('✅ KurdMDb Final loaded with all fixes (Collections, Top250, Security, Performance, Back Button, Rating/Votes, Views).');
                } catch (e) {
                    console.error('❌ Initialization error:', e);
                    showToast('بارکردنی ناوەڕۆک سەرکەوتوو نەبوو. تکایە پەڕە نوێ بکەوە.', 'error');
                    hideAllPages();
                    document.getElementById('homePage').style.display = 'block';
                    document.getElementById('navHome').classList.add('active');
                    setHomeMeta();
                }
            }

            // ─── LOG VISITOR FUNCTION ──────────────────────────────────
            async function logVisitor(action = "page_view") {
                try {
                    const { data: { session } } = await supabaseClient.auth.getSession();
                    const headers = {
                        "Content-Type": "application/json"
                    };
                    if (session?.access_token) {
                        headers.Authorization = `Bearer ${session.access_token}`;
                    }
                    await fetch(
                        "https://ayxuklozwgnrzveisvof.supabase.co/functions/v1/log-visitor",
                        {
                            method: "POST",
                            headers: headers,
                            body: JSON.stringify({
                                page: window.location.pathname,
                                action: action
                            })
                        }
                    );
                } catch (error) {
                    console.error("Visitor log error:", error);
                }
            }

            // ─── CALL VISITOR ACTION (comment / rate / watched / watchlist) ──
            // ئەم فەنکشنە edge function بانگ دەکات بۆ کۆمێنت/نمرەدان/بینین/
            // واچ لیست، تا سنووری ڕۆژانە و نووسینی داتاکە هەردووکیان لە
            // سەرەوە کۆنتڕۆڵ بکرێن، نەک لای فرۆنتێند.
            async function callVisitorAction(action, payload = {}) {
                try {
                    const { data: { session } } = await supabaseClient.auth.getSession();
                    const headers = {
                        "Content-Type": "application/json"
                    };
                    if (session?.access_token) {
                        headers.Authorization = `Bearer ${session.access_token}`;
                    }
                    const res = await fetch(
                        "https://ayxuklozwgnrzveisvof.supabase.co/functions/v1/log-visitor",
                        {
                            method: "POST",
                            headers: headers,
                            body: JSON.stringify({
                                page: window.location.pathname,
                                action: action,
                                ...payload
                            })
                        }
                    );
                    return await res.json();
                } catch (error) {
                    console.error("Visitor action error:", error);
                    return { success: false, error: (error && error.message) || 'هەڵەی پەیوەندی' };
                }
            }

            // ─── EXPOSE ────────────────────────────────────────────────────
            window.goHome = goHome;
            window.showWorks = showWorks;
            window.showRankings = showRankings;
            window.showLeaderboard = showLeaderboard;
            window.showProfile = showProfile;
            window.showRecommendations = showRecommendations;
            window.showCollections = showCollections;
            window.showCollectionDetail = showCollectionDetail;
            window.showDetail = showDetail;
            window.handleLogin = handleLogin;
            window.handleCreateAccount = handleCreateAccount;
            window.handleLogout = handleLogout;
            window.handleProfileClick = handleProfileClick;
            window.closeProfileModal = closeProfileModal;
            window.switchAuthTab = switchAuthTab;
            window.openProfileModal = openProfileModal;
            window.switchLibraryTab = switchLibraryTab;
            window.applyFilters = applyFilters;
            window.applyRankFilters = applyRankFilters;
            // handleWatchlistToggle / handleWatched / handleRating are already
            // defined directly as window.X = async function(...) {...} above
            // (search for their definitions), so re-assigning window.X = window.X
            // here was a redundant no-op left over from an earlier refactor —
            // removed rather than left in as confusing dead code.
            window.closeSearchFn = closeSearchFn;
            window.getCurrentUser = getCurrentUser;
            window.isLoggedIn = isLoggedIn;
            window.addXP = addXP;
            window.renderLeaderboard = renderLeaderboard;
            window.generateRecommendations = generateRecommendations;
            window.goBack = goBack;

// ─── START APP: run init() AFTER WINDOW LOAD (mirrors the original runApp() gate) ───
// The original single-file script wrapped everything in a
// function runApp() and only called it once window 'load' fired
// (or immediately if the page was already fully loaded), so that
// GSAP/Swiper/Supabase (loaded via separate <script> tags) were
// guaranteed to be ready first. api.js + app.js together are that
// same body, so init() is called here under the same gate.
if (document.readyState === 'complete') {
    init();
} else {
    window.addEventListener('load', init);
}
