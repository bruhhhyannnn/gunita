// A tiny fake of the Claude Messages API, so the end-to-end tests never call
// the real API. It answers by looking at what each request asks for.
// GET /__log returns the requests it has seen.
import http from 'node:http'

const port = Number(process.env.MOCK_ANTHROPIC_PORT || 8788)
const log = []

function answer(body) {
  const sys = typeof body.system === 'string' ? body.system : JSON.stringify(body.system ?? '')
  const props = Object.keys(body.output_config?.format?.schema?.properties ?? {})
  if (body.output_config?.format) {
    if (props.includes('groups'))
      return { groups: [{ title: 'Website redesign', items: ['Built the new landing page.', 'Fixed the login bug on mobile.'] }] }
    if (props.includes('suggestions'))
      return {
        suggestions: [
          { text: 'prepare slides for the quarterly review', reason: 'meeting at 2pm' },
          { text: 'reply to the vendor about the contract', reason: 'due Friday' },
        ],
      }
    if (props.includes('summary'))
      return {
        summary: 'We agreed to ship the website update next week.',
        decisions: ['Ship on Friday'],
        actionItems: [
          { text: 'fix the login bug', owner: 'me', due: '' },
          { text: 'record the demo video', owner: '', due: '' },
        ],
      }
    if (props.includes('entities'))
      return {
        entities: [
          { name: 'Website redesign', type: 'project', summary: 'The new company website', pageIds: [] },
          { name: 'AWS', type: 'topic', summary: 'Cloud services being studied', pageIds: [] },
        ],
        links: [{ source: 'Website redesign', target: 'AWS', label: 'hosted on' }],
        facts: [{ text: 'You have postponed the login fix for several days.', sourceIds: [] }],
      }
    if (props.includes('text')) return { title: 'Slide', text: 'Extracted slide text', keyPoints: ['point one'] }
    return {}
  }
  if (sys.includes('answer questions')) return 'You wrote that **EC2** lets you rent virtual machines [1].'
  return ' that runs your app'
}

http
  .createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/__log') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify(log))
    }
    if (req.method === 'GET') {
      res.writeHead(200)
      return res.end('mock anthropic')
    }
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const body = JSON.parse(raw || '{}')
      log.push({ path: req.url, model: body.model, effort: body.output_config?.effort, beta: req.headers['anthropic-beta'] ?? null, stream: !!body.stream })
      const out = answer(body)
      const text = typeof out === 'string' ? out : JSON.stringify(out)
      const msg = {
        id: 'msg_mock',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }
      if (!body.stream) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify(msg))
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      send('message_start', { type: 'message_start', message: { ...msg, content: [], stop_reason: null } })
      send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
      for (const chunk of text.match(/.{1,12}/gs) ?? []) send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk } })
      send('content_block_stop', { type: 'content_block_stop', index: 0 })
      send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } })
      send('message_stop', { type: 'message_stop' })
      res.end()
    })
  })
  .listen(port, '127.0.0.1', () => console.log(`mock anthropic on http://127.0.0.1:${port}`))
