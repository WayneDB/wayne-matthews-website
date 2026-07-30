function shakeElement(el) {
    if (!el) return;
    el.classList.remove("shake");
    void el.offsetWidth; // force reflow so the animation can replay
    el.classList.add("shake");
}

/* =========================================================
   COMPONENT LOADING
   Pulls in any [data-component] block from /blocks, recursively,
   then announces "partials:loaded" once everything is in the DOM.
========================================================= */

async function loadComponents(container = document) {
    const components = container.querySelectorAll("[data-component]");

    for (const element of components) {
        const component = element.dataset.component;

        try {
            const response = await fetch(`blocks/${component}.html`);

            if (!response.ok) {
                throw new Error(`Failed to load ${component}.html`);
            }

            element.innerHTML = await response.text();

            await loadComponents(element); // handle nested components
        } catch (error) {
            console.error(error);
        }
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    await loadComponents();
    document.dispatchEvent(new Event("partials:loaded"));
});


/* =========================================================
   DATA-DRIVEN RENDERING
========================================================= */

const jsonCache = {};

function fetchJSON(path) {
    if (!jsonCache[path]) {
        jsonCache[path] = fetch(path).then(response => response.json());
    }
    return jsonCache[path];
}

function showLoadError(container, message) {
    const template = document.getElementById("load-error-template");
    if (!template) return;
    const clone = template.content.cloneNode(true);
    if (message) {
        clone.querySelector('[data-field="message"]').textContent = message;
    }
    container.innerHTML = "";
    container.appendChild(clone);
}

// CAROUSEL
function preloadCarouselImages(items, renderItem) {
    items.forEach(item => {
        const rendered = renderItem(item);
        rendered.querySelectorAll?.("img").forEach(img => {
            if (img.src) {
                const preload = new Image();
                preload.src = img.src;
            }
        });
    });
}

