# Multimodal Input Implementation

## Overview

Support image and voice input for character reactions. Vision/STT models process uploads.

## Implementation

### File: src/input/multimodal-handler.ts

```typescript
export interface MultimodalInput {
  type: "image" | "voice" | "text";
  content: string | ArrayBuffer;
  mimeType: string;
}

export async function processMultimodal(
  input: MultimodalInput,
  context: { chatId: string; actorId: string; worldId: string }
): Promise<string> {
  switch (input.type) {
    case "image":
      return await processImage(input.content as ArrayBuffer, context);
    case "voice":
      return await processVoice(input.content as ArrayBuffer, context);
    default:
      return input.content as string;
  }
}

async function processImage(
  buffer: ArrayBuffer,
  context: { chatId: string; actorId: string; worldId: string }
): Promise<string> {
  // Get vision model
  const visionModel = getProviderForTask("vision");

  // Convert to base64
  const base64 = arrayBufferToBase64(buffer);

  // Call vision model
  const response = await fetch(visionModel.endpoint, {
    method: "POST",
    headers: { "Authorization": `Bearer ${visionModel.apiKey}` },
    body: JSON.stringify({
      model: visionModel.model,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Describe this image for an RPG character to react to." },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } }
        ]
      }]
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;
}

async function processVoice(
  buffer: ArrayBuffer,
  context: { chatId: string; actorId: string; worldId: string }
): Promise<string> {
  // Get STT model
  const sttModel = getProviderForTask("stt");

  // Convert to audio file
  const audioBlob = new Blob([buffer], { type: "audio/webm" });
  const formData = new FormData();
  formData.append("file", audioBlob, "recording.webm");
  formData.append("model", sttModel.model);

  const response = await fetch(sttModel.endpoint, {
    method: "POST",
    body: formData,
  });

  const data = await response.json();
  return data.text;
}
```

### File: src/frontend/alpine/multimodal-input.ts

```typescript
export function useMultimodalInput() {
  return {
    isRecording: false,
    recordingTime: 0,

    async captureImage() {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.capture = "environment"; // Camera on mobile

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const buffer = await file.arrayBuffer();
        const description = await processMultimodal(
          { type: "image", content: buffer, mimeType: file.type },
          { chatId: this.chatId, actorId: this.actorId, worldId: this.worldId }
        );

        this.$dispatch("send-message", { content: description });
      };

      input.click();
    },

    async startRecording() {
      if (!("MediaRecorder" in window)) {
        this.$dispatch("show-toast", { type: "error", message: "Recording not supported" });
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const buffer = await blob.arrayBuffer();

        const text = await processMultimodal(
          { type: "voice", content: buffer, mimeType: "audio/webm" },
          { chatId: this.chatId, actorId: this.actorId, worldId: this.worldId }
        );

        this.$dispatch("send-message", { content: text });
      };

      recorder.start();
      this.isRecording = true;
    },
  };
}
```

## Edge Cases

- Image too large → resize before vision model
- Vision model rate limited → queue with toast
- STT returns poor transcription → user edit before send
- No microphone permission → request permission
- Audio format unsupported → convert via ffmpeg.wasm
- Multimodal not in user plan → disable UI

## Configuration

```yaml
multimodal:
  vision_enabled: true
  stt_enabled: true
  max_image_size_mb: 10
  max_audio_seconds: 60
  default_vision_model: "gpt-4-vision"
  default_stt_model: "whisper-large"
```

## UI Integration

```html
<div class="input-toolbar">
  <button @click="captureImage" title="Attach image">📷</button>
  <button @click="startRecording" :class="{ recording: isRecording }">🎤</button>
</div>
```