import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { MongoClient } from "mongodb";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import handlebars from "handlebars";
import nodemailer from "nodemailer";
import Agenda from "agenda";
import { randomUUID } from "crypto";

const app = express();
app.use(express.json({ limit: "1mb" }));

const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/vfl";
const DB_NAME = process.env.DB_NAME || "vfl";
const PORT = Number(process.env.NOTIF_PORT || 4001);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const TEXTBELT_KEY = process.env.TEXTBELT_KEY || "textbelt";
const SMS_MODE = process.env.SMS_MODE || "smtp_gateway"; // smtp_gateway | textbelt

const client = new MongoClient(MONGO_URL);
await client.connect();
const db = client.db(DB_NAME);

const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: "*" } });

const agenda = new Agenda({ db: { address: MONGO_URL, collection: "notification_jobs" } });
await agenda.start();

async function ensureIndexes() {
  await db.collection("notifications").createIndex({ dedup_key: 1 }, { unique: true });
  await db.collection("notifications").createIndex({ order_id: 1, sent_at: -1 });
  await db.collection("notification_templates").createIndex({ name: 1, channel: 1 }, { unique: true });
  await db.collection("audit_log").createIndex({ entity_type: 1, entity_id: 1, timestamp: -1 });
}
await ensureIndexes();

async function ensureDefaultTemplates() {
  const defaults = [
    { channel: "email", name: "new", subject: "Orden {{order_number}} creada", body_template: "<p>Hola {{name}}, tu orden {{order_number}} fue creada.</p><p>Estado: {{status}}</p>" },
    { channel: "email", name: "processing", subject: "Orden {{order_number}} en proceso", body_template: "<p>Tu orden {{order_number}} está en proceso.</p>" },
    { channel: "email", name: "ready", subject: "Orden {{order_number}} lista", body_template: "<p>Tu orden {{order_number}} está lista para entrega.</p>" },
    { channel: "email", name: "out_for_delivery", subject: "Orden {{order_number}} en camino", body_template: "<p>Tu orden {{order_number}} va en camino a {{address}}.</p>" },
    { channel: "email", name: "delivered", subject: "Orden {{order_number}} entregada", body_template: "<p>Hemos entregado tu orden {{order_number}}.</p><p>Total: {{total}}</p>" },
    { channel: "sms", name: "new", body_template: "Orden {{order_number}} creada. Estado: {{status}}" },
    { channel: "sms", name: "processing", body_template: "Orden {{order_number}} en proceso." },
    { channel: "sms", name: "ready", body_template: "Orden {{order_number}} lista para entrega." },
    { channel: "sms", name: "out_for_delivery", body_template: "Orden {{order_number}} en camino a {{address}}." },
    { channel: "sms", name: "delivered", body_template: "Orden {{order_number}} entregada. Total: {{total}}" },
    { channel: "dashboard", name: "new", body_template: "{{name}} creó la orden {{order_number}}." },
    { channel: "dashboard", name: "processing", body_template: "Orden {{order_number}} pasó a 'processing'." },
    { channel: "dashboard", name: "ready", body_template: "Orden {{order_number}} está 'ready'." },
    { channel: "dashboard", name: "out_for_delivery", body_template: "Orden {{order_number}} 'out_for_delivery' hacia {{address}}." },
    { channel: "dashboard", name: "delivered", body_template: "Orden {{order_number}} 'delivered'." }
  ];
  for (const tpl of defaults) {
    await db.collection("notification_templates").updateOne(
      { name: tpl.name, channel: tpl.channel },
      { $setOnInsert: { ...tpl, active: true, id: `${tpl.channel}:${tpl.name}` } },
      { upsert: true }
    );
  }
}
await ensureDefaultTemplates();

