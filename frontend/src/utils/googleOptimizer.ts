import { Platform } from 'react-native';

/**
 * Injects and synchronizes Google SEO meta tags, Google Site Verification,
 * Schema.org JSON-LD Structured Data, and Google Analytics / Tag Manager scripts on Web.
 */
export function applyGoogleOptimization(settings: Record<string, string>) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  try {
    const head = document.head || document.getElementsByTagName('head')[0];
    if (!head) return;

    const siteName = settings.hero_title || 'FixMart';
    const siteDesc =
      settings.seo_meta_description ||
      settings.hero_subtitle ||
      'FixMart - Professional handyman services, general merchandise e-commerce, parcel delivery, and certified technicians across Nigeria.';
    const keywords =
      settings.seo_keywords ||
      'handyman, ecommerce, fixmart, plumbing, electrical, carpentry, repairs, shopping, delivery, nigeria, online marketplace';
    const googleVerification = settings.google_site_verification || '';
    const gaId = settings.google_analytics_id || '';
    const gtmId = settings.google_tag_manager_id || '';
    const logoUrl = settings.logo_url || 'https://fixmart.ng/assets/icon.png';
    const currentUrl = typeof window !== 'undefined' ? window.location.origin : 'https://fixmart.ng';

    // ── 1. Update Document Title ──
    const customTitle = settings.seo_meta_title || `${siteName} | Handyman Services & Online Marketplace`;
    document.title = customTitle;

    // ── 2. Helper to set/create <meta> tags ──
    const setMetaTag = (attrName: 'name' | 'property', attrValue: string, content: string) => {
      let meta = document.querySelector(`meta[${attrName}="${attrValue}"]`) as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attrName, attrValue);
        head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };

    // Google & Standard SEO Meta Tags
    setMetaTag('name', 'description', siteDesc);
    setMetaTag('name', 'keywords', keywords);
    setMetaTag('name', 'robots', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
    setMetaTag('name', 'author', 'FixMart Marketplace');
    setMetaTag('name', 'theme-color', settings.primary_color || '#007AFF');

    // Google Search Console Site Verification
    if (googleVerification.trim()) {
      setMetaTag('name', 'google-site-verification', googleVerification.trim());
    }

    // OpenGraph (Facebook, LinkedIn, Google Preview)
    setMetaTag('property', 'og:title', customTitle);
    setMetaTag('property', 'og:description', siteDesc);
    setMetaTag('property', 'og:type', 'website');
    setMetaTag('property', 'og:url', currentUrl);
    setMetaTag('property', 'og:site_name', 'FixMart');
    if (logoUrl) {
      setMetaTag('property', 'og:image', logoUrl);
    }

    // Twitter Card
    setMetaTag('name', 'twitter:card', 'summary_large_image');
    setMetaTag('name', 'twitter:title', customTitle);
    setMetaTag('name', 'twitter:description', siteDesc);
    if (logoUrl) {
      setMetaTag('name', 'twitter:image', logoUrl);
    }

    // Canonical link tag
    let canonical = document.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      head.appendChild(canonical);
    }
    canonical.href = currentUrl;

    // ── 3. Google Structured Data (Schema.org JSON-LD) ──
    const schemaId = 'fixmart-google-structured-data';
    let schemaScript = document.getElementById(schemaId) as HTMLScriptElement | null;
    if (!schemaScript) {
      schemaScript = document.createElement('script');
      schemaScript.id = schemaId;
      schemaScript.type = 'application/ld+json';
      head.appendChild(schemaScript);
    }

    const structuredData = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          '@id': `${currentUrl}/#website`,
          url: currentUrl,
          name: siteName,
          description: siteDesc,
          potentialAction: {
            '@type': 'SearchAction',
            target: {
              '@type': 'EntryPoint',
              urlTemplate: `${currentUrl}/?search={search_term_string}`,
            },
            'query-input': 'required name=search_term_string',
          },
        },
        {
          '@type': 'LocalBusiness',
          '@id': `${currentUrl}/#organization`,
          name: 'FixMart Services & Marketplace',
          url: currentUrl,
          logo: logoUrl,
          image: logoUrl,
          description: siteDesc,
          priceRange: '₦₦',
          paymentAccepted: 'Cash, Credit Card, Bank Transfer, OPay, Flutterwave, Paystack, Stripe',
          currenciesAccepted: 'NGN, USD',
        },
        {
          '@type': 'Organization',
          name: 'FixMart',
          url: currentUrl,
          logo: logoUrl,
          sameAs: [
            'https://facebook.com/fixmart',
            'https://twitter.com/fixmart',
            'https://instagram.com/fixmart',
          ],
        },
      ],
    };
    schemaScript.textContent = JSON.stringify(structuredData);

    // ── 4. Google Analytics (GA4 - gtag.js) ──
    if (gaId.trim()) {
      const gaScriptId = 'fixmart-google-analytics';
      if (!document.getElementById(gaScriptId)) {
        const gaScript = document.createElement('script');
        gaScript.id = gaScriptId;
        gaScript.async = true;
        gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${gaId.trim()}`;
        head.appendChild(gaScript);

        const gaInline = document.createElement('script');
        gaInline.id = `${gaScriptId}-inline`;
        gaInline.textContent = `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaId.trim()}', { page_path: window.location.pathname });
        `;
        head.appendChild(gaInline);
        console.log(`[GoogleOptimizer] Google Analytics 4 initialized (${gaId.trim()})`);
      }
    }

    // ── 5. Google Tag Manager (GTM) ──
    if (gtmId.trim()) {
      const gtmScriptId = 'fixmart-google-tag-manager';
      if (!document.getElementById(gtmScriptId)) {
        const gtmScript = document.createElement('script');
        gtmScript.id = gtmScriptId;
        gtmScript.textContent = `
          (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
          new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
          j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
          'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','${gtmId.trim()}');
        `;
        head.appendChild(gtmScript);
        console.log(`[GoogleOptimizer] Google Tag Manager initialized (${gtmId.trim()})`);
      }
    }
  } catch (error) {
    console.warn('[GoogleOptimizer] Error applying Google optimization:', error);
  }
}