function initCarousel(container, items, renderItem) {
    const FLIP_STEP_DELAY = 80;
    const flipDuration = 500; // ms, total time for a full flip (two 250ms phases)
    const halfDuration = flipDuration / 2;

    const carousel = container.closest("[data-carousel]");
    const prevBtn = carousel?.querySelector(".carousel-prev");
    const nextBtn = carousel?.querySelector(".carousel-next");
    const wrap = carousel?.dataset.wrap === "true";
    const intervalMs = parseInt(carousel?.dataset.interval, 10) || 0;
    const perPage = parseInt(carousel?.dataset.perPage, 10) || Number.MAX_SAFE_INTEGER;

    const buildCard = () => {
        const card = document.createElement("div");
        card.className = "flip-card";
        card.innerHTML = `
            <div class="flip-card-inner">
                <div class="flip-face"></div>
            </div>`;
        return card;
    };

    preloadCarouselImages(items, renderItem);

    let cards = [];
    let cardWidth = 0;

    const countColumns = () => {
        if (cards.length > 0) {
            cardWidth = cards[0].getBoundingClientRect().width;
        } else {
            container.innerHTML = "";
            const sample = buildCard();
            const face = sample.querySelector(".flip-face");
            if (items[0]) face.appendChild(renderItem(items[0]));
            container.appendChild(sample);
            cardWidth = sample.getBoundingClientRect().width;
            container.innerHTML = "";
        }
        const gap = parseFloat(getComputedStyle(container).gap) || 0;
        const containerWidth = container.getBoundingClientRect().width;
        if (!cardWidth) return 1;
        return Math.min(perPage, items.length, Math.max(1, Math.floor((containerWidth + gap) / (cardWidth + gap))));
    };

    const lastPage = (perPage) => Math.max(0, Math.ceil(items.length / perPage) - 1);

    let columns = countColumns();
    let page = 0;
    let isAnimating = false;

    const buildGrid = () => {
        container.innerHTML = "";
        cards = [];
        for (let i = 0; i < columns; i++) {
            const card = buildCard();
            if (cardWidth) card.style.width = `${cardWidth}px`;
            container.appendChild(card);
            cards.push(card);
        }
    };

    const updateArrows = (targetPage = page) => {
        if (wrap) {
            prevBtn?.classList.remove("hide");
            nextBtn?.classList.remove("hide");
        } else {
            prevBtn?.classList.toggle("hide", targetPage === 0);
            nextBtn?.classList.toggle("hide", targetPage >= lastPage(columns));
        }
        prevBtn?.classList.toggle("disabled", isAnimating);
        nextBtn?.classList.toggle("disabled", isAnimating);
    };

    const fillPage = () => {
        const pageItems = items.slice(page * columns, page * columns + columns);
        cards.forEach((card, i) => {
            const inner = card.querySelector(".flip-card-inner");
            const face = card.querySelector(".flip-face");
            inner.style.transition = "0ms";
            inner.style.transform = "rotateY(0deg)";
            face.innerHTML = "";
            if (pageItems[i]) {
                face.appendChild(renderItem(pageItems[i]));
                card.classList.remove("hide");
            } else {
                card.classList.add("hide");
            }
        });
        updateArrows();
    };

    buildGrid();
    fillPage();

    // Animates one card through a single 0->90->swap->90->0 sequence.
    // Returns a Promise that resolves once the card has fully settled.
    const animateCard = (card, i, hadContent, willHaveContent, newItem, dir) => {
        const inner = card.querySelector(".flip-card-inner");
        const face = card.querySelector(".flip-face");
        const angle = dir === 1 ? -90 : 90;
        const delay = (dir === 1 ? i : columns - 1 - i) * FLIP_STEP_DELAY;

        const rotateTo = (deg, duration, wait) => new Promise(resolve => {
            inner.style.transitionDuration = `${duration}ms`;
            inner.style.transitionDelay = `${wait}ms`;
            requestAnimationFrame(() => {
                inner.style.transform = `rotateY(${deg}deg)`;
            });
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                inner.removeEventListener("transitionend", onEnd);
                resolve();
            };
            const onEnd = (e) => {
                if (e.target === inner && e.propertyName === "transform") finish();
            };
            inner.addEventListener("transitionend", onEnd);
            setTimeout(finish, duration + wait + 50); // safety net
        });

        return (async () => { 
            
            if (hadContent) { 
                await rotateTo(angle, halfDuration, delay); 
            } else { 
                inner.style.transitionDuration = "0ms"; 
                inner.style.transitionDelay = "0ms"; 
                inner.style.transform = `rotateY(${angle}deg)`; 
                void inner.offsetWidth;
                await new Promise(r => setTimeout(r, delay));
            } 
            
            if (willHaveContent) { 
                face.innerHTML = ""; face.appendChild(renderItem(newItem)); 
                card.classList.remove("hide"); 
            } else { 
                card.classList.add("hide"); 
                face.innerHTML = ""; 
            } 

            inner.style.transitionDuration = "0ms"; 
            inner.style.transitionDelay = "0ms"; 
            inner.style.transform = `rotateY(${-angle}deg)`; 
            void inner.offsetWidth; 
            
            await rotateTo(0, halfDuration, 0);
            
            inner.style.transitionDuration = "0ms"; 
            inner.style.transitionDelay = "0ms"; 
            inner.style.transform = "rotateY(0deg)"; 
        })();
    };

    const goToPage = (newPage, forcedDir = null) => {
        if (isAnimating || newPage === page) return;
        const dir = forcedDir !== null ? forcedDir : (newPage > page ? 1 : -1);

        const currentItems = items.slice(page * columns, page * columns + columns);
        const nextItems = items.slice(newPage * columns, newPage * columns + columns);

        const tasks = [];
        cards.forEach((card, i) => {
            const hadContent = !!currentItems[i];
            const willHaveContent = !!nextItems[i];
            if (!hadContent && !willHaveContent) return;
            tasks.push(animateCard(card, i, hadContent, willHaveContent, nextItems[i], dir));
        });

        if (!tasks.length) {
            page = newPage;
            return updateArrows();
        }

        isAnimating = true;
        updateArrows(newPage);

        Promise.all(tasks).then(() => {
            page = newPage;
            isAnimating = false;
            updateArrows();
        });
    };

    const goToNextPage = () => {
        if (page < lastPage(columns)) goToPage(page + 1);
        else if (wrap) goToPage(0, 1);
    };

    const goToPrevPage = () => {
        if (page > 0) goToPage(page - 1);
        else if (wrap) goToPage(lastPage(columns), -1);
    };

    let autoplayTimer = null;
    const scheduleAutoplay = () => {
        if (!intervalMs) return;
        clearTimeout(autoplayTimer);
        autoplayTimer = setTimeout(() => {
            goToNextPage();
            scheduleAutoplay();
        }, intervalMs);
    };
    const stopAutoplay = () => clearTimeout(autoplayTimer);

    prevBtn?.addEventListener("click", () => {
        stopAutoplay();
        goToPrevPage();
        scheduleAutoplay();
    });
    nextBtn?.addEventListener("click", () => {
        stopAutoplay();
        goToNextPage();
        scheduleAutoplay();
    });

    let resizeTimeout;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const newColumns = countColumns();
            if (newColumns !== columns) {
                columns = newColumns;
                page = 0;
                buildGrid();
                fillPage();
            }
        }, 150);
    });

    if (intervalMs && carousel) {
        let isHovered = false;
        let isVisible = false;

        const maybeStart = () => {
            if (isVisible && !isHovered) scheduleAutoplay();
            else stopAutoplay();
        };

        carousel.addEventListener("mouseenter", () => { isHovered = true; maybeStart(); });
        carousel.addEventListener("mouseleave", () => { isHovered = false; maybeStart(); });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                isVisible = entry.isIntersecting;
                maybeStart();
            });
        }, { threshold: 0.4 });

        observer.observe(carousel);
    }
}

