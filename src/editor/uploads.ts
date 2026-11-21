import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { toast } from '#/components/ui/toast'

export interface Uploaded {
  url: string
  key: string
  name: string
  contentType: string
  size: number
}

export async function uploadFile(file: File): Promise<Uploaded> {
  if (!navigator.onLine) throw new Error('Uploading needs an internet connection.')
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/files', { method: 'POST', body: form })
  if (!res.ok) {
    const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error
    throw new Error(msg || `Upload failed (${res.status})`)
  }
  return (await res.json()) as Uploaded
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

export async function insertImages(editor: Editor, files: File[], pos?: number) {
  for (const file of files) {
    try {
      toast('Uploading image…')
      const up = await uploadFile(file)
      const chain = editor.chain().focus()
      if (pos !== undefined) chain.insertContentAt(pos, { type: 'image', attrs: { src: up.url, alt: file.name } })
      else chain.setImage({ src: up.url, alt: file.name })
      chain.run()
    } catch (e) {
      toast((e as Error).message)
    }
  }
}

export async function pickAndUploadImage(editor: Editor) {
  const file = await pickFile('image/*')
  if (file) await insertImages(editor, [file])
}

/** Paste or drop images into the editor to upload them to R2. */
export const ImageUploads = Extension.create({
  name: 'imageUploads',
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('imageUploads'),
        props: {
          handlePaste(_view, event) {
            const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
            if (!files.length) return false
            event.preventDefault()
            void insertImages(editor, files)
            return true
          },
          handleDrop(view, event) {
            const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'))
            if (!files.length) return false
            event.preventDefault()
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
            void insertImages(editor, files, pos)
            return true
          },
        },
      }),
    ]
  },
})
