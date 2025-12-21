import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get("file") as Blob
    const model = formData.get("model") as string
    const language = formData.get("language") as string
    const glossaryPrompt = formData.get("glossary") as string | null

    if (!audioFile) {
      return NextResponse.json({ error: "Keine Audio-Datei gefunden" }, { status: 400 })
    }

    // Groq Whisper API aufrufen
    const groqFormData = new FormData()
    groqFormData.append("file", audioFile, "audio.webm")
    groqFormData.append("model", model)
    groqFormData.append("language", language)
    groqFormData.append("response_format", "json")

    if (glossaryPrompt) {
      groqFormData.append("prompt", glossaryPrompt)
      console.log("[v0] Sending glossary to Whisper:", glossaryPrompt)
    }

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: groqFormData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Groq API Fehler:", errorText)
      throw new Error("Groq API Anfrage fehlgeschlagen")
    }

    const data = await response.json()

    return NextResponse.json({
      text: data.text,
      language: data.language,
    })
  } catch (error) {
    console.error("Transkriptionsfehler:", error)
    return NextResponse.json({ error: "Transkription fehlgeschlagen" }, { status: 500 })
  }
}
