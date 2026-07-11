const normalizeStatus = (status) =>
  (status || "").toString().trim().toLowerCase().replace(/\s+/g, "_");

const getComparableDate = (order) => {
  const source = order?.pickup_date || order?.created_at;
  if (!source) return "";
  return String(source).trim().slice(0, 10);
};

const buildOrderSearchText = (order) =>
  [
    order?.order_number,
    order?.id,
    order?.customer_name,
    order?.customer_email,
    order?.pickup_address,
    order?.delivery_address,
    order?.pickup_time_window,
    order?.service_type,
    order?.service_plan,
    order?.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export const filterOrdersClientSide = (orders, filters) => {
  const source = Array.isArray(orders) ? orders : [];
  const searchTerm = (filters?.search || "").trim().toLowerCase();

  return source.filter((order) => {
    const normalizedStatus = normalizeStatus(order?.status);
    const normalizedPayment = (order?.payment_status || "").toString().trim().toLowerCase();
    const orderDate = getComparableDate(order);

    if (filters?.status && filters.status !== "all" && normalizedStatus !== filters.status) {
      return false;
    }

    if (filters?.service && filters.service !== "all" && (order?.service_type || "") !== filters.service) {
      return false;
    }

    if (filters?.payment && filters.payment !== "all" && normalizedPayment !== filters.payment) {
      return false;
    }

    if (filters?.dateFrom && (!orderDate || orderDate < filters.dateFrom)) {
      return false;
    }

    if (filters?.dateTo && (!orderDate || orderDate > filters.dateTo)) {
      return false;
    }

    if (searchTerm && !buildOrderSearchText(order).includes(searchTerm)) {
      return false;
    }

    return true;
  });
};