function setLanguage(language) {
    const url = new URL(window.location);
    url.searchParams.set("lang", language);

    window.history.replaceState({}, "", url);

    applyLanguage();
}

function getLanguage() {
    const params = new URLSearchParams(window.location.search);
    return params.get("lang") || "en";
}

function getLocalizedString(key, default_value) {
    fetchJSON('data/language.json')
        .then(data => {
            var strings = data[getLanguage()] || data.en;
            console.log(strings);
            return strings[key] || default_value;
        });
}

document.addEventListener("partials:loaded", () => {
    document.querySelectorAll('[data-render="releases"]').forEach(container => { renderReleases(container); });
    document.querySelectorAll('[data-render="featured-release"]').forEach(container => { renderFeaturedRelease(container); });
    document.querySelectorAll('[data-render="gallery"]').forEach(container => { renderGallery(container); });
    document.querySelectorAll('[data-render="featured-videos"]').forEach(container => { renderVideos(container); });
    document.querySelectorAll('[data-render="tour-dates"]').forEach(container => { renderTourDates(container); });
    document.querySelectorAll('[data-render="press-photos"]').forEach(container => { renderPressPhotos(container); });
    
    applyLanguage();
});

function renderVideos(container) {
    fetchJSON("data/videos.json")
        .then(videos => {
            const template = document.getElementById("video-template");

            const render = (video) => {
                const clone = template.content.cloneNode(true);
                const embed = clone.querySelector('[data-field="embed"]');
                embed.src = `https://www.youtube-nocookie.com/embed/${video.videoId}`;
                embed.title = video.title;
                return clone;
            };

            initCarousel(container, videos, render);
        })
        .catch(error => {
            console.error("Error loading release cards:", error);
            showLoadError(container);
        });
}

// GALLERY
function renderGallery(container) {
    const galleryName = container.dataset.gallery || "main";

    fetchJSON(`data/gallery-${galleryName}.json`)
        .then(photos => {
            const template = document.getElementById("gallery-photo-template");

            const render = (photo) => {
                const clone = template.content.cloneNode(true);
                const img = clone.querySelector('[data-field="image"]');
                img.src = photo.image;
                img.alt = photo.alt || "Wayne Matthews photo";
                return clone;
            };

            initCarousel(container, photos, render);
        })
        .catch(error => {
            console.error("Error loading release cards:", error);
            showLoadError(container);
        });
}

// RELEASES
function renderReleases(container) {
    fetchJSON("data/releases.json")
        .then(data => {
            const template = document.getElementById("release-card-template");
            const releases = [...data].sort(
                (a, b) => new Date(b.releaseDate) - new Date(a.releaseDate)
            );

            const renderCard = (release) => {
                const clone = template.content.cloneNode(true);
                const cover = clone.querySelector('[data-field="cover"]');
                cover.src = release.cover;
                cover.alt = `${release.title} cover art`;
                clone.querySelector('[data-field="type"]').textContent = release.type;
                clone.querySelector('[data-field="title"]').textContent = release.title;
                clone.querySelector('[data-field="year"]').textContent = release.year;
                clone.querySelector('[data-field="link"]').href = release.url;
                return clone;
            };

            initCarousel(container, releases, renderCard)
        })
        .catch(error => {
            console.error("Error loading release cards:", error);
            showLoadError(container);
        });
}

