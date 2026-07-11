import { filterOrdersClientSide } from "../utils/orderFilters";

describe("filterOrdersClientSide", () => {
  const orders = [
    {
      id: "ord-1",
      order_number: "VFL-20260711-0001",
      status: "new",
      service_type: "pickup_delivery",
      payment_status: "paid",
      customer_name: "Juan Perez",
      customer_email: "juan@example.com",
      pickup_address: "123 Main St",
      delivery_address: "123 Main St",
      pickup_date: "2026-07-10",
      notes: "Lavado premium",
    },
    {
      id: "ord-2",
      order_number: "VFL-20260711-0002",
      status: "processing",
      service_type: "wash_fold",
      payment_status: "pending",
      customer_name: "Maria Lopez",
      customer_email: "maria@example.com",
      pickup_address: "456 Oak Ave",
      delivery_address: "456 Oak Ave",
      pickup_date: "2026-07-12",
      notes: "Sin suavizante",
    },
    {
      id: "ord-3",
      order_number: "VFL-20260711-0003",
      status: "delivered",
      service_type: "commercial",
      payment_status: "failed",
      customer_name: "Hotel Ventura",
      customer_email: "ops@hotelventura.com",
      pickup_address: "789 Beach Blvd",
      delivery_address: "789 Beach Blvd",
      created_at: "2026-07-15T13:00:00Z",
      notes: "Toallas",
    },
  ];

  it("filtra por texto usando nombre, correo y numero de orden", () => {
    expect(
      filterOrdersClientSide(orders, {
        status: "all",
        service: "all",
        payment: "all",
        search: "maria",
        dateFrom: "",
        dateTo: "",
      })
    ).toEqual([orders[1]]);

    expect(
      filterOrdersClientSide(orders, {
        status: "all",
        service: "all",
        payment: "all",
        search: "0003",
        dateFrom: "",
        dateTo: "",
      })
    ).toEqual([orders[2]]);
  });

  it("filtra por servicio y pago", () => {
    expect(
      filterOrdersClientSide(orders, {
        status: "all",
        service: "wash_fold",
        payment: "pending",
        search: "",
        dateFrom: "",
        dateTo: "",
      })
    ).toEqual([orders[1]]);
  });

  it("filtra por estado normalizado", () => {
    expect(
      filterOrdersClientSide(orders, {
        status: "processing",
        service: "all",
        payment: "all",
        search: "",
        dateFrom: "",
        dateTo: "",
      })
    ).toEqual([orders[1]]);
  });

  it("filtra por rango de fechas usando pickup_date y created_at como respaldo", () => {
    expect(
      filterOrdersClientSide(orders, {
        status: "all",
        service: "all",
        payment: "all",
        search: "",
        dateFrom: "2026-07-11",
        dateTo: "2026-07-15",
      })
    ).toEqual([orders[1], orders[2]]);
  });
});
