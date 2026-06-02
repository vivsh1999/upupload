import { ClientOnly } from "@tanstack/react-router";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { MediaUploadField } from "./media-upload";
import { MediaUploadShadcnControls } from "./media-upload/MediaUploadShadcnControls";
import { MEDIA_PICKER_ACCEPT } from "@/lib/media-picker-accept";

function UploadLoadingCard() {
  return (
    <Card className="border-border/80 animate-pulse">
      <CardHeader>
        <CardTitle>Loading uploader…</CardTitle>
        <CardDescription>Preparing client-side pipeline and processing.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="bg-muted h-40 rounded-lg" />
      </CardContent>
    </Card>
  );
}

export function UppyUploader() {
  return (
    <ClientOnly fallback={<UploadLoadingCard />}>
      <MediaUploadField
        pipelineConfig={{
          logLevel: "debug",
        }}
        fileInputProps={{ accept: MEDIA_PICKER_ACCEPT }}
        folderInputProps={{ accept: MEDIA_PICKER_ACCEPT }}
        classNames={{
          fileList:
            "bg-muted/30 border-border/60 max-h-56 space-y-1 overflow-y-auto rounded-lg border p-3",
          fileListItem:
            "text-foreground/90 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm odd:bg-background/50",
        }}
        renderControls={MediaUploadShadcnControls}
      />
    </ClientOnly>
  );
}
