
(() => {
  `use strict`;
  const host = document.getElementById(`heroAccounts`);
  if (!host) return;
  const finePointer = window.matchMedia(`(hover:hover) and (pointer:fine)`);
  const reducedMotion = window.matchMedia(`(prefers-reduced-motion:reduce)`);
  const canTilt = () => finePointer.matches && !reducedMotion.matches && !document.body.classList.contains(`no-motion`);
  function updateGallery() {
    const cards = [...host.querySelectorAll(`.heroAccount`)];
    const count = cards.length;
    host.dataset.count = String(count);
    host.style.setProperty(`--hero-card-min`, count > 12 ? `110px` : count > 8 ? `116px` : count > 5 ? `124px` : count > 3 ? `136px` : `148px`);
    cards.forEach((card, index) => {
      card.style.setProperty(`--card-order`, String(Math.min(index, 12)));
    });
  }
  function reset(card) {
    if (!card) return;
    card.style.setProperty(`--tilt-x`, `0deg`);
    card.style.setProperty(`--tilt-y`, `0deg`);
    card.style.setProperty(`--spot-x`, `50%`);
    card.style.setProperty(`--spot-y`, `50%`);
  }
  host.addEventListener(`pointermove`, event => {
    if (!canTilt() || event.pointerType !== `mouse`) return;
    const card = event.target.closest(`.heroAccount`);
    if (!card || !host.contains(card)) return;
    const bounds = card.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    card.style.setProperty(`--tilt-x`, `${((.5 - y) * 2.6).toFixed(2)}deg`);
    card.style.setProperty(`--tilt-y`, `${((x - .5) * 2.6).toFixed(2)}deg`);
    card.style.setProperty(`--spot-x`, `${(x * 100).toFixed(1)}%`);
    card.style.setProperty(`--spot-y`, `${(y * 100).toFixed(1)}%`);
  }, {passive:true});
  host.addEventListener(`pointerout`, event => {
    const card = event.target.closest(`.heroAccount`);
    if (card && !card.contains(event.relatedTarget)) reset(card);
  });
  const observer = new MutationObserver(updateGallery);
  observer.observe(host, {childList:true});
  updateGallery();
})();
