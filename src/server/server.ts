import dotenv from "dotenv";

dotenv.config();

import { createApp } from "./app";

const { app, logger } = createApp();

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

app.listen(port, () => {
  logger.info({ port }, "Server listening");
});
