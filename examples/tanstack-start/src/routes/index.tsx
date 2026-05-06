import { createFileRoute } from '@tanstack/react-router'
import { UppyUploader } from '../components/UppyUploader'
import { TUS_API_PATH } from '../lib/tus-path'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main className="from-muted/40 via-background to-background min-h-dvh bg-gradient-to-b px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Resumable uploads (TUS)
          </h1>
          <p className="text-muted-foreground max-w-2xl text-pretty leading-relaxed">
            Uppy sends files to this app’s tus endpoint at{' '}
            <code className="bg-muted text-foreground rounded-md px-1.5 py-0.5 text-sm">
              {TUS_API_PATH}/
            </code>
            . The server writes completed uploads to the{' '}
            <code className="bg-muted text-foreground rounded-md px-1.5 py-0.5 text-sm">
              uploads/
            </code>{' '}
            folder (created automatically). Override the client target with{' '}
            <code className="bg-muted text-foreground rounded-md px-1.5 py-0.5 text-sm">
              VITE_TUS_ENDPOINT
            </code>{' '}
            if you need a different URL.
          </p>
        </header>
        <UppyUploader />
      </div>
    </main>
  )
}