// FEATURED RELEASE
function renderFeaturedRelease(container) {
    fetchJSON("data/releases.json")
        .then(data => {
            const template = document.getElementById("featured-release-template");
            const release = data.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate))[0];

            const clone = template.content.cloneNode(true);
            const cover = clone.querySelector('[data-field="cover"]');
            cover.src = release.cover;
            cover.alt = `${release.title} cover art`;
            clone.querySelector('[data-field="year"]').textContent = release.year;
            clone.querySelector('[data-field="title"]').textContent = release.title;
            clone.querySelectorAll('[data-field="link"]')?.forEach(a => {
                a.href = release.url
                a.setAttribute("aria-label", `Listen to ${release.title}`);
            });

            container.appendChild(clone);
        })
        .catch(error => {
            console.error("Error loading featured release:", error);
            showLoadError(container);
        });
}

// PRESS TRACKS
function renderPressTracks(container) {
    return fetchJSON("data/press-tracks.json")
        .then(tracks => {
            const template = document.getElementById("press-track-template");
            container.innerHTML = "";
            tracks.forEach(track => {
                const clone = template.content.cloneNode(true);
                const embed = clone.querySelector('[data-field="embed"]');
                embed.src = `https://open.spotify.com/embed/album/${track.spotifyId}?utm_source=generator&theme=0`;
                embed.title = track.title;
                container.appendChild(clone);
            });
        })
        .catch(error => {
            console.error("Error loading press tracks:", error);
            showLoadError(container);
        });
}

// TOUR DATES
function renderTourDates(container) {
    const artistName = encodeURIComponent("Wayne Matthews");
    const apikey = "7a7f46d1e6b41189f5daa668ef7e80f3";

    fetch(`https://rest.bandsintown.com/artists/${artistName}/events/?app_id=${apikey}&date=upcoming`)
        .then(response => response.json())
        .then(data => {
            const template = document.getElementById("tour-date-template");

            let events = Array.isArray(data)
                ? [...data].sort((a, b) => new Date(a.datetime) - new Date(b.datetime))
                : [];

            const limit = container.dataset.limit;
            if (limit) {
                events = events.slice(0, Number(limit));
            }
            
            if (events.length === 0) {
                return;
            }
            
            container.querySelector('#on-empty')?.remove();

            events.forEach(event => {
                const clone = template.content.cloneNode(true);
                const eventDate = new Date(event.datetime);
                const formattedDate = eventDate.toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric"
                });

                clone.querySelector('[data-field="title"]').textContent = event.venue.name;
                clone.querySelector('[data-field="date"]').textContent = formattedDate;
                clone.querySelector('[data-field="location"]').textContent = `${event.venue.city}, ${event.venue.country}`;
                clone.querySelector('[data-field="link"]').href = event.url;

                container.appendChild(clone);
            });
        })
        .catch(error => {
            console.error("Error loading release cards:", error);
            showLoadError(container, "Couldn't check upcoming tour dates — try refreshing the page.");
        });
}



/* =========================================================
   HERO SCROLL EFFECT
   Fake camera push-in on the homepage hero as the user scrolls.
========================================================= */

const hero = document.querySelector(".hero");
const heroImage = document.querySelector(".hero-image");
const heroContent = document.querySelector(".hero-content");

if (heroImage) {
    window.addEventListener("scroll", () => {
        const scrollPosition = window.scrollY;
        const heroHeight = hero.offsetHeight;

        let progress = Math.min(scrollPosition / heroHeight, 1);
        progress = progress * progress; // ease-in curve

        // Background camera movement
        const scale = 100 + (progress * 100);
        const position = progress * 200;

        heroImage.style.zoom = `${scale}%`;
        heroImage.style.backgroundPosition = `center ${position}px`;

        // Content movement + fade
        if (heroContent) {
            const opacity = 1 - (progress * 3.5);
            const movement = progress * 300;

            heroContent.style.opacity = opacity;
            heroContent.style.top = `${movement}px`;
            heroContent.style.zoom = `${scale}%`;
        }
    });
}

