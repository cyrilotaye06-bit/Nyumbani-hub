// Enhanced Navigation System
document.addEventListener('DOMContentLoaded', function() {
  // Enhance header navigation
  const header = document.querySelector('header');
  const nav = document.querySelector('nav');
  
  if (nav) {
    // Add mobile hamburger menu
    const hamburger = document.createElement('button');
    hamburger.id = 'mobile-menu-toggle';
    hamburger.innerHTML = '☰';
    hamburger.setAttribute('aria-label', 'Toggle menu');
    hamburger.style.cssText = `
      display: none;
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
      padding: 10px;
      @media (max-width: 768px) {
        display: block;
      }
    `;
    
    // Create mobile nav dropdown
    const mobileNav = nav.cloneNode(true);
    mobileNav.id = 'mobile-nav';
    mobileNav.style.cssText = `
      display: none;
      position: absolute;
      top: 100%;
      right: 0;
      background: #0b1c39;
      flex-direction: column;
      width: 100%;
      padding: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 999;
    `;
    
    // Mobile nav links styling
    const mobileNavLinks = mobileNav.querySelectorAll('a');
    mobileNavLinks.forEach(link => {
      link.style.cssText = `
        display: block;
        padding: 12px 0;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        transition: 0.2s;
      `;
      link.addEventListener('click', () => {
        mobileNav.style.display = 'none';
      });
    });
    
    // Toggle mobile menu
    if (window.innerWidth < 768) {
      header.appendChild(hamburger);
      header.appendChild(mobileNav);
      
      hamburger.addEventListener('click', () => {
        mobileNav.style.display = mobileNav.style.display === 'none' ? 'flex' : 'none';
      });
    }
    
    // Hide nav on desktop, show on mobile
    if (window.innerWidth < 768) {
      nav.style.display = 'none';
    }
  }

  // Add breadcrumb navigation for module pages
  const breadcrumbContainer = document.querySelector('header nav') || document.querySelector('header');
  if (breadcrumbContainer && !breadcrumbContainer.id.includes('mobile')) {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const pageNames = {
      'index.html': 'Home',
      'rentals.html': 'Rentals',
      'property.html': 'Buy Property',
      'bnb.html': 'BnB',
      'resales.html': 'Resales',
      'agents.html': 'Agents',
      'tools.html': 'Tools',
      'favorites.html': 'Favorites'
    };
    
    const breadcrumb = document.createElement('div');
    breadcrumb.id = 'breadcrumb';
    breadcrumb.style.cssText = `
      padding: 10px 8%;
      background: #f5f7fa;
      font-size: 13px;
      color: #666;
      border-top: 1px solid #e0e0e0;
    `;
    
    const pageName = pageNames[currentPage] || 'Page';
    if (currentPage !== 'index.html') {
      breadcrumb.innerHTML = `
        <a href="index.html" style="color: #0b1c39; text-decoration: underline;">Home</a>
        <span style="margin: 0 8px;">/</span>
        <span>${pageName}</span>
      `;
      document.body.insertBefore(breadcrumb, document.body.firstChild);
    }
  }

  // Add quick navigation links in modules
  const isModulePage = ['rentals.html', 'property.html', 'bnb.html', 'resales.html', 'agents.html', 'tools.html', 'favorites.html'].some(page => window.location.pathname.includes(page));
  
  if (isModulePage) {
    const nav = document.querySelector('nav');
    if (nav) {
      const quickNav = document.createElement('div');
      quickNav.id = 'module-quick-nav';
      quickNav.style.cssText = `
        padding: 12px 8%;
        background: white;
        border-bottom: 2px solid #ffd700;
        display: flex;
        gap: 20px;
        overflow-x: auto;
        font-size: 13px;
      `;
      
      const navItems = [
        { text: '← Back to Home', href: 'index.html' },
        { text: 'All Rentals', href: 'rentals.html' },
        { text: 'Buy Property', href: 'property.html' },
        { text: 'BnBs', href: 'bnb.html' },
        { text: 'Resales', href: 'resales.html' },
        { text: 'Agents', href: 'agents.html' }
      ];
      
      navItems.forEach(item => {
        const a = document.createElement('a');
        a.href = item.href;
        a.textContent = item.text;
        a.style.cssText = `
          color: #0b1c39;
          white-space: nowrap;
          transition: 0.2s;
          font-weight: 500;
        `;
        a.addEventListener('mouseover', () => a.style.color = '#ffd700');
        a.addEventListener('mouseout', () => a.style.color = '#0b1c39');
        quickNav.appendChild(a);
      });
      
      document.body.insertBefore(quickNav, document.querySelector('section'));
    }
  }
});
