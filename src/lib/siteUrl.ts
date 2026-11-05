// The public address of the site, shared by the page metadata, sitemap.xml and robots.txt.
export const siteUrl = process.env.SITE_URL
  || process.env.AUTH_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");