/* =========================================================
   HIDE NAV ON SCROLL DOWN
   Reveals again when scrolling up or back at the top.
========================================================= */

let lastScrollY = window.scrollY;
let isNavigating = false;

function suppressHideForNavigation() {
    isNavigating = true;
    lastScrollY = window.scrollY; // avoid a false "scrolled down" jump once resumed
}

// Any in-page anchor click (nav links, "skip to section", etc.)
document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href*="#"]');
    if (link) {
        suppressHideForNavigation();
    }
});

// Covers back/forward navigation landing on a hash, and any
// programmatic scrollIntoView() / location.hash changes too.
window.addEventListener("hashchange", suppressHideForNavigation);

window.addEventListener("scroll", () => {
    const currentScrollY = window.scrollY;
    const hideableElements = document.querySelectorAll(".hide-on-scroll");

    const show = () => {
        hideableElements.forEach(el => {
            el.inert = false;
            el.classList.remove("hide");
            el.classList.remove("is-hiding");
        });
    };

    const hide = () => {
        hideableElements.forEach(el => {
            el.classList.add("is-hiding");

            // Add .hide after the opacity transition finishes
            el.addEventListener("transitionend", function handler(event) {
                if (
                    event.propertyName === "opacity" &&
                    el.classList.contains("is-hiding")
                ) {
                    el.inert = true;
                    el.classList.add("hide");
                    el.removeEventListener("transitionend", handler);
                }
            });
        });
    };

    if (isNavigating) {
        lastScrollY = currentScrollY;
        return;
    }

    if (currentScrollY <= 0) {
        show();
    } else if (currentScrollY > lastScrollY + 2) {
        hide(); // scrolling down
    } else if(currentScrollY < lastScrollY - 2) {
        show(); // scrolling up
    }

    lastScrollY = currentScrollY;
});

// scrollend fires once the browser-driven scroll (smooth or instant)
// has actually finished, regardless of what triggered it.
window.addEventListener("scrollend", () => {
    isNavigating = false;
});
 
document.addEventListener("partials:loaded", () => {
    const header = document.querySelector("header");
    if (!header) return;
 
    const hero = document.querySelector(".hero");
 
    // No hero on this page (bio/tour/music) — header is solid immediately.
    if (!hero) {
        header.classList.add("solid");
        return;
    }
 
    // Hero present (index/links) — solid only once scrolled past it.
    const updateHeaderState = () => {
        const heroBottom = hero.getBoundingClientRect().bottom;
        header.classList.toggle("solid", heroBottom <= 0);
    };
 
    updateHeaderState();
    window.addEventListener("scroll", updateHeaderState);
});

/* =========================================================
   MOBILE MENU TOGGLE
========================================================= */

document.addEventListener("partials:loaded", () => {
    const toggle = document.querySelector(".menu-toggle");
    const menu = document.querySelector(".mobile-menu");
    if (!toggle || !menu) return;

    const barsIcon = toggle.querySelector(".icon-bars");
    const xmarkIcon = toggle.querySelector(".icon-xmark");

    const closeMenu = () => {
        menu.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        menu.inert = true;
        menu.setAttribute("aria-hidden", "true");
        barsIcon?.classList.remove("hide");
        xmarkIcon?.classList.add("hide");
    };

    const openMenu = () => {
        menu.classList.add("is-open");
        menu.inert = false;
        menu.setAttribute("aria-hidden", "false");
        toggle.setAttribute("aria-expanded", "true");
        barsIcon?.classList.add("hide");
        xmarkIcon?.classList.remove("hide");
    };

    toggle.addEventListener("click", () => {
        menu.classList.contains("is-open") ? closeMenu() : openMenu();
    });

    menu.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", closeMenu);
    });
});

/* =========================================================
   COOKIE CONSENT
========================================================= */

const COOKIE_CONSENT_KEY = "cookie-consent"; // JSON: { functional: bool, analytics: bool }

function getCookieConsent() {
    try {
        return JSON.parse(localStorage.getItem(COOKIE_CONSENT_KEY));
    } catch {
        return null;
    }
}

