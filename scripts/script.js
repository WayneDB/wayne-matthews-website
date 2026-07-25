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
    const flipDuration = 0.5;
    const rows = Math.max(1, parseInt(container.dataset.rows, 10) || 1);

    container.style.setProperty("--flip-duration", `${flipDuration}s`);

    const carousel = container.closest("[data-carousel]");
    const prevBtn = carousel?.querySelector(".carousel-prev");
    const nextBtn = carousel?.querySelector(".carousel-next");

    const wrap = carousel?.dataset.wrap;
    const intervalMs = parseInt(carousel?.dataset.interval, 10) || 0;

    const waitForMedia = (el) => {
        const media = [...el.querySelectorAll("img, iframe")];
        if (media.length === 0) return Promise.resolve();
        return Promise.race([
            Promise.all(media.map(m => {
                if (m.tagName === "IMG" && m.complete) return Promise.resolve();
                return new Promise(resolve => {
                    m.addEventListener("load", resolve, { once: true });
                    m.addEventListener("error", resolve, { once: true });
                });
            })),
            new Promise(resolve => setTimeout(resolve, 2000))
        ]);
    };

    const buildCard = () => {
        const card = document.createElement("div");
        card.className = "flip-card";
        card.innerHTML = `
            <div class="flip-card-inner">
                <div class="flip-face flip-face-front"></div>
                <div class="flip-face flip-face-back"></div>
            </div>`;
        return card;
    };

    preloadCarouselImages(items, renderItem);

    let cards = []; // moved up so countColumns() can use it

    const countColumns = () => {
        let cardWidth;

        if (cards.length > 0) {
            // Reuse an existing card instead of tearing down the DOM to measure
            cardWidth = cards[0].getBoundingClientRect().width;
        } else {
            container.innerHTML = "";
            const sample = buildCard();
            const front = sample.querySelector(".flip-face-front");
            if (items[0]) front.appendChild(renderItem(items[0]));
            container.appendChild(sample);
            cardWidth = sample.getBoundingClientRect().width;
            container.innerHTML = "";
        }

        const gap = parseFloat(getComputedStyle(container).gap) || 0;
        const containerWidth = container.getBoundingClientRect().width;

        if (!cardWidth) return 1;
        return Math.max(1, Math.floor((containerWidth + gap) / (cardWidth + gap)));
    };

    const lastPage = (perPage) => Math.max(0, Math.ceil(items.length / perPage) - 1);

    let itemsPerPage = countColumns();
    let page = 0;
    let isAnimating = false;

    const buildGrid = () => {
        container.innerHTML = "";
        cards = [];
        for (let i = 0; i < itemsPerPage; i++) {
            const card = buildCard();
            container.appendChild(card);
            cards.push(card);
        }
    };

    const updateArrows = (targetPage = page) => {
        prevBtn?.classList.toggle("hide", !wrap && targetPage === 0);
        prevBtn?.classList.toggle("disabled", isAnimating);
        
        nextBtn?.classList.toggle("hide", !wrap && targetPage >= lastPage(itemsPerPage));
        nextBtn?.classList.toggle("disabled", isAnimating);
    };

    const fillPage = () => {
        const pageItems = items.slice(page * itemsPerPage, page * itemsPerPage + itemsPerPage);
        cards.forEach((card, i) => {
            const front = card.querySelector(".flip-face-front");
            front.innerHTML = "";
            if (pageItems[i]) {
                front.appendChild(renderItem(pageItems[i]));
                card.classList.remove("hide");
            } else {
                card.classList.add("hide");
            }
        });
        updateArrows();
    };

    buildGrid();
    fillPage();

    const goToPage = (newPage, forceDir = null) => {
        if (isAnimating || newPage === page) return;
    const dir = forceDir !== null ? forceDir : (newPage > page ? 1 : -1);

        const currentItems = items.slice(page * itemsPerPage, page * itemsPerPage + itemsPerPage);
        const nextItems = items.slice(newPage * itemsPerPage, newPage * itemsPerPage + itemsPerPage);

        const flipping = [], hiding = [], showing = [];
        cards.forEach((card, i) => {
            const has = !!currentItems[i], will = !!nextItems[i];
            if (has && will) flipping.push({ card, item: nextItems[i], i });
            else if (has && !will) hiding.push({ card, i });
            else if (!has && will) showing.push({ card, item: nextItems[i], i });
        });

        if (!flipping.length && !hiding.length && !showing.length) {
            page = newPage;
            return updateArrows();
        }

        isAnimating = true;
        updateArrows(newPage);

        // Wave direction: starts left when advancing, right when going back
        const stepDelay = (i) => (dir === 1 ? i : cards.length - 1 - i) * FLIP_STEP_DELAY;

        flipping.forEach(({ card, item }) => {
            const back = card.querySelector(".flip-face-back");
            back.innerHTML = "";
            back.appendChild(renderItem(item));
        });

        showing.forEach(({ card, item }) => {
            const front = card.querySelector(".flip-face-front");
            front.innerHTML = "";
            front.appendChild(renderItem(item));
        });

        Promise.resolve().then(() => {
            // Snap "showing" cards to their invisible starting angle before anything animates
            showing.forEach(({ card }) => {
                const inner = card.querySelector(".flip-card-inner");
                card.classList.remove("hide");
                inner.style.transition = "none";
                inner.style.transform = `rotateY(${dir * 90}deg)`;
            });
            if (showing.length) void showing[0].card.offsetWidth; // lock that snap in

            flipping.forEach(({ card, i }) => {
                card.classList.toggle("flip-reverse", dir === -1);
                card.querySelector(".flip-card-inner").style.transitionDelay = `${stepDelay(i)}ms`;
                card.classList.add("is-flipped");
            });

            hiding.forEach(({ card, i }) => {
                card.classList.toggle("flip-reverse", dir === -1);
                card.querySelector(".flip-card-inner").style.transitionDelay = `${stepDelay(i)}ms`;
                card.classList.add("is-hiding");
            });

            showing.forEach(({ card, i }) => {
                const inner = card.querySelector(".flip-card-inner");
                inner.style.transition = "";
                inner.style.transform = "";
                inner.style.transitionDelay = `${stepDelay(i)}ms`;
                card.classList.add("is-showing");
            });

            const maxOffset = Math.max(0, ...cards.map((_, i) => stepDelay(i)));

            setTimeout(() => {
                flipping.forEach(({ card }) => {
                    const inner = card.querySelector(".flip-card-inner");
                    const front = card.querySelector(".flip-face-front");
                    const back = card.querySelector(".flip-face-back");

                    // Swap roles instead of moving nodes — reparenting an <iframe>
                    // forces it to reload, which caused the flash.
                    front.classList.remove("flip-face-front");
                    front.classList.add("flip-face-back");
                    back.classList.remove("flip-face-back");
                    back.classList.add("flip-face-front");

                    inner.style.transition = "none";
                    card.classList.remove("is-flipped", "flip-reverse");
                    inner.style.transitionDelay = "";
                    void inner.offsetWidth;
                    inner.style.transition = "";
                });

                hiding.forEach(({ card }) => {
                    const inner = card.querySelector(".flip-card-inner");
                    card.classList.add("hide");
                    inner.style.transition = "none";
                    card.classList.remove("is-hiding", "flip-reverse");
                    inner.style.transitionDelay = "";
                    void inner.offsetWidth;
                    inner.style.transition = "";
                });

                showing.forEach(({ card }) => {
                    const inner = card.querySelector(".flip-card-inner");
                    inner.style.transition = "none";
                    card.classList.remove("is-showing");
                    inner.style.transitionDelay = "";
                    void inner.offsetWidth;
                    inner.style.transition = "";
                });

                page = newPage;
                isAnimating = false;
                updateArrows();
            }, maxOffset + (flipDuration * 1000) + 20);
        });
    };

    const goToNextPage = () => {
        if (page < lastPage(itemsPerPage)) goToPage(page + 1);
        else if (wrap) goToPage(0, 1);
    };

    const goToPrevPage = () => {
        if (page > 0) goToPage(page - 1);
        else if (wrap) goToPage(lastPage(itemsPerPage), -1);
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
    let suppressResizeUntil = 0;

    document.addEventListener("fullscreenchange", () => {
        // Ignore any resize noise for a bit after entering/exiting fullscreen
        suppressResizeUntil = Date.now() + 500;
    });

    window.addEventListener("resize", () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const newItemsPerPage = countColumns();
            if (newItemsPerPage !== itemsPerPage) {
                itemsPerPage = newItemsPerPage;
                page = 0;
                buildGrid();
                fillPage();
            }
            // if column count is unchanged, do nothing — cards/iframes stay untouched
        }, 150);
    });

    if (intervalMs && carousel) {
        let isHovered = false;
        let isVisible = false;

        const maybeStart = () => {
            if (isVisible && !isHovered) scheduleAutoplay();
            else stopAutoplay();
        };

        carousel.addEventListener("mouseenter", () => {
            isHovered = true;
            maybeStart();
        });
        carousel.addEventListener("mouseleave", () => {
            isHovered = false;
            maybeStart();
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                isVisible = entry.isIntersecting;
                maybeStart();
            });
        }, { threshold: 0.4 });

        observer.observe(carousel);
    }
}


