// Server-Sent Events: any module calls publish('machines') after a change; the UI refetches.
const clients = new Set();
export const sseHandler = (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
};
export const publish = (topic) => {
  for (const c of clients) c.write(`data: ${JSON.stringify({ topic, at: Date.now() })}\n\n`);
};