function hasConsentDecision() {
    return getCookieConsent() !== null;
}

function saveCookieConsent(consent) {
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
}

function pageNeedsSender() {
    return !!document.querySelector("#subscribebutton");
}

function loadSenderScript() {
    if (document.getElementById("sender-script")) return;
    const script = document.createElement("script");
    script.id = "sender-script";
    script.src = "scripts/sender.js";
    document.head.appendChild(script);
}

function loadAnalyticsScript() {
    if (document.getElementById("ga-script")) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag("js", new Date());
    gtag("config", "G-TKDZCT3KG8", { anonymize_ip: true });

    const script = document.createElement("script");
    script.id = "ga-script";
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=G-TKDZCT3KG8";
    document.head.appendChild(script);
}

function deleteAnalyticsCookies() {
    document.cookie.split(";").forEach(c => {
        const name = c.split("=")[0].trim();
        if (name.startsWith("_ga")) {
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        }
    });
}

function applyCookieConsent() {
    const consent = getCookieConsent();
    if (!consent) return;

    if (consent.functional && pageNeedsSender()) loadSenderScript();

    if (consent.analytics) {
        loadAnalyticsScript();
    } else {
        deleteAnalyticsCookies();
    }
}

function showCookieBanner() {
    const banner = document.getElementById("cookie-banner");
    if (!banner) return;

    const consent = getCookieConsent();
    const functionalBox = document.getElementById("consent-functional");
    const analyticsBox = document.getElementById("consent-analytics");
    if (functionalBox) functionalBox.checked = consent?.functional ?? false;
    if (analyticsBox) analyticsBox.checked = consent?.analytics ?? false;

    const wasHidden = banner.classList.contains("hide");
    banner.classList.remove("hide");
}

function hideCookieBanner() {
    document.getElementById("cookie-banner")?.classList.add("hide");
}

document.addEventListener("partials:loaded", () => {
    if (!document.getElementById("cookie-banner")) return;

    if (!hasConsentDecision()) {
        showCookieBanner();
    } else {
        applyCookieConsent();
    }

    document.getElementById("cookie-save")?.addEventListener("click", () => {
        const consent = {
            functional: document.getElementById("consent-functional")?.checked ?? false,
            analytics: document.getElementById("consent-analytics")?.checked ?? false,
        };
        saveCookieConsent(consent);
        hideCookieBanner();
        applyCookieConsent();
    });

    document.getElementById("cookie-decline")?.addEventListener("click", (event) => {
        event.preventDefault();
        saveCookieConsent({ functional: false, analytics: false });
        hideCookieBanner();
        applyCookieConsent();
    });

    document.getElementById("cookie-accept-all")?.addEventListener("click", () => {
        saveCookieConsent({ functional: true, analytics: true });
        hideCookieBanner();
        applyCookieConsent();
    });
});


document.addEventListener("click", (event) => {
    if (event.target.closest("#cookie-settings")) {
        event.preventDefault();
        showCookieBanner();
    }
});

document.getElementById("cookie-decline")?.addEventListener("click", () => {
    saveCookieConsent({ functional: false, analytics: false });
    hideCookieBanner();
    applyCookieConsent();
});

document.addEventListener("click", (event) => {
    const btn = event.target.closest("#subscribebutton");
    if (!btn) return;
    const consent = getCookieConsent();
    if (!consent?.functional) {
        event.preventDefault();
        event.stopPropagation();
        showCookieBanner();
        shakeElement(document.getElementById("consent-functional")?.closest("label"));
    }
}, true);

/* =========================================================
   PRESS KIT
========================================================= */

function renderBioFull(container) {
    return fetchJSON("data/bio.json")
        .then(data => {
            const lang = getLanguage();
            const content = data[lang] || data.en;
            
            container.innerHTML = "";
            content.full.forEach(text => {
                const p = document.createElement("p");
                p.textContent = text;
                p.style.marginTop = "var(--space-xs)";
                container.appendChild(p);
            });
        })
        .catch(error => {
            console.error("Error loading press bio:", error);
            showLoadError(container);
        });
}

