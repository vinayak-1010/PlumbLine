import { createApp } from "./app";

const port = Number(process.env.PORT || 8080);
createApp().listen(port, "0.0.0.0", () => console.log(`Plumbline listening on http://localhost:${port}`));
