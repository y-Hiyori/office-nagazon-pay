app.get("/api/order-status", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const orderId = String(req.query.orderId || "");
    const token = String(req.query.token || "");

    if (!orderId || !token) {
      return res.status(400).json({ ok: false, status: "MISSING", need: ["orderId", "token"] });
    }

    const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error || !order) return res.status(404).json({ ok: false, status: "ORDER_NOT_FOUND" });

    // ✅ tokenが合う人だけ見れる（未ログインでもOK、でも第三者は見れない）
    if (String(order.paypay_return_token || "") !== token) {
      return res.status(403).json({ ok: false, status: "BAD_TOKEN" });
    }

    return res.status(200).json({
      ok: true,
      orderId: order.id,
      status: order.status,
      paidAt: order.paid_at,
      paymentMethod: order.payment_method,
      total: order.total,
      fulfillment_type: order.fulfillment_type || "pickup",
      shipping_status: order.shipping_status || null,
      pickup_code: order.pickup_code || null,
      pickup_status: order.pickup_status || null,
      picked_up_at: order.picked_up_at || null,
      pickup_code_expires_at: order.pickup_code_expires_at || null,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, status: "ERROR", message: String(e?.message || e) });
  }
});