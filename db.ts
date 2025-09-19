import mongoose from "mongoose";

async function dbConnect(uri: string): Promise<void> {
  try {
    await mongoose.connect(uri, {

      autoIndex: true, // build indexes
      serverSelectionTimeoutMS: 5000,
    });
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1); // exit process if DB connection fails
  }

  mongoose.connection.on("disconnected", () => {
    console.warn("⚠️ MongoDB disconnected");
  });

  mongoose.connection.on("reconnected", () => {
    console.log("🔄 MongoDB reconnected");
  });
}

export default dbConnect;
