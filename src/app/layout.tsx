import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { Toaster } from 'sonner'
import { cn } from '@/lib/utils'
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
})

const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-mono',
  weight: '100 900',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'TerangaCoach',
    template: '%s | TerangaCoach',
  },
  description: "Logiciel de gestion pour coachs sportifs en Afrique de l'Ouest",
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0D0D0D',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="fr"
      className={cn('dark', plusJakarta.variable, geistMono.variable)}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        {children}
        <Toaster
          theme="dark"
          position="top-center"
          richColors
          toastOptions={{
            style: {
              background: 'rgba(15,15,30,0.97)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: '#fff',
              borderRadius: '16px',
              backdropFilter: 'blur(12px)',
            },
          }}
        />
      </body>
    </html>
  )
}
