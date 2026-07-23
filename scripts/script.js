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
        .then(data => {
            const template = document.getElementById("video-template");

            data.forEach(video => {
                const clone = template.content.cloneNode(true);
                const embed = clone.querySelector('[data-field="embed"]');
                embed.src = `https://www.youtube.com/embed/${video.videoId}`;
                embed.title = video.title;

                container.appendChild(clone);
            });
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

            const carousel = container.closest("[data-carousel]");
            const prevBtn = carousel?.querySelector(".carousel-prev");
            const nextBtn = carousel?.querySelector(".carousel-next");

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

            // Fill the row with every release so CSS auto-fit reports
            // every column it's actually able to create at this width.
            const countColumns = () => {
                container.innerHTML = "";
                releases.forEach(release => container.appendChild(renderCard(release)));
                const columns = getComputedStyle(container).gridTemplateColumns.split(" ").length;
                return Math.max(1, columns);
            };

            const lastPage = (perPage) => Math.max(0, Math.ceil(releases.length / perPage) - 1);

            let itemsPerPage = countColumns();
            let page = 0;

            const fillPage = () => {
                container.innerHTML = "";
                const start = page * itemsPerPage;
                releases.slice(start, start + itemsPerPage).forEach(release => {
                    container.appendChild(renderCard(release));
                });

                prevBtn?.classList.toggle("hide", page === 0);
                nextBtn?.classList.toggle("hide", page >= lastPage(itemsPerPage));
            };

            let isAnimating = false;
            let pendingPage = null;

            const goToPage = (newPage) => {
                if (newPage === page) return;
                pendingPage = newPage;
                if (isAnimating) return;
                
                isAnimating = true;
                container.classList.add("hide");
                container.addEventListener("transitionend", function swap() {
                    container.removeEventListener("transitionend", swap);
                    page = pendingPage;
                    pendingPage = null;
                    fillPage();
                    container.classList.remove("hide");
                    isAnimating = false;
                }, { once: true });
            };

            fillPage();

            prevBtn?.addEventListener("click", () => {
                const current = pendingPage ?? page;
                if (current > 0) goToPage(current - 1);
            });
            nextBtn?.addEventListener("click", () => {
                const current = pendingPage ?? page;
                if (current < lastPage(itemsPerPage)) goToPage(current + 1);
            });

            let resizeTimeout;
            window.addEventListener("resize", () => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    const newItemsPerPage = countColumns();
                    if (newItemsPerPage !== itemsPerPage) {
                        itemsPerPage = newItemsPerPage;
                        page = 0; // old page index may no longer be valid at the new width
                    }
                    fillPage();
                }, 150);
            });
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