async function ensureOpenApiSpec() {
  const spec = {
    openapi: "3.0.0",
    info: {
      title: "VFL Notifications API",
      version: "0.1.0"
    },
    servers: [
      { url: "http://localhost:" + PORT, description: "Local notifications service" }
    ],
    paths: {
      "/api/webhook/order-status": {
        post: {
          summary: "Webhook interno de cambio de estado de orden",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    order: { type: "object" },
                    status: { type: "string" }
                  },
                  required: ["order", "status"]
                }
              }
            }
          },
          responses: {
            "200": { description: "Notificaciones creadas" },
            "400": { description: "Payload inválido" }
          }
        }
      },
      "/api/notifications/send": {
        post: {
          summary: "Enviar notificación manual para una orden",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    order_id: { type: "string" },
                    channel: { type: "string", enum: ["email", "sms", "dashboard"] },
                    template_name: { type: "string" },
                    variables: { type: "object" }
                  },
                  required: ["order_id", "channel", "template_name"]
                }
              }
            }
          },
          responses: {
            "200": { description: "Notificación encolada" },
            "404": { description: "Orden no encontrada" },
            "409": { description: "Notificación duplicada" }
          }
        }
      },
      "/api/notifications": {
        get: {
          summary: "Listar notificaciones",
          parameters: [
            { name: "order_id", in: "query", schema: { type: "string" } },
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "channel", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 100 } }
          ],
          responses: {
            "200": {
              description: "Listado de notificaciones"
            }
          }
        }
      }
    }
  };
  await db.collection("notification_openapi").updateOne(
    { id: "openapi" },
    { $set: { id: "openapi", ...spec } },
    { upsert: true }
  );
}
await ensureOpenApiSpec();
function buildDedupKey({ order_id, channel, template_id, variables }) {
  const variables_key = JSON.stringify(variables || {});
  return `${order_id}|${channel}|${template_id}|${variables_key}`;
}

function compileTemplate(source, variables) {
  const tpl = handlebars.compile(source || "");
  return tpl(variables || {});
}

function getTransport() {
  if (SMTP_USER && SMTP_PASS) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
  }
  return nodemailer.createTransport({ sendmail: true, newline: "unix", path: "/usr/sbin/sendmail" });
}

const CARRIER_GATEWAYS = {
  att: "txt.att.net",
  tmobile: "tmomail.net",
  verizon: "vtext.com",
  sprint: "messaging.sprintpcs.com",
  boost: "sms.myboostmobile.com",
  cricket: "sms.cricketwireless.net",
  uscellular: "email.uscc.net",
  virgin: "vmobl.com",
  metro: "mymetropcs.com",
  telcel: "mms.telcel.com",
  movistar_mx: "movistar.com.mx"
};
const DEFAULT_CARRIER = process.env.DEFAULT_SMS_CARRIER || "att";

agenda.define("send-email", async (job) => {
  const data = job.attrs.data;
  const transport = getTransport();
  const info = await transport.sendMail({
    from: data.from || SMTP_USER,
    to: data.to,
    subject: data.subject,
    html: data.html
  });
  await db.collection("notifications").updateOne({ id: data.id }, { $set: { status: "sent", sent_at: new Date().toISOString(), provider_message_id: info.messageId } });
  io.emit("notification", { id: data.id, status: "sent" });
});

agenda.define("send-sms", async (job) => {
  const data = job.attrs.data;
  let status = "failed";
  let error_message = null;
  if (SMS_MODE === "smtp_gateway") {
    const transport = getTransport();
    const carrier = data.carrier || DEFAULT_CARRIER;
    const gateway = CARRIER_GATEWAYS[carrier];
    if (!gateway) {
      error_message = "Unknown carrier gateway";
    } else {
      try {
        await transport.sendMail({
          from: data.from || SMTP_USER,
          to: `${data.to}@${gateway}`,
          subject: "",
          text: data.text
        });
        status = "sent";
      } catch (e) {
        error_message = String(e);
      }
    }
  } else {
    const res = await fetch("https://textbelt.com/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: data.to, message: data.text, key: TEXTBELT_KEY })
    });
    const result = await res.json();
    status = result.success ? "sent" : "failed";
    error_message = result.error || null;
  }
  await db.collection("notifications").updateOne({ id: data.id }, { $set: { status, sent_at: new Date().toISOString(), error_message } });
  io.emit("notification", { id: data.id, status });
});

async function createNotification({ order, channel, templateName, variables }) {
  const template = await db.collection("notification_templates").findOne({ name: templateName, channel });
  if (!template || template.active === false) {
    throw new Error("Template not found or inactive");
  }
  const id = randomUUID();
  const payload = {
    id,
    order_id: order.id || order.order_id || order.order_number,
    type: "order_status",
    channel,
    status: "queued",
    template_id: template.id || `${template.channel}:${template.name}`,
    queued_at: new Date().toISOString(),
    variables
  };
  payload.dedup_key = buildDedupKey(payload);
  await db.collection("notifications").insertOne(payload);
  if (channel === "email") {
    const html = compileTemplate(template.body_template, variables);
    const subject = compileTemplate(template.subject || "", variables);
    await agenda.now("send-email", { id, to: variables.email, subject, html, from: variables.from });
  } else if (channel === "sms") {
    const text = compileTemplate(template.body_template, variables);
    await agenda.now("send-sms", { id, to: variables.phone, text, carrier: variables.carrier });
  } else if (channel === "dashboard") {
    io.emit("notification", { id, status: "sent", type: "dashboard", variables });
    await db.collection("notifications").updateOne({ id }, { $set: { status: "sent", sent_at: new Date().toISOString() } });
  }
  await db.collection("audit_log").insertOne({
    id: randomUUID(),
    entity_type: "order",
    entity_id: payload.order_id,
    action: "notification_queued",
    user_id: "system",
    timestamp: new Date().toISOString(),
    changes: { channel, template_id: payload.template_id },
    notification_id: id
  });
  return { id };
}

