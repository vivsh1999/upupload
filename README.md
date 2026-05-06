# @vivsh1999/upupload

Client-first, multi-stage media uploader/processor with safe fallback-to-original behavior.

- Runs processing **in the browser** (JPEG optimize, thumbnails, RAW decode, video posters)
- Falls back to uploading original bytes when client-side processing is unavailable
- Optional decoder plugins (HEIC/HEIF, TIFF) via runtime imports

## Examples

- `examples/tanstack-start` – TanStack Start + local TUS server
- `examples/vanilla-html` – plain HTML + ES modules using `@vivsh1999/upupload/browser`

import { useMediaUpload } from "@vivsh1999/upupload/react";

```

```
