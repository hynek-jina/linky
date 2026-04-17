import type { IncomingMessage, ServerResponse } from "node:http";

export default function handler(_req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  res.setHeader("Cache-Control", "no-store");
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Linky</title>
  </head>
  <body>
    <p>Returning to Linky...</p>
    <script>
      window.setTimeout(function () {
        window.location.replace("/#");
      }, 400);
    </script>
  </body>
</html>`);
}
