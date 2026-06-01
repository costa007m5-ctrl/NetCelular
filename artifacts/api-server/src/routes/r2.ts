import { Router } from "express";
import { S3Client, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const router = Router();

function getClient(): S3Client {
  const accountId = process.env["R2_ACCOUNT_ID"];
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucket(query: any): string {
  const name = process.env["R2_BUCKET_NAME"] ?? query?.bucket;
  if (!name) throw new Error("bucket required (set R2_BUCKET_NAME env var or pass ?bucket=)");
  return name;
}

function isVideo(key: string) {
  return /\.(mp4|mkv|mov|avi|webm|m4v|ts|m3u8)$/i.test(key);
}

function isImage(key: string) {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(key);
}

function fileType(key: string): "video" | "image" | "other" {
  if (isVideo(key)) return "video";
  if (isImage(key)) return "other";
  return "other";
}

router.get("/buckets", async (req, res) => {
  try {
    const client = getClient();
    const bucket = getBucket(req.query);
    res.json({ buckets: [bucket] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

router.get("/list", async (req, res) => {
  try {
    const client = getClient();
    const bucket = getBucket(req.query);
    const prefix = (req.query["prefix"] as string) ?? "";
    const delimiter = (req.query["delimiter"] as string) ?? "/";
    const continuationToken = (req.query["token"] as string) ?? undefined;

    const cmd = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      Delimiter: delimiter,
      MaxKeys: 200,
      ContinuationToken: continuationToken,
    });

    const data = await client.send(cmd);

    const folders = (data.CommonPrefixes ?? []).map((p) => ({
      type: "folder" as const,
      key: p.Prefix!,
      name: p.Prefix!.replace(prefix, "").replace(/\/$/, "") || p.Prefix!,
    }));

    const files = (data.Contents ?? [])
      .filter((o) => o.Key !== prefix)
      .map((o) => ({
        type: "file" as const,
        key: o.Key!,
        name: o.Key!.split("/").pop() ?? o.Key!,
        size: o.Size ?? 0,
        lastModified: o.LastModified?.toISOString() ?? null,
        fileType: fileType(o.Key!),
        isVideo: isVideo(o.Key!),
      }));

    res.json({
      bucket,
      prefix,
      folders,
      files,
      isTruncated: data.IsTruncated ?? false,
      nextToken: data.NextContinuationToken ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

router.get("/signed-url", async (req, res) => {
  try {
    const client = getClient();
    const bucket = getBucket(req.query);
    const key = req.query["key"] as string;

    if (!key) {
      res.status(400).json({ error: "key is required" });
      return;
    }

    const expiresIn = Number(req.query["expires"] ?? 3600);

    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(client, cmd, { expiresIn });

    res.json({ url, key, bucket, expiresIn });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const client = getClient();
    const bucket = getBucket(req.query);

    const cmd = new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000 });
    const data = await client.send(cmd);

    const contents = data.Contents ?? [];
    const totalSize = contents.reduce((acc, o) => acc + (o.Size ?? 0), 0);
    const videoCount = contents.filter((o) => isVideo(o.Key ?? "")).length;

    res.json({
      bucket,
      objectCount: contents.length,
      isTruncated: data.IsTruncated ?? false,
      totalSizeBytes: totalSize,
      videoCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

export default router;
