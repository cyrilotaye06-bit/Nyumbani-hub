// Mobile Navigation & Back to Top functionality
document.addEventListener('DOMContentLoaded', function() {
  // Create back-to-top button
  const backToTopBtn = document.createElement('button');
  backToTopBtn.id = 'back-to-top-btn';
  backToTopBtn.innerHTML = '↑ Top';
  backToTopBtn.setAttribute('aria-label', 'Back to top');
  backToTopBtn.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    padding: 12px 16px;
    background: #0b1c39;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
    z-index: 999;
    display: none;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    transition: all 0.3s ease;
  `;

  document.body.appendChild(backToTopBtn);

  // Show/hide back-to-top button
  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
      backToTopBtn.style.display = 'block';
      backToTopBtn.style.animation = 'slideUp 0.3s ease';
    } else {
      backToTopBtn.style.display = 'none';
    }
  });

  // Scroll to top on click
  backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Create mobile quick links (sticky at bottom for mobile)
  if (window.innerWidth < 768) {
    const mobileQuickLinks = document.createElement('div');
    mobileQuickLinks.id = 'mobile-quick-links';
    mobileQuickLinks.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: #0b1c39;
      color: white;
      display: flex;
      justify-content: space-around;
      padding: 12px 0;
      z-index: 998;
      box-shadow: 0 -2px 8px rgba(0,0,0,0.1);
      flex-wrap: wrap;
    `;

    const links = [
      { text: '📞 Call', href: 'tel:+254713402088' },
      { text: '💬 WhatsApp', href: 'https://wa.me/254713402088?text=Hello%20Nyumbani%20Hub' },
      { text: '📧 Email', href: 'mailto:nyumbanihubkenya@gmail.com' }
    ];

    links.forEach(link => {
      const a = document.createElement('a');
      a.href = link.href;
      a.innerHTML = link.text;
      a.target = link.href.includes('wa.me') ? '_blank' : '_self';
      a.rel = link.href.includes('wa.me') ? 'noopener noreferrer' : '';
      a.style.cssText = `
        color: white;
        flex: 1;
        text-align: center;
        padding: 8px 4px;
        font-size: 13px;
        transition: 0.2s;
      `;
      a.onmouseover = () => a.style.color = '#ffd700';
      a.onmouseout = () => a.style.color = 'white';
      mobileQuickLinks.appendChild(a);
    });

    document.body.appendChild(mobileQuickLinks);

    // Add padding to body to prevent content from hiding under fixed links
    document.body.style.paddingBottom = '55px';
  }

  // Add animation keyframes
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (max-width: 768px) {
      #back-to-top-btn {
        bottom: 80px !important;
        right: 10px !important;
        padding: 10px 14px !important;
        font-size: 12px !important;
      }

      #mobile-quick-links a {
        font-size: 12px !important;
      }
    }
  `;
  document.head.appendChild(style);
});

