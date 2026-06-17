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
          speaker: { type: 'string', description: 'Which character speaks this line: the main character name, the partner name, or "Both".' },
          emotion: { type: 'string', enum: ['happy', 'love', 'sad', 'surprised', 'angry', 'sleepy', 'excited', 'neutral'] },
          setting: { type: 'string', enum: ['chai', 'street', 'home', 'diwali', 'monsoon', 'park', 'bedroom', 'kitchen', 'cafe', 'night', 'beach', 'rain', 'plain'] },
          prop: { type: 'string', enum: ['none', 'heart', 'gift', 'food', 'balloon', 'flower', 'coffee'] },
          action: { type: 'string', enum: ['idle', 'wave', 'hug', 'give', 'jump', 'dance', 'cry', 'sulk', 'point', 'clap', 'nod', 'shake', 'walkin', 'hit', 'look', 'beat', 'chase', 'run'] },
        },
        required: ['beat', 'narration', 'visual', 'speaker', 'emotion', 'setting', 'prop', 'action'],
      },
    },
  },
  required: ['suggestedTitle', 'summary', 'tone', 'character', 'script', 'scenes'],
}

const SYSTEM_PROMPT = `You are a creative director for a cute cartoon-short video tool in the style of "Bubu and Dudu" — two adorable characters (a couple/duo) acting out short, wholesome, funny or sweet stories.
The cast is exactly TWO characters: the chosen main character and their partner. Bubu pairs with Dudu, Momo pairs with Zara. They appear together on screen.
Given a user's story, you:
1. Understand the story and distill it into a clear, warm, cute narrative for these two characters.
2. Design the main character (name, appearance, personality, speaking/voice style). Keep the user's chosen character name unless it is empty.
3. Write a "script" — all the spoken lines in order, natural and suitable for being read aloud (roughly 60-150 words; aim for a video of about 20-40 seconds).
4. Break the story into 4-7 short scenes. For EACH scene provide:
   - beat: a short label
   - narration: the exact words spoken in this scene (one or two short sentences)
   - visual: a one-line description of what happens
   - speaker: who says the line — the main character's name, the partner's name, or "Both"
   - emotion: the mood (happy, love, sad, surprised, angry, sleepy, excited, neutral)
   - setting: the location. Indian-flavoured options: chai (roadside tea stall), street (Indian street with auto-rickshaw), home (Indian living room with rangoli/diya), diwali (festive night with fireworks & diyas), monsoon (rainy street). Generic options: park, bedroom, kitchen, cafe, night, beach, rain, plain.
   - prop: an optional cute object on screen (none, heart, gift, food, balloon, flower, coffee)
   - action: what the SPEAKING character physically DOES this scene — idle, wave, hug, give (hand something over), jump, dance, cry, sulk (turn away in a huff), point, clap, nod (yes), shake (no), walkin (enter the scene), hit (playfully beat/scold the partner, who recoils), beat (beat the partner with a stick/hammer — set prop to stick or hammer), chase (chase the partner, who runs away), run (run away), look (gaze lovingly at each other). Choose an action that matches the line and emotion (e.g. an apology → give or hug; a tiff/scolding → sulk or hit; a tender moment → look; excitement → jump or dance; crying → cry). The partner automatically reacts.
Vary the settings, emotions, actions and speakers across scenes so the video feels lively and animated. If the story has an Indian context, PREFER the Indian settings (chai, street, home, diwali, monsoon). Write for the spoken word: short sentences, vivid, warm, a little playful. Match the requested tone.`

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

    const PAIRS = { Dudu: 'Bubu', Bubu: 'Dudu', Momo: 'Zara', Zara: 'Momo' }
    const mainName = character || 'Dudu'
    const partnerName = PAIRS[mainName] || 'Bubu'

    let userContent =
      `Main character: ${mainName}\nPartner character (also on screen): ${partnerName}\n` +
      `Use these two names as the "speaker" for each scene (or "Both").\n\nStory / content:\n${text}`
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
