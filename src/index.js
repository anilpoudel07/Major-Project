import dotenv from "dotenv";
dotenv.config();
const PORT = process.env.PORT || 4000;
import app from "./app.js";
import { connectDB } from "./config/db.js";

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is connected to port: ${PORT}`);
    });
  })
  .catch((error) => {
    console.log("Error while connecting to the DB:", error);
  });

console.log("Hello anil");
