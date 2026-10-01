# Streaming & Chunked Uploads

Easily stream large medical DICOM/video files using HTTP 206 Partial Content:

```ts
app.get('/video.mp4', async (ctx) => {
  await ctx.res.streamFile(ctx.req, './storage/video.mp4', { range: true });
});
```
