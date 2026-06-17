export async function POST(request) {
  try {
    const body = await request.json()
    const { text, character, title } = body

    if (!text || !character || !title) {
      return Response.json(
        { message: 'Missing required fields' },
        { status: 400 }
      )
    }

    const mockVideoUrl = `https://example.com/videos/${Date.now()}.mp4`

    return Response.json(
      {
        success: true,
        message: 'Video generation started',
        url: mockVideoUrl,
        character,
        title,
      },
      { status: 200 }
    )
  } catch (error) {
    return Response.json(
      { message: 'Internal server error', error: error.message },
      { status: 500 }
    )
  }
}