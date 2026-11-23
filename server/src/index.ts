import { createApp } from "./app.ts";
import { config } from "./config.ts";

const { port } = config();
createApp().listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