app.post("/api/webhook/order-status", async (req, res) => {
  try {
    const { order, status } = req.body || {};
    if (!order || !status) return res.status(400).json({ error: "Invalid payload" });
    const customer = await db.collection("customers").findOne({ id: order.customer_id });
    const variables = {
      order_number: order.order_number || order.order_id,
      status,
      name: customer?.name || order.customer_name || "Cliente",
      email: customer?.email,
      phone: customer?.phone,
      carrier: customer?.carrier,
      address: order.delivery_address || order.pickup_address || "",
      total: order.total_amount || ""
    };
    const channels = ["email", "sms", "dashboard"];
    const sent = [];
    for (const ch of channels) {
      try {
        const templateName = status.toLowerCase();
        const result = await createNotification({ order, channel: ch, templateName, variables });
        sent.push({ channel: ch, id: result.id });
      } catch (e) {}
    }
    return res.json({ ok: true, sent });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

function chooseChannels(vars) {
  const channels = [];
  if (vars.email) channels.push("email");
  if (vars.phone) channels.push("sms");
  channels.push("dashboard");
  return channels;
}

async function watchOrderStatusChanges() {
  const pipeline = [
    { $match: { operationType: { $in: ["insert", "update"] } } },
    {
      $match: {
        $or: [
          { "fullDocument.status": { $exists: true } },
          { "updateDescription.updatedFields.status": { $exists: true } }
        ]
      }
    }
  ];
  const changeStream = db.collection("orders").watch(pipeline, { fullDocument: "updateLookup" });
  changeStream.on("change", async (event) => {
    try {
      const order = event.fullDocument || {};
      const status =
        event.operationType === "insert"
          ? order.status
          : order.status || event.updateDescription?.updatedFields?.status;
      if (!status) return;
      const customer = await db.collection("customers").findOne({ id: order.customer_id }, { projection: { _id: 0 } });
      const variables = {
        order_number: order.order_number || order.order_id || order.id,
        status,
        name: customer?.name || order.customer_name || "Cliente",
        email: customer?.email,
        phone: customer?.phone,
        carrier: customer?.carrier,
        address: order.delivery_address || order.pickup_address || "",
        total: order.total_amount || ""
      };
      const channels = chooseChannels(variables);
      for (const ch of channels) {
        try {
          await createNotification({ order, channel: ch, templateName: status.toLowerCase(), variables });
        } catch (e) {}
      }
    } catch {}
  });
}
watchOrderStatusChanges();
app.post("/api/notifications/send", async (req, res) => {
  try {
    const { order_id, channel, template_name, variables } = req.body || {};
    if (!order_id || !channel || !template_name) return res.status(400).json({ error: "Missing fields" });
    const order = await db.collection("orders").findOne({ $or: [{ id: order_id }, { order_id: order_id }, { order_number: order_id }] }, { projection: { _id: 0 } });
    if (!order) return res.status(404).json({ error: "Order not found" });
    const result = await createNotification({ order, channel, templateName: template_name, variables });
    return res.json({ ok: true, id: result.id });
  } catch (e) {
    if (String(e).includes("E11000")) return res.status(409).json({ error: "Duplicate notification" });
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/notifications", async (req, res) => {
  const { order_id, status, channel, limit = 100 } = req.query;
  const q = {};
  if (order_id) q.order_id = order_id;
  if (status) q.status = status;
  if (channel) q.channel = channel;
  const items = await db.collection("notifications").find(q, { projection: { _id: 0 } }).sort({ queued_at: -1 }).limit(Number(limit)).toArray();
  res.json(items);
});

app.get("/api/openapi.json", async (req, res) => {
  const spec = await db.collection("notification_openapi").findOne({ id: "openapi" });
  res.json(spec || {});
});

io.on("connection", (socket) => {
  socket.emit("hello", { ok: true });
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => {});
}

export { app, server };
