async function loadComponents(container = document) {
    const components = container.querySelectorAll("[data-component]");

    for (const element of components) {
        const component = element.dataset.component;

        try {
            const response = await fetch(`blocks/${component}.html`);

            if (!response.ok) {
                throw new Error(`Failed to load ${component}.html`);
            }

            const html = await response.text();

            element.innerHTML = html;

            await loadComponents(element);
        } catch (error) {
            console.error(error);
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadComponents();
});

const hero = document.querySelector(".hero");
const content = document.querySelector(".hero-content");

if (hero) {
    window.addEventListener("scroll", () => {
        const scrollPosition = window.scrollY;
        const heroHeight = hero.offsetHeight;

        let progress = Math.min(scrollPosition / heroHeight, 1);

        // Ease-in curve
        progress = progress * progress;

        // Background camera movement
        const scale = 100 + (progress * 35);
        const position = -progress * 150;

        hero.style.zoom = `${scale}%`;
        hero.style.backgroundPosition = `center ${position}%`;

        // Content movement + fade
        if (content) {
            const opacity = 1 - (progress * 3.5);
            const movement = progress * 300;

            content.style.opacity = opacity;
            content.style.top = `${movement}px`;
            content.style.zoom = `${scale}%`;
        }
    });
}

let lastScrollY = window.scrollY;

window.addEventListener("scroll", () => {
    const currentScrollY = window.scrollY;
    const elements = document.querySelectorAll(".hide-on-scroll");

    if (currentScrollY <= 0) {
        elements.forEach(element => {
            element.classList.remove("is-hidden");
        });

        lastScrollY = currentScrollY;
        return;
    }

    if (currentScrollY > lastScrollY) {
        // Scrolling down
        elements.forEach(element => {
            element.classList.add("is-hidden");
        });
    } else {
        // Scrolling up
        elements.forEach(element => {
            element.classList.remove("is-hidden");
        });
    }

    lastScrollY = currentScrollY;
});