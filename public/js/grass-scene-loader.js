const hero = document.querySelector('[data-grass-hero]');

if (hero) {
  let requested = false;

  const loadGrassScene = () => {
    if (requested) return;
    requested = true;
    import('/js/grass-scene.js?v=1.0.9').catch(() => {
      hero.classList.add('grass-webgl-failed');
    });
  };

  if (!('IntersectionObserver' in window)) {
    window.addEventListener('load', loadGrassScene, { once: true });
  } else {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        loadGrassScene();
      }
    }, { rootMargin: '1400px 0px' });
    observer.observe(hero);
  }
}