document.addEventListener("partials:loaded", () => {
    document.querySelectorAll('[data-render="socials"]').forEach(container => { renderSocials(container); });
    document.querySelectorAll('[data-render="releases"]').forEach(container => { renderReleases(container); });
    document.querySelectorAll('[data-render="featured-release"]').forEach(container => { renderFeaturedRelease(container); });
    document.querySelectorAll('[data-render="gallery"]').forEach(container => { renderGallery(container); });
    document.querySelectorAll('[data-render="featured-videos"]').forEach(container => { renderVideos(container); });
    document.querySelectorAll('[data-render="tour-dates"]').forEach(container => { renderTourDates(container); });

    document.querySelectorAll('[data-render="press-bio"]').forEach(container => { renderPressBio(container); });
    document.querySelectorAll('[data-render="press-photos"]').forEach(container => { renderPressPhotos(container); });
});

function renderSocials(container) {
    fetch("data/socials.json")
        .then(response => response.json())
        .then(data => {
            const template = document.getElementById("social-icon-template");

            data.forEach(social => {
                const clone = template.content.cloneNode(true);
                clone.querySelector('[data-field="link"]').href = social.url;
                clone.querySelector('[data-field="icon"]').className = social.iconClass;

                container.appendChild(clone);
            });
        })
        .catch(error => {
            console.error("Error loading social icons:", error);
            showLoadError(container);
        });
}

