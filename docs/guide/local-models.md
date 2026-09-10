<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Browser Models

The web UI Settings → **Models** tab downloads small models into the browser
(IndexedDB) for opt-in local inference: eligible auxiliary tasks
(`prompt-improve`, `prompt-analyze`) run on-device so their prompts never
reach the server. Two sources exist: the **host catalog** (models the server
advertises at `GET /api/local-inference/manifest`) and **direct URL**
downloads (any `http(s)` model file URL with an optional SHA-256).

## Admin download policy

Admins control browser downloads via `generation.localModels` in the server
config file. Omitted fields mean allow.

```toml
[generation.localModels]
# Instance default. Default true when omitted.
allowDownloads = true

# Per-model overrides keyed by catalog id. Unknown ids are ignored.
[generation.localModels.models."Qwen2.5-0.5B-Instruct"]
allowDownload = false
```

Behavior:

- Blocked models disappear from the manifest, so policy-abiding clients
  cannot offer them.
- `allowDownloads = false` also removes the direct-URL form and catalog
  download buttons in the Models tab (advertised via
  `GET /api/local-inference/capability` → `downloadsAllowed`).
- The policy resolves once at route mount time: **config edits take effect
  on restart**.

## Publishing GGUF splits (host guide)

Browsers cannot load files over the ~2GB `ArrayBuffer` cap, so large GGUF
models must ship as `llama-gguf-split` chunks. The downloader speaks the
following contract — publish to it and chunked entries download, resume
per-chunk, and probe clean:

- **Naming:** `<stem>-<index>-of-<total>.gguf` with 5-digit zero-padded
  sequence, e.g. `model-00001-of-00003.gguf` (exactly what `llama-gguf-split`
  produces).
- **Size class:** parts sized for parallel fetch, ≤512MB each:

  ```bash
  llama-gguf-split --split-max-size 512M model.gguf model
  ```

- **Checksums:** record per-chunk SHA-256 alongside sizes:

  ```bash
  sha256sum model-*.gguf
  ```

- **Manifest entry:** one entry per model, one file per chunk in any order
  (the downloader sorts 1..total itself and rejects incomplete sets):

  ```json
  {
    "id": "my-model-GGUF",
    "label": "My Model (llama.cpp)",
    "engine": "wllama-webgpu",
    "parameters": "7B",
    "quantization": "q4_0",
    "files": [
      {
        "name": "my-model-00001-of-00003.gguf",
        "url": "https://host.example.com/models/my-model-00001-of-00003.gguf",
        "sizeBytes": 536870912,
        "sha256": "<hex>"
      }
    ]
  }
  ```

- **Verification rule:** `sizeBytes`/`sha256` are enforced when present and
  recorded otherwise (same rule as single-file downloads). After the set
  completes, the downloader probes the first chunk's `GGUF` magic bytes —
  a wrong or truncated first chunk fails before the entry is treated as
  ready. In the UI a chunked entry renders as a single model with aggregate
  progress (`storedFiles(model.id) + '/' + model.files.length`).
