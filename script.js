fetch("header.html")
    .then(response => response.text())
    .then(data => {
        document.getElementById("header").innerHTML = data;
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
        const scale = 110 + (progress * 35);
        const position = -progress * 150;

        hero.style.backgroundSize = `${scale}%`;
        hero.style.backgroundPosition = `center ${position}%`;

        // Content movement + fade
        if (content) {
            const opacity = 1 - (progress * 5);
            const movement = progress * 500;

            content.style.opacity = opacity;
            content.style.top = `${movement}px`;
        }
    });
}