function renderBioShort(container) {
    return fetchJSON("data/bio.json")
        .then(data => {
            const lang = getLanguage();
            const content = data[lang] || data.en;
            
            container.innerHTML = "";
            const p = document.createElement("p");
            p.textContent = content.short;
            container.appendChild(p);
        })
        .catch(error => {
            console.error("Error loading press bio:", error);
            showLoadError(container);
        });
}

function renderBioMentions(container) {
    return fetchJSON("data/bio.json")
        .then(data => {
            const lang = getLanguage();
            const content = data[lang] || data.en;
            
            container.innerHTML = null;

            const list = document.createElement("ul");
            list.style.marginLeft = "var(--space-md)";
            list.style.marginTop = "var(--space-xs)";
            list.style.display = "flex";
            list.style.flexDirection = "column";
            list.style.gap = "var(--space-xs)";

            content.mentions.forEach(mention => {
                const li = document.createElement("li");
                if (mention.url) {
                    const a = document.createElement("a");
                    a.href = mention.url;
                    a.target = "_blank";
                    a.textContent = mention.text;
                    li.appendChild(a);
                } else {
                    li.textContent = mention.text;
                }
                list.appendChild(li);
            });
            container.appendChild(list);
        })
        .catch(error => {
            console.error("Error loading press bio:", error);
            showLoadError(container);
        });
}

function applyLanguage() {
    const language = getLanguage();
    
    document.querySelectorAll("[data-language]").forEach(btn => {
        const isActive = btn.dataset.language === language;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-pressed", isActive);
    });
    
    applyLanguageStrings();
    applyBioLanguage();
}

function applyBioLanguage(){
    document.querySelectorAll('[data-render="bio-full"]').forEach(container => { renderBioFull(container); });
    document.querySelectorAll('[data-render="bio-short"]').forEach(container => { renderBioShort(container); });
    document.querySelectorAll('[data-render="bio-mentions"]').forEach(container => { renderBioMentions(container); });
}

document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-language]");
    if (!btn) return;
    setLanguage(btn.dataset.language);
});

function renderPressPhotos(container) {
    return fetchJSON("data/press-photos.json")
        .then(photos => {
            const template = document.getElementById("press-photo-template");
            container.innerHTML = "";
            photos.forEach(photo => {
                const clone = template.content.cloneNode(true);
                const link = clone.querySelector('[data-field="link"]');
                const img = clone.querySelector('[data-field="image"]');
                link.href = photo.download;
                img.src = photo.image;
                img.alt = photo.alt || "Wayne Matthews photo";
                container.appendChild(clone);
            });
        })
        .catch(error => {
            console.error("Error loading press photos:", error);
            showLoadError(container);
        });
}

/* =========================================================
   LANGUAGE (site-wide strings — reusable anywhere)
========================================================= */

function applyLanguageStrings() {
    return fetchJSON("data/language.json")
        .then(data => {
            const lang = getLanguage();
            const strings = data[lang] || data.en;

            document.documentElement.lang = lang;

            document.querySelectorAll("[data-string]").forEach(el => {
                const value = strings[el.dataset.string];
                if (value) el.textContent = value;
            });

            document.querySelectorAll("[data-language]").forEach(btn => {
                btn.classList.toggle("active-lang", btn.dataset.language === lang);
            });
        })
        .catch(error => console.error("Error loading language strings:", error));
}

/* =========================================================
   LIGHT BOX
========================================================= */

let lightboxOriginRect = null; // remembers the thumbnail's position for the close animation
let lightboxOriginTrigger = null; // remembers which element to return focus to

document.addEventListener("click", (event) => {
    const img = event.target.closest('[data-render="gallery"] img');
    if (img) {
        openLightbox(img, img.src.replace('_thumbnail', ''));
        return;
    }
    closeLightbox();
});

document.addEventListener("keydown", (event) => {
    const lightbox = document.getElementById("lightbox");
    const isOpen = lightbox && !lightbox.classList.contains("hide");

    if (isOpen) {
        if (event.key === "Escape") {
            closeLightbox();
            return;
        }
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault(); // stop Space from scrolling the page
            closeLightbox();
            return;
        }
        if (event.key === "Tab") {
            event.preventDefault();
            lightbox.focus();
            return;
        }
    }

    // Open via keyboard when a gallery photo has focus
    const img = event.target.closest('[data-render="gallery"] img');
    if (img && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        openLightbox(img, img.src.replace('_thumbnail', ''));
    }
});

