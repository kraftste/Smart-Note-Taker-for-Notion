import { NextResponse } from "next/server"

export async function GET() {
  try {
    const notionApiKey = process.env.NOTION_API_KEY

    if (!notionApiKey) {
      throw new Error("NOTION_API_KEY not configured")
    }

    const changelogDatabaseId = "21677e415a0980c18637c1b85976ffbf"
    const networkingEventsDatabaseId = "2a677e415a098119a13ad2a78a457d28"
    const excludedDatabaseId2 = "21677e415a09807caf5fe7a075cb3c66"

    const normalizeId = (id: string) => id.replace(/-/g, "")
    const normalizedChangelogId = normalizeId(changelogDatabaseId)
    const normalizedNetworkingId = normalizeId(networkingEventsDatabaseId)
    const normalizedExcludedId2 = normalizeId(excludedDatabaseId2)

    const response = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionApiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sort: {
          direction: "descending",
          timestamp: "last_edited_time",
        },
        page_size: 50,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Notion API error:", errorText)
      throw new Error(`Notion API returned ${response.status}`)
    }

    const data = await response.json()

    const pages =
      data.results
        ?.filter((page: any) => {
          const isChangelogPage = normalizeId(page.parent?.database_id || "") === normalizedChangelogId
          const isNetworkingPage = normalizeId(page.parent?.database_id || "") === normalizedNetworkingId
          const isExcludedPage = normalizeId(page.parent?.database_id || "") === normalizedExcludedId2

          let title = "Unbenannte Seite"
          if (page.properties) {
            const titleProp = Object.values(page.properties).find((prop: any) => prop.type === "title")
            if (titleProp && (titleProp as any).title?.[0]?.plain_text) {
              title = (titleProp as any).title[0].plain_text
            }
          }

          const isUnnamedPage =
            title.toLowerCase().trim() === "unbenannte seite" || title.toLowerCase().trim() === "new page"

          return !isChangelogPage && !isNetworkingPage && !isExcludedPage && !isUnnamedPage
        })
        .map((page: any) => {
          let title = "Unbenannte Seite"

          if (page.properties) {
            const titleProp = Object.values(page.properties).find((prop: any) => prop.type === "title")
            if (titleProp && (titleProp as any).title?.[0]?.plain_text) {
              title = (titleProp as any).title[0].plain_text
            }
          }

          return {
            id: page.id,
            title,
            lastEdited: page.last_edited_time,
          }
        }) || []

    return NextResponse.json({
      pages,
      fetchedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error fetching Notion pages:", error)
    return NextResponse.json(
      { error: "Failed to fetch Notion pages", pages: [], fetchedAt: new Date().toISOString() },
      { status: 500 },
    )
  }
}
