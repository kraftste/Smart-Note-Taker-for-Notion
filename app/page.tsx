"use client"

import { useRef, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Mic, Square, Save, RotateCcw, RefreshCw } from "lucide-react"

type NotionPage = {
  id: string
  title: string
  lastEdited: string
}

type NotionData = {
  pages: NotionPage[]
  fetchedAt: string
}

type GlossaryInfo = {
  prompt: string
  titlesIncluded: number
}

type Toast = {
  id: string
  message: string
  type: "success" | "error"
}

export default function DictationPage() {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [transcription, setTranscription] = useState("")
  const [status, setStatus] = useState<"idle" | "recording" | "processing" | "ready">("idle")
  const [toasts, setToasts] = useState<Toast[]>([])
  const [saveError, setSaveError] = useState<string>("")
  const [isSaving, setIsSaving] = useState(false)

  const [notionData, setNotionData] = useState<NotionData | null>(null)
  const [isLoadingNotion, setIsLoadingNotion] = useState(false)
  const [glossaryInfo, setGlossaryInfo] = useState<GlossaryInfo | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    startRecording()
    // Fetch Notion pages in parallel, doesn't block recording
    fetchNotionPages()
  }, [])

  const createGlossaryPrompt = (pages: NotionPage[]): GlossaryInfo | null => {
    if (!pages || pages.length === 0) return null

    // Sort pages by last edited time (newest first)
    const sortedPages = [...pages].sort((a, b) => new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime())

    const prefix = "Glossar: "
    const maxLength = 896
    const maxPromptLength = maxLength - prefix.length

    const titles: string[] = []
    let currentLength = 0

    for (const page of sortedPages) {
      const title = page.title || "Unbenannte Seite"
      // Calculate length if we add this title
      // Format: "title1, title2, title3" (with ", " separator)
      const additionalLength = titles.length === 0 ? title.length : title.length + 2 // +2 for ", "

      if (currentLength + additionalLength <= maxPromptLength) {
        titles.push(title)
        currentLength += additionalLength
      } else {
        // Would exceed limit, stop here
        break
      }
    }

    const glossaryPrompt = titles.join(", ")
    const fullPrompt = prefix + glossaryPrompt

    console.log("[v0] Glossary prompt created:", fullPrompt)
    console.log("[v0] Length:", fullPrompt.length, "/ 896 characters")
    console.log("[v0] Titles included:", titles.length, "of", sortedPages.length)

    return {
      prompt: fullPrompt,
      titlesIncluded: titles.length,
    }
  }

  const fetchNotionPages = async () => {
    setIsLoadingNotion(true)
    try {
      const response = await fetch("/api/notion/recent-pages")
      if (!response.ok) {
        throw new Error("Failed to fetch Notion pages")
      }
      const data = await response.json()
      setNotionData(data)

      const glossary = createGlossaryPrompt(data.pages)
      setGlossaryInfo(glossary)
    } catch (error) {
      console.error("Error fetching Notion pages:", error)
    } finally {
      setIsLoadingNotion(false)
    }
  }

  const requestWakeLock = async () => {
    try {
      // Only request wake lock if document is visible and the API is supported
      if ("wakeLock" in navigator && document.visibilityState === "visible") {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen")
        console.log("[v0] Wake Lock acquired successfully")
      } else {
        console.warn("[v0] Wake Lock not available - document not visible or API not supported")
      }
    } catch (error) {
      // Handle NotAllowedError gracefully - it's not critical if wake lock fails
      console.warn("[v0] Wake Lock request failed (non-critical):", error)
    }
  }

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release()
        wakeLockRef.current = null
        console.log("[v0] Wake Lock released")
      }
    } catch (error) {
      console.error("Wake Lock release failed:", error)
    }
  }

  const startRecording = async () => {
    try {
      await requestWakeLock()

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      const options = {
        mimeType: "audio/webm;codecs=opus",
        audioBitsPerSecond: 33000,
      }

      const mediaRecorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        transcribeAudio()
      }

      mediaRecorder.start(1000)
      setIsRecording(true)
      setStatus("recording")
    } catch (error) {
      console.error("Fehler beim Zugriff auf Mikrofon:", error)
      alert("Mikrofon-Zugriff fehlgeschlagen. Bitte erlaube den Zugriff in den Browser-Einstellungen.")
      await releaseWakeLock()
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
      setIsRecording(false)
      releaseWakeLock()
    }
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
    }
    setIsRecording(false)
    chunksRef.current = []
    setStatus("idle")
    releaseWakeLock()
  }

  const resetForm = () => {
    setTranscription("")
    chunksRef.current = []
    setStatus("idle")
  }

  const transcribeAudio = async () => {
    if (chunksRef.current.length === 0) {
      setStatus("idle")
      return
    }

    setIsProcessing(true)
    setStatus("processing")

    try {
      const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" })

      const formData = new FormData()
      formData.append("file", audioBlob, "audio.webm")
      formData.append("model", "whisper-large-v3")
      formData.append("language", "de")

      if (glossaryInfo && glossaryInfo.prompt) {
        formData.append("glossary", glossaryInfo.prompt)
        console.log("[v0] Using prepared glossary:", glossaryInfo.prompt)
      }

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Transkription fehlgeschlagen")
      }

      const data = await response.json()

      setTranscription((prev) => {
        if (prev.trim()) {
          return prev.trim() + " " + data.text
        }
        return data.text
      })

      chunksRef.current = []
      setStatus("ready")
    } catch (error) {
      console.error("Fehler bei der Transkription:", error)
      alert("Transkription fehlgeschlagen. Bitte versuche es erneut.")
      setStatus("idle")
    } finally {
      setIsProcessing(false)
    }
  }

  const saveTranscription = async () => {
    if (!transcription.trim()) {
      setSaveError("Kein Text zum Speichern vorhanden")
      return
    }

    setSaveError("")
    setIsSaving(true)

    try {
      const webhookUrl = "https://webhooks.tasklet.ai/v1/public/webhook?token=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: transcription,
          timestamp: new Date().toISOString(),
        }),
      })

      if (!response.ok) {
        throw new Error("Speichern fehlgeschlagen")
      }

      showToast("Text erfolgreich gespeichert!", "success")
      resetForm()
    } catch (error) {
      console.error("Fehler beim Speichern:", error)
      setSaveError("Speichern fehlgeschlagen. Bitte versuche es erneut.")
    } finally {
      setIsSaving(false)
    }
  }

  const showToast = (message: string, type: "success" | "error" = "success") => {
    const id = Date.now().toString()
    const newToast = { id, message, type }
    setToasts((prev) => [...prev, newToast])

    // Auto-remove toast after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }

  const formatDate = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-fade-in ${
              toast.type === "success" ? "bg-green-600" : "bg-red-600"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <div className="max-w-2xl mx-auto pt-8 pb-20">
        {/* Header with Reset Button */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">Notion Smart Note Taker</h1>
            <p className="text-gray-600 text-sm">
              {status === "recording" ? "Aufnahme läuft..." : status === "processing" ? "Wird transkribiert..." : ""}
            </p>
          </div>
          <Button
            onClick={resetForm}
            variant="outline"
            className="h-11 px-4 text-gray-600 bg-transparent"
            disabled={isRecording || isProcessing}
          >
            <RotateCcw className="w-5 h-5 mr-2" />
            Zurücksetzen
          </Button>
        </div>

        {/* Status Indicator */}
        <div className="mb-6 text-center">
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
              status === "recording"
                ? "bg-red-100 text-red-700"
                : status === "processing"
                  ? "bg-blue-100 text-blue-700"
                  : status === "ready"
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-700"
            }`}
          >
            {status === "recording" && (
              <>
                <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                Aufnahme läuft
              </>
            )}
            {status === "processing" && "Wird transkribiert..."}
            {status === "ready" && "Bereit zum Speichern"}
            {status === "idle" && "Bereit"}
          </div>
        </div>

        {/* Recording Controls */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex gap-3">
            {!isRecording ? (
              <Button
                onClick={startRecording}
                className="flex-1 h-14 text-lg font-semibold bg-blue-600 hover:bg-blue-700"
                disabled={isProcessing}
              >
                <Mic className="w-6 h-6 mr-2" />
                {isProcessing ? "Transkribiere..." : "Aufnahme starten"}
              </Button>
            ) : (
              <>
                <Button
                  onClick={stopRecording}
                  className="flex-1 h-14 text-lg font-semibold bg-red-600 hover:bg-red-700"
                >
                  <Square className="w-6 h-6 mr-2" />
                  Stop
                </Button>
                <Button
                  onClick={cancelRecording}
                  variant="outline"
                  className="flex-1 h-14 text-lg font-semibold bg-transparent"
                >
                  Abbrechen
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Transcription Text Area */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">Transkription (bearbeitbar)</label>
          <Textarea
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
            className="min-h-[200px] text-base resize-none"
            placeholder="Deine Transkription erscheint hier..."
          />
        </div>

        {saveError && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700 font-medium">{saveError}</p>
          </div>
        )}

        {/* Save Button */}
        <Button
          onClick={saveTranscription}
          className="w-full h-14 text-lg font-semibold bg-green-600 hover:bg-green-700"
          disabled={!transcription.trim() || isRecording || isProcessing || isSaving}
        >
          <Save className="w-6 h-6 mr-2" />
          {isSaving ? "Speichert..." : "Abspeichern"}
        </Button>

        <div className="mt-12 bg-white rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Zuletzt bearbeitete Notion-Seiten</h2>
            <Button
              onClick={fetchNotionPages}
              variant="outline"
              size="sm"
              disabled={isLoadingNotion}
              className="h-9 bg-transparent"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingNotion ? "animate-spin" : ""}`} />
              Aktualisieren
            </Button>
          </div>

          {notionData && (
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">Zuletzt abgerufen: {formatDate(notionData.fetchedAt)}</p>
              <p className="text-sm text-gray-500 font-medium">{notionData.pages.length} Seiten</p>
            </div>
          )}

          {glossaryInfo && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide mb-2">
                Glossar-Prompt für Transkription ({glossaryInfo.titlesIncluded} Titel)
              </p>
              <p className="text-sm text-blue-800 break-words font-mono">{glossaryInfo.prompt}</p>
              <p className="text-xs text-blue-600 mt-2">{glossaryInfo.prompt.length} / 896 Zeichen</p>
            </div>
          )}

          {isLoadingNotion && !notionData ? (
            <div className="text-center py-8 text-gray-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p>Lade Notion-Seiten...</p>
            </div>
          ) : notionData && notionData.pages.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {notionData.pages.map((page) => (
                <div key={page.id} className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="font-medium text-gray-900">{page.title || "Unbenannte Seite"}</div>
                  <div className="text-xs text-gray-500 mt-1">Bearbeitet: {formatDate(page.lastEdited)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>Keine Seiten gefunden</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