function renderVideos(container) {
    fetch("data/videos.json")
        .then(response => response.json())
        .then(videos => {
            const template = document.getElementById("video-template");

            const render = (video) => {
                const clone = template.content.cloneNode(true);
                const embed = clone.querySelector('[data-field="embed"]');
                embed.src = `https://www.youtube.com/embed/${video.videoId}`;
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

    fetch(`data/gallery-${galleryName}.json`)
        .then(response => response.json())
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
    fetch("data/releases.json")
        .then(response => response.json())
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
    fetch("data/releases.json")
        .then(response => response.json())
        .then(data => {
            const template = document.getElementById("featured-release-template");
            const release = data.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate))[0];

            const clone = template.content.cloneNode(true);
            const cover = clone.querySelector('[data-field="cover"]');
            cover.src = release.cover;
            cover.alt = `${release.title} cover art`;
            clone.querySelector('[data-field="year"]').textContent = release.year;
            clone.querySelector('[data-field="title"]').textContent = release.title;
            clone.querySelectorAll('[data-field="link"]')?.forEach(a => a.href = release.url);

            container.appendChild(clone);
        })
        .catch(error => {
            console.error("Error loading featured release:", error);
            showLoadError(container);
        });
}

// PRESS TRACKS
function renderPressTracks(container) {
    return fetch("data/press-tracks.json")
        .then(response => response.json())
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

    const show = () => hideableElements.forEach(el => el.classList.remove("is-hidden"));
    const hide = () => hideableElements.forEach(el => el.classList.add("is-hidden"));

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

    const icon = toggle.querySelector("i");

    const closeMenu = () => {
        menu.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        if (icon) icon.className = "fa-solid fa-bars";
    };

    const openMenu = () => {
        menu.classList.add("is-open");
        toggle.setAttribute("aria-expanded", "true");
        if (icon) icon.className = "fa-solid fa-xmark";
    };

    toggle.addEventListener("click", () => {
        menu.classList.contains("is-open") ? closeMenu() : openMenu();
    });

    menu.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", closeMenu);
    });
});

