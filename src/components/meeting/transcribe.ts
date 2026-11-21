import type { Editor } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface SpeechResult {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechEvent {
  resultIndex: number
  results: ArrayLike<SpeechResult>
}
interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: (e: SpeechEvent) => void
  onend: () => void
  onerror: (e: { error: string }) => void
  start: () => void
  stop: () => void
}

function getRecognition(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Live transcript from the microphone using the browser's speech recognition (English). */
export function useTranscriber(editor: Editor | null) {
  const [active, setActive] = useState(false)
  const [interim, setInterim] = useState('')
  const rec = useRef<Recognition | null>(null)
  const wanted = useRef(false)
  const supported = typeof window !== 'undefined' && !!getRecognition()

  const append = useCallback(
    (text: string) => {
      if (!editor) return
      const doc = editor.state.doc
      let hasHeading = false
      doc.forEach((n) => {
        if (n.type.name === 'heading' && n.textContent === 'Transcript') hasHeading = true
      })
      const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      const para = { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: `${time} ` }, { type: 'text', text }] }
      const content = hasHeading ? [para] : [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Transcript' }] }, para]
      editor.chain().insertContentAt(editor.state.doc.content.size, content).run()
    },
    [editor],
  )

  const start = useCallback(() => {
    const R = getRecognition()
    if (!R) return
    const r = new R()
    r.continuous = true
    r.interimResults = true
    r.lang = 'en-US'
    r.onresult = (e) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) append(res[0].transcript.trim())
        else live += res[0].transcript
      }
      setInterim(live)
    }
    // Browsers stop recognition after a pause; keep it going until the user stops.
    r.onend = () => {
      if (wanted.current) r.start()
      else setActive(false)
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed') {
        wanted.current = false
        setActive(false)
      }
    }
    rec.current = r
    wanted.current = true
    r.start()
    setActive(true)
  }, [append])

  const stop = useCallback(() => {
    wanted.current = false
    rec.current?.stop()
    setInterim('')
    setActive(false)
  }, [])

  useEffect(() => () => stop(), [stop])
  return { supported, active, interim, start, stop }
}
