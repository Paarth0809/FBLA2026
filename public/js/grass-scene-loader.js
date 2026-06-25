// Lazy-loads the cinematic grass scene only when the hero is near the viewport.
// This keeps the initial scroll-story smooth while preserving the full Three.js
// grass effect for users who continue down the homepage.
const hero = document.querySelector('[data-grass-hero]');

if (hero) {
  let requested = false;

  const loadGrassScene = () => {
    if (requested) return;
    requested = true;
    import('/js/grass-scene.js?v=1.0.10').catch(() => {
      hero.classList.add('grass-webgl-failed');
    });
  };

  if (!('IntersectionObserver' in window)) {
    // Older browsers get the scene after page load rather than blocking first paint.
    window.addEventListener('load', loadGrassScene, { once: true });
  } else {
    // Start loading early enough that the scene is ready before the user reaches it.
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        loadGrassScene();
      }
    }, { rootMargin: '1400px 0px' });
    observer.observe(hero);
  }
}
