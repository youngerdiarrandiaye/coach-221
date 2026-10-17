// CSS side-effect imports (needed for TS5+ with moduleResolution: bundler)
declare module '*.css' {
  const styles: { [className: string]: string }
  export default styles
}

// SVG as React components
declare module '*.svg' {
  import type { FC, SVGProps } from 'react'
  const ReactComponent: FC<SVGProps<SVGSVGElement>>
  export default ReactComponent
}

// Environment variables — type-safe
declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_SUPABASE_URL: string
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string
    NEXT_PUBLIC_APP_URL: string
    SUPABASE_SERVICE_ROLE_KEY: string
  }
}
