import request from "supertest";
import { app } from "./index.js";

describe("Notifications API", () => {
  it("rejects invalid webhook payload", async () => {
    const response = await request(app).post("/api/webhook/order-status").send({});
    expect(response.status).toBe(400);
  });
});
