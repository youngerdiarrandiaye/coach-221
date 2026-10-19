/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permet de construire dans un dossier séparé sans toucher au serveur de développement (NEXT_DIST_DIR=.next-build)
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Image Docker de production (deploy/api.Dockerfile) : serveur autonome. Sans cette variable, le comportement ne change pas.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' } : {}),
  experimental: {
    serverComponentsExternalPackages: ['@supabase/supabase-js'],
  },
  images: {
    // L'API n'utilise pas next/image : l'optimiseur d'images (surface d'attaque connue) est désactivé.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
