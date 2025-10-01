import express from "express";
import { setupBot } from "./bot/bot.js";

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send("hello world");
});

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});

// Start the bot logic
setupBot();
