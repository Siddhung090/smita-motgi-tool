import Anthropic from '@anthropic-ai/sdk'

// Default to the most capable Claude model; override via env if desired.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8'

// Structured-output schema: forces Claude to return a parseable script + character profile.
const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    suggestedTitle: { type: 'string' },
    summary: { type: 'string' },
    tone: { type: 'string' },
    character: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        appearance: { type: 'string' },
        personality: { type: 'string' },
        voiceStyle: { type: 'string' },
      },
      required: ['name', 'appearance', 'personality', 'voiceStyle'],
    },
    script: { type: 'string' },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          beat: { type: 'string' },
          narration: { type: 'string' },
          visual: { type: 'string' },
        },
        required: ['beat', 'narration', 'visual'],
      },
    },
  },
  required: ['suggestedTitle', 'summary', 'tone', 'character', 'script', 'scenes'],
}

const SYSTEM_PROMPT = `You are a creative video scriptwriter for a "talking character" video tool.
Given a user's story and a chosen character, you:
1. Understand the story and distill it into a clear narrative.
2. Design the character (name, appearance, personality, and speaking/voice style) so it fits the story. Keep the user's chosen character name unless it is empty.
3. Write a "script" — the exact words the character will speak, in first person, narrating the story. Keep it natural, engaging, and suitable for being spoken aloud (roughly 60-150 words unless the story is longer).
4. Break the story into 3-6 scenes; for each, give a short beat label, the narration line(s) for that beat, and a one-line visual description.
Write for the spoken word: short sentences, vivid, warm. Match the requested tone.`

export async function POST(request) {
  try {
    const body = await request.json()
    const { text, character, videoLink } = body

    if (!text || !text.trim()) {
      return Response.json({ message: 'Please provide some story text.' }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        {
          message:
            'ANTHROPIC_API_KEY is not configured. Add it in your .env.local (local) or Render environment variables (deployed).',
        },
        { status: 503 }
      )
    }

    const client = new Anthropic()

    let userContent = `Chosen character: ${character || '(none — you choose a fitting name)'}\n\nStory / content:\n${text}`
    if (videoLink && videoLink.trim()) {
      userContent +=
        `\n\nThe user also provided a reference video link for inspiration: ${videoLink}\n` +
        `(You cannot watch the video; treat the link only as a hint about the desired style/topic. Do not invent specific facts from it.)`
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: ANALYSIS_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    })

    if (response.stop_reason === 'refusal') {
      return Response.json(
        { message: 'The request was declined. Try rephrasing your story.' },
        { status: 422 }
      )
    }

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock) {
      return Response.json({ message: 'No analysis was returned. Please try again.' }, { status: 502 })
    }

    const analysis = JSON.parse(textBlock.text)
    return Response.json({ success: true, analysis }, { status: 200 })
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ message: 'Invalid ANTHROPIC_API_KEY.' }, { status: 401 })
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ message: 'Rate limited — please try again in a moment.' }, { status: 429 })
    }
    return Response.json(
      { message: 'Failed to analyze story.', error: error.message },
      { status: 500 }
    )
  }
}
