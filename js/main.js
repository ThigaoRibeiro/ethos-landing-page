/* ============================================
   Ethos — Main JavaScript
   ============================================ */

(function () {
  'use strict';

  // ---- NotebookLM URL ----
  // Replace this URL with the actual NotebookLM environment link
  const NOTEBOOK_LM_URL = 'https://notebooklm.google.com/notebook/4d5af2b3-3346-4ac2-91d5-6325378808c2';

  // ---- DOM Elements ----
  const header = document.getElementById('header');
  const menuToggle = document.getElementById('menuToggle');
  const headerNav = document.getElementById('headerNav');

  // All CTA links that should point to NotebookLM
  const ctaLinks = document.querySelectorAll('#mainCtaLink, #headerCtaLink, #ctaLink');
  const exampleLinks = document.querySelectorAll('.example-item');

  // ---- Header scroll effect ----
  function handleHeaderScroll() {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', handleHeaderScroll, { passive: true });
  handleHeaderScroll(); // Run on load

  // ---- Mobile menu toggle ----
  if (menuToggle) {
    menuToggle.addEventListener('click', function () {
      headerNav.classList.toggle('open');
      this.classList.toggle('active');

      // Animate hamburger to X
      const spans = this.querySelectorAll('span');
      if (headerNav.classList.contains('open')) {
        spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
      } else {
        spans[0].style.transform = '';
        spans[1].style.opacity = '';
        spans[2].style.transform = '';
      }
    });

    // Close mobile menu when clicking a nav link
    headerNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        headerNav.classList.remove('open');
        menuToggle.classList.remove('active');
        const spans = menuToggle.querySelectorAll('span');
        spans[0].style.transform = '';
        spans[1].style.opacity = '';
        spans[2].style.transform = '';
      });
    });
  }

  // ---- Set CTA link URLs ----
  ctaLinks.forEach(function (link) {
    if (NOTEBOOK_LM_URL !== '#') {
      link.href = NOTEBOOK_LM_URL;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    } else {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        showNotice('O link para o ambiente de consulta será configurado em breve.');
      });
    }
  });

  // ---- Example items click ----
  exampleLinks.forEach(function (item) {
    if (NOTEBOOK_LM_URL !== '#') {
      item.href = NOTEBOOK_LM_URL;
      item.target = '_blank';
      item.rel = 'noopener noreferrer';
    } else {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        showNotice('O link para o ambiente de consulta será configurado em breve.');
      });
    }
  });

  // ---- Simple notice toast ----
  function showNotice(message) {
    // Remove existing notice
    const existing = document.querySelector('.toast-notice');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notice';
    toast.textContent = message;

    // Styles
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%) translateY(20px)',
      background: 'rgba(13, 33, 55, 0.95)',
      color: '#fff',
      padding: '14px 28px',
      borderRadius: '12px',
      fontSize: '0.9rem',
      fontFamily: "'Inter', sans-serif",
      fontWeight: '500',
      zIndex: '9999',
      backdropFilter: 'blur(16px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      opacity: '0',
      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      maxWidth: '90vw',
      textAlign: 'center',
    });

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(function () {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    // Remove after delay
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
      setTimeout(function () {
        toast.remove();
      }, 400);
    }, 3500);
  }

  // ---- Intersection Observer for scroll animations ----
  const animatedElements = document.querySelectorAll('.animate-on-scroll');

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    animatedElements.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    // Fallback: show all elements
    animatedElements.forEach(function (el) {
      el.classList.add('visible');
    });
  }

  // ---- Smooth scroll for anchor links ----
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      const target = document.querySelector(href);
      if (!href || href === '#' || !target) return;

      e.preventDefault();
      const headerHeight = document.getElementById('header').offsetHeight;
      const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;
      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth',
      });
    });
  });
})();
