// Open the sources footer when a source link is followed.
(() => {
    "use strict";
    // Footer is collapsed initially. Deep links reveal it before scrolling;
    // this also handles source anchors loaded directly from another page.
    const footerButton = document.querySelector('#footer-toggle');
    const footerContent = document.querySelector('#footer-content');
    function setFooter(open) {
        footerContent.hidden = !open;
        footerButton.setAttribute('aria-expanded', String(open));
        footerButton.innerHTML = `${open ? 'Hide' : 'View full'} sources and methods <span aria-hidden="true">${open ? '−' : '+'}</span>`;
    }
    footerButton.addEventListener('click', () => setFooter(footerContent.hidden));
    function revealHash(hash) {
        const target = document.getElementById(hash.slice(1));
        if (target && footerContent.contains(target)) {
            setFooter(true);
            requestAnimationFrame(() => {
                target.scrollIntoView({block: 'start'});
                target.setAttribute('tabindex', '-1');
                target.focus({preventScroll: true});
            });
        }
    }
    document.addEventListener('click', event => {
        const anchor = event.target.closest('a[href^="#"]');
        if (anchor) revealHash(anchor.hash);
    });
    window.addEventListener('hashchange', () => revealHash(location.hash));
    revealHash(location.hash);

})();