function openLightbox(sourceImg, sourceUrl = null) {
    const lightbox = document.getElementById("lightbox");
    const image = document.getElementById("lightbox-image");
    if (!lightbox || !image) return;

    lightboxOriginRect = sourceImg.getBoundingClientRect();
    lightboxOriginTrigger = sourceImg;

    image.src = sourceUrl ?? sourceImg.src;
    image.alt = sourceImg.alt || "";
    lightbox.classList.remove("hide");
    lightbox.focus();

    // Wait for the image to have its natural lightbox layout before measuring it
    const placeAndAnimate = () => {
        const targetRect = image.getBoundingClientRect();
        const dx = lightboxOriginRect.left - targetRect.left;
        const dy = lightboxOriginRect.top - targetRect.top;
        const scaleX = lightboxOriginRect.width / targetRect.width;
        const scaleY = lightboxOriginRect.height / targetRect.height;

        // Snap to the thumbnail's spot/size with no transition
        image.style.transition = "none";
        image.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
        image.style.transformOrigin = "top left";

        void image.offsetWidth; // force the snap to apply before animating

        // Animate to natural position/size
        requestAnimationFrame(() => {
            image.style.transition = "";
            image.style.transform = "translate(0, 0) scale(1, 1)";
        });
    };

    if (image.complete) {
        placeAndAnimate();
    } else {
        image.addEventListener("load", placeAndAnimate, { once: true });
    }
}

function closeLightbox() {
    const lightbox = document.getElementById("lightbox");
    const image = document.getElementById("lightbox-image");
    if (!lightbox || !image || lightbox.classList.contains("hide")) return;

    const returnFocus = () => {
        if (lightboxOriginTrigger && document.contains(lightboxOriginTrigger)) {
            lightboxOriginTrigger.focus();
        } else {
            document.querySelector('[data-render="gallery"]')?.focus?.();
        }
        lightboxOriginTrigger = null;
    };

    if (!lightboxOriginRect) {
        lightbox.classList.add("hide");
        returnFocus();
        return;
    }

    const currentRect = image.getBoundingClientRect();
    const dx = lightboxOriginRect.left - currentRect.left;
    const dy = lightboxOriginRect.top - currentRect.top;
    const scaleX = lightboxOriginRect.width / currentRect.width;
    const scaleY = lightboxOriginRect.height / currentRect.height;

    image.style.transformOrigin = "top left";
    image.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;

    const onDone = () => {
        lightbox.classList.add("hide");
        image.style.transition = "none";
        image.style.transform = "";
        image.style.transformOrigin = "";
        image.src = "";
        void image.offsetWidth;
        image.style.transition = "";
        image.removeEventListener("transitionend", onDone);
        returnFocus();
    };
    image.addEventListener("transitionend", onDone, { once: true });
}

/* =========================================================
   RIDER
========================================================= */

function getRiderPdfPath(setup) {
    return `files/wayne-matthews-tech-rider-${setup}.pdf`;
}

async function downloadRiderPdf(requestedSetup) {
    const fallback = "looper";
    const candidate = requestedSetup || fallback;

    const tryFetch = async (setup) => {
        const path = getRiderPdfPath(setup);
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Not found: ${path}`);
        return { setup, blob: await response.blob() };
    };

    let result;
    try {
        result = await tryFetch(candidate);
    } catch {
        result = await tryFetch(fallback);
    }

    const blobUrl = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `wayne-matthews-tech-rider-${result.setup}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
}

document.getElementById("download-rider-btn")?.addEventListener("click", () => {
    const params = new URLSearchParams(window.location.search);
    const requestedSetup = params.get("setup");
    downloadRiderPdf(requestedSetup);
});

document.getElementById("copy-bio-btn")?.addEventListener("click", () => {
    const bio = document.getElementById("bio-short")
    if(!bio) return;

    navigator.clipboard.writeText(bio.textContent)
        .then(() => {
            const btn = document.getElementById("copy-bio-btn");
            btn.textContent += ' 📋';
            setTimeout(() => {
                btn.textContent = btn.textContent.replace(' 📋', '');
            }, 2000);
        });
});