/* =========================================================
   COOKIES
========================================================= */

const COOKIE_CONSENT_KEY = "cookie-consent"; // "accepted" | "declined"

function getCookieConsent() {
    return localStorage.getItem(COOKIE_CONSENT_KEY);
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

function showCookieBanner() {
    const banner = document.getElementById("cookie-banner");
    if (!banner) return;
    const wasHidden = banner.classList.contains("hide");
    banner.classList.remove("hide");
    if (!wasHidden) {
        banner.classList.remove("shake");
        void banner.offsetWidth; // force reflow so the animation can replay
        banner.classList.add("shake");
    }
}

function hideCookieBanner() {
    document.getElementById("cookie-banner")?.classList.add("hide");
}

function applyCookieConsent() {
    if (getCookieConsent() === "accepted" && pageNeedsSender()) {
        loadSenderScript();
    }
}

document.addEventListener("partials:loaded", () => {
    if (!document.getElementById("cookie-banner")) return;

    applyCookieConsent(); // no auto-show on load anymore

    document.getElementById("cookie-accept")?.addEventListener("click", () => {
        localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
        hideCookieBanner();
        applyCookieConsent();
        resumePendingSubscribeClick();
    });

    document.getElementById("cookie-decline")?.addEventListener("click", (event) => {
        event.preventDefault();
        localStorage.setItem(COOKIE_CONSENT_KEY, "declined");
        hideCookieBanner();
        applyCookieConsent();
        pendingSubscribeTarget = null; // don't resume on decline
    });
});

let pendingSubscribeTarget = null;

function resumePendingSubscribeClick() {
    if (!pendingSubscribeTarget) return;
    const target = pendingSubscribeTarget;
    pendingSubscribeTarget = null;
    // small delay lets Sender's script finish initializing before we replay the click
    setTimeout(() => target.click(), 400);
}

// Reopen banner from footer / links-page "Cookie Settings" link (delegated, loads async)
document.addEventListener("click", (event) => {
    if (event.target.closest("#cookie-settings")) {
        event.preventDefault();
        showCookieBanner();
    }
});

document.addEventListener("click", (event) => {
    const btn = event.target.closest("#subscribebutton");
    if (!btn) return;
    if (getCookieConsent() !== "accepted") {
        event.preventDefault();
        event.stopPropagation();
        pendingSubscribeTarget = btn;
        showCookieBanner();
    }
}, true);

/* =========================================================
   PRESS KIT
========================================================= */

let pressBioData = null;

function renderPressBio(container) {
    return fetch("data/press-bio.json")
        .then(response => response.json())
        .then(data => {
            pressBioData = data;
            applyPressLanguage();
        })
        .catch(error => {
            console.error("Error loading press bio:", error);
            showLoadError(container);
        });
}

function applyPressLanguage() {
    if (!pressBioData) return;
    const lang = getSiteLanguage();
    const content = pressBioData[lang] || pressBioData.en;

    const bioContainer = document.querySelector('[data-render="press-bio"]');
    if (!bioContainer) return;

    bioContainer.innerHTML = "";
    content.paragraphs.forEach(text => {
        const p = document.createElement("p");
        p.textContent = text;
        p.style.marginTop = "var(--space-xs)";
        bioContainer.appendChild(p);
    });

    const container = document.querySelector('[data-render="press-mentions"]');
    if (!container) return;

    container.innerHTML = "";
    const list = document.createElement("ul");
    list.style.marginLeft = "var(--space-md)";
    list.style.marginTop = "var(--space-xs)";

    content.mentions.forEach(mention => {
        const li = document.createElement("li");
        if (mention.url) {
            const a = document.createElement("a");
            a.href = mention.url;
            a.target = "_blank";
            a.textContent = mention.text;
            a.style.textDecoration = "underline";
            li.appendChild(a);
        } else {
            li.textContent = mention.text;
        }
        list.appendChild(li);
    });

    container.appendChild(list);

    document.querySelectorAll("[data-language]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.language === lang);
    });
}

