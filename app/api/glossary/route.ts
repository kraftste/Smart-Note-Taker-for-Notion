import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { pages } = await request.json()

    if (!pages || !Array.isArray(pages)) {
      return NextResponse.json({ error: "Invalid pages data" }, { status: 400 })
    }

    const MAX_CHARACTERS = 896
    const PREFIX = "Glossar: "

    const glossaryTitles: string[] = []
    let currentLength = PREFIX.length

    for (const page of pages) {
      const title = page.title || "Unbenannte Seite"
      if (title.toLowerCase().trim() === "unbenannte seite" || title.toLowerCase().trim() === "new page") {
        continue
      }

      const titleWithComma = glossaryTitles.length > 0 ? `, ${title}` : title
      const newLength = currentLength + titleWithComma.length

      if (newLength <= MAX_CHARACTERS) {
        glossaryTitles.push(title)
        currentLength = newLength
      } else {
        break // Stop when the next title would exceed the limit
      }
    }

    const glossaryText = glossaryTitles.join(", ")
    const fullPrompt = `${PREFIX}${glossaryText}`

    console.log("[v0] Glossary created:", {
      titlesCount: glossaryTitles.length,
      totalCharacters: fullPrompt.length,
      prompt: fullPrompt,
    })

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: fullPrompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    })

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text()
      console.error("[v0] Groq API error:", errorText)
      throw new Error("Groq API request failed")
    }

    const groqData = await groqResponse.json()
    const groqResponseText = groqData.choices?.[0]?.message?.content || ""

    console.log("[v0] Groq response:", groqResponseText)

    return NextResponse.json({
      glossary: fullPrompt,
      groqResponse: groqResponseText,
      titlesIncluded: glossaryTitles.length,
      totalCharacters: fullPrompt.length,
    })
  } catch (error) {
    console.error("[v0] Error creating glossary:", error)
    return NextResponse.json({ error: "Failed to create glossary" }, { status: 500 })
  }
}
