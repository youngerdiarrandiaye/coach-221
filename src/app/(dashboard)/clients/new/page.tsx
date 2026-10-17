import { ClientForm } from '@/features/clients/ClientForm'

export const metadata = { title: 'Nouveau client' }

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-lg pb-24 lg:pb-6">
      <h1 className="mb-5 text-xl font-black text-white">Nouveau client</h1>
      <div className="tc-card p-5">
        <ClientForm />
      </div>
    </div>
  )
}