document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-language]");
    if (!btn) return;
    localStorage.setItem("language", btn.dataset.language);
    applyPressLanguage();
});

function renderPressPhotos(container) {
    return fetch("data/press-photos.json")
        .then(response => response.json())
        .then(photos => {
            const template = document.getElementById("press-photo-template");
            container.innerHTML = "";
            photos.forEach(photo => {
                const clone = template.content.cloneNode(true);
                const link = clone.querySelector('[data-field="link"]');
                const img = clone.querySelector('[data-field="image"]');
                link.href = photo.image;
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

let languageStrings = null;

function getSiteLanguage() {
    return localStorage.getItem("site-lang") || "en";
}

function loadLanguageStrings() {
    return fetch("data/language.json")
        .then(response => response.json())
        .then(data => {
            languageStrings = data;
            applyLanguageStrings();
        })
        .catch(error => console.error("Error loading language strings:", error));
}

function applyLanguageStrings() {
    if (!languageStrings) return;
    const lang = getSiteLanguage();
    const strings = languageStrings[lang] || languageStrings.en;

    document.documentElement.lang = lang;

    document.querySelectorAll("[data-string]").forEach(el => {
        const value = strings[el.dataset.string];
        if (value) el.textContent = value;
    });

    document.querySelectorAll("[data-language]").forEach(btn => {
        btn.classList.toggle("active-lang", btn.dataset.language === lang);
    });
}

document.addEventListener("partials:loaded", () => {
    if (document.querySelector("[data-string]")) {
        loadLanguageStrings();
    }
});

document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-language]");
    if (!btn) return;
    localStorage.setItem("site-lang", btn.dataset.language);
    applyLanguageStrings();
    applyPressLanguage(); // re-render bio-specific content, if present
});

/* =========================================================
   LIGHT BOX
========================================================= */

let lightboxOriginRect = null; // remembers the thumbnail's position for the close animation

document.addEventListener("click", (event) => {
    const img = event.target.closest('[data-render="gallery"] img');
    if (img) {
        openLightbox(img);
        return;
    }
    closeLightbox();
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLightbox();
});

function openLightbox(sourceImg) {
    const lightbox = document.getElementById("lightbox");
    const image = document.getElementById("lightbox-image");
    if (!lightbox || !image) return;

    lightboxOriginRect = sourceImg.getBoundingClientRect();

    image.src = sourceImg.src;
    image.alt = sourceImg.alt || "";
    lightbox.classList.remove("hide");

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

    if (!lightboxOriginRect) {
        lightbox.classList.add("hide");
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
        void image.offsetWidth;
        image.style.transition = "";
        image.removeEventListener("transitionend", onDone);
    };
    image.addEventListener("transitionend", onDone, { once: true });
}