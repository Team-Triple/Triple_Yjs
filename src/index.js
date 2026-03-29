import http from "node:http";

const port = process.env.PORT ?? 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(
    JSON.stringify({
      ok: true,
      message: "Node.js starter is running",
      path: req.url
    })
  );
});

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
