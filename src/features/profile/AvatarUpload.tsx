'use client'

import { useRef, useState, useTransition } from 'react'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'
import { uploadAvatarAction } from './actions'

interface Props {
  avatarUrl: string | null
  initials:  string
  grad:      string
}

export function AvatarUpload({ avatarUrl, initials, grad }: Props) {
  const inputRef               = useRef<HTMLInputElement>(null)
  const [preview, setPreview]  = useState<string | null>(avatarUrl)
  const [, startTransition]    = useTransition()

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => setPreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    const tid = toast.loading('Envoi de la photo…')
    const formData = new FormData()
    formData.set('avatar', file)

    startTransition(async () => {
      const result = await uploadAvatarAction(formData)
      if (result.error) {
        toast.error(result.error, { id: tid })
        setPreview(avatarUrl)
        return
      }
      setPreview(result.url ?? null)
      toast.success('Photo mise à jour ! 🎉', { id: tid })
    })

    e.target.value = ''
  }

  return (
    <div className="relative w-fit">
      {/* Avatar visuel */}
      <div
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-black text-black overflow-hidden"
        style={{
          background: preview ? undefined : grad,
          boxShadow:  '0 0 24px rgba(0,255,133,0.25)',
        }}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Photo profil" className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </div>

      {/* Bouton caméra */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95"
        style={{
          background: 'rgba(0,255,133,0.92)',
          border:     '2.5px solid rgba(5,5,15,0.98)',
          boxShadow:  '0 0 12px rgba(0,255,133,0.45)',
        }}
        aria-label="Changer la photo de profil"
      >
        <Camera size={12} className="text-black" strokeWidth={2.5} />
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}
