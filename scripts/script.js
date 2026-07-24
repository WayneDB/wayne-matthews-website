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

// CAROUSEL
function initCarousel(container, items, renderItem) {
    const FLIP_STEP_DELAY = 80;
    const flipDuration = 0.5;

    container.style.setProperty("--flip-duration", `${flipDuration}s`);

    const carousel = container.closest("[data-carousel]");
    const prevBtn = carousel?.querySelector(".carousel-prev");
    const nextBtn = carousel?.querySelector(".carousel-next");

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

    const countColumns = () => {
        container.innerHTML = "";
        const sample = buildCard();
        const front = sample.querySelector(".flip-face-front");
        if (items[0]) front.appendChild(renderItem(items[0]));
        container.appendChild(sample);

        const cardWidth = sample.getBoundingClientRect().width;
        const gap = parseFloat(getComputedStyle(container).gap) || 0;
        const containerWidth = container.getBoundingClientRect().width;

        container.innerHTML = "";
        if (!cardWidth) return 1;
        return Math.max(1, Math.floor((containerWidth + gap) / (cardWidth + gap)));
    };

    const lastPage = (perPage) => Math.max(0, Math.ceil(items.length / perPage) - 1);

    let itemsPerPage = countColumns();
    let page = 0;
    let isAnimating = false;
    let cards = [];

    const buildGrid = () => {
        container.innerHTML = "";
        cards = [];
        for (let i = 0; i < itemsPerPage; i++) {
            const card = buildCard();
            container.appendChild(card);
            cards.push(card);
        }
    };

    const updateArrows = () => {
        prevBtn?.classList.toggle("hide", isAnimating || page === 0);
        nextBtn?.classList.toggle("hide", isAnimating || page >= lastPage(itemsPerPage));
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

    const goToPage = (newPage) => {
        if (isAnimating || newPage === page) return;
        const dir = newPage > page ? 1 : -1;

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
        updateArrows();

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
                inner.style.transitionDelay = `calc(var(--transition) / 2 + ${stepDelay(i)}ms)`;
                card.classList.add("is-showing");
            });

            const maxOffset = Math.max(0, ...cards.map((_, i) => stepDelay(i)));
            const baseDuration = flipDuration * 1000;

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
            }, maxOffset + baseDuration + 20);
        });
    };

    prevBtn?.addEventListener("click", () => {
        if (page > 0) goToPage(page - 1);
    });
    nextBtn?.addEventListener("click", () => {
        if (page < lastPage(itemsPerPage)) goToPage(page + 1);
    });

    let resizeTimeout;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const newItemsPerPage = countColumns();
            if (newItemsPerPage !== itemsPerPage) {
                itemsPerPage = newItemsPerPage;
                page = 0;
            }
            buildGrid();
            fillPage();
        }, 150);
    });
}


// SOCIALS
document.addEventListener("partials:loaded", () => {
    document.querySelectorAll('[data-render="socials"]').forEach(container => {
        renderSocials(container);
    });
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
        .catch(error => console.error("Error loading social icons:", error));
}

// VIDEOS
document.addEventListener("partials:loaded", () => {
    document.querySelectorAll('[data-render="featured-videos"]').forEach(container => {
        renderVideos(container);
    });
});

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
        .catch(error => console.error("Error loading release cards:", error));
}

// RELEASES
document.addEventListener("partials:loaded", () => {
    document.querySelectorAll('[data-render="releases"]').forEach(container => {
        renderReleases(container);
    });
});

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
        .catch(error => console.error("Error loading release cards:", error));
}

// FEATURED RELEASE
document.addEventListener("partials:loaded", () => {
    document.querySelectorAll('[data-render="featured-release"]').forEach(container => {
        renderFeaturedRelease(container);
    });
});

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
            clone.querySelector('[data-field="link"]').href = release.url;

            container.appendChild(clone);
        })
        .catch(error => console.error("Error loading featured release:", error));
}

// TOUR DATES
document.addEventListener("partials:loaded", () => {
    document.querySelectorAll('[data-render="tour-dates"]').forEach(container => {
        renderTourDates(container);
    });
});

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
        .catch(error => console.error("Error loading release cards:", error));
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
    const link = event.target.closest('a[href^="#"]');
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