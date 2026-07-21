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
   Anything marked data-render="x" gets filled in once the
   shared partials (and their <template> tags) are ready.
========================================================= */

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
                clone.querySelector("a").href = social.url;
                clone.querySelector("i").className = social.iconClass;

                container.appendChild(clone);
            });
        })
        .catch(error => console.error("Error loading social icons:", error));
}

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

            let releases = [...data].sort(
                (a, b) => new Date(b.releaseDate) - new Date(a.releaseDate)
            );

            const limit = container.dataset.limit;
            if (limit) {
                releases = releases.slice(0, Number(limit));
            }

            releases.forEach(release => {
                const clone = template.content.cloneNode(true);
                clone.querySelector("img").src = release.cover;
                clone.querySelector("p.release-card-type").textContent = release.type;
                clone.querySelector("h3.release-card-title").textContent = release.title;
                clone.querySelector("p.release-card-year").textContent = release.year;
                clone.querySelector("a").href = release.url;

                container.appendChild(clone);
            });
        })
        .catch(error => console.error("Error loading release cards:", error));
}

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
            const img = clone.querySelector("img");
            img.src = release.cover;
            img.alt = `${release.title} cover art`;
            clone.querySelector("p.eyebrow").textContent = release.year;
            clone.querySelector("h3").textContent = release.title;
            clone.querySelector("a").href = release.url;

            container.appendChild(clone);
        })
        .catch(error => console.error("Error loading featured release:", error));
}

document.addEventListener("partials:loaded", () => {
    document.querySelectorAll('[data-render="tour-dates"]').forEach(container => {
        renderTourDates(container);
    });
});

function renderTourDates(container) {
    fetch("data/tourdates.json")
        .then(response => response.json())
        .then(data => {
            if (!data.length) {
                container.closest("section")?.remove();
                return;
            }

            const template = document.getElementById("tour-date-template");

            let tourdates = [...data].sort(
                (a, b) => new Date(b.date) - new Date(a.date)
            );

            const limit = container.dataset.limit;
            if (limit) {
                tourdates = tourdates.slice(0, Number(limit));
            }

            tourdates.forEach(tourdate => {
                const clone = template.content.cloneNode(true);
                clone.querySelector("h3").textContent = tourdate.title;
                clone.querySelector("p.tour-date-date").textContent = tourdate.date;
                clone.querySelector("p.tour-date-location").textContent = tourdate.location;

                var link = clone.querySelector("a");
                if(tourdate.url)
                    link.href = tourdate.url;
                else
                    link.remove();

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
const heroContent = document.querySelector(".hero-content");

if (hero) {
    window.addEventListener("scroll", () => {
        const scrollPosition = window.scrollY;
        const heroHeight = hero.offsetHeight;

        let progress = Math.min(scrollPosition / heroHeight, 1);
        progress = progress * progress; // ease-in curve

        // Background camera movement
        const scale = 100 + (progress * 35);
        const position = -progress * 150;

        hero.style.zoom = `${scale}%`;
        hero.style.backgroundPosition = `center ${position}%`;

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

window.addEventListener("scroll", () => {
    const currentScrollY = window.scrollY;
    const hideableElements = document.querySelectorAll(".hide-on-scroll");

    const show = () => hideableElements.forEach(el => el.classList.remove("is-hidden"));
    const hide = () => hideableElements.forEach(el => el.classList.add("is-hidden"));

    if (currentScrollY <= 0) {
        show();
    } else if (currentScrollY > lastScrollY) {
        hide(); // scrolling down
    } else {
        show(); // scrolling up
    }

    lastScrollY = currentScrollY;
});
 
document.addEventListener("partials:loaded", () => {
    const header = document.querySelector(".site-header